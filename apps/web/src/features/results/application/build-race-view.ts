import type {
  MatchRow,
  LeaderboardEntry,
  PoolGroupScore,
  PoolKnockoutPick,
  PoolFinishScore,
  PoolSpecialBet,
} from '@cup/db';
import { computeRemainingMaxPoints, getSpecialBetDefs } from '@cup/engine';
import type { Tournament, ActualResults } from '@cup/engine';
import type {
  PointsRaceView,
  RaceChartPlayer,
  ProjectedEntry,
  MatchMatrixEntry,
  MatrixMatch,
  MatchMatrixCell,
  KnockoutMatrixEntry,
  KnockoutMatrixCell,
  KnockoutMatrixMatch,
  KnockoutMatchHit,
  BracketRoundResultView,
  KnockoutMatchView,
  SpecialsMatrixEntry,
  SpecialsMatrixBet,
  SpecialsMatrixCell,
} from '../domain/types';
import {
  computeHit,
  buildRaceEventDates,
  buildDailyChartPlayers,
  RACE_COLORS,
} from '../domain/race-chart';

type RaceParams = {
  leaderboard: LeaderboardEntry[];
  userId: string | null;
  allMatches: MatchRow[];
  poolGroupScores: PoolGroupScore[];
  def: Tournament;
  myTotalCanStillGet: number;
  bracketRounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
  poolKnockoutPicks: PoolKnockoutPick[];
  poolFinishScores: PoolFinishScore[];
  poolSpecialBets: PoolSpecialBet[];
  actualResults: ActualResults;
};

/**
 * Per-user still-live projection.
 *
 * Formula: `stillLive = hitRate × remainingMax`, where
 *   hitRate    = banked / maxFromResolved
 *   resolvedMax = tournament-wide max ceiling − tournament-wide remaining max
 *
 * Edge cases:
 *  - `maxFromResolved <= 0` (nothing has resolved yet) → no signal to project
 *    from, so stillLive = 0.
 *  - `remainingMax <= 0` (tournament complete) → stillLive = 0 by construction.
 */
function projectStillLive(banked: number, maxFromResolved: number, remainingMax: number): number {
  if (maxFromResolved <= 0 || remainingMax <= 0) return 0;
  const hitRate = banked / maxFromResolved;
  return Math.round(hitRate * remainingMax);
}

