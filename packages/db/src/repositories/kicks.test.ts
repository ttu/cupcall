import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../testing/make-test-db';
import { testScoring } from '../testing/fixtures';
import type { Db } from '../client';
import { recordKick, isKicked, clearKick } from './kicks';
import { createUser } from './users';
import { createPool } from './pools';
import type { UserId } from '@cup/engine';
import * as schema from '../schema/index';

describe('kicks repository', () => {
  let db: Db<typeof schema>;
  let poolId: string;
  let userId: UserId;

  beforeEach(async () => {
    db = await makeTestDb();
    const tId = `wc-${crypto.randomUUID()}`;
    await db.insert(schema.tournaments).values({
      id: tId,
      name: 'Test',
      firstKickoff: new Date(),
      scoringConfig: testScoring,
    });
    const owner = await createUser(db, {
      email: `owner-${crypto.randomUUID()}@x.com`,
      displayName: 'Owner',
    });
    const user = await createUser(db, {
      email: `u-${crypto.randomUUID()}@x.com`,
      displayName: 'User',
    });
    userId = user.id;
    const pool = await createPool(db, {
      tournamentId: tId,
      ownerId: owner.id,
      name: 'Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });
    poolId = pool.id;
  });

  describe('recordKick', () => {
    it('records a kick', async () => {
      await recordKick(db, poolId, userId);
      expect(await isKicked(db, poolId, userId)).toBe(true);
    });

    it('is idempotent — re-kicking does not throw', async () => {
      await recordKick(db, poolId, userId);
      await expect(recordKick(db, poolId, userId)).resolves.not.toThrow();
      // Still kicked, no duplicate row error
      expect(await isKicked(db, poolId, userId)).toBe(true);
    });
  });

  describe('isKicked', () => {
    it('returns false when not kicked', async () => {
      expect(await isKicked(db, poolId, userId)).toBe(false);
    });

    it('returns true after a kick is recorded', async () => {
      await recordKick(db, poolId, userId);
      expect(await isKicked(db, poolId, userId)).toBe(true);
    });
  });

  describe('clearKick', () => {
    it('removes a kick record', async () => {
      await recordKick(db, poolId, userId);
      await clearKick(db, poolId, userId);
      expect(await isKicked(db, poolId, userId)).toBe(false);
    });

    it('is a no-op when no kick record exists', async () => {
      await expect(clearKick(db, poolId, userId)).resolves.not.toThrow();
    });
  });
});
