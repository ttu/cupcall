import { integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { pools } from './pools';
import type { ScoreBreakdown } from '@cup/engine';

export const scores = pgTable(
  'scores',
  {
    poolId: text('pool_id')
      .notNull()
      .references(() => pools.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    pointsTotal: integer('points_total').notNull().default(0),
    breakdown: jsonb('breakdown').notNull().$type<ScoreBreakdown>(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (s) => [primaryKey({ columns: [s.poolId, s.userId] })],
);
