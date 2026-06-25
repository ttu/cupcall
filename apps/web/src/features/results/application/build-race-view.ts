import type { MatchRow, LeaderboardEntry, PoolGroupScore } from '@cup/db';
import { computeRemainingMaxPoints } from '@cup/engine';
import type { Tournament } from '@cup/engine';
import type {
  PointsRaceView,
  RaceChartPlayer,
  ProjectedEntry,
  MatchMatrixEntry,
  MatrixMatch,
  MatchMatrixCell,
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
  const { leaderboard, userId, allMatches, poolGroupScores, def, myTotalCanStillGet } = params;

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
