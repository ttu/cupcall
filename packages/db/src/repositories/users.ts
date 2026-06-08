import { eq } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema/index';
import { userId, type UserId } from '@cup/engine';

type Database = Db<typeof schema>;

export type UserRow = {
  id: UserId;
  name: string | null;
  email: string | null;
  emailVerified: Date | null;
  image: string | null;
  displayName: string;
};

function toUserRow(raw: typeof schema.users.$inferSelect): UserRow {
  return {
    ...raw,
    id: userId(raw.id),
  };
}

export async function createUser(
  db: Database,
  input: { email: string; displayName: string },
): Promise<UserRow> {
  const [row] = await db
    .insert(schema.users)
    .values({ email: input.email, displayName: input.displayName })
    .returning();
  if (!row) throw new Error('createUser: insert did not return a row');
  return toUserRow(row);
}

export async function getUserById(db: Database, id: UserId): Promise<UserRow | undefined> {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return row ? toUserRow(row) : undefined;
}

export async function getUserByEmail(db: Database, email: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  return row ? toUserRow(row) : undefined;
}

export async function updateDisplayName(
  db: Database,
  id: UserId,
  displayName: string,
): Promise<UserRow | undefined> {
  const [row] = await db
    .update(schema.users)
    .set({ displayName })
    .where(eq(schema.users.id, id))
    .returning();
  return row ? toUserRow(row) : undefined;
}
