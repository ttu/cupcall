import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema/index';
import {
  userId,
  predictionId as asPredictionId,
  type UserId,
  type PoolId,
  type PredictionId,
} from '@cup/engine';

type Database = Db<typeof schema>;

export type EditRow = {
  id: string;
  predictionId: PredictionId;
  editorUserId: UserId;
  editorName: string;
  fieldPath: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  source: 'manual' | 'import';
  editedAt: Date;
};

export type PoolEditRow = EditRow & {
  targetUserId: UserId;
  targetName: string;
};

/** Appends an audit record for an owner edit. */
export async function createPredictionEdit(
  db: Database,
  input: {
    predictionId: PredictionId;
    editorUserId: UserId;
    fieldPath: string;
    oldValue: unknown;
    newValue: unknown;
    reason?: string;
    source: 'manual' | 'import';
  },
): Promise<void> {
  await db.insert(schema.predictionEdits).values({
    predictionId: input.predictionId,
    editorUserId: input.editorUserId,
    fieldPath: input.fieldPath,
    oldValue: input.oldValue ?? null,
    newValue: input.newValue ?? null,
    reason: input.reason ?? null,
    source: input.source,
  });
}

/**
 * Returns edit history for a prediction, most-recent first.
 * Readable by all pool members per functional-spec §8.3.
 */
export async function listEditsForPrediction(
  db: Database,
  predictionId: PredictionId,
): Promise<EditRow[]> {
  const rows = await db
    .select({
      id: schema.predictionEdits.id,
      predictionId: schema.predictionEdits.predictionId,
      editorUserId: schema.predictionEdits.editorUserId,
      editorDisplayName: schema.users.displayName,
      editorEmail: schema.users.email,
      fieldPath: schema.predictionEdits.fieldPath,
      oldValue: schema.predictionEdits.oldValue,
      newValue: schema.predictionEdits.newValue,
      reason: schema.predictionEdits.reason,
      source: schema.predictionEdits.source,
      editedAt: schema.predictionEdits.editedAt,
    })
    .from(schema.predictionEdits)
    .leftJoin(schema.users, eq(schema.predictionEdits.editorUserId, schema.users.id))
    .where(eq(schema.predictionEdits.predictionId, predictionId))
    .orderBy(schema.predictionEdits.editedAt);

  return rows
    .slice()
    .reverse()
    .map((r) => ({
      id: r.id,
      predictionId: asPredictionId(r.predictionId),
      editorUserId: userId(r.editorUserId),
      editorName: r.editorDisplayName || r.editorEmail || r.editorUserId,
      fieldPath: r.fieldPath,
      oldValue: r.oldValue,
      newValue: r.newValue,
      reason: r.reason,
      source: r.source,
      editedAt: r.editedAt,
    }));
}

/** Returns true if the pool has any owner-edit records (used to gate the audit link). */
export async function hasEditsForPool(db: Database, poolId: PoolId): Promise<boolean> {
  const rows = await db
    .select({ id: schema.predictionEdits.id })
    .from(schema.predictionEdits)
    .innerJoin(
      schema.predictions,
      and(
        eq(schema.predictionEdits.predictionId, schema.predictions.id),
        eq(schema.predictions.poolId, poolId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Returns all edit records across every member's prediction in the pool, most-recent first.
 * Owner-only; caller is responsible for authorization.
 */
export async function listEditsForPool(db: Database, poolId: PoolId): Promise<PoolEditRow[]> {
  const editorUsers = schema.users;
  const rows = await db
    .select({
      id: schema.predictionEdits.id,
      predictionId: schema.predictionEdits.predictionId,
      editorUserId: schema.predictionEdits.editorUserId,
      editorDisplayName: editorUsers.displayName,
      editorEmail: editorUsers.email,
      targetUserId: schema.predictions.userId,
      fieldPath: schema.predictionEdits.fieldPath,
      oldValue: schema.predictionEdits.oldValue,
      newValue: schema.predictionEdits.newValue,
      reason: schema.predictionEdits.reason,
      source: schema.predictionEdits.source,
      editedAt: schema.predictionEdits.editedAt,
    })
    .from(schema.predictionEdits)
    .innerJoin(
      schema.predictions,
      and(
        eq(schema.predictionEdits.predictionId, schema.predictions.id),
        eq(schema.predictions.poolId, poolId),
      ),
    )
    .leftJoin(editorUsers, eq(schema.predictionEdits.editorUserId, editorUsers.id))
    .orderBy(schema.predictionEdits.editedAt);

  const targetUserIds = [...new Set(rows.map((r) => userId(r.targetUserId)))];
  const targetUsers =
    targetUserIds.length > 0
      ? await db
          .select({
            id: schema.users.id,
            displayName: schema.users.displayName,
            email: schema.users.email,
          })
          .from(schema.users)
          .where(inArray(schema.users.id, targetUserIds))
      : [];
  const targetUserMap = new Map(targetUsers.map((u) => [u.id, u.displayName || u.email || u.id]));

  return rows
    .slice()
    .reverse()
    .map((r) => ({
      id: r.id,
      predictionId: asPredictionId(r.predictionId),
      editorUserId: userId(r.editorUserId),
      editorName: r.editorDisplayName || r.editorEmail || r.editorUserId,
      targetUserId: userId(r.targetUserId),
      targetName: targetUserMap.get(userId(r.targetUserId)) ?? r.targetUserId,
      fieldPath: r.fieldPath,
      oldValue: r.oldValue,
      newValue: r.newValue,
      reason: r.reason,
      source: r.source,
      editedAt: r.editedAt,
    }));
}
