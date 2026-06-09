/**
 * Assembles a CardView for a given prediction (own card or owner viewing a member's card).
 * Pure read — no mutations. Authorization is the caller's responsibility.
 */
import type { AppSchema } from '@/shared/db';
import type { Db } from '@cup/db';
import { getPrediction, getOrCreatePrediction, getPredictionInputs } from '@cup/db';
import { deriveCard, deriveGroupOrders } from '@cup/engine';
import type { Tournament, GroupId, TeamId } from '@cup/engine';
import type {
  CardView,
  GroupView,
  GroupMatchView,
  BracketView,
  TieView,
  BracketRoundView,
  FinishMatchView,
  SpecialBetView,
} from '../domain/types';
import { getSpecialBetDefs } from '../domain/special-bet-defs';

type Params = {
  db: Db<AppSchema>;
  poolId: string;
  userId: string;
  tournamentId: string;
  tournament: Tournament;
  firstKickoff: Date;
  now: Date;
  /** If true, create an empty prediction row when none exists */
  createIfMissing?: boolean;
};

/**
 * Builds the full CardView for the given (poolId, userId).
 * Returns null if no prediction exists and createIfMissing is false.
 */
export async function getCardView(params: Params): Promise<CardView | null> {
  const { db, poolId, userId, tournamentId, tournament, firstKickoff, now, createIfMissing } =
    params;

  // 1. Get or create the prediction row
  let prediction: Awaited<ReturnType<typeof getPrediction>> | undefined;
  if (createIfMissing) {
    prediction = await getOrCreatePrediction(db, {
      poolId,
      userId: userId as import('@cup/engine').UserId,
      tournamentId,
    });
  } else {
    prediction = await getPrediction(db, poolId, userId as import('@cup/engine').UserId);
    if (!prediction) return null;
  }

  // 2. Load stored inputs
  const inputs = await getPredictionInputs(db, prediction.id);

  // 3. Derive the card
  const derived = deriveCard(inputs, tournament);

  // 4. Build team lookup map
  const teamMap = new Map<TeamId, string>(tournament.teams.map((t) => [t.id, t.name]));
  const teamName = (id: TeamId | null) => (id ? (teamMap.get(id) ?? id) : null);

  // 5. Build group score views
  const groupScoreMap = new Map(inputs.groupScores.map((gs) => [gs.matchId, gs]));

  const groups: GroupView[] = tournament.groups.map((group) => {
    const matches: GroupMatchView[] = tournament.groupMatches
      .filter((m) => m.group === group.id)
      .map((m) => {
        const saved = groupScoreMap.get(m.id);
        return {
          matchId: m.id,
          group: m.group,
          homeTeamId: m.home,
          homeTeamName: teamMap.get(m.home) ?? m.home,
          awayTeamId: m.away,
          awayTeamName: teamMap.get(m.away) ?? m.away,
          kickoff: null,
          predictedHome: saved?.home ?? null,
          predictedAway: saved?.away ?? null,
        };
      });

    const derivedGroupOrder = derived.groupOrders[group.id as GroupId] ?? [];
    const autoQualify = tournament.qualification.autoQualifyPerGroup;

    const complete = matches.every((m) => m.predictedHome !== null);

    return {
      groupId: group.id as GroupId,
      matches,
      derivedOrder: derivedGroupOrder.map((tid, i) => ({
        teamId: tid,
        teamName: teamMap.get(tid) ?? tid,
        qualifies: complete && i < autoQualify,
      })),
      complete,
    };
  });

  // 6. Build bracket view
  const completeGroupsSet = new Set<GroupId>(
    groups.filter((g) => g.complete).map((g) => g.groupId),
  );
  const allGroupsComplete = completeGroupsSet.size === tournament.groups.length;

  const knockoutPickMap = new Map(
    inputs.knockoutPicks.map((kp) => [kp.bracketMatchKey, kp.winner]),
  );
  const { bracket } = tournament;

  // Build rounds: group ties by round (order: entry round → ... → SF), exclude Final/bronze
  const roundKeys = bracket.rounds.filter((r) => r !== 'Final' && r !== 'bronze');

  const tiesByRound = new Map<string, TieView[]>();
  for (const slot of bracket.slots) {
    // Determine which round this slot belongs to by matching against bracket rounds
    // The slot's match key starts with a prefix (e.g., "ro32-", "ro16-", "qf-", "sf-")
    const roundLabel = getRoundLabel(slot.match, bracket.rounds);
    if (!tiesByRound.has(roundLabel)) tiesByRound.set(roundLabel, []);

    const picked = knockoutPickMap.get(slot.match) ?? null;
    // Only resolve slot teams when the relevant group is fully predicted
    const homeId =
      resolveSlotTeam(
        slot.home,
        derived.qualifiers,
        derived.groupOrders,
        completeGroupsSet,
        allGroupsComplete,
      ) ?? null;
    const awayId =
      resolveSlotTeam(
        slot.away,
        derived.qualifiers,
        derived.groupOrders,
        completeGroupsSet,
        allGroupsComplete,
      ) ?? null;

    tiesByRound.get(roundLabel)!.push({
      bracketMatchKey: slot.match,
      homeTeamId: homeId,
      homeTeamName: homeId ? (teamMap.get(homeId) ?? homeId) : null,
      awayTeamId: awayId,
      awayTeamName: awayId ? (teamMap.get(awayId) ?? awayId) : null,
      pickedWinnerId: picked,
    });
  }

  // Also add progression ties (R16 onwards)
  for (const prog of bracket.progression) {
    if (prog.match === bracket.finalMatch || prog.match === bracket.bronzeMatch) continue;
    const roundLabel = getRoundLabel(prog.match, bracket.rounds);
    if (!tiesByRound.has(roundLabel)) tiesByRound.set(roundLabel, []);

    const picked = knockoutPickMap.get(prog.match) ?? null;
    // For progression ties, the teams come from the winner picks of prior rounds
    const homeId =
      prog.from[0] != null ? (getProgTeam(prog.from[0], knockoutPickMap) ?? null) : null;
    const awayId =
      prog.from[1] != null ? (getProgTeam(prog.from[1], knockoutPickMap) ?? null) : null;

    tiesByRound.get(roundLabel)!.push({
      bracketMatchKey: prog.match,
      homeTeamId: homeId,
      homeTeamName: homeId ? (teamMap.get(homeId) ?? homeId) : null,
      awayTeamId: awayId,
      awayTeamName: awayId ? (teamMap.get(awayId) ?? awayId) : null,
      pickedWinnerId: picked,
    });
  }

  const rounds: BracketRoundView[] = bracket.rounds
    .filter((r) => r !== 'Final' && r !== 'bronze' && tiesByRound.has(r))
    .map((r) => ({ label: r, ties: tiesByRound.get(r) ?? [] }));

  // Final + bronze match views
  const finalPick = knockoutPickMap.get(bracket.finalMatch);
  const [finalist1, finalist2] = derived.finalists;
  const finalFinish = inputs.finishScores.final;

  const bronzeFrom = bracket.progression.find((p) => p.match === bracket.bronzeMatch);
  const bronze1 =
    bronzeFrom && bronzeFrom.from[0] != null
      ? getProgTeam(bronzeFrom.from[0], knockoutPickMap)
      : null;
  const bronze2 =
    bronzeFrom && bronzeFrom.from[1] != null
      ? getProgTeam(bronzeFrom.from[1], knockoutPickMap)
      : null;
  const bronzeFinish = inputs.finishScores.bronze;

  const finalView: FinishMatchView = {
    homeTeamId: finalist1 ?? null,
    homeTeamName: finalist1 ? (teamMap.get(finalist1) ?? finalist1) : null,
    awayTeamId: finalist2 ?? null,
    awayTeamName: finalist2 ? (teamMap.get(finalist2) ?? finalist2) : null,
    predictedHome: finalFinish?.home ?? null,
    predictedAway: finalFinish?.away ?? null,
  };

  const bronzeView: FinishMatchView = {
    homeTeamId: bronze1 as TeamId | null,
    homeTeamName: bronze1 ? (teamMap.get(bronze1 as TeamId) ?? bronze1) : null,
    awayTeamId: bronze2 as TeamId | null,
    awayTeamName: bronze2 ? (teamMap.get(bronze2 as TeamId) ?? bronze2) : null,
    predictedHome: bronzeFinish?.home ?? null,
    predictedAway: bronzeFinish?.away ?? null,
  };

  const bracketView: BracketView = {
    rounds,
    final: finalView,
    bronze: bronzeView,
    roundOf8: derived.roundOf8.map((tid) => ({ teamId: tid, teamName: teamMap.get(tid) ?? tid })),
    topFour: derived.topFour.map((tid, i) => ({
      teamId: tid,
      teamName: teamMap.get(tid) ?? tid,
      position: i + 1,
    })),
  };

  // 7. Special bets
  const defs = getSpecialBetDefs(tournament.scoring);
  const playerMap = new Map(tournament.players.map((p) => [p.id, p.name]));

  const specials: SpecialBetView[] = defs.map((def) => {
    const raw = (inputs.specials as Record<string, unknown>)[def.key];
    let displayValue: string | number | boolean | null = null;
    if (raw !== undefined && raw !== null) {
      if (def.kind === 'player') {
        displayValue = playerMap.get(raw as import('@cup/engine').PlayerId) ?? String(raw);
      } else if (def.kind === 'team') {
        displayValue = teamMap.get(raw as TeamId) ?? String(raw);
      } else {
        displayValue = raw as number | boolean;
      }
    }
    return { ...def, value: displayValue };
  });

  // 8. Completion
  const totalFields =
    groups.reduce((acc, g) => acc + g.matches.length, 0) +
    bracket.slots.length +
    bracket.progression.filter(
      (p) => p.match !== bracket.bronzeMatch && p.match !== bracket.finalMatch,
    ).length +
    2 /* final + bronze scores */ +
    specials.length;
  const filledFields =
    inputs.groupScores.length +
    inputs.knockoutPicks.length +
    (inputs.finishScores.final ? 1 : 0) +
    (inputs.finishScores.bronze ? 1 : 0) +
    Object.keys(inputs.specials).length;
  const completionPercent = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;

  const status = now >= firstKickoff ? 'locked' : 'editable';

  return {
    predictionId: prediction.id,
    poolId,
    tournamentId,
    status,
    completionPercent,
    groups,
    bracket: bracketView,
    specials,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRoundLabel(matchKey: string, rounds: string[]): string {
  // Match key prefixes: "ro32-", "ro16-", "qf-", "sf-" map to round labels
  const prefixMap: Record<string, string> = {
    'ro32-': 'R32',
    'ro16-': 'R16',
    'qf-': 'QF',
    'sf-': 'SF',
  };
  for (const [prefix, label] of Object.entries(prefixMap)) {
    if (matchKey.startsWith(prefix)) return label;
  }
  // Fallback: find the round in the bracket.rounds list by checking if the key starts with a lowercase version
  for (const r of rounds) {
    if (matchKey.toLowerCase().startsWith(r.toLowerCase().replace(' ', '-'))) return r;
  }
  return matchKey;
}

function resolveSlotTeam(
  slotRef: string,
  qualifiers: TeamId[],
  groupOrders: Record<GroupId, TeamId[]>,
  completeGroups: Set<GroupId>,
  allGroupsComplete: boolean,
): TeamId | undefined {
  const posGroupMatch = slotRef.match(/^(\d+)([A-Z]+)$/);
  if (posGroupMatch) {
    const pos = parseInt(posGroupMatch[1]!) - 1;
    const gId = posGroupMatch[2] as GroupId;
    if (!completeGroups.has(gId)) return undefined;
    return groupOrders[gId]?.[pos];
  }
  const thirdMatch = slotRef.match(/^3rd\[(\d+)\]$/);
  if (thirdMatch) {
    // Thirds ranking is cross-group — need all groups complete
    if (!allGroupsComplete) return undefined;
    const idx = parseInt(thirdMatch[1]!);
    return qualifiers[idx];
  }
  return undefined;
}

function getProgTeam(
  fromKey: import('@cup/engine').BracketMatchKey,
  picks: Map<import('@cup/engine').BracketMatchKey, TeamId>,
): TeamId | undefined {
  return picks.get(fromKey);
}
