import { and, eq } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema/index';
import type { UserId } from '@cup/engine';

type Database = Db<typeof schema>;

/**
 * Records a kick for (poolId, userId). Idempotent: the composite PK on pool_kicks
 * means a duplicate record is silently ignored via DO NOTHING on conflict.
 */
export async function recordKick(db: Database, poolId: string, userId: UserId): Promise<void> {
  await db
    .insert(schema.poolKicks)
    .values({ poolId, userId })
    .onConflictDoNothing({ target: [schema.poolKicks.poolId, schema.poolKicks.userId] });
}

export async function isKicked(db: Database, poolId: string, userId: UserId): Promise<boolean> {
  const [row] = await db
    .select({ poolId: schema.poolKicks.poolId })
    .from(schema.poolKicks)
    .where(and(eq(schema.poolKicks.poolId, poolId), eq(schema.poolKicks.userId, userId)));
  return row !== undefined;
}

export async function clearKick(db: Database, poolId: string, userId: UserId): Promise<void> {
  await db
    .delete(schema.poolKicks)
    .where(and(eq(schema.poolKicks.poolId, poolId), eq(schema.poolKicks.userId, userId)));
}
