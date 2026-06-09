import type { Db } from '@cup/db';
import { getPoolById, getLeaderboard, getTournamentById } from '@cup/db';
import type { PoolDetail } from '../domain/types';

export async function getPoolDetail(
  db: Db<import('@/shared/db').AppSchema>,
  poolId: string,
): Promise<PoolDetail | undefined> {
  const pool = await getPoolById(db, poolId);
  if (!pool) return undefined;

  const [leaderboard, tournament] = await Promise.all([
    getLeaderboard(db, poolId),
    getTournamentById(db, pool.tournamentId),
  ]);

  return {
    id: pool.id,
    name: pool.name,
    tournamentId: pool.tournamentId,
    tournamentName: tournament?.name ?? pool.tournamentId,
    ownerId: pool.ownerId,
    // inviteTokenHash stores the raw token; null means the link is disabled.
    inviteToken: pool.inviteTokenHash ?? null,
    viewToken: pool.viewToken ?? null,
    leaderboard,
    memberCount: leaderboard.length,
    lockTime: tournament?.firstKickoff ?? new Date(0),
    scoring: tournament?.scoringConfig ?? null,
  } satisfies PoolDetail;
}