export function buildPointsRaceView(params: RaceParams): PointsRaceView {
  const {
    leaderboard,
    userId,
    allMatches,
    poolGroupScores,
    def,
    myTotalCanStillGet,
    bracketRounds,
    bronzeMatch,
    poolKnockoutPicks,
    poolFinishScores,
    poolSpecialBets,
    actualResults,
  } = params;

  const finalMatchIds = new Set(allMatches.filter((m) => m.status === 'final').map((m) => m.id));
  const totalMax = computeRemainingMaxPoints(def, { finalMatchIds: new Set() });
  const remainingMax = computeRemainingMaxPoints(def, { finalMatchIds });
  const maxFromResolved = totalMax.total - remainingMax.total;

  const stillLiveByUser = new Map<string, number>(
    leaderboard.map((e) => [
      e.userId,
      projectStillLive(e.pointsTotal, maxFromResolved, remainingMax.total),
    ]),
  );

  const myBanked = userId ? (leaderboard.find((e) => e.userId === userId)?.pointsTotal ?? 0) : 0;
  const myStillLive = userId ? (stillLiveByUser.get(userId) ?? 0) : 0;
  const myProjected = myBanked + myStillLive;
  const anyStillLive = Array.from(stillLiveByUser.values()).some((v) => v > 0);

  const eventDates = buildRaceEventDates(allMatches);

  let stages: string[];
  let nowIndex: number;
  let chartPlayers: RaceChartPlayer[];

  if (eventDates.length > 0) {
    const result = buildDailyChartPlayers({
      eventDates,
      leaderboard,
      userId,
      allMatches,
      poolGroupScores,
      def,
      anyStillLive,
      stillLiveByUser,
      knockoutPicks: poolKnockoutPicks,
    });
    stages = result.stages;
    nowIndex = result.nowIndex;
    chartPlayers = result.chartPlayers;
  } else {
    // Fallback: milestone chart (matches exist but no kickoff dates set).
    const hasGroupStagePoints = leaderboard.some(
      (e) => e.breakdown && e.breakdown.groupMatches + e.breakdown.groupOrder > 0,
    );
    stages = ['Start'];
    if (hasGroupStagePoints) stages.push('Group Stage');
    stages.push('Now');
    nowIndex = stages.length - 1;
    if (anyStillLive) stages.push('Projected');

    let colorIdx = 0;
    chartPlayers = leaderboard.map((e) => {
      const isCurrentUser = userId !== null && e.userId === userId;
      const color = isCurrentUser
        ? 'var(--green-500)'
        : (RACE_COLORS[colorIdx++] ?? 'var(--ink-muted)');
      const pts: number[] = [0];
      if (hasGroupStagePoints) {
        pts.push(e.breakdown ? e.breakdown.groupMatches + e.breakdown.groupOrder : 0);
      }
      pts.push(e.pointsTotal);
      if (anyStillLive) pts.push(e.pointsTotal + (stillLiveByUser.get(e.userId) ?? 0));
      return { userId: e.userId, displayName: e.displayName, isCurrentUser, color, points: pts };
    });
    chartPlayers = chartPlayers.toSorted(
      (a, b) => (a.isCurrentUser ? 1 : 0) - (b.isCurrentUser ? 1 : 0),
    );
  }

  const projectedEntries = buildProjectedEntries(leaderboard, userId, stillLiveByUser);
  const { matchMatrix, matrixMatches } = buildMatchMatrix(
    leaderboard,
    userId,
    allMatches,
    poolGroupScores,
    def,
  );
  const { knockoutMatrix, knockoutMatrixMatches } = buildKnockoutMatrix({
    leaderboard,
    userId,
    bracketRounds,
    bronzeMatch,
    poolKnockoutPicks,
    poolFinishScores,
    def,
  });

  const { specialsMatrix, specialsMatrixBets } = buildSpecialsMatrix({
    leaderboard,
    userId,
    poolSpecialBets,
    actualResults,
    def,
  });

  return {
    chartStages: stages,
    chartNowIndex: nowIndex,
    chartPlayers,
    myBanked,
    myStillLive,
    myProjected,
    myTotalCanStillGet,
    projectedEntries,
    matchMatrix,
    matrixMatches,
    knockoutMatrix,
    knockoutMatrixMatches,
    specialsMatrix,
    specialsMatrixBets,
  };
}

function buildProjectedEntries(
  leaderboard: LeaderboardEntry[],
  userId: string | null,
  stillLiveByUser: Map<string, number>,
): ProjectedEntry[] {
  const currentRankMap = new Map<string, number>(leaderboard.map((e, i) => [e.userId, i + 1]));

  const withProjected = leaderboard.map((e) => ({
    userId: e.userId,
    displayName: e.displayName,
    isCurrentUser: userId !== null && e.userId === userId,
    currentPoints: e.pointsTotal,
    projectedPoints: e.pointsTotal + (stillLiveByUser.get(e.userId) ?? 0),
  }));

  const sorted = withProjected.toSorted((a, b) => b.projectedPoints - a.projectedPoints);

  return sorted.map((e, i) => {
    const currentRank = currentRankMap.get(e.userId) ?? 0;
    const projectedRank = i + 1;
    return {
      userId: e.userId,
      displayName: e.displayName,
      isCurrentUser: e.isCurrentUser,
      currentPoints: e.currentPoints,
      currentRank,
      projectedPoints: e.projectedPoints,
      projectedRank,
      rankDelta: currentRank - projectedRank,
    };
  });
}

