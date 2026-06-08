import { pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { tournaments } from './tournament';

export const pools = pgTable(
  'pools',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tournamentId: text('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Null means invite link is disabled; unique when set.
    inviteTokenHash: text('invite_token_hash'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('pools_invite_token_hash_uniq').on(t.inviteTokenHash)],
);

export const poolMembers = pgTable(
  'pool_members',
  {
    poolId: text('pool_id')
      .notNull()
      .references(() => pools.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (pm) => [uniqueIndex('pool_members_pool_user_uniq').on(pm.poolId, pm.userId)],
);

export const poolKicks = pgTable(
  'pool_kicks',
  {
    poolId: text('pool_id')
      .notNull()
      .references(() => pools.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kickedAt: timestamp('kicked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (pk) => [primaryKey({ columns: [pk.poolId, pk.userId] })],
);
