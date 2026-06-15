import type { AppSchema } from '@/shared/db';
import type { Db } from '@cup/db';
import {
  getPoolById,
  getTournamentById,
  getLeaderboard,
  getPrediction,
  getPredictionInputs,
  getMatchesForTournament,
  getGroupScoresByPool,
  getSpecialBetsByPool,
  getActualResults,
} from '@cup/db';
import type { MatchRow, LeaderboardEntry } from '@cup/db';
import { computeRemainingMaxPoints } from '@cup/engine';
import type { Tournament, ActualResults, ScoreBreakdown, PoolId } from '@cup/engine';
import type {
  ResultsView,
  UserRankChip,
  SpecialBetResultRow,
  UserPointsSummary,
} from '../domain/types';
import { buildStageProgress } from '@/shared/stage-progress';
import type { StageProgress, StageKey } from '@/shared/stage-progress';
import { buildGroupResults, buildBest3rdStanding } from './build-group-results';
import { buildBracketRounds, buildBracketHealth } from './build-bracket-rounds';
import { buildPointsRaceView } from './build-race-view';
import { buildSpecialBetResults } from './build-special-bet-results';

type Params = {
  db: Db<AppSchema>;
  poolId: PoolId;
  userId?: string;
  now: Date;
};

export async function getResultsView(params: Params): Promise<ResultsView | null> {
  const { db, poolId, userId, now } = params;

  const pool = await getPoolById(db, poolId);
  if (!pool) return null;

  const tournament = await getTournamentById(db, pool.tournamentId);
  if (!tournament?.definition) return null;

  const def = tournament.definition;

  const [leaderboard, prediction, allMatches, poolGroupScores, actualResults, poolSpecialBets] =
    await Promise.all([
      getLeaderboard(db, poolId),
      userId !== undefined
        ? getPrediction(db, poolId, userId as import('@cup/engine').UserId)
        : Promise.resolve(null),
      getMatchesForTournament(db, pool.tournamentId),
      getGroupScoresByPool(db, poolId),
      getActualResults(db, pool.tournamentId),
      getSpecialBetsByPool(db, poolId),
    ]);

  const inputs = prediction != null ? await getPredictionInputs(db, prediction.id) : null;

  const userRank = userId !== undefined ? buildUserRank(leaderboard, userId) : null;
  const userBreakdown =
    userId !== undefined ? (leaderboard.find((e) => e.userId === userId)?.breakdown ?? null) : null;
  const stageProgress = buildStageProgress(def, allMatches);
  const currentStage = deriveCurrentStage(stageProgress);
  const groupResults = buildGroupResults(def, allMatches, inputs, poolGroupScores, now);
  const best3rdStanding = buildBest3rdStanding(def, groupResults);

  // Mark live best-third qualifiers in individual group standings.
  // buildGroupResults only confirms them once every group is complete; this fills in the
  // coloring during the ongoing group stage using the same live ranking.
  if (best3rdStanding) {
    const liveBestThirds = new Set(best3rdStanding.filter((r) => r.qualifies).map((r) => r.teamId));
    for (const gr of groupResults) {
      for (const row of gr.standing) {
        if (row.qualifies === false && liveBestThirds.has(row.teamId)) {
          row.qualifies = 'best-third';
        }
      }
    }
  }

  const { bracketRounds, bronzeMatch } = buildBracketRounds(
    def,
    allMatches,
    inputs,
    poolGroupScores,
  );
  const bracketHealth = buildBracketHealth(bracketRounds, bronzeMatch);

  const specialBets = buildSpecialBetResults(
    def,
    inputs,
    actualResults,
    allMatches,
    poolSpecialBets,
  );

  const userGroupSummary = buildGroupSummary(def, allMatches, userBreakdown, userId);
  const userKnockoutSummary = buildKnockoutSummary(
    def,
    allMatches,
    userBreakdown,
    userId,
    actualResults,
  );
  const userSpecialsSummary = buildSpecialsSummary(specialBets, userId);
  const myTotalCanStillGet =
    (userGroupSummary?.canStillGet ?? 0) +
    (userKnockoutSummary?.canStillGet ?? 0) +
    (userSpecialsSummary?.canStillGet ?? 0);

  const pointsRaceView = buildPointsRaceView({
    leaderboard,
    userId: userId ?? null,
    allMatches,
    poolGroupScores,
    def,
    myTotalCanStillGet,
  });

  return {
    poolName: pool.name,
    tournamentName: tournament.name,
    userRank,
    userBreakdown,
    userGroupSummary,
    userKnockoutSummary,
    userSpecialsSummary,
    stageProgress,
    currentStage,
    groupResults,
    best3rdStanding,
    bracketRounds,
    bronzeMatch,
    bracketHealth,
    leaderboard,
    pointsRaceView,
    specialBets,
  };
}

