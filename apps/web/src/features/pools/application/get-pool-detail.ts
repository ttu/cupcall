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

  // inviteTokenHash column stores the raw invite token (see create-pool.ts for rationale).
  return {
    id: pool.id,
    name: pool.name,
    tournamentId: pool.tournamentId,
    tournamentName: tournament?.name ?? pool.tournamentId,
    ownerId: pool.ownerId,
    inviteToken: pool.inviteTokenHash,
    leaderboard,
    memberCount: leaderboard.length,
    lockTime: tournament?.firstKickoff ?? new Date(0),
  } satisfies PoolDetail;
}
