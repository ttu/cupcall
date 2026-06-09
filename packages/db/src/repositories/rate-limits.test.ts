import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../testing/make-test-db';
import type { Db } from '../client';
import * as schema from '../schema/index';
import { checkRateLimit, RATE_LIMITS } from './rate-limits';

describe('rate-limits repository', () => {
  let db: Db<typeof schema>;
  const WINDOW_MS = 60_000; // 1 minute for test speed
  const LIMIT = 3;

  beforeEach(async () => {
    db = await makeTestDb();
  });

  function now(offsetMs = 0): Date {
    // Fixed base time to avoid real-clock flakiness
    return new Date(1_700_000_000_000 + offsetMs);
  }

  describe('checkRateLimit', () => {
    it('allows the first request', async () => {
      const result = await checkRateLimit(db, {
        key: 'test:user:1',
        limit: LIMIT,
        windowMs: WINDOW_MS,
        now: now(),
      });
      expect(result.allowed).toBe(true);
      expect(result.count).toBe(1);
    });

    it('allows up to the limit', async () => {
      const key = 'test:user:2';
      for (let i = 1; i <= LIMIT; i++) {
        const result = await checkRateLimit(db, {
          key,
          limit: LIMIT,
          windowMs: WINDOW_MS,
          now: now(),
        });
        expect(result.allowed).toBe(true);
        expect(result.count).toBe(i);
      }
    });

    it('denies the (limit + 1)-th call in the same window', async () => {
      const key = 'test:user:3';
      for (let i = 0; i < LIMIT; i++) {
        await checkRateLimit(db, { key, limit: LIMIT, windowMs: WINDOW_MS, now: now() });
      }
      const result = await checkRateLimit(db, {
        key,
        limit: LIMIT,
        windowMs: WINDOW_MS,
        now: now(),
      });
      expect(result.allowed).toBe(false);
      expect(result.count).toBe(LIMIT + 1);
    });

    it('resets to allowed when advancing now to a new window', async () => {
      const key = 'test:user:4';
      // Exhaust the first window
      for (let i = 0; i <= LIMIT; i++) {
        await checkRateLimit(db, { key, limit: LIMIT, windowMs: WINDOW_MS, now: now() });
      }
      // Advance time to the next window
      const nextWindow = now(WINDOW_MS);
      const result = await checkRateLimit(db, {
        key,
        limit: LIMIT,
        windowMs: WINDOW_MS,
        now: nextWindow,
      });
      expect(result.allowed).toBe(true);
      expect(result.count).toBe(1);
    });

    it('uses separate counters for different keys', async () => {
      const r1 = await checkRateLimit(db, {
        key: 'key:A',
        limit: LIMIT,
        windowMs: WINDOW_MS,
        now: now(),
      });
      const r2 = await checkRateLimit(db, {
        key: 'key:B',
        limit: LIMIT,
        windowMs: WINDOW_MS,
        now: now(),
      });
      expect(r1.count).toBe(1);
      expect(r2.count).toBe(1);
    });
  });

  describe('RATE_LIMITS config', () => {
    it('exports createPool limit', () => {
      expect(RATE_LIMITS.createPool.limit).toBe(3);
      expect(RATE_LIMITS.createPool.windowMs).toBe(60 * 60 * 1_000);
    });

    it('exports join limit', () => {
      expect(RATE_LIMITS.join.limit).toBe(10);
      expect(RATE_LIMITS.join.windowMs).toBe(60 * 60 * 1_000);
    });

    it('exports joinGuestIp limit', () => {
      expect(RATE_LIMITS.joinGuestIp.limit).toBe(5);
      expect(RATE_LIMITS.joinGuestIp.windowMs).toBe(60 * 60 * 1_000);
    });

    it('exports magicLink limit', () => {
      expect(RATE_LIMITS.magicLink.limit).toBe(5);
      expect(RATE_LIMITS.magicLink.windowMs).toBe(60 * 60 * 1_000);
    });
  });
});
