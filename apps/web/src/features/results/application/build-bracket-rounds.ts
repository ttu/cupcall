import type { MatchRow, PoolGroupScore } from '@cup/db';
import { deriveGroupOrders, selectQualifiers, matchId, resolveSlot } from '@cup/engine';
import type { Tournament, BracketMatchKey, GroupScore } from '@cup/engine';
import type {
  KnockoutMatchView,
  BracketRoundResultView,
  BracketHealth,
  MatchHit,
} from '../domain/types';

export function buildBracketRounds(
  def: Tournament,
  allMatches: MatchRow[],
  inputs: {
    knockoutPicks: { bracketMatchKey: string; winner: string }[];
    finishScores: {
      final?: { home: number; away: number };
      bronze?: { home: number; away: number };
    };
  } | null,
  poolGroupScores: PoolGroupScore[],
): { bracketRounds: BracketRoundResultView[]; bronzeMatch: KnockoutMatchView | null } {
  const teamMap = new Map<string, string>(def.teams.map((t) => [t.id, t.name]));
  const matchByKey = new Map<string, MatchRow>(allMatches.map((m) => [m.id, m]));
  const pickMap = new Map<string, string>(
    (inputs?.knockoutPicks ?? []).map((kp) => [kp.bracketMatchKey, kp.winner]),
  );
  const { participants: derivedParticipants, projectedKeys } = computeDerivedParticipants(
    def,
    allMatches,
  );
  const entryRoundKeys = new Set(def.bracket.slots.map((s) => s.match as string));
  const r32PredPcts = computeEntryRoundPredictionPcts(def, poolGroupScores);

  const finishScores = inputs?.finishScores ?? {};
  const finalMatchKey = def.bracket.finalMatch;
  const bronzeMatchKey = def.bracket.bronzeMatch;

  const buildMatchView = (key: BracketMatchKey, round: string): KnockoutMatchView => {
    const actual = matchByKey.get(key) ?? null;
    const pickedId = pickMap.get(key) ?? null;

    const derivedPair = derivedParticipants.get(key);
    const homeId = actual?.homeTeamId ?? derivedPair?.[0] ?? null;
    const awayId = actual?.awayTeamId ?? derivedPair?.[1] ?? null;
    const winnerId = actual?.winnerTeamId ?? null;

    let pickStatus: KnockoutMatchView['pickStatus'] = 'no-pick';
    if (pickedId) {
      if (!winnerId) {
        pickStatus = 'pending';
      } else if (winnerId === pickedId) {
        pickStatus = 'alive';
      } else {
        pickStatus = 'busted';
      }
    }

    // Predicted score: only Final and Bronze have a finish score.
    let predictedHome: number | null = null;
    let predictedAway: number | null = null;
    if (key === finalMatchKey && finishScores.final) {
      predictedHome = finishScores.final.home;
      predictedAway = finishScores.final.away;
    } else if (key === bronzeMatchKey && finishScores.bronze) {
      predictedHome = finishScores.bronze.home;
      predictedAway = finishScores.bronze.away;
    }

    const hit = computeKnockoutHit({
      pickedWinnerId: pickedId,
      actualWinnerId: winnerId,
      predictedHome,
      predictedAway,
      actualHome: actual?.homeGoals ?? null,
      actualAway: actual?.awayGoals ?? null,
    });

    const isEntryRound = entryRoundKeys.has(key);

    return {
      bracketMatchKey: key,
      round,
      homeTeamId: homeId,
      homeTeamName: homeId ? (teamMap.get(homeId) ?? homeId) : null,
      awayTeamId: awayId,
      awayTeamName: awayId ? (teamMap.get(awayId) ?? awayId) : null,
      actualHome: actual?.homeGoals ?? null,
      actualAway: actual?.awayGoals ?? null,
      actualWinnerId: winnerId,
      actualWinnerName: winnerId ? (teamMap.get(winnerId) ?? winnerId) : null,
      kickoff: actual?.kickoff?.toISOString() ?? null,
      status: actual?.status === 'final' ? 'final' : 'scheduled',
      pickedWinnerId: pickedId,
      pickedWinnerName: pickedId ? (teamMap.get(pickedId) ?? pickedId) : null,
      pickStatus,
      predictedHome,
      predictedAway,
      hit,
      projected: projectedKeys.has(key),
      homeTeamR32Pct: isEntryRound && homeId ? (r32PredPcts.get(homeId) ?? null) : null,
      awayTeamR32Pct: isEntryRound && awayId ? (r32PredPcts.get(awayId) ?? null) : null,
    };
  };

  const { bracket } = def;
  const mainRounds = bracket.rounds.filter((r) => r !== 'Final' && r !== 'bronze');

  const keysByRound = new Map<string, BracketMatchKey[]>();

  for (const slot of bracket.slots) {
    const round = getRoundLabel(slot.match, bracket.rounds);
    if (!keysByRound.has(round)) keysByRound.set(round, []);
    keysByRound.get(round)!.push(slot.match);
  }

  for (const prog of bracket.progression) {
    if (prog.match === finalMatchKey || prog.match === bronzeMatchKey) continue;
    const round = getRoundLabel(prog.match, bracket.rounds);
    if (!keysByRound.has(round)) keysByRound.set(round, []);
    keysByRound.get(round)!.push(prog.match);
  }

  const bracketRounds: BracketRoundResultView[] = mainRounds
    .filter((r) => keysByRound.has(r))
    .map((r) => ({
      label: r,
      matches: (keysByRound.get(r) ?? []).map((key) => buildMatchView(key, r)),
    }));

  bracketRounds.push({
    label: 'Final',
    matches: [buildMatchView(finalMatchKey, 'Final')],
  });

  const bronzeMatch = buildMatchView(bronzeMatchKey, 'Bronze');

  return { bracketRounds, bronzeMatch };
}

