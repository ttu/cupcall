import type { Db } from '@cup/db';
import { getLeaderboard, upsertPoolArchive } from '@cup/db';
import { points } from '@cup/engine';
import type { PoolId, TournamentId, UserId, ScoreBreakdown } from '@cup/engine';
import type { AppSchema } from '@/shared/db';

function emptyBreakdown(): ScoreBreakdown {
  return {
    groupMatches: points(0),
    groupOrder: points(0),
    bronze: points(0),
    final: points(0),
    roundOf16: points(0),
    roundOf8: points(0),
    topFour: points(0),
    topFourTeams: points(0),
    topFourPosition: points(0),
    specials: points(0),
    total: points(0),
  };
}

/**
 * Snapshots a pool's current leaderboard into the archive tables. Re-running for the
 * same pool replaces the previous snapshot (see `upsertPoolArchive`).
 */
export async function archivePool(
  db: Db<AppSchema>,
  input: {
    poolId: PoolId;
    poolName: string;
    tournamentId: TournamentId;
    tournamentName: string;
    archivedBy: UserId;
  },
): Promise<void> {
  const leaderboard = await getLeaderboard(db, input.poolId);

  const entries = leaderboard.map((entry, index) => ({
    userId: entry.userId,
    displayName: entry.displayName,
    rank: index + 1,
    pointsTotal: entry.pointsTotal,
    breakdown: entry.breakdown ?? emptyBreakdown(),
  }));

  await upsertPoolArchive(db, {
    poolId: input.poolId,
    poolName: input.poolName,
    tournamentId: input.tournamentId,
    tournamentName: input.tournamentName,
    archivedBy: input.archivedBy,
    entries,
  });
}
