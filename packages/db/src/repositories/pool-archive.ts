import { asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema/index';
import {
  poolId as asPoolId,
  tournamentId as asTournamentId,
  userId as asUserId,
  points,
  type PoolId,
  type TournamentId,
  type UserId,
  type Points,
  type ScoreBreakdown,
} from '@cup/engine';

type Database = Db<typeof schema>;

export type PoolArchiveRow = {
  id: string;
  poolId: PoolId;
  poolName: string;
  tournamentId: TournamentId;
  tournamentName: string;
  archivedAt: Date;
  archivedBy: UserId | null;
};

export type PoolArchiveEntryRow = {
  id: string;
  archiveId: string;
  userId: UserId | null;
  displayName: string;
  rank: number;
  pointsTotal: Points;
  breakdown: ScoreBreakdown;
};

export type PoolArchiveEntryInput = {
  userId: UserId;
  displayName: string;
  rank: number;
  pointsTotal: Points;
  breakdown: ScoreBreakdown;
};

function toPoolArchiveRow(raw: typeof schema.poolArchives.$inferSelect): PoolArchiveRow {
  return {
    ...raw,
    poolId: asPoolId(raw.poolId),
    tournamentId: asTournamentId(raw.tournamentId),
    archivedBy: raw.archivedBy ? asUserId(raw.archivedBy) : null,
  };
}

function toPoolArchiveEntryRow(
  raw: typeof schema.poolArchiveEntries.$inferSelect,
): PoolArchiveEntryRow {
  return {
    ...raw,
    userId: raw.userId ? asUserId(raw.userId) : null,
    pointsTotal: points(raw.pointsTotal),
  };
}

/**
 * Creates or replaces the archive for a pool. Re-archiving deletes the previous
 * entries and inserts the new ones — `pool_archives.pool_id` is unique, so there
 * is always at most one archive per pool.
 */
export async function upsertPoolArchive(
  db: Database,
  input: {
    poolId: PoolId;
    poolName: string;
    tournamentId: TournamentId;
    tournamentName: string;
    archivedBy: UserId;
    entries: PoolArchiveEntryInput[];
  },
): Promise<PoolArchiveRow> {
  const [archive] = await db
    .insert(schema.poolArchives)
    .values({
      poolId: input.poolId,
      poolName: input.poolName,
      tournamentId: input.tournamentId,
      tournamentName: input.tournamentName,
      archivedBy: input.archivedBy,
    })
    .onConflictDoUpdate({
      target: schema.poolArchives.poolId,
      set: {
        poolName: input.poolName,
        tournamentId: input.tournamentId,
        tournamentName: input.tournamentName,
        archivedBy: input.archivedBy,
        archivedAt: sql`now()`,
      },
    })
    .returning();
  if (!archive) throw new Error('upsertPoolArchive: upsert did not return a row');

  await db
    .delete(schema.poolArchiveEntries)
    .where(eq(schema.poolArchiveEntries.archiveId, archive.id));

  if (input.entries.length > 0) {
    await db.insert(schema.poolArchiveEntries).values(
      input.entries.map((e) => ({
        archiveId: archive.id,
        userId: e.userId,
        displayName: e.displayName,
        rank: e.rank,
        pointsTotal: e.pointsTotal,
        breakdown: e.breakdown,
      })),
    );
  }

  return toPoolArchiveRow(archive);
}

export async function getPoolArchiveWithEntries(
  db: Database,
  poolId: PoolId,
): Promise<{ archive: PoolArchiveRow; entries: PoolArchiveEntryRow[] } | undefined> {
  const [archive] = await db
    .select()
    .from(schema.poolArchives)
    .where(eq(schema.poolArchives.poolId, poolId));
  if (!archive) return undefined;

  const entryRows = await db
    .select()
    .from(schema.poolArchiveEntries)
    .where(eq(schema.poolArchiveEntries.archiveId, archive.id))
    .orderBy(asc(schema.poolArchiveEntries.rank));

  return {
    archive: toPoolArchiveRow(archive),
    entries: entryRows.map(toPoolArchiveEntryRow),
  };
}