export function buildBracketHealth(
  rounds: BracketRoundResultView[],
  bronze: KnockoutMatchView | null,
): BracketHealth {
  const allMatches = [...rounds.flatMap((r) => r.matches), ...(bronze ? [bronze] : [])].filter(
    (m) => m.pickStatus !== 'no-pick',
  );

  return {
    totalPicks: allMatches.length,
    alivePicks: allMatches.filter((m) => m.pickStatus === 'alive').length,
    bustedPicks: allMatches.filter((m) => m.pickStatus === 'busted').length,
  };
}

function computeKnockoutHit(args: {
  pickedWinnerId: string | null;
  actualWinnerId: string | null;
  predictedHome: number | null;
  predictedAway: number | null;
  actualHome: number | null;
  actualAway: number | null;
}): MatchHit {
  const { pickedWinnerId, actualWinnerId, predictedHome, predictedAway, actualHome, actualAway } =
    args;

  if (actualWinnerId === null) return 'pending';

  // Exact requires both predicted and actual scores; only Final/Bronze populate predicted.
  if (
    predictedHome !== null &&
    predictedAway !== null &&
    actualHome !== null &&
    actualAway !== null &&
    predictedHome === actualHome &&
    predictedAway === actualAway
  ) {
    return 'exact';
  }

  if (pickedWinnerId !== null && pickedWinnerId === actualWinnerId) return 'outcome';
  return 'missed';
}