function buildHitPointsMap(def: Tournament): Map<string, number> {
  const map = new Map<string, number>();
  const { bracket, scoring } = def;
  for (const prog of bracket.progression) {
    if ((bracket.roundOf16Matches as string[]).includes(prog.match as string)) {
      for (const fromKey of prog.from) map.set(fromKey as string, scoring.roundOf16PerTeam);
    }
    if ((bracket.roundOf8Matches as string[]).includes(prog.match as string)) {
      for (const fromKey of prog.from) map.set(fromKey as string, scoring.roundOf8PerTeam);
    }
  }
  const finalProg = bracket.progression.find((p) => p.match === bracket.finalMatch);
  if (finalProg) {
    for (const sfKey of finalProg.from) map.set(sfKey as string, scoring.final.perTeam);
  }
  map.set(bracket.finalMatch as string, scoring.final.perTeam);
  map.set(bracket.bronzeMatch as string, scoring.bronze.perTeam);
  return map;
}

export function buildKnockoutMatrix(params: {
  leaderboard: LeaderboardEntry[];
  userId: string | null;
  bracketRounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
  poolKnockoutPicks: PoolKnockoutPick[];
  poolFinishScores: PoolFinishScore[];
  def: Tournament;
}): { knockoutMatrix: KnockoutMatrixEntry[]; knockoutMatrixMatches: KnockoutMatrixMatch[] } {
  const {
    leaderboard,
    userId,
    bracketRounds,
    bronzeMatch,
    poolKnockoutPicks,
    poolFinishScores,
    def,
  } = params;

  const allKnockoutMatches: KnockoutMatchView[] = [
    ...bracketRounds.flatMap((r) => r.matches),
    ...(bronzeMatch ? [bronzeMatch] : []),
  ];

  const sortedMatches = allKnockoutMatches.toSorted((a, b) => {
    if (a.kickoff === null && b.kickoff === null) return 0;
    if (a.kickoff === null) return 1;
    if (b.kickoff === null) return -1;
    return a.kickoff.localeCompare(b.kickoff);
  });

  const knockoutMatrixMatches: KnockoutMatrixMatch[] = sortedMatches.map((m) => ({
    bracketMatchKey: m.bracketMatchKey,
    round: m.round,
    homeTeamId: m.homeTeamId,
    homeTeamName: m.homeTeamName,
    awayTeamId: m.awayTeamId,
    awayTeamName: m.awayTeamName,
    actualWinnerId: m.actualWinnerId,
    kickoff: m.kickoff,
    status: m.status,
  }));

  const hitPoints = buildHitPointsMap(def);

  const pickMap = new Map<string, string>();
  for (const pick of poolKnockoutPicks) {
    pickMap.set(`${pick.userId}::${pick.bracketMatchKey}`, pick.winnerTeamId);
  }

  // Map bracketMatchKey → round label for cross-slot pick matching.
  const matchRoundMap = new Map<string, string>(
    allKnockoutMatches.map((m) => [m.bracketMatchKey, m.round]),
  );

  // Per-user, per-round set of all picked team IDs (regardless of which slot).
  const userRoundPicksMap = new Map<string, Map<string, Set<string>>>();
  for (const pick of poolKnockoutPicks) {
    const round = matchRoundMap.get(pick.bracketMatchKey);
    if (!round) continue;
    if (!userRoundPicksMap.has(pick.userId)) userRoundPicksMap.set(pick.userId, new Map());
    const roundMap = userRoundPicksMap.get(pick.userId)!;
    if (!roundMap.has(round)) roundMap.set(round, new Set());
    roundMap.get(round)!.add(pick.winnerTeamId);
  }

  // Per-user finish scores: userId → 'final'|'bronze' → {home, away}
  const finishScoreMap = new Map<string, Map<'final' | 'bronze', { home: number; away: number }>>();
  for (const fs of poolFinishScores) {
    if (!finishScoreMap.has(fs.userId)) finishScoreMap.set(fs.userId, new Map());
    finishScoreMap.get(fs.userId)!.set(fs.match, { home: fs.home, away: fs.away });
  }

  const finalMatchKey = def.bracket.finalMatch as string;
  const bronzeMatchKey = def.bracket.bronzeMatch as string;

  const knockoutMatrix: KnockoutMatrixEntry[] = leaderboard.map((e) => {
    const userRoundPicks = userRoundPicksMap.get(e.userId) ?? new Map<string, Set<string>>();
    let totalPoints = 0;
    const cells: KnockoutMatrixCell[] = sortedMatches.map((m) => {
      const knockoutPick = pickMap.get(`${e.userId}::${m.bracketMatchKey}`) ?? null;

      // For the final and bronze, derive the effective pick from the finish score so that
      // stale auto-derived knockoutPicks from previous non-tied scores don't mislead the
      // display or the hit check.
      const isFinalOrBronze =
        m.bracketMatchKey === finalMatchKey || m.bracketMatchKey === bronzeMatchKey;
      let pickedWinnerId: string | null = knockoutPick;
      if (isFinalOrBronze) {
        const matchType = m.bracketMatchKey === finalMatchKey ? 'final' : 'bronze';
        const fs = finishScoreMap.get(e.userId)?.get(matchType);
        pickedWinnerId = deriveEffectivePick(fs, m.homeTeamId, m.awayTeamId, knockoutPick);
      }

      if (m.status !== 'final') {
        return {
          bracketMatchKey: m.bracketMatchKey,
          hit: 'pending' as KnockoutMatchHit,
          points: 0,
          pickedWinnerId,
        };
      }

      // For final/bronze use the effective pick directly; for other rounds use the
      // cross-slot round-pick set so swapped picks are still credited.
      const isHit = isFinalOrBronze
        ? m.actualWinnerId !== null && pickedWinnerId === m.actualWinnerId
        : m.actualWinnerId !== null &&
          (userRoundPicks.get(m.round)?.has(m.actualWinnerId) ?? false);

      if (isHit) {
        const pts = hitPoints.get(m.bracketMatchKey) ?? 0;
        totalPoints += pts;
        return {
          bracketMatchKey: m.bracketMatchKey,
          hit: 'hit' as KnockoutMatchHit,
          points: pts,
          pickedWinnerId,
        };
      }

      if (pickedWinnerId === null) {
        return {
          bracketMatchKey: m.bracketMatchKey,
          hit: 'no-pick' as KnockoutMatchHit,
          points: 0,
          pickedWinnerId: null,
        };
      }

      return {
        bracketMatchKey: m.bracketMatchKey,
        hit: 'miss' as KnockoutMatchHit,
        points: 0,
        pickedWinnerId,
      };
    });

    return {
      userId: e.userId,
      displayName: e.displayName,
      isCurrentUser: userId !== null && e.userId === userId,
      cells,
      totalPoints,
    };
  });

  return {
    knockoutMatrix: knockoutMatrix.toSorted((a, b) => b.totalPoints - a.totalPoints),
    knockoutMatrixMatches,
  };
}

