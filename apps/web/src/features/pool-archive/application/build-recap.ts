import type { Db } from '@cup/db';
import {
  getMatchesForTournament,
  getGroupScoresByPool,
  getKnockoutPicksByPool,
  getFinishScoresByPool,
  getSpecialBetsByPool,
  getLeaderboard,
} from '@cup/db';
import type { MatchRow, PoolGroupScore, PoolKnockoutPick, PoolArchiveRecap } from '@cup/db';
import {
  buildRaceChartData,
  buildRaceEventDates,
  resolveActualWinner,
  computeHit,
} from '@/features/results';
import type { PoolId, TournamentId, Tournament, Scoring, UserId } from '@cup/engine';
import { userId as asUserId } from '@cup/engine';
import type { AppSchema } from '@/shared/db';
import {
  computeChampionPick,
  computeBestSingleMatch,
  computeBiggestUpset,
  computePredictionsMade,
  computeExactScoreRatePercent,
} from './build-highlights';

export type EntryRecapExtras = {
  pointsHistory: number[];
  stageReasons: (string | null)[];
};

type StageReasonCtx = {
  allMatches: MatchRow[];
  groupScores: PoolGroupScore[];
  knockoutPicks: PoolKnockoutPick[];
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

function describeKnockoutOutcome(
  userId: UserId,
  knockoutMatchesToday: MatchRow[],
  knockoutPicks: PoolKnockoutPick[],
  finalKey: string,
): string | null {
  const correctTeams: string[] = [];
  let championPickCorrect = false;

  for (const m of knockoutMatchesToday) {
    const winner = resolveActualWinner(m);
    if (!winner) continue;
    const pick = knockoutPicks.find((p) => p.userId === userId && p.bracketMatchKey === m.id);
    if (pick?.winnerTeamId !== winner) continue;
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
  return describeKnockoutOutcome(
    userId,
    knockoutMatchesToday,
    ctx.knockoutPicks,
    ctx.def.bracket.finalMatch,
  );
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

export async function buildPoolArchiveRecap(
  db: Db<AppSchema>,
  params: { poolId: PoolId; tournamentId: TournamentId; def: Tournament; scoring: Scoring },
): Promise<{ recap: PoolArchiveRecap; entryExtras: Map<UserId, EntryRecapExtras> }> {
  const { poolId, tournamentId, def, scoring } = params;

  const [leaderboard, allMatches, groupScores, knockoutPicks, finishScores, specialBets] =
    await Promise.all([
      getLeaderboard(db, poolId),
      getMatchesForTournament(db, tournamentId),
      getGroupScoresByPool(db, poolId),
      getKnockoutPicksByPool(db, poolId),
      getFinishScoresByPool(db, poolId),
      getSpecialBetsByPool(db, poolId),
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
        def,
        scoring,
      }),
    });
  }

  const recap: PoolArchiveRecap = {
    stages: raceChart.chartStages,
    championPick: computeChampionPick(knockoutPicks, def, totalMembers),
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
  };

  return { recap, entryExtras };
}
