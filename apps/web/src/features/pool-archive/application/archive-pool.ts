import type { Db } from '@cup/db';
import { getLeaderboard, upsertPoolArchive } from '@cup/db';
import { points } from '@cup/engine';
import type {
  PoolId,
  TournamentId,
  UserId,
  ScoreBreakdown,
  Tournament,
  Scoring,
} from '@cup/engine';
import type { AppSchema } from '@/shared/db';
import { buildPoolArchiveRecap } from './build-recap';

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
 * Snapshots a pool's current leaderboard, plus a computed recap (race chart,
 * highlights, per-member stage history), into the archive tables. Re-running
 * for the same pool replaces the previous snapshot (see `upsertPoolArchive`).
 */
export async function archivePool(
  db: Db<AppSchema>,
  input: {
    poolId: PoolId;
    poolName: string;
    tournamentId: TournamentId;
    tournamentName: string;
    archivedBy: UserId;
    def: Tournament;
    scoring: Scoring;
  },
): Promise<void> {
  const leaderboard = await getLeaderboard(db, input.poolId);

  const { recap, entryExtras } = await buildPoolArchiveRecap(db, {
    poolId: input.poolId,
    tournamentId: input.tournamentId,
    def: input.def,
    scoring: input.scoring,
  });

  const entries = leaderboard.map((entry, index) => {
    const extras = entryExtras.get(entry.userId);
    return {
      userId: entry.userId,
      displayName: entry.displayName,
      rank: index + 1,
      pointsTotal: entry.pointsTotal,
      breakdown: entry.breakdown ?? emptyBreakdown(),
      pointsHistory: extras?.pointsHistory ?? null,
      stageReasons: extras?.stageReasons ?? null,
    };
  });

  await upsertPoolArchive(db, {
    poolId: input.poolId,
    poolName: input.poolName,
    tournamentId: input.tournamentId,
    tournamentName: input.tournamentName,
    archivedBy: input.archivedBy,
    recap,
    entries,
  });
}
