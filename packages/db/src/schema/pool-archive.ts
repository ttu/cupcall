import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { pools } from './pools';
import { users } from './auth';
import type { ScoreBreakdown } from '@cup/engine';

export const poolArchives = pgTable(
  'pool_archives',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    poolId: text('pool_id')
      .notNull()
      .references(() => pools.id, { onDelete: 'cascade' }),
    poolName: text('pool_name').notNull(),
    tournamentId: text('tournament_id').notNull(),
    tournamentName: text('tournament_name').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }).notNull().defaultNow(),
    archivedBy: text('archived_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [uniqueIndex('pool_archives_pool_id_uniq').on(t.poolId)],
);

export const poolArchiveEntries = pgTable('pool_archive_entries', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  archiveId: text('archive_id')
    .notNull()
    .references(() => poolArchives.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  displayName: text('display_name').notNull(),
  rank: integer('rank').notNull(),
  pointsTotal: integer('points_total').notNull(),
  breakdown: jsonb('breakdown').notNull().$type<ScoreBreakdown>(),
});
