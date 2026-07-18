import type { Db } from '@cup/db';
import { getPoolArchiveWithEntries } from '@cup/db';
import type { PoolId } from '@cup/engine';
import type { AppSchema } from '@/shared/db';
import type { PoolArchiveView } from '../domain/types';

export async function getPoolArchiveView(
  db: Db<AppSchema>,
  poolId: PoolId,
): Promise<PoolArchiveView | undefined> {
  const result = await getPoolArchiveWithEntries(db, poolId);
  if (!result) return undefined;

  const { archive, entries } = result;
  return {
    poolId: archive.poolId,
    poolName: archive.poolName,
    tournamentId: archive.tournamentId,
    tournamentName: archive.tournamentName,
    archivedAt: archive.archivedAt,
    entries: entries.map((e) => ({
      userId: e.userId,
      displayName: e.displayName,
      rank: e.rank,
      pointsTotal: e.pointsTotal,
      breakdown: e.breakdown,
    })),
  };
}
