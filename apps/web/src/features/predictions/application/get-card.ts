/**
 * Assembles a CardView for a given prediction (own card or owner viewing a member's card).
 * Pure read — no mutations. Authorization is the caller's responsibility.
 */
import type { AppSchema } from '@/shared/db';
import type { Db } from '@cup/db';
import { getPrediction, getOrCreatePrediction, getPredictionInputs } from '@cup/db';
import { deriveCard, deriveGroupOrders, matchId } from '@cup/engine';
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
import { LATE_JOINER_WINDOW_MS } from '@/shared/authz';

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
  /**
   * When set, enables per-item lock computation for late joiners.
   * A late joiner is someone whose joinedAt >= firstKickoff.
   * Must be provided alongside knownResultMatchIds / answeredBetKeys.
   */
  joinedAt?: Date;
  /** Set of match IDs (group + knockout) that have a recorded final score. */
  knownResultMatchIds?: Set<string>;
  /** Set of special-bet keys that have a recorded answer. */
  answeredBetKeys?: Set<string>;
  /**
   * Actual scores for completed group matches. When provided for a late joiner,
   * locked matches without a saved prediction are prefilled so groups count as complete.
   */
  actualGroupMatchScores?: Map<string, { home: number; away: number }>;
};

/**
 * Builds the full CardView for the given (poolId, userId).
 * Returns null if no prediction exists and createIfMissing is false.
 */