/**
 * Determines the effective winner pick for the final or bronze match.
 *
 * - Non-tied finish score → winner is the home or away team derived from the score.
 *   Falls back to knockoutPick if the match teams are not yet known.
 * - Tied finish score → winner is the explicit knockoutPick (penalty pick).
 * - No finish score → falls back to knockoutPick (existing behaviour).
 */
function deriveEffectivePick(
  finishScore: { home: number; away: number } | undefined,
  homeTeamId: string | null,
  awayTeamId: string | null,
  knockoutPick: string | null,
): string | null {
  if (!finishScore) return knockoutPick;
  if (finishScore.home > finishScore.away) return homeTeamId ?? knockoutPick;
  if (finishScore.home < finishScore.away) return awayTeamId ?? knockoutPick;
  return knockoutPick; // tied — use explicit penalty pick
}

function toPredictedOutcome(home: number | null, away: number | null): '1' | 'X' | '2' | null {
  if (home === null || away === null) return null;
  if (home > away) return '1';
  if (home === away) return 'X';
  return '2';
}

function buildMatchMatrix(
  leaderboard: LeaderboardEntry[],
  userId: string | null,
  allMatches: MatchRow[],
  poolGroupScores: PoolGroupScore[],
  def: Tournament,
): { matchMatrix: MatchMatrixEntry[]; matrixMatches: MatrixMatch[] } {
  const teamMap = new Map<string, string>(def.teams.map((t) => [t.id, t.name]));
  const scoring = def.scoring.groupMatch;

  const allGroupMatches = allMatches
    .filter((m) => m.stage === 'group')
    .toSorted((a, b) => (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0));

  const matrixMatches: MatrixMatch[] = allGroupMatches.map((m) => ({
    matchId: m.id,
    homeTeamId: m.homeTeamId ?? '',
    homeTeamName: teamMap.get(m.homeTeamId ?? '') ?? m.homeTeamId ?? '',
    awayTeamId: m.awayTeamId ?? '',
    awayTeamName: teamMap.get(m.awayTeamId ?? '') ?? m.awayTeamId ?? '',
    status: m.status,
    kickoff: m.kickoff?.toISOString() ?? null,
    actualHome: m.homeGoals ?? null,
    actualAway: m.awayGoals ?? null,
  }));

  const predMap = new Map<string, { home: number; away: number }>();
  for (const gs of poolGroupScores) {
    predMap.set(`${gs.userId}::${gs.matchId}`, { home: gs.home, away: gs.away });
  }

  const matchMatrix: MatchMatrixEntry[] = leaderboard.map((e) => {
    let totalPoints = 0;
    const cells: MatchMatrixCell[] = allGroupMatches.map((m) => {
      const pred = predMap.get(`${e.userId}::${m.id}`) ?? null;
      const predictedOutcome = toPredictedOutcome(pred?.home ?? null, pred?.away ?? null);

      if (m.status !== 'final') {
        return { matchId: m.id, hit: 'pending', points: 0, predictedOutcome };
      }

      const hit = computeHit(
        m.homeGoals!,
        m.awayGoals!,
        pred?.home ?? null,
        pred?.away ?? null,
        scoring,
      );
      totalPoints += hit.points;
      return { matchId: m.id, hit: hit.hit, points: hit.points, predictedOutcome };
    });
    return {
      userId: e.userId,
      displayName: e.displayName,
      isCurrentUser: userId !== null && e.userId === userId,
      cells,
      totalPoints,
    };
  });

  return {
    matchMatrix: matchMatrix.toSorted((a, b) => b.totalPoints - a.totalPoints),
    matrixMatches,
  };
}

