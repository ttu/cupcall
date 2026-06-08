import type { Db } from '@cup/db';
import { listPoolsForUser, getLeaderboard, listTournaments } from '@cup/db';
import type { UserId } from '@cup/engine';
import type { PoolSummary } from '../domain/types';

export async function getUserPools(
  db: Db<import('@/shared/db').AppSchema>,
  userId: UserId,
): Promise<PoolSummary[]> {
  const [pools, tournaments] = await Promise.all([
    listPoolsForUser(db, userId),
    listTournaments(db),
  ]);

  const tournamentNames = new Map(tournaments.map((t) => [t.id, t.name]));

  const results = await Promise.all(
    pools.map(async (pool) => {
      const leaderboard = await getLeaderboard(db, pool.id);
      const myEntry = leaderboard.find((e) => e.userId === userId);
      return {
        id: pool.id,
        name: pool.name,
        tournamentId: pool.tournamentId,
        tournamentName: tournamentNames.get(pool.tournamentId) ?? pool.tournamentId,
        ownerId: pool.ownerId,
        memberCount: leaderboard.length,
        myScore: myEntry?.pointsTotal ?? null,
      } satisfies PoolSummary;
    }),
  );

  return results;
}