function computeDerivedParticipants(
  def: Tournament,
  allMatches: MatchRow[],
): { participants: Map<BracketMatchKey, [string, string]>; projectedKeys: Set<BracketMatchKey> } {
  const participantsByMatch = new Map<BracketMatchKey, [string, string]>();
  const projectedKeys = new Set<BracketMatchKey>();
  const matchByKey = new Map<string, MatchRow>(allMatches.map((m) => [m.id, m]));

  const finalGroupMatchIds = new Set(
    allMatches.filter((m) => m.stage === 'group' && m.status === 'final').map((m) => m.id),
  );
  const allGroupsFinal = def.groupMatches.every((gm) => finalGroupMatchIds.has(gm.id));

  const liveScores: GroupScore[] = def.groupMatches
    .filter((gm) => finalGroupMatchIds.has(gm.id))
    .map((gm) => {
      const m = matchByKey.get(gm.id)!;
      return { matchId: matchId(gm.id), home: m.homeGoals!, away: m.awayGoals! };
    });

  // Always derive: with no matches played the engine falls back to seed order.
  const groupOrders = deriveGroupOrders(def, liveScores);
  const qualifiers = selectQualifiers(def, liveScores, groupOrders);
  const autoCount = def.groups.length * def.qualification.autoQualifyPerGroup;
  const rankedThirds = qualifiers.slice(autoCount);

  for (const slot of def.bracket.slots) {
    try {
      const home = resolveSlot(slot.home, groupOrders, rankedThirds);
      const away = resolveSlot(slot.away, groupOrders, rankedThirds);
      participantsByMatch.set(slot.match, [home, away]);
      if (!allGroupsFinal) projectedKeys.add(slot.match);
    } catch {
      // unresolvable ref (e.g. best-third slot not yet rankable) — leave TBD
    }
  }

  for (const prog of def.bracket.progression) {
    if (prog.match === def.bracket.bronzeMatch) continue;
    const winners = prog.from.map((k) => matchByKey.get(k)?.winnerTeamId ?? null);
    if (winners.length === 2 && winners[0] && winners[1]) {
      participantsByMatch.set(prog.match, [winners[0], winners[1]]);
    }
  }

  // Bronze: SF losers (need both SFs final; participants of SF can be derived or from DB row)
  const bronzeProg = def.bracket.progression.find((p) => p.match === def.bracket.bronzeMatch);
  if (bronzeProg) {
    const losers: (string | null)[] = bronzeProg.from.map((sfKey) => {
      const sfMatch = matchByKey.get(sfKey);
      const sfWinner = sfMatch?.winnerTeamId ?? null;
      if (!sfWinner) return null;
      const sfParts = participantsByMatch.get(sfKey);
      const sfHome = sfMatch?.homeTeamId ?? sfParts?.[0] ?? null;
      const sfAway = sfMatch?.awayTeamId ?? sfParts?.[1] ?? null;
      if (!sfHome || !sfAway) return null;
      return sfWinner === sfHome ? sfAway : sfHome;
    });
    if (losers.length === 2 && losers[0] && losers[1]) {
      participantsByMatch.set(def.bracket.bronzeMatch, [losers[0], losers[1]]);
    }
  }

  return { participants: participantsByMatch, projectedKeys };
}

/**
 * For each team, compute the percentage of pool members who predicted it
 * to qualify to the entry round (R32/QF), derived from their group score predictions.
 */
function computeEntryRoundPredictionPcts(
  def: Tournament,
  poolGroupScores: PoolGroupScore[],
): Map<string, number> {
  const byUser = new Map<string, GroupScore[]>();
  for (const s of poolGroupScores) {
    const uid = s.userId as string;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push({ matchId: matchId(s.matchId), home: s.home, away: s.away });
  }

  if (byUser.size === 0) return new Map();

  const qualifierCounts = new Map<string, number>();
  for (const scores of byUser.values()) {
    const groupOrders = deriveGroupOrders(def, scores);
    const qualifiers = selectQualifiers(def, scores, groupOrders);
    for (const tid of qualifiers) {
      qualifierCounts.set(tid, (qualifierCounts.get(tid) ?? 0) + 1);
    }
  }

  const total = byUser.size;
  return new Map(
    Array.from(qualifierCounts.entries()).map(([tid, count]) => [
      tid,
      Math.round((count / total) * 100),
    ]),
  );
}

function getRoundLabel(matchKey: string, rounds: string[]): string {
  const prefixMap: Record<string, string> = {
    'ro32-': 'R32',
    'ro16-': 'R16',
    'qf-': 'QF',
    'sf-': 'SF',
  };
  for (const [prefix, label] of Object.entries(prefixMap)) {
    if (matchKey.startsWith(prefix)) return label;
  }
  for (const r of rounds) {
    if (matchKey.toLowerCase().startsWith(r.toLowerCase().replace(/\s+/g, '-'))) return r;
  }
  return matchKey;
}
