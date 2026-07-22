import type { Db } from '@cup/db';
import {
  getMatchesForTournament,
  getGroupScoresByPool,
  getKnockoutPicksByPool,
  getFinishScoresByPool,
  getSpecialBetsByPool,
  getLeaderboard,
  getActualResults,
  getPrediction,
  getPredictionInputs,
} from '@cup/db';
import type {
  MatchRow,
  PoolGroupScore,
  PoolKnockoutPick,
  PoolFinishScore,
  PoolArchiveRecap,
} from '@cup/db';
import {
  buildRaceChartData,
  buildRaceEventDates,
  resolveActualWinner,
  computeHit,
} from '@/features/results';
import { findOverallGroupCompletionDate } from '@/shared/race-chart';
import { deriveCard, scoreCardAccuracy } from '@cup/engine';
import type {
  PoolId,
  TournamentId,
  Tournament,
  Scoring,
  UserId,
  CardInputs,
  ActualResults,
} from '@cup/engine';
import { userId as asUserId } from '@cup/engine';
import type { AppSchema } from '@/shared/db';
import {
  computeChampionPick,
  computeBestSingleMatch,
  computeBiggestUpset,
  computePredictionsMade,
  computeExactScoreRatePercent,
  computeStageLeaders,
  resolveEffectiveFinalePick,
} from './build-highlights';

export type EntryRecapExtras = {
  pointsHistory: number[];
  stageReasons: (string | null)[];
};

type StageReasonCtx = {
  allMatches: MatchRow[];
  groupScores: PoolGroupScore[];
  knockoutPicks: PoolKnockoutPick[];
  finishScores: PoolFinishScore[];
  def: Tournament;
  scoring: Scoring;
};

function countExactGroupScores(
  userId: UserId,
  groupMatchesToday: MatchRow[],
  groupScores: PoolGroupScore[],
  scoring: Scoring,
): number {
  let exactCount = 0;
  for (const m of groupMatchesToday) {
    const guess = groupScores.find((gs) => gs.userId === userId && gs.matchId === m.id);
    if (!guess || m.homeGoals === null || m.awayGoals === null) continue;
    const { hit } = computeHit(
      m.homeGoals,
      m.awayGoals,
      guess.home,
      guess.away,
      scoring.groupMatch,
    );
    if (hit === 'exact') exactCount++;
  }
  return exactCount;
}

/**
 * Resolves a user's effective pick for a single knockout match. Final/Bronze picks are rarely
 * explicit — most players only submit a finish-score prediction — so those two matches fall back
 * to the score-derived winner via {@link resolveEffectiveFinalePick}.
 */
function resolveEffectivePickForMatch(
  matchId: string,
  def: Tournament,
  pickMap: Map<string, string>,
  finishScoreByMatch: Map<PoolFinishScore['match'], PoolFinishScore>,
): string | null {
  const { finalMatch, bronzeMatch } = def.bracket;
  if (matchId !== finalMatch && matchId !== bronzeMatch) return pickMap.get(matchId) ?? null;

  const finishScore = finishScoreByMatch.get(matchId === finalMatch ? 'final' : 'bronze');
  return resolveEffectiveFinalePick(matchId, def, pickMap, finishScore);
}

function describeKnockoutOutcome(
  userId: UserId,
  knockoutMatchesToday: MatchRow[],
  ctx: Pick<StageReasonCtx, 'knockoutPicks' | 'finishScores' | 'def'>,
): string | null {
  const { knockoutPicks, finishScores, def } = ctx;
  const finalKey = def.bracket.finalMatch;

  const pickMap = new Map<string, string>();
  for (const p of knockoutPicks) {
    if (p.userId === userId) pickMap.set(p.bracketMatchKey, p.winnerTeamId);
  }
  const finishScoreByMatch = new Map(
    finishScores.filter((fs) => fs.userId === userId).map((fs) => [fs.match, fs]),
  );

  const correctTeams: string[] = [];
  let championPickCorrect = false;

  for (const m of knockoutMatchesToday) {
    const winner = resolveActualWinner(m);
    if (!winner) continue;

    const effectivePick = resolveEffectivePickForMatch(m.id, def, pickMap, finishScoreByMatch);
    if (effectivePick !== winner) continue;
    if (m.id === finalKey) championPickCorrect = true;
    else correctTeams.push(winner);
  }

  if (championPickCorrect) return 'Champion pick correct';
  if (correctTeams.length > 0) return `${correctTeams.join(', ')} advance as picked`;
  return null;
}

function describeStageReason(
  userId: UserId,
  matchesThisDate: MatchRow[],
  ctx: StageReasonCtx,
): string | null {
  const groupMatchesToday = matchesThisDate.filter((m) => m.stage === 'group');
  const exactCount = countExactGroupScores(userId, groupMatchesToday, ctx.groupScores, ctx.scoring);
  if (exactCount > 0) return `${exactCount} exact score${exactCount > 1 ? 's' : ''}`;

  const knockoutMatchesToday = matchesThisDate.filter((m) => m.stage !== 'group');
  return describeKnockoutOutcome(userId, knockoutMatchesToday, ctx);
}

function buildStageReasons(
  userId: UserId,
  stages: string[],
  ctx: StageReasonCtx,
): (string | null)[] {
  const eventDates = buildRaceEventDates(ctx.allMatches);
  // stages = ['Start', ...eventDates-as-labels(, 'Projected')] — index 0 ('Start') has no reason.
  const reasons: (string | null)[] = [null];

  for (const dateStr of eventDates) {
    const matchesThisDate = ctx.allMatches.filter(
      (m) => m.status === 'final' && m.kickoff && m.kickoff.toISOString().slice(0, 10) === dateStr,
    );
    reasons.push(describeStageReason(userId, matchesThisDate, ctx));
  }

  // buildRaceEventDates never produces a 'Projected' stage for a finished (fully-archived)
  // tournament, so `reasons.length === stages.length` here; if it's ever short, pad with null.
  while (reasons.length < stages.length) reasons.push(null);

  return reasons;
}

