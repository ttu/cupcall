import { sql } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema/index';

type Database = Db<typeof schema>;

const HOUR_MS = 60 * 60 * 1_000;

/**
 * Rate-limit configuration constants (functional-spec §9, technical-spec §11).
 * These are the canonical limits — never hard-code numbers at call sites.
 */
export const RATE_LIMITS = {
  /** Pool creation: ≤ 3 per hour per user. */
  createPool: { limit: 3, windowMs: HOUR_MS },
  /** Pool join: ≤ 10 per hour per user (and per IP — key encodes the dimension). */
  join: { limit: 10, windowMs: HOUR_MS },
  /** Magic-link request: ≤ 5 per hour per email (+ per IP — key encodes the dimension). */
  magicLink: { limit: 5, windowMs: HOUR_MS },
} as const satisfies Record<string, { limit: number; windowMs: number }>;

export type RateLimitResult = {
  allowed: boolean;
  count: number;
};

/**
 * Fixed-window rate-limit check.
 *
 * Atomically upserts (key, windowStart) in rate_limits, incrementing count by 1.
 * Returns { allowed, count } where allowed = count <= limit.
 *
 * @param db      - The database handle.
 * @param key     - Dimension key, e.g. "create_pool:user:<userId>".
 * @param limit   - Maximum allowed count per window.
 * @param windowMs - Window duration in milliseconds.
 * @param now     - Injected current time (do not call Date.now() here).
 */
export async function checkRateLimit(
  db: Database,
  {
    key,
    limit,
    windowMs,
    now,
  }: {
    key: string;
    limit: number;
    windowMs: number;
    now: Date;
  },
): Promise<RateLimitResult> {
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);

  // Atomically upsert: insert with count=1, or increment existing count by 1.
  // The composite PK (key, window_start) ensures exactly one row per window.
  const [row] = await db
    .insert(schema.rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [schema.rateLimits.key, schema.rateLimits.windowStart],
      set: {
        count: sql`${schema.rateLimits.count} + 1`,
      },
    })
    .returning();

  if (!row) throw new Error('checkRateLimit: upsert did not return a row');

  return { count: row.count, allowed: row.count <= limit };
}
