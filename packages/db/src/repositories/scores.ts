import { asc, eq, and, sql } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema/index';
import {
  userId,
  points,
  poolId as asPoolId,
  type UserId,
  type Points,
  type ScoreBreakdown,
  type PoolId,
} from '@cup/engine';

type Database = Db<typeof schema>;

export type ScoreRow = {
  poolId: PoolId;
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
  /** null = no prediction row exists; 0–100 = filled / total × 100 */
  completionPercent: number | null;
};

function toScoreRow(raw: typeof schema.scores.$inferSelect): ScoreRow {
  return {
    ...raw,
    poolId: asPoolId(raw.poolId),
    userId: userId(raw.userId),
    pointsTotal: points(raw.pointsTotal),
  };
}

/** Deletes the score row for (poolId, userId). No-op if no row exists. */
export async function deleteScore(db: Database, poolId: PoolId, uid: UserId): Promise<void> {
  await db
    .delete(schema.scores)
    .where(and(eq(schema.scores.poolId, poolId), eq(schema.scores.userId, uid)));
}

/**
 * Upserts a score row for (poolId, userId). Uses ON CONFLICT DO UPDATE on the
 * composite PK so a second call updates rather than inserting a duplicate row.
 */
export async function upsertScore(
  db: Database,
  input: {
    poolId: PoolId;
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
 *
 * Pass totalFields (total number of prediction fields in the tournament) to get a meaningful
 * completionPercent per entry. When totalFields is 0 (default), completionPercent is null
 * for all entries that have a prediction row.
 */
export async function getLeaderboard(
  db: Database,
  poolId: PoolId,
  totalFields = 0,
): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      userId: schema.poolMembers.userId,
      displayName: schema.users.displayName,
      pointsTotal: schema.scores.pointsTotal,
      breakdown: schema.scores.breakdown,
      filledCount: sql<number | null>`
        CASE WHEN ${schema.predictions.id} IS NULL THEN NULL
        ELSE (
          SELECT COUNT(*)::int FROM "prediction_group_scores"  WHERE prediction_id = ${schema.predictions.id}
        ) + (
          SELECT COUNT(*)::int FROM "prediction_knockout_picks" WHERE prediction_id = ${schema.predictions.id}
        ) + (
          SELECT COUNT(*)::int FROM "prediction_finish_scores"  WHERE prediction_id = ${schema.predictions.id}
        ) + (
          SELECT COUNT(*)::int FROM "prediction_specials"       WHERE prediction_id = ${schema.predictions.id}
        ) END
      `,
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
    .leftJoin(
      schema.predictions,
      and(
        eq(schema.predictions.poolId, schema.poolMembers.poolId),
        eq(schema.predictions.userId, schema.poolMembers.userId),
      ),
    )
    .where(eq(schema.poolMembers.poolId, poolId))
    // NULLS LAST: members with no score row (NULL pointsTotal) sort below all scored members.
    // Secondary tiebreak: displayName ASC for a stable, display-only order (functional-spec §8.5).
    .orderBy(sql`${schema.scores.pointsTotal} DESC NULLS LAST`, asc(schema.users.displayName));

  return rows.map((r) => {
    let completionPercent: number | null = null;
    if (r.filledCount !== null && totalFields > 0) {
      completionPercent = Math.min(100, Math.round((r.filledCount / totalFields) * 100));
    }
    return {
      userId: userId(r.userId),
      displayName: r.displayName,
      pointsTotal: points(r.pointsTotal ?? 0),
      breakdown: r.breakdown ?? null,
      completionPercent,
    };
  });
}
