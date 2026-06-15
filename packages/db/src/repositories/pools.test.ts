import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../testing/make-test-db';
import { testScoring } from '../testing/fixtures';
import type { Db } from '../client';
import * as schema from '../schema/index';
import {
  createPool,
  getPoolById,
  getPoolByInviteTokenHash,
  listPoolsForUser,
  rotateInviteTokenHash,
  deletePool,
  countPoolsOwnedBy,
} from './pools';
import { createUser } from './users';
import { addMember } from './members';
import type { UserId, TournamentId, PoolId } from '@cup/engine';
import { tournamentId as asTournamentId, poolId as asPoolId } from '@cup/engine';

async function seedTournament(db: Db<typeof schema>, id = 'wc-test'): Promise<TournamentId> {
  await db.insert(schema.tournaments).values({
    id,
    name: 'Test WC',
    firstKickoff: new Date(),
    scoringConfig: testScoring,
  });
  return asTournamentId(id);
}

describe('pools repository', () => {
  let db: Db<typeof schema>;
  let ownerId: UserId;
  let tournamentId: TournamentId;

  beforeEach(async () => {
    db = await makeTestDb();
    const owner = await createUser(db, {
      email: `owner-${crypto.randomUUID()}@x.com`,
      displayName: 'Owner',
    });
    ownerId = owner.id;
    tournamentId = await seedTournament(db, `wc-${crypto.randomUUID()}`);
  });

  describe('createPool / getPoolById', () => {
    it('round-trips a created pool', async () => {
      const pool = await createPool(db, {
        tournamentId,
        ownerId,
        name: 'My Pool',
        inviteTokenHash: 'hash-abc',
      });
      expect(pool.name).toBe('My Pool');
      expect(pool.ownerId).toBe(ownerId);
      expect(pool.inviteTokenHash).toBe('hash-abc');
      expect(pool.tokenExpiresAt).toBeNull();

      const found = await getPoolById(db, pool.id);
      expect(found?.name).toBe('My Pool');
    });

    it('returns undefined for a missing pool id', async () => {
      const result = await getPoolById(db, asPoolId('no-such-pool'));
      expect(result).toBeUndefined();
    });

    it('stores tokenExpiresAt when provided', async () => {
      const expiry = new Date('2030-01-01T00:00:00Z');
      const pool = await createPool(db, {
        tournamentId,
        ownerId,
        name: 'Expiring Pool',
        inviteTokenHash: 'hash-xyz',
        tokenExpiresAt: expiry,
      });
      const found = await getPoolById(db, pool.id);
      expect(found?.tokenExpiresAt?.toISOString()).toBe(expiry.toISOString());
    });
  });

  describe('getPoolByInviteTokenHash', () => {
    it('finds a pool by its invite token hash', async () => {
      const pool = await createPool(db, {
        tournamentId,
        ownerId,
        name: 'Token Pool',
        inviteTokenHash: 'unique-hash-42',
      });
      const found = await getPoolByInviteTokenHash(db, 'unique-hash-42');
      expect(found?.id).toBe(pool.id);
    });

    it('returns undefined for an unknown hash', async () => {
      const result = await getPoolByInviteTokenHash(db, 'ghost-hash');
      expect(result).toBeUndefined();
    });
  });

  describe('listPoolsForUser', () => {
    it('returns pools the user owns', async () => {
      await createPool(db, { tournamentId, ownerId, name: 'P1', inviteTokenHash: 'h1' });
      await createPool(db, { tournamentId, ownerId, name: 'P2', inviteTokenHash: 'h2' });
      const pools = await listPoolsForUser(db, ownerId);
      expect(pools).toHaveLength(2);
    });

    it('returns pools the user has joined as a member', async () => {
      const other = await createUser(db, {
        email: `other-${crypto.randomUUID()}@x.com`,
        displayName: 'Other',
      });
      const pool = await createPool(db, {
        tournamentId,
        ownerId: other.id,
        name: 'Other Pool',
        inviteTokenHash: 'h-other',
      });
      await addMember(db, pool.id, ownerId);
      const pools = await listPoolsForUser(db, ownerId);
      expect(pools.some((p) => p.id === pool.id)).toBe(true);
    });

    it('does not duplicate pools when user is both owner and member', async () => {
      const pool = await createPool(db, {
        tournamentId,
        ownerId,
        name: 'Own + Member',
        inviteTokenHash: 'h-both',
      });
      // Owner also added as explicit member
      await addMember(db, pool.id, ownerId);
      const pools = await listPoolsForUser(db, ownerId);
      const ids = pools.map((p) => p.id);
      expect(ids.filter((id) => id === pool.id)).toHaveLength(1);
    });

    it('returns empty array when user has no pools', async () => {
      const stranger = await createUser(db, {
        email: `stranger-${crypto.randomUUID()}@x.com`,
        displayName: 'Stranger',
      });
      const pools = await listPoolsForUser(db, stranger.id);
      expect(pools).toHaveLength(0);
    });
  });

  describe('rotateInviteTokenHash', () => {
    it('updates the invite token hash', async () => {
      const pool = await createPool(db, {
        tournamentId,
        ownerId,
        name: 'Rotate Pool',
        inviteTokenHash: 'old-hash',
      });
      await rotateInviteTokenHash(db, pool.id, 'new-hash');
      const found = await getPoolById(db, pool.id);
      expect(found?.inviteTokenHash).toBe('new-hash');
    });
  });

  describe('deletePool', () => {
    it('removes the pool', async () => {
      const pool = await createPool(db, {
        tournamentId,
        ownerId,
        name: 'To Delete',
        inviteTokenHash: 'h-del',
      });
      await deletePool(db, pool.id);
      const found = await getPoolById(db, pool.id);
      expect(found).toBeUndefined();
    });
  });

  describe('countPoolsOwnedBy', () => {
    it('returns 0 when user owns no pools', async () => {
      expect(await countPoolsOwnedBy(db, ownerId)).toBe(0);
    });

    it('counts only pools owned by the given user', async () => {
      await createPool(db, { tournamentId, ownerId, name: 'P1', inviteTokenHash: 'h-co1' });
      await createPool(db, { tournamentId, ownerId, name: 'P2', inviteTokenHash: 'h-co2' });

      const other = await createUser(db, {
        email: `other-co-${crypto.randomUUID()}@x.com`,
        displayName: 'Other',
      });
      await createPool(db, {
        tournamentId,
        ownerId: other.id,
        name: 'Other Pool',
        inviteTokenHash: 'h-co3',
      });

      expect(await countPoolsOwnedBy(db, ownerId)).toBe(2);
      expect(await countPoolsOwnedBy(db, other.id)).toBe(1);
    });
  });

  describe('inviteTokenHash uniqueness', () => {
    it('rejects two pools with the same inviteTokenHash', async () => {
      await createPool(db, {
        tournamentId,
        ownerId,
        name: 'Pool A',
        inviteTokenHash: 'duplicate-hash',
      });
      await expect(
        createPool(db, {
          tournamentId,
          ownerId,
          name: 'Pool B',
          inviteTokenHash: 'duplicate-hash',
        }),
      ).rejects.toThrow();
    });
  });
});