export async function getCardView(params: Params): Promise<CardView | null> {
  const {
    db,
    poolId,
    userId,
    tournamentId,
    tournament,
    firstKickoff,
    now,
    createIfMissing,
    joinedAt,
    knownResultMatchIds = new Set<string>(),
    answeredBetKeys = new Set<string>(),
    actualGroupMatchScores,
  } = params;

  // A late joiner is someone who joined at or after the tournament lock.
  // They get per-item lock state within a 4-hour window from joining.
  const isLateJoiner = joinedAt !== undefined && now >= firstKickoff && joinedAt >= firstKickoff;
  const lateJoinerDeadline = isLateJoiner
    ? new Date(joinedAt!.getTime() + LATE_JOINER_WINDOW_MS)
    : null;
  const lateJoinerExpired = lateJoinerDeadline !== null && now >= lateJoinerDeadline;

  function itemLocked(matchIdOrKey: string): boolean {
    if (!isLateJoiner) return now >= firstKickoff;
    if (lateJoinerExpired) return true;
    return knownResultMatchIds.has(matchIdOrKey);
  }

  function betLocked(betKey: string): boolean {
    if (!isLateJoiner) return now >= firstKickoff;
    if (lateJoinerExpired) return true;
    return answeredBetKeys.has(betKey);
  }

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

  // 3. For late joiners, overlay actual results for locked group matches not yet saved.
  // This makes locked-but-unsaved matches count as "complete" for group/bracket derivation.
  const savedMatchIds = new Set(inputs.groupScores.map((gs) => gs.matchId as string));
  const augmentedGroupScores =
    isLateJoiner && actualGroupMatchScores
      ? [
          ...inputs.groupScores,
          ...[...actualGroupMatchScores.entries()]
            .filter(([mid]) => knownResultMatchIds.has(mid) && !savedMatchIds.has(mid))
            .map(([mid, result]) => ({
              matchId: matchId(mid),
              home: result.home,
              away: result.away,
            })),
        ]
      : inputs.groupScores;

  // 4. Derive the card (using augmented group scores so group orders reflect actual results)
  const derived = deriveCard({ ...inputs, groupScores: augmentedGroupScores }, tournament);

  // 5. Build team lookup map
  const teamMap = new Map<TeamId, string>(tournament.teams.map((t) => [t.id, t.name]));
  const teamName = (id: TeamId | null) => (id ? (teamMap.get(id) ?? id) : null);

  // 6. Build group score views
  const groupScoreMap = new Map(augmentedGroupScores.map((gs) => [gs.matchId, gs]));

  const autoQualify = tournament.qualification.autoQualifyPerGroup;
  const autoQualifiedCount = tournament.groups.length * autoQualify;

  // Pre-compute which groups are fully predicted so best-third logic can be applied in one pass.
  const completeGroupIds = new Set<GroupId>(
    tournament.groups
      .filter((g) =>
        tournament.groupMatches
          .filter((m) => m.group === g.id)
          .every((m) => groupScoreMap.has(m.id)),
      )
      .map((g) => g.id as GroupId),
  );
  const allGroupsComplete = completeGroupIds.size === tournament.groups.length;
  // Best-third qualifiers are appended after auto-qualifiers in derived.qualifiers.
  const bestThirdsSet = new Set(derived.qualifiers.slice(autoQualifiedCount));

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
          locked: itemLocked(m.id),
        };
      });

    const derivedGroupOrder = derived.groupOrders[group.id as GroupId] ?? [];
    const complete = completeGroupIds.has(group.id as GroupId);

    return {
      groupId: group.id as GroupId,
      matches,
      derivedOrder: derivedGroupOrder.map((tid, i) => {
        let qualifies: 'auto' | 'best-third' | false = false;
        if (complete && i < autoQualify) {
          qualifies = 'auto';
        } else if (allGroupsComplete && i === autoQualify && bestThirdsSet.has(tid)) {
          qualifies = 'best-third';
        }
        return { teamId: tid, teamName: teamMap.get(tid) ?? tid, qualifies };
      }),
      complete,
    };
  });

  // 6. Build bracket view

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
        autoQualifiedCount,
        derived.groupOrders,
        completeGroupIds,
        allGroupsComplete,
      ) ?? null;
    const awayId =
      resolveSlotTeam(
        slot.away,
        derived.qualifiers,
        autoQualifiedCount,
        derived.groupOrders,
        completeGroupIds,
        allGroupsComplete,
      ) ?? null;

    tiesByRound.get(roundLabel)!.push({
      bracketMatchKey: slot.match,
      homeTeamId: homeId,
      homeTeamName: homeId ? (teamMap.get(homeId) ?? homeId) : null,
      awayTeamId: awayId,
      awayTeamName: awayId ? (teamMap.get(awayId) ?? awayId) : null,
      pickedWinnerId: picked,
      locked: itemLocked(slot.match),
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
      locked: itemLocked(prog.match),
    });
  }

  const rounds: BracketRoundView[] = bracket.rounds
    .filter((r) => r !== 'Final' && r !== 'bronze' && tiesByRound.has(r))
    .map((r) => ({ label: r, ties: tiesByRound.get(r) ?? [] }));

  // Final + bronze match views
  const [finalist1, finalist2] = derived.finalists;
  const finalFinish = inputs.finishScores.final;

  const [bronze1, bronze2] = derived.bronzePair;
  const bronzeFinish = inputs.finishScores.bronze;

  const finalView: FinishMatchView = {
    homeTeamId: finalist1 ?? null,
    homeTeamName: finalist1 ? (teamMap.get(finalist1) ?? finalist1) : null,
    awayTeamId: finalist2 ?? null,
    awayTeamName: finalist2 ? (teamMap.get(finalist2) ?? finalist2) : null,
    predictedHome: finalFinish?.home ?? null,
    predictedAway: finalFinish?.away ?? null,
    pickedWinnerId: (knockoutPickMap.get(bracket.finalMatch) as TeamId | undefined) ?? null,
    locked: itemLocked(bracket.finalMatch),
  };

  const bronzeView: FinishMatchView = {
    homeTeamId: bronze1 ?? null,
    homeTeamName: bronze1 ? (teamMap.get(bronze1) ?? bronze1) : null,
    awayTeamId: bronze2 ?? null,
    awayTeamName: bronze2 ? (teamMap.get(bronze2) ?? bronze2) : null,
    predictedHome: bronzeFinish?.home ?? null,
    predictedAway: bronzeFinish?.away ?? null,
    pickedWinnerId: (knockoutPickMap.get(bracket.bronzeMatch) as TeamId | undefined) ?? null,
    locked: itemLocked(bracket.bronzeMatch),
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
    let storedValue: string | number | boolean | null = null;
    if (raw !== undefined && raw !== null) {
      if (def.kind === 'player') {
        storedValue = String(raw);
        displayValue = playerMap.get(raw as import('@cup/engine').PlayerId) ?? String(raw);
      } else if (def.kind === 'team') {
        storedValue = String(raw);
        displayValue = teamMap.get(raw as TeamId) ?? String(raw);
      } else {
        storedValue = raw as number | boolean;
        displayValue = raw as number | boolean;
      }
    }
    return { ...def, value: displayValue, storedValue, locked: betLocked(def.key) };
  });

  // 8. Completion
  const finalFilled = isFinishFilled(
    inputs.finishScores.final,
    knockoutPickMap.get(bracket.finalMatch),
  );
  const bronzeFilled = isFinishFilled(
    inputs.finishScores.bronze,
    knockoutPickMap.get(bracket.bronzeMatch),
  );

  const totalFields =
    groups.reduce((acc, g) => acc + g.matches.length, 0) +
    bracket.slots.length +
    bracket.progression.filter(
      (p) => p.match !== bracket.bronzeMatch && p.match !== bracket.finalMatch,
    ).length +
    2 /* final + bronze scores */ +
    specials.length;
  const filledFields =
    augmentedGroupScores.length +
    inputs.knockoutPicks.filter(
      (kp) =>
        kp.bracketMatchKey !== bracket.finalMatch && kp.bracketMatchKey !== bracket.bronzeMatch,
    ).length +
    (finalFilled ? 1 : 0) +
    (bronzeFilled ? 1 : 0) +
    Object.keys(inputs.specials).length;
  const completionPercent = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;

  const status =
    now < firstKickoff ? 'editable' : isLateJoiner && !lateJoinerExpired ? 'partial' : 'locked';

  return {
    predictionId: prediction.id,
    poolId,
    tournamentId,
    status,
    completionPercent,
    groups,
    bracket: bracketView,
    specials,
    lateJoinerDeadline: status === 'partial' ? lateJoinerDeadline : null,
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
  autoQualifiedCount: number,
  groupOrders: Record<GroupId, TeamId[]>,
  completeGroupIds: Set<GroupId>,
  allGroupsComplete: boolean,
): TeamId | undefined {
  const posGroupMatch = slotRef.match(/^(\d+)([A-Z]+)$/);
  if (posGroupMatch) {
    const pos = parseInt(posGroupMatch[1]!) - 1;
    const gId = posGroupMatch[2] as GroupId;
    if (!completeGroupIds.has(gId)) return undefined;
    return groupOrders[gId]?.[pos];
  }
  const thirdMatch = slotRef.match(/^3rd\[(\d+)\]$/);
  if (thirdMatch) {
    // Thirds ranking is cross-group — need all groups complete
    if (!allGroupsComplete) return undefined;
    const idx = parseInt(thirdMatch[1]!);
    // rankedThirds start after the auto-qualified teams in the qualifiers array
    return qualifiers[autoQualifiedCount + idx];
  }
  return undefined;
}

function getProgTeam(
  fromKey: import('@cup/engine').BracketMatchKey,
  picks: Map<import('@cup/engine').BracketMatchKey, TeamId>,
): TeamId | undefined {
  return picks.get(fromKey);
}

function isFinishFilled(
  finishScore: { home: number; away: number } | undefined,
  pickedWinner: TeamId | undefined,
): boolean {
  if (!finishScore) return false;
  if (finishScore.home === finishScore.away) return pickedWinner !== undefined;
  return true;
}
