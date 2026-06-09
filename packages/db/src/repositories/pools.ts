import { eq, inArray, count } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema/index';
import type { UserId } from '@cup/engine';
import { userId } from '@cup/engine';

type Database = Db<typeof schema>;

export type PoolRow = {
  id: string;
  tournamentId: string;
  ownerId: UserId;
  name: string;
  inviteTokenHash: string | null;
  tokenExpiresAt: Date | null;
  viewToken: string | null;
  createdAt: Date;
};

function toPoolRow(raw: typeof schema.pools.$inferSelect): PoolRow {
  return { ...raw, ownerId: userId(raw.ownerId) };
}

export async function createPool(
  db: Database,
  input: {
    tournamentId: string;
    ownerId: UserId;
    name: string;
    inviteTokenHash?: string;
    tokenExpiresAt?: Date;
  },
): Promise<PoolRow> {
  const [row] = await db
    .insert(schema.pools)
    .values({
      tournamentId: input.tournamentId,
      ownerId: input.ownerId,
      name: input.name,
      inviteTokenHash: input.inviteTokenHash,
      tokenExpiresAt: input.tokenExpiresAt,
    })
    .returning();
  if (!row) throw new Error('createPool: insert did not return a row');
  return toPoolRow(row);
}

export async function getPoolById(db: Database, id: string): Promise<PoolRow | undefined> {
  const [row] = await db.select().from(schema.pools).where(eq(schema.pools.id, id));
  return row ? toPoolRow(row) : undefined;
}

export async function getPoolByInviteTokenHash(
  db: Database,
  hash: string,
): Promise<PoolRow | undefined> {
  const [row] = await db.select().from(schema.pools).where(eq(schema.pools.inviteTokenHash, hash));
  return row ? toPoolRow(row) : undefined;
}

/**
 * Returns pools the user owns OR is a member of, deduplicated.
 * A pool owner is typically also a member, so the union is deduped by poolId.
 */
export async function listPoolsForUser(db: Database, userId: UserId): Promise<PoolRow[]> {
  // Owned pools
  const owned = await db.select().from(schema.pools).where(eq(schema.pools.ownerId, userId));

  // Joined-as-member pools (may overlap with owned)
  const memberRows = await db
    .select({ poolId: schema.poolMembers.poolId })
    .from(schema.poolMembers)
    .where(eq(schema.poolMembers.userId, userId));

  // Only fetch pools where user is a member but not already an owner
  const ownedIds = new Set(owned.map((p) => p.id));
  const extraIds = memberRows.map((r) => r.poolId).filter((id) => !ownedIds.has(id));

  if (extraIds.length === 0) {
    return owned.map(toPoolRow);
  }

  // Fetch member-only pools in a single query using IN
  const memberPools = await db
    .select()
    .from(schema.pools)
    .where(inArray(schema.pools.id, extraIds));

  return [...owned.map(toPoolRow), ...memberPools.map(toPoolRow)];
}

export async function rotateInviteTokenHash(
  db: Database,
  poolId: string,
  newHash: string,
): Promise<void> {
  await db
    .update(schema.pools)
    .set({ inviteTokenHash: newHash })
    .where(eq(schema.pools.id, poolId));
}

export async function clearInviteToken(db: Database, poolId: string): Promise<void> {
  await db.update(schema.pools).set({ inviteTokenHash: null }).where(eq(schema.pools.id, poolId));
}

export async function getPoolByViewToken(
  db: Database,
  token: string,
): Promise<PoolRow | undefined> {
  const [row] = await db.select().from(schema.pools).where(eq(schema.pools.viewToken, token));
  return row ? toPoolRow(row) : undefined;
}

export async function rotateViewToken(
  db: Database,
  poolId: string,
  newToken: string,
): Promise<void> {
  await db.update(schema.pools).set({ viewToken: newToken }).where(eq(schema.pools.id, poolId));
}

export async function clearViewToken(db: Database, poolId: string): Promise<void> {
  await db.update(schema.pools).set({ viewToken: null }).where(eq(schema.pools.id, poolId));
}

export async function deletePool(db: Database, poolId: string): Promise<void> {
  await db.delete(schema.pools).where(eq(schema.pools.id, poolId));
}

export async function countPoolsOwnedBy(db: Database, ownerId: UserId): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.pools)
    .where(eq(schema.pools.ownerId, ownerId));
  return row?.n ?? 0;
}
