import { eq } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema/index';
import { userId, type UserId } from '@cup/engine';

export type LoginTokenRow = { userId: UserId; token: string; createdAt: Date };

type Database = Db<typeof schema>;

export type UserRow = {
  id: UserId;
  name: string | null;
  email: string | null;
  emailVerified: Date | null;
  image: string | null;
  displayName: string;
};

export type DbSession = {
  sessionToken: string;
  userId: string;
  expires: Date;
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

export async function createGuestUser(
  db: Database,
  input: { displayName: string },
): Promise<UserRow> {
  const [row] = await db
    .insert(schema.users)
    .values({ displayName: input.displayName })
    .returning();
  if (!row) throw new Error('createGuestUser: insert did not return a row');
  return toUserRow(row);
}

export async function createDbSession(
  db: Database,
  input: { sessionToken: string; userId: UserId; expires: Date },
): Promise<DbSession> {
  const [row] = await db
    .insert(schema.sessions)
    .values({
      sessionToken: input.sessionToken,
      userId: input.userId,
      expires: input.expires,
    })
    .returning();
  if (!row) throw new Error('createDbSession: insert did not return a row');
  return row;
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

export async function upsertLoginToken(
  db: Database,
  id: UserId,
  token: string,
): Promise<LoginTokenRow> {
  const [row] = await db
    .insert(schema.userLoginTokens)
    .values({ userId: id, token })
    .onConflictDoUpdate({
      target: schema.userLoginTokens.userId,
      set: { token, createdAt: new Date() },
    })
    .returning();
  if (!row) throw new Error('upsertLoginToken: insert did not return a row');
  return { userId: userId(row.userId), token: row.token, createdAt: row.createdAt };
}

export async function getLoginTokenByToken(
  db: Database,
  token: string,
): Promise<LoginTokenRow | undefined> {
  const [row] = await db
    .select()
    .from(schema.userLoginTokens)
    .where(eq(schema.userLoginTokens.token, token));
  if (!row) return undefined;
  return { userId: userId(row.userId), token: row.token, createdAt: row.createdAt };
}

export async function getLoginTokenByUserId(
  db: Database,
  id: UserId,
): Promise<LoginTokenRow | undefined> {
  const [row] = await db
    .select()
    .from(schema.userLoginTokens)
    .where(eq(schema.userLoginTokens.userId, id));
  if (!row) return undefined;
  return { userId: userId(row.userId), token: row.token, createdAt: row.createdAt };
}
