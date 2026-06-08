import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../testing/make-test-db';
import { testScoring } from '../testing/fixtures';
import type { Db } from '../client';
import { addMember, removeMember, listMembers, isMember } from './members';
import { createUser } from './users';
import { createPool } from './pools';
import type { UserId } from '@cup/engine';
import * as schema from '../schema/index';

describe('members repository', () => {
  let db: Db<typeof schema>;
  let poolId: string;
  let user1Id: UserId;
  let user2Id: UserId;

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
    const u1 = await createUser(db, {
      email: `u1-${crypto.randomUUID()}@x.com`,
      displayName: 'U1',
    });
    const u2 = await createUser(db, {
      email: `u2-${crypto.randomUUID()}@x.com`,
      displayName: 'U2',
    });
    user1Id = u1.id;
    user2Id = u2.id;
    const pool = await createPool(db, {
      tournamentId: tId,
      ownerId: owner.id,
      name: 'Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });
    poolId = pool.id;
  });

  describe('addMember', () => {
    it('adds a user to a pool', async () => {
      await addMember(db, poolId, user1Id);
      expect(await isMember(db, poolId, user1Id)).toBe(true);
    });

    it('is idempotent — duplicate add does not throw or create duplicate', async () => {
      await addMember(db, poolId, user1Id);
      await expect(addMember(db, poolId, user1Id)).resolves.not.toThrow();
      const members = await listMembers(db, poolId);
      expect(members.filter((m) => m.userId === user1Id)).toHaveLength(1);
    });
  });

  describe('removeMember', () => {
    it('removes a member from a pool', async () => {
      await addMember(db, poolId, user1Id);
      await removeMember(db, poolId, user1Id);
      expect(await isMember(db, poolId, user1Id)).toBe(false);
    });

    it('is a no-op when the member does not exist', async () => {
      await expect(removeMember(db, poolId, user1Id)).resolves.not.toThrow();
    });
  });

  describe('listMembers', () => {
    it('returns all members of a pool', async () => {
      await addMember(db, poolId, user1Id);
      await addMember(db, poolId, user2Id);
      const members = await listMembers(db, poolId);
      expect(members).toHaveLength(2);
      const ids = members.map((m) => m.userId);
      expect(ids).toContain(user1Id);
      expect(ids).toContain(user2Id);
    });

    it('returns empty array when pool has no members', async () => {
      const members = await listMembers(db, poolId);
      expect(members).toHaveLength(0);
    });
  });

  describe('isMember', () => {
    it('returns true when the user is a member', async () => {
      await addMember(db, poolId, user1Id);
      expect(await isMember(db, poolId, user1Id)).toBe(true);
    });

    it('returns false when the user is not a member', async () => {
      expect(await isMember(db, poolId, user2Id)).toBe(false);
    });
  });
});
