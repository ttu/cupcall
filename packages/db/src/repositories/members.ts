import { and, eq, count } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema/index';
import { userId, type UserId } from '@cup/engine';

type Database = Db<typeof schema>;

export type MemberRow = {
  poolId: string;
  userId: UserId;
  joinedAt: Date;
};

function toMemberRow(raw: typeof schema.poolMembers.$inferSelect): MemberRow {
  return { ...raw, userId: userId(raw.userId) };
}

/**
 * Adds a user to a pool. Idempotent: if the (poolId, userId) pair already exists
 * the conflict is silently ignored (do-nothing on the unique index conflict).
 */
export async function addMember(db: Database, poolId: string, userId: UserId): Promise<void> {
  await db
    .insert(schema.poolMembers)
    .values({ poolId, userId })
    .onConflictDoNothing({ target: [schema.poolMembers.poolId, schema.poolMembers.userId] });
}

export async function removeMember(db: Database, poolId: string, userId: UserId): Promise<void> {
  await db
    .delete(schema.poolMembers)
    .where(and(eq(schema.poolMembers.poolId, poolId), eq(schema.poolMembers.userId, userId)));
}

export async function listMembers(db: Database, poolId: string): Promise<MemberRow[]> {
  const rows = await db
    .select()
    .from(schema.poolMembers)
    .where(eq(schema.poolMembers.poolId, poolId));
  return rows.map(toMemberRow);
}

export async function countPoolMembers(db: Database, poolId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.poolMembers)
    .where(eq(schema.poolMembers.poolId, poolId));
  return row?.n ?? 0;
}

export async function isMember(db: Database, poolId: string, userId: UserId): Promise<boolean> {
  const [row] = await db
    .select({ poolId: schema.poolMembers.poolId })
    .from(schema.poolMembers)
    .where(and(eq(schema.poolMembers.poolId, poolId), eq(schema.poolMembers.userId, userId)));
  return row !== undefined;
}
