import { integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import type { UserId } from '@cup/engine';

/**
 * Auth.js (next-auth v5) Drizzle adapter schema for PostgreSQL.
 * Column names and nullability match @auth/drizzle-adapter pg.ts exactly so the
 * adapter works without a custom schema config (Chunk E).
 * Extra columns (displayName) are app additions — the adapter ignores unknown columns.
 *
 * WARNING: The camelCase column names below (userId, sessionToken, providerAccountId,
 * emailVerified) are REQUIRED by @auth/drizzle-adapter and must NOT be normalised to
 * snake_case — the adapter reads these names directly and will break silently if changed.
 */
export const users = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())
    .$type<UserId>(),
  name: text('name'), // adapter required (nullable)
  email: text('email').unique(), // adapter required (nullable for compat)
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  // App-specific addition:
  displayName: text('display_name').notNull().default(''), // shown on leaderboards (§5)
});

export const accounts = pgTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })],
);

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// Pending email-link requests: guest user has requested to connect an email.
// One pending link per user; upsert to replace. Expires after 24 h.
export const pendingEmailLinks = pgTable('pending_email_link', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' })
    .$type<UserId>(),
  email: text('email').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { mode: 'date' }).notNull(),
});

// Personal login tokens for guest users (no email/password).
// One token per user; upsert to rotate. Stored plaintext like viewToken.
export const userLoginTokens = pgTable('user_login_token', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' })
    .$type<UserId>(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