/**
 * Returns `null` when the member never created a prediction row at all — distinct from a member
 * who has a card with some items left unfilled (e.g. a late joiner). Real scoring never scores a
 * no-prediction member (their leaderboard `breakdown` is `null`), so this stat must not
 * synthesize one either — see `computeOverallAccuracyPercent`.
 */
async function buildMemberCardInputs(
  db: Db<AppSchema>,
  poolId: PoolId,
  userId: UserId,
): Promise<CardInputs | null> {
  const prediction = await getPrediction(db, poolId, userId);
  if (!prediction) return null;
  return getPredictionInputs(db, prediction.id);
}

/**
 * Sums hit/attempted accuracy across every pool member's predictions. Mirrors
 * `@/shared/card-scoring`'s `rescoreCard` augmentation exactly (fills in actual results for any
 * match a member didn't predict) so this can't diverge from what real scoring already computes.
 *
 * Members with no prediction row at all are skipped entirely (contribute 0/0) rather than run
 * through the augmentation pipeline: an empty `CardInputs` has no saved group scores, so every
 * match would get backfilled with the real result and `groupOrder` accuracy would come out as a
 * phantom ~100% for someone who never predicted anything.
 */
async function computeOverallAccuracyPercent(
  db: Db<AppSchema>,
  poolId: PoolId,
  leaderboard: { userId: UserId }[],
  def: Tournament,
  actual: ActualResults,
): Promise<number> {
  const memberInputs = await Promise.all(
    leaderboard.map((entry) => buildMemberCardInputs(db, poolId, entry.userId)),
  );

  let totalHits = 0;
  let totalAttempted = 0;

  for (const inputs of memberInputs) {
    if (!inputs) continue;

    const savedMatchIds = new Set(inputs.groupScores.map((gs) => gs.matchId as string));
    const augmentedGroupScores = [
      ...inputs.groupScores,
      ...actual.matchResults.filter((r) => !savedMatchIds.has(r.matchId as string)),
    ];
    const derived = deriveCard({ ...inputs, groupScores: augmentedGroupScores }, def);
    const accuracy = scoreCardAccuracy(derived, inputs, actual);
    totalHits += accuracy.total.hits;
    totalAttempted += accuracy.total.attempted;
  }

  return totalAttempted > 0 ? Math.round((totalHits / totalAttempted) * 100) : 0;
}

export async function buildPoolArchiveRecap(
  db: Db<AppSchema>,
  params: { poolId: PoolId; tournamentId: TournamentId; def: Tournament; scoring: Scoring },
): Promise<{ recap: PoolArchiveRecap; entryExtras: Map<UserId, EntryRecapExtras> }> {
  const { poolId, tournamentId, def, scoring } = params;

  const [leaderboard, allMatches, groupScores, knockoutPicks, finishScores, specialBets, actual] =
    await Promise.all([
      getLeaderboard(db, poolId),
      getMatchesForTournament(db, tournamentId),
      getGroupScoresByPool(db, poolId),
      getKnockoutPicksByPool(db, poolId),
      getFinishScoresByPool(db, poolId),
      getSpecialBetsByPool(db, poolId),
      getActualResults(db, tournamentId),
    ]);

  const totalMembers = leaderboard.length;

  const raceChart = buildRaceChartData(leaderboard, null, {
    allMatches,
    poolGroupScores: groupScores,
    def,
    knockoutPicks,
  });

  const entryExtras = new Map<UserId, EntryRecapExtras>();
  for (const player of raceChart.chartPlayers) {
    const uid = asUserId(player.userId);
    entryExtras.set(uid, {
      pointsHistory: player.points,
      stageReasons: buildStageReasons(uid, raceChart.chartStages, {
        allMatches,
        groupScores,
        knockoutPicks,
        finishScores,
        def,
        scoring,
      }),
    });
  }

  const groupCompletionDate = findOverallGroupCompletionDate(allMatches, def);
  const eventDates = buildRaceEventDates(allMatches);
  const groupCompletionStageIndex = groupCompletionDate
    ? eventDates.indexOf(groupCompletionDate) + 1
    : 0;

  const pointsHistoryByUser = new Map(
    [...entryExtras.entries()].map(([uid, extras]) => [uid, extras.pointsHistory]),
  );
  const { groupStageLeader, knockoutStageLeader } = computeStageLeaders(
    leaderboard,
    pointsHistoryByUser,
    groupCompletionStageIndex,
  );

  const recap: PoolArchiveRecap = {
    stages: raceChart.chartStages,
    championPick: computeChampionPick(knockoutPicks, finishScores, def, totalMembers),
    bestSingleMatch: computeBestSingleMatch(
      groupScores,
      allMatches,
      def,
      scoring.groupMatch,
      totalMembers,
    ),
    biggestUpset: computeBiggestUpset(knockoutPicks, allMatches, def, totalMembers),
    predictionsMade: computePredictionsMade({
      groupScores: groupScores.length,
      knockoutPicks: knockoutPicks.length,
      finishScores: finishScores.length,
      specialBets: specialBets.length,
    }),
    exactScoreRatePercent: computeExactScoreRatePercent(
      groupScores,
      allMatches,
      scoring.groupMatch,
    ),
    overallAccuracyPercent: await computeOverallAccuracyPercent(
      db,
      poolId,
      leaderboard,
      def,
      actual,
    ),
    groupCompletionStageIndex,
    groupStageLeader,
    knockoutStageLeader,
  };

  return { recap, entryExtras };
}
