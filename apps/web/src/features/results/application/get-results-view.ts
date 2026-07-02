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
  getKnockoutPicksByPool,
  getFinishScoresByPool,
} from '@cup/db';
import type { MatchRow, LeaderboardEntry } from '@cup/db';
import { computeRemainingMaxPoints, deriveGroupOrders, selectQualifiers } from '@cup/engine';
import type { Tournament, ActualResults, ScoreBreakdown, PoolId } from '@cup/engine';
import type {
  ResultsView,
  UserRankChip,
  SpecialBetResultRow,
  UserPointsSummary,
  KnockoutRoundRow,
  BracketHealth,
  BracketRoundResultView,
  KnockoutMatchView,
} from '../domain/types';
import { buildStageProgress } from '@/shared/stage-progress';
import type { StageProgress, StageKey } from '@/shared/stage-progress';
import { buildGroupResults, buildBest3rdStanding } from './build-group-results';
import { buildBracketRounds, computeBracketHealth } from './build-bracket-rounds';
import { computeR32QualHealth } from '../domain/bracket-health';
import { buildPointsRaceView } from './build-race-view';
import { buildSpecialBetResults } from './build-special-bet-results';
import { computeCanStillGet } from './compute-can-still-get';

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

  const [
    leaderboard,
    prediction,
    allMatches,
    poolGroupScores,
    actualResults,
    poolSpecialBets,
    poolKnockoutPicks,
    poolFinishScores,
  ] = await Promise.all([
    getLeaderboard(db, poolId),
    userId !== undefined
      ? getPrediction(db, poolId, userId as import('@cup/engine').UserId)
      : Promise.resolve(null),
    getMatchesForTournament(db, pool.tournamentId),
    getGroupScoresByPool(db, poolId),
    getActualResults(db, pool.tournamentId),
    getSpecialBetsByPool(db, poolId),
    getKnockoutPicksByPool(db, poolId),
    getFinishScoresByPool(db, poolId),
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

  let userPredictedQualifiers: string[] | null = null;
  let userPredictedKnockoutTeamIds: string[] | null = null;
  if (inputs) {
    const groupOrders = deriveGroupOrders(def, inputs.groupScores);
    userPredictedQualifiers = selectQualifiers(def, inputs.groupScores, groupOrders);
    const knockoutWinners = inputs.knockoutPicks.map((p) => p.winner as string);
    userPredictedKnockoutTeamIds = [...new Set([...userPredictedQualifiers, ...knockoutWinners])];
  }

  const { bracketRounds, bronzeMatch } = buildBracketRounds(
    def,
    allMatches,
    inputs,
    poolGroupScores,
    poolKnockoutPicks,
  );
  const bracketHealth = computeBracketHealth(bracketRounds, bronzeMatch, def);
  if (userPredictedQualifiers) {
    bracketHealth.perRound.unshift(computeR32QualHealth(userPredictedQualifiers, groupResults));
  }

  const specialBets = buildSpecialBetResults(
    def,
    inputs,
    actualResults,
    allMatches,
    poolSpecialBets,
  );

  const userGroupSummary = buildGroupSummary(def, allMatches, userBreakdown, userId);
  const userKnockoutRoundBreakdown = buildKnockoutRoundBreakdown(
    def,
    userBreakdown,
    userId,
    actualResults,
    bracketHealth,
    bracketRounds,
    bronzeMatch,
  );
  // Derive the summary by summing per-round rows so earned/missed/canStillGet are always
  // consistent with what the per-round breakdown displays. The old approach computed missed
  // independently using binary "is round answered?" checks, which diverged from the health-based
  // per-round computation (e.g. when answers.roundOf16 was a partial list).
  const userKnockoutSummary: UserPointsSummary | null =
    userKnockoutRoundBreakdown !== null
      ? {
          earned: userKnockoutRoundBreakdown.reduce((sum, r) => sum + r.earned, 0),
          missed: userKnockoutRoundBreakdown.reduce((sum, r) => sum + r.missed, 0),
          canStillGet: userKnockoutRoundBreakdown.reduce((sum, r) => sum + r.canStillGet, 0),
        }
      : null;
  const userSpecialsSummary = buildSpecialsSummary(specialBets, userId);
  const myTotalCanStillGet =
    userId !== undefined ? computeCanStillGet(def, allMatches, actualResults) : 0;

  const pointsRaceView = buildPointsRaceView({
    leaderboard,
    userId: userId ?? null,
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
  });

  return {
    poolName: pool.name,
    tournamentName: tournament.name,
    scoring: def.scoring,
    userRank,
    userBreakdown,
    userGroupSummary,
    userKnockoutSummary,
    userKnockoutRoundBreakdown,
    userSpecialsSummary,
    stageProgress,
    currentStage,
    groupResults,
    best3rdStanding,
    bracketRounds,
    bronzeMatch,
    bracketHealth,
    userPredictedKnockoutTeamIds,
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
  return {
    ...makeSummaryFromCategories(earned, totalMaxCat, remainingMaxCat),
    earnedBreakdown: userBreakdown
      ? { matchPoints: userBreakdown.groupMatches, orderPoints: userBreakdown.groupOrder }
      : null,
  };
}

/** Returns the highest tier of topFour points achievable when `remaining` picks are still possible. */
function topFourTierMax(remaining: number, order: Tournament['scoring']['topFourOrder']): number {
  if (remaining >= 4) return order.allCorrect;
  if (remaining === 3) return order.threeCorrect;
  if (remaining === 2) return order.twoCorrect;
  if (remaining === 1) return order.oneCorrect;
  return 0;
}

function buildKnockoutRoundBreakdown(
  def: Tournament,
  userBreakdown: ScoreBreakdown | null,
  userId: string | undefined,
  actualResults: ActualResults,
  bracketHealth: BracketHealth,
  bracketRounds: BracketRoundResultView[],
  bronzeMatch: KnockoutMatchView | null,
): KnockoutRoundRow[] | null {
  if (userId === undefined) return null;
  const bd = userBreakdown;

  const totalMax = computeRemainingMaxPoints(def, { finalMatchIds: new Set() });

  // For per-team scored rounds (R16, QF), answers.* may be partially populated while
  // the round is still in progress (sync writes winners as matches complete). When a
  // bracket health row exists for that label, use it to compute accurate canStillGet
  // (pending picks × ptsPerPick) and missed (busted picks × ptsPerPick). Fall back to
  // the binary answered check only when there is no health row (entry-round tournaments
  // where that round has no upstream feeding round).
  const r16Health = bracketHealth.perRound.find((r) => r.label === 'R16') ?? null;
  const r8Health = bracketHealth.perRound.find((r) => r.label === 'QF') ?? null;
  const sfHealth = bracketHealth.perRound.find((r) => r.label === 'SF') ?? null;
  // 'Finalist' tracks the two SF bracket picks — same picks that determine finalists and bronze pair.
  const finalistHealth = bracketHealth.perRound.find((r) => r.label === 'Finalist') ?? null;

  function perTeamAvail(
    health: BracketHealth['perRound'][number] | null,
    isAnswered: boolean,
    totalMaxPts: number,
  ): number {
    if (health !== null) {
      // maxPossiblePoints = (alive + pending) × ptsPerPick; subtract earned to get pending portion.
      return health.maxPossiblePoints - health.earnedPoints;
    }
    return isAnswered ? 0 : totalMaxPts;
  }

  function perTeamMissed(
    health: BracketHealth['perRound'][number] | null,
    isAnswered: boolean,
    totalMaxPts: number,
    earned: number,
  ): number {
    if (health !== null) {
      return Math.max(0, totalMaxPts - health.maxPossiblePoints);
    }
    return isAnswered ? Math.max(0, totalMaxPts - earned) : 0;
  }

  // For topFour: if some QF picks are busted, the highest achievable tier decreases.
  // Use the 'SF' health row (populated from QF picks) to count still-possible picks.
  // Use totalPicks - bustedPicks (not alivePicks + pendingPicks) so that 'no-pick' slots
  // don't incorrectly reduce the achievable tier.
  const sfRemaining = sfHealth !== null ? sfHealth.totalPicks - sfHealth.bustedPicks : null;
  const sfMaxPossible =
    sfRemaining !== null ? topFourTierMax(sfRemaining, def.scoring.topFourOrder) : totalMax.topFour;

  // For Final/Bronze: each has two derived participants (finalists / bronze pair), both
  // derived from the SF bracket picks. The 'Finalist' health row tracks those two SF picks —
  // its bustedPicks count equals the number of wrong derived participants for both Final and
  // Bronze. Each wrong participant forfeits one perTeam bonus; the exact-score bonus is
  // independent of team correctness and is always preserved until the match is played.
  const bustedSfPicks = finalistHealth?.bustedPicks ?? 0;

  // For Bronze: also check if the user's picked bronze teams are themselves already eliminated.
  // bustedSfPicks only captures when the SF *winner* pick is wrong (making the SF loser/bronze
  // participant unknown). But if the SF *loser* (bronze team) is eliminated before reaching the
  // SF, the SF winner pick may still be alive, so bustedSfPicks stays 0 even though that bronze
  // slot is definitely lost. Take the max of both perspectives.
  const bronzePicksBusted =
    bronzeMatch !== null
      ? (bronzeMatch.pickStatus === 'busted' ? 1 : 0) +
        (bronzeMatch.pickedOpponentStatus === 'busted' ? 1 : 0)
      : 0;
  const effectiveBronzeBusted = Math.max(bustedSfPicks, bronzePicksBusted);

  function finaleAvail(
    matchScoring: { perTeam: number; exactScore: number },
    earned: number,
    isAnswered: boolean,
    bustedPickCount: number,
  ): number {
    if (isAnswered) return 0;
    const maxPossible =
      Math.max(0, 2 - bustedPickCount) * matchScoring.perTeam + matchScoring.exactScore;
    return Math.max(0, maxPossible - earned);
  }

  const r16Answered = actualResults.answers.roundOf16 !== undefined;
  const r8Answered = actualResults.answers.roundOf8 !== undefined;
  const r16Earned = bd?.roundOf16 ?? 0;
  const r8Earned = bd?.roundOf8 ?? 0;

  const canStillGet = {
    roundOf16: perTeamAvail(r16Health, r16Answered, totalMax.roundOf16),
    roundOf8: perTeamAvail(r8Health, r8Answered, totalMax.roundOf8),
    topFour:
      actualResults.answers.topFourOrder !== undefined ? 0 : sfMaxPossible - (bd?.topFour ?? 0),
    bronze: finaleAvail(
      def.scoring.bronze,
      bd?.bronze ?? 0,
      actualResults.bronzeMatch !== undefined,
      effectiveBronzeBusted,
    ),
    final: finaleAvail(
      def.scoring.final,
      bd?.final ?? 0,
      actualResults.finalMatch !== undefined,
      bustedSfPicks,
    ),
  };

  function row(label: string, earned: number, max: number, avail: number): KnockoutRoundRow {
    return { label, earned, missed: Math.max(0, max - avail - earned), canStillGet: avail };
  }

  return [
    {
      label: 'Round of 16',
      earned: r16Earned,
      missed: perTeamMissed(r16Health, r16Answered, totalMax.roundOf16, r16Earned),
      canStillGet: canStillGet.roundOf16,
    },
    {
      label: 'QF',
      earned: r8Earned,
      missed: perTeamMissed(r8Health, r8Answered, totalMax.roundOf8, r8Earned),
      canStillGet: canStillGet.roundOf8,
    },
    row('SF', bd?.topFour ?? 0, totalMax.topFour, canStillGet.topFour),
    row('Final', bd?.final ?? 0, totalMax.final, canStillGet.final),
    row('Bronze', bd?.bronze ?? 0, totalMax.bronze, canStillGet.bronze),
  ];
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
