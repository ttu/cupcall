import type { Db } from '@cup/db';
import {
  getPoolById,
  getLeaderboard,
  getTournamentById,
  getMatchesForTournament,
  getGroupScoresByPool,
} from '@cup/db';
import type { Tournament, PoolId } from '@cup/engine';
import type { PoolDetail } from '../domain/types';
import { buildRaceChartData, buildLastDayPoints } from '@/shared/race-chart';
import { buildStageProgress } from '@/shared/stage-progress';

// getSpecialBetDefs always produces 11 bets for any standard tournament scoring config.
const SPECIALS_COUNT = 11;

function computeTotalFields(definition: Tournament | null): number {
  if (!definition) return 0;
  const { bracket } = definition;
  return (
    definition.groupMatches.length +
    bracket.slots.length +
    bracket.progression.filter(
      (p) => p.match !== bracket.bronzeMatch && p.match !== bracket.finalMatch,
    ).length +
    2 + // final + bronze finish scores
    SPECIALS_COUNT
  );
}

export async function getPoolDetail(
  db: Db<import('@/shared/db').AppSchema>,
  poolId: PoolId,
): Promise<PoolDetail | undefined> {
  const pool = await getPoolById(db, poolId);
  if (!pool) return undefined;

  const tournament = await getTournamentById(db, pool.tournamentId);
  const def = tournament?.definition ?? null;

  const [leaderboard, allMatches, poolGroupScores] = await Promise.all([
    getLeaderboard(db, poolId, computeTotalFields(def)),
    getMatchesForTournament(db, pool.tournamentId),
    getGroupScoresByPool(db, poolId),
  ]);

  const stageProgress = def ? buildStageProgress(def, allMatches) : [];
  const raceChart = def
    ? buildRaceChartData(leaderboard, null, { allMatches, poolGroupScores, def })
    : buildRaceChartData(leaderboard, null);
  const lastDayPoints = def
    ? buildLastDayPoints(leaderboard, allMatches, poolGroupScores, def)
    : null;

  return {
    id: pool.id,
    name: pool.name,
    tournamentId: pool.tournamentId,
    tournamentName: tournament?.name ?? pool.tournamentId,
    ownerId: pool.ownerId,
    inviteToken: pool.inviteTokenHash ?? null,
    viewToken: pool.viewToken ?? null,
    leaderboard,
    memberCount: leaderboard.length,
    lockTime: tournament?.firstKickoff ?? new Date(0),
    scoring: tournament?.scoringConfig ?? null,
    stageProgress,
    raceChart,
    lastDayPoints,
  } satisfies PoolDetail;
}
