import { integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * DB-backed rate-limit counters (functional-spec §9).
 * Key encodes the rate-limit dimension (e.g. "create_pool:user:<userId>").
 * windowStart marks the start of the current counting window.
 * count is incremented atomically via UPDATE ... SET count = count + 1.
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (rl) => [primaryKey({ columns: [rl.key, rl.windowStart] })],
);