// User rank

function buildUserRank(leaderboard: LeaderboardEntry[], userId: string): UserRankChip | null {
  const idx = leaderboard.findIndex((e) => e.userId === userId);
  if (idx === -1) return null;
  return {
    rank: idx + 1,
    totalMembers: leaderboard.length,
    points: leaderboard[idx]!.pointsTotal,
  };
}

function deriveCurrentStage(progress: StageProgress[]): StageKey {
  const active = progress.find((s) => s.state === 'active');
  if (active) return active.key;
  const first = progress[0];
  return first?.key ?? 'group';
}

// User points summary (earned / missed / canStillGet)

function makeSummaryFromCategories(
  earnedTotal: number,
  totalMaxTotal: number,
  remainingMaxTotal: number,
): UserPointsSummary {
  const maxFromResolved = totalMaxTotal - remainingMaxTotal;
  return {
    earned: earnedTotal,
    missed: Math.max(0, maxFromResolved - earnedTotal),
    canStillGet: remainingMaxTotal,
  };
}

function buildGroupSummary(
  def: Tournament,
  allMatches: MatchRow[],
  userBreakdown: ScoreBreakdown | null,
  userId: string | undefined,
): UserPointsSummary | null {
  if (userId === undefined) return null;
  const finalMatchIds = new Set(allMatches.filter((m) => m.status === 'final').map((m) => m.id));
  const totalMax = computeRemainingMaxPoints(def, { finalMatchIds: new Set() });
  const remainingMax = computeRemainingMaxPoints(def, { finalMatchIds });
  const earned = (userBreakdown?.groupMatches ?? 0) + (userBreakdown?.groupOrder ?? 0);
  const totalMaxCat = totalMax.groupMatches + totalMax.groupOrder;
  const remainingMaxCat = remainingMax.groupMatches + remainingMax.groupOrder;
  return makeSummaryFromCategories(earned, totalMaxCat, remainingMaxCat);
}

function buildKnockoutSummary(
  def: Tournament,
  allMatches: MatchRow[],
  userBreakdown: ScoreBreakdown | null,
  userId: string | undefined,
  actualResults: ActualResults,
): UserPointsSummary | null {
  if (userId === undefined) return null;
  const finalMatchIds = new Set(allMatches.filter((m) => m.status === 'final').map((m) => m.id));
  const totalMax = computeRemainingMaxPoints(def, { finalMatchIds: new Set() });
  // roundOf8 uses group match IDs (present in DB) — engine correctly detects resolution.
  // topFour/bronze/final use KO match IDs that are never inserted into the matches table by
  // the sync pipeline, so we detect their resolution from actualResults instead.
  const remainingMax = computeRemainingMaxPoints(def, { finalMatchIds });
  const earned =
    (userBreakdown?.roundOf8 ?? 0) +
    (userBreakdown?.topFour ?? 0) +
    (userBreakdown?.bronze ?? 0) +
    (userBreakdown?.final ?? 0);
  const topFourRemaining = actualResults.answers.topFourOrder !== undefined ? 0 : totalMax.topFour;
  const bronzeRemaining = actualResults.bronzeMatch !== undefined ? 0 : totalMax.bronze;
  const finalRemaining = actualResults.finalMatch !== undefined ? 0 : totalMax.final;
  const totalMaxCat = totalMax.roundOf8 + totalMax.topFour + totalMax.bronze + totalMax.final;
  const remainingMaxCat =
    remainingMax.roundOf8 + topFourRemaining + bronzeRemaining + finalRemaining;
  return makeSummaryFromCategories(earned, totalMaxCat, remainingMaxCat);
}

function buildSpecialsSummary(
  specialBets: SpecialBetResultRow[],
  userId: string | undefined,
): UserPointsSummary | null {
  if (userId === undefined) return null;
  return {
    earned: specialBets.reduce((sum, b) => sum + b.pointsAwarded, 0),
    missed: specialBets.filter((b) => b.hit === 'missed').reduce((sum, b) => sum + b.points, 0),
    canStillGet: specialBets
      .filter((b) => b.hit === 'pending')
      .reduce((sum, b) => sum + b.points, 0),
  };
}
