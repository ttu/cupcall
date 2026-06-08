import { asc, eq, and, sql } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema/index';
import { userId, points, type UserId, type Points, type ScoreBreakdown } from '@cup/engine';

type Database = Db<typeof schema>;

export type ScoreRow = {
  poolId: string;
  userId: UserId;
  pointsTotal: Points;
  breakdown: ScoreBreakdown;
  updatedAt: Date;
};

export type LeaderboardEntry = {
  userId: UserId;
  displayName: string;
  pointsTotal: Points;
  breakdown: ScoreBreakdown | null;
};

function toScoreRow(raw: typeof schema.scores.$inferSelect): ScoreRow {
  return {
    ...raw,
    userId: userId(raw.userId),
    pointsTotal: points(raw.pointsTotal),
  };
}

/**
 * Upserts a score row for (poolId, userId). Uses ON CONFLICT DO UPDATE on the
 * composite PK so a second call updates rather than inserting a duplicate row.
 */
export async function upsertScore(
  db: Database,
  input: {
    poolId: string;
    userId: UserId;
    pointsTotal: Points;
    breakdown: ScoreBreakdown;
  },
): Promise<ScoreRow> {
  const [row] = await db
    .insert(schema.scores)
    .values({
      poolId: input.poolId,
      userId: input.userId,
      pointsTotal: input.pointsTotal,
      breakdown: input.breakdown,
    })
    .onConflictDoUpdate({
      target: [schema.scores.poolId, schema.scores.userId],
      set: {
        pointsTotal: input.pointsTotal,
        breakdown: input.breakdown,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  if (!row) throw new Error('upsertScore: upsert did not return a row');
  return toScoreRow(row);
}

/**
 * Returns the leaderboard for a pool: all members (even those without a score row yet),
 * ordered by pointsTotal DESC then displayName ASC (stable display-only tiebreak, §8.5).
 * Members with no score row appear at 0 points.
 */
export async function getLeaderboard(db: Database, poolId: string): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      userId: schema.poolMembers.userId,
      displayName: schema.users.displayName,
      pointsTotal: schema.scores.pointsTotal,
      breakdown: schema.scores.breakdown,
    })
    .from(schema.poolMembers)
    .innerJoin(schema.users, eq(schema.poolMembers.userId, schema.users.id))
    .leftJoin(
      schema.scores,
      and(
        eq(schema.scores.poolId, schema.poolMembers.poolId),
        eq(schema.scores.userId, schema.poolMembers.userId),
      ),
    )
    .where(eq(schema.poolMembers.poolId, poolId))
    // NULLS LAST: members with no score row (NULL pointsTotal) sort below all scored members.
    // Secondary tiebreak: displayName ASC for a stable, display-only order (functional-spec §8.5).
    .orderBy(sql`${schema.scores.pointsTotal} DESC NULLS LAST`, asc(schema.users.displayName));

  return rows.map((r) => ({
    userId: userId(r.userId),
    displayName: r.displayName,
    pointsTotal: points(r.pointsTotal ?? 0),
    breakdown: r.breakdown ?? null,
  }));
}