// ---------------------------------------------------------------------------
// Specials matrix
// ---------------------------------------------------------------------------

const ARRAY_ANSWER_BETS = new Set([
  'groupTopScoringTeam',
  'groupTopConcedingTeam',
  'tournamentTopScoringTeam',
  'tournamentTopConcedingTeam',
  'mostYellowCardsTeam',
  'topScorerPlayer',
]);

function makePickLabel(
  raw: unknown,
  kind: 'player' | 'team' | 'number' | 'bool',
  playerMap: Map<string, string>,
): string | null {
  if (raw === null || raw === undefined) return null;
  if (kind === 'team') return String(raw);
  if (kind === 'bool') return raw === true || raw === 'true' ? 'Y' : 'N';
  if (kind === 'number') return String(raw);
  // player: last word of display name, uppercased, max 6 chars
  const name = playerMap.get(String(raw)) ?? String(raw);
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? name;
  return last.slice(0, 6).toUpperCase();
}

function resolveActualForBet(
  betKey: string,
  actualResults: ActualResults,
): { isArray: boolean; scalar: unknown; array: unknown[] } {
  if (betKey === 'finalDecidedByPenalties') {
    const val =
      actualResults.finalMatch !== undefined
        ? actualResults.finalMatch.decidedBy === 'penalties'
        : undefined;
    return { isArray: false, scalar: val, array: [] };
  }
  if (betKey === 'finalDecisiveGoalPlayer') {
    return { isArray: false, scalar: actualResults.finalMatch?.decisiveGoalPlayer, array: [] };
  }
  if (ARRAY_ANSWER_BETS.has(betKey)) {
    const arr = ((actualResults.answers as Record<string, unknown[]>)[betKey] ?? []) as unknown[];
    return { isArray: true, scalar: undefined, array: arr };
  }
  return {
    isArray: false,
    scalar: (actualResults.answers as Record<string, unknown>)[betKey],
    array: [],
  };
}

export function buildSpecialsMatrix(params: {
  leaderboard: LeaderboardEntry[];
  userId: string | null;
  poolSpecialBets: PoolSpecialBet[];
  actualResults: ActualResults;
  def: Tournament;
}): { specialsMatrix: SpecialsMatrixEntry[]; specialsMatrixBets: SpecialsMatrixBet[] } {
  const { leaderboard, userId, poolSpecialBets, actualResults, def } = params;

  const playerMap = new Map<string, string>(def.players.map((p) => [p.id, p.name]));

  const defs = getSpecialBetDefs(def.scoring).filter((d) => d.points > 0);

  const specialsMatrixBets: SpecialsMatrixBet[] = defs.map((d) => {
    const { isArray, scalar, array } = resolveActualForBet(d.key, actualResults);
    let actualPickLabel: string | null = null;
    if (isArray) {
      if (array.length > 0) {
        actualPickLabel = array
          .map((v) => makePickLabel(v, d.kind, playerMap) ?? String(v))
          .join(' / ');
      }
    } else if (scalar !== undefined && scalar !== null) {
      actualPickLabel = makePickLabel(scalar, d.kind, playerMap);
    }
    return { betKey: d.key, label: d.label, points: d.points, kind: d.kind, actualPickLabel };
  });

  // Build per-user pick index: userId → betKey → raw value
  const pickIndex = new Map<string, Map<string, unknown>>();
  for (const sb of poolSpecialBets) {
    if (!pickIndex.has(sb.userId)) pickIndex.set(sb.userId, new Map());
    pickIndex.get(sb.userId)!.set(sb.betKey, sb.value);
  }

  const specialsMatrix: SpecialsMatrixEntry[] = leaderboard.map((e) => {
    const userPicks = pickIndex.get(e.userId) ?? new Map<string, unknown>();
    let totalPoints = 0;

    const cells: SpecialsMatrixCell[] = defs.map((d) => {
      const raw = userPicks.get(d.key);
      const hasPick = raw !== null && raw !== undefined;
      const { isArray, scalar, array } = resolveActualForBet(d.key, actualResults);
      const isResolved = isArray ? array.length > 0 : scalar !== undefined && scalar !== null;

      let hit: SpecialsMatrixCell['hit'];
      if (!isResolved) {
        hit = 'pending';
      } else if (!hasPick) {
        hit = 'no-pick';
      } else if (isArray) {
        hit = array.includes(raw) ? 'hit' : 'missed';
      } else {
        hit = raw === scalar ? 'hit' : 'missed';
      }

      const points = hit === 'hit' ? d.points : 0;
      totalPoints += points;

      return {
        betKey: d.key,
        hit,
        points,
        pickLabel: hasPick ? makePickLabel(raw, d.kind, playerMap) : null,
      };
    });

    return {
      userId: e.userId,
      displayName: e.displayName,
      isCurrentUser: userId !== null && e.userId === userId,
      cells,
      totalPoints,
    };
  });

  return {
    specialsMatrix: specialsMatrix.toSorted((a, b) => b.totalPoints - a.totalPoints),
    specialsMatrixBets,
  };
}
