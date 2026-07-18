import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../testing/make-test-db';
import type { Db } from '../client';
import * as schema from '../schema/index';
import {
  createUser,
  createGuestUser,
  getUserById,
  getUserByEmail,
  updateDisplayName,
  deleteUser,
  upsertPendingEmailLink,
  getPendingEmailLinkByToken,
  deletePendingEmailLink,
  linkEmailToUser,
  clearUserEmail,
} from './users';
import { createPool } from './pools';
import { upsertTournamentDef } from './tournament';
import { upsertPoolArchive, getPoolArchiveWithEntries } from './pool-archive';
import { miniTournament } from '@cup/engine/testing';
import { tournamentId as asTournamentId, points } from '@cup/engine';
import type { ScoreBreakdown } from '@cup/engine';

describe('users repository', () => {
  let db: Db<typeof schema>;

  beforeEach(async () => {
    db = await makeTestDb();
  });

  describe('createUser / getUserById', () => {
    it('round-trips a created user', async () => {
      const created = await createUser(db, { email: 'alice@example.com', displayName: 'Alice' });
      expect(created.email).toBe('alice@example.com');
      expect(created.displayName).toBe('Alice');
      expect(created.id).toBeTypeOf('string');

      const found = await getUserById(db, created.id);
      expect(found).toBeDefined();
      expect(found?.email).toBe('alice@example.com');
      expect(found?.displayName).toBe('Alice');
    });

    it('returns undefined for a missing id', async () => {
      const { userId } = await import('@cup/engine');
      const result = await getUserById(db, userId('no-such-id'));
      expect(result).toBeUndefined();
    });
  });

  describe('getUserByEmail', () => {
    it('finds a user by email', async () => {
      await createUser(db, { email: 'bob@example.com', displayName: 'Bob' });
      const found = await getUserByEmail(db, 'bob@example.com');
      expect(found?.displayName).toBe('Bob');
    });

    it('returns undefined when email does not exist', async () => {
      const result = await getUserByEmail(db, 'nobody@example.com');
      expect(result).toBeUndefined();
    });
  });

  describe('updateDisplayName', () => {
    it('changes the display name and returns the updated row', async () => {
      const created = await createUser(db, { email: 'carol@example.com', displayName: 'Carol' });
      const updated = await updateDisplayName(db, created.id, 'Carol Updated');
      expect(updated?.displayName).toBe('Carol Updated');

      const refetched = await getUserById(db, created.id);
      expect(refetched?.displayName).toBe('Carol Updated');
    });

    it('returns undefined when the user does not exist', async () => {
      const { userId } = await import('@cup/engine');
      const result = await updateDisplayName(db, userId('ghost-id'), 'Ghost');
      expect(result).toBeUndefined();
    });
  });

  describe('upsertPendingEmailLink / getPendingEmailLinkByToken / deletePendingEmailLink', () => {
    it('stores and retrieves a pending link by token', async () => {
      const user = await createGuestUser(db, { displayName: 'Guest' });
      const expiresAt = new Date(Date.now() + 86_400_000);

      await upsertPendingEmailLink(db, {
        userId: user.id,
        email: 'guest@example.com',
        token: 'tok-abc',
        expiresAt,
      });

      const found = await getPendingEmailLinkByToken(db, 'tok-abc');
      expect(found?.userId).toBe(user.id);
      expect(found?.email).toBe('guest@example.com');
    });

    it('replaces an existing pending link on upsert', async () => {
      const user = await createGuestUser(db, { displayName: 'Guest2' });
      const expiresAt = new Date(Date.now() + 86_400_000);

      await upsertPendingEmailLink(db, {
        userId: user.id,
        email: 'first@example.com',
        token: 'tok-first',
        expiresAt,
      });
      await upsertPendingEmailLink(db, {
        userId: user.id,
        email: 'second@example.com',
        token: 'tok-second',
        expiresAt,
      });

      expect(await getPendingEmailLinkByToken(db, 'tok-first')).toBeUndefined();
      const found = await getPendingEmailLinkByToken(db, 'tok-second');
      expect(found?.email).toBe('second@example.com');
    });

    it('returns undefined for an unknown token', async () => {
      expect(await getPendingEmailLinkByToken(db, 'no-such-token')).toBeUndefined();
    });

    it('deletes the pending link', async () => {
      const user = await createGuestUser(db, { displayName: 'Guest3' });
      await upsertPendingEmailLink(db, {
        userId: user.id,
        email: 'del@example.com',
        token: 'tok-del',
        expiresAt: new Date(Date.now() + 86_400_000),
      });

      await deletePendingEmailLink(db, 'tok-del');
      expect(await getPendingEmailLinkByToken(db, 'tok-del')).toBeUndefined();
    });
  });

  describe('deleteUser', () => {
    it('removes the user so it can no longer be found', async () => {
      const user = await createUser(db, { email: 'del@example.com', displayName: 'Delete Me' });
      await deleteUser(db, user.id);
      expect(await getUserById(db, user.id)).toBeUndefined();
    });

    it('is a no-op for a non-existent id', async () => {
      const { userId } = await import('@cup/engine');
      await expect(deleteUser(db, userId('ghost-id'))).resolves.toBeUndefined();
    });

    it("anonymizes a non-owner member's pool archive entry but keeps rank/points/breakdown", async () => {
      // Not the pool owner: pools.ownerId cascades from users.id (pre-existing), and
      // pool_archives.poolId cascades from pools.id (Task 1) — deleting the owner would cascade
      // away the whole pool and archive, leaving nothing to anonymize. That's an accepted
      // limitation, not this test's concern; anonymization is only observable for non-owner
      // members, whose deletion only removes their own pool_members row, not the pool.
      const FUTURE_KICKOFF = new Date('2099-06-11T18:00:00Z');
      await upsertTournamentDef(db, miniTournament, FUTURE_KICKOFF, new Map());
      const tournamentId = asTournamentId(miniTournament.id);

      const owner = await createUser(db, { email: 'owner@x.com', displayName: 'Owner' });
      const pool = await createPool(db, { tournamentId, ownerId: owner.id, name: 'Archived Pool' });
      const member = await createUser(db, { email: 'member@x.com', displayName: 'Member' });

      const breakdown: ScoreBreakdown = {
        groupMatches: points(42),
        groupOrder: points(0),
        bronze: points(0),
        final: points(0),
        roundOf16: points(0),
        roundOf8: points(0),
        topFour: points(0),
        topFourTeams: points(0),
        topFourPosition: points(0),
        specials: points(0),
        total: points(42),
      };

      await upsertPoolArchive(db, {
        poolId: pool.id,
        poolName: pool.name,
        tournamentId,
        tournamentName: miniTournament.name,
        archivedBy: owner.id,
        entries: [
          { userId: owner.id, displayName: 'Owner', rank: 1, pointsTotal: points(50), breakdown },
          { userId: member.id, displayName: 'Member', rank: 2, pointsTotal: points(42), breakdown },
        ],
      });

      await deleteUser(db, member.id);

      const fetched = await getPoolArchiveWithEntries(db, pool.id);
      expect(fetched?.entries).toHaveLength(2);
      const memberEntry = fetched?.entries.find((e) => e.rank === 2);
      expect(memberEntry?.displayName).toBe('Deleted user');
      expect(memberEntry?.userId).toBeNull();
      const ownerEntry = fetched?.entries.find((e) => e.rank === 1);
      expect(ownerEntry?.displayName).toBe('Owner'); // untouched
      expect(memberEntry?.rank).toBe(2);
      expect(memberEntry?.pointsTotal).toBe(42);
      expect(memberEntry?.breakdown.total).toBe(42);
    });
  });

  describe('linkEmailToUser', () => {
    it('sets email and emailVerified for a guest user', async () => {
      const guest = await createGuestUser(db, { displayName: 'LinkMe' });
      const updated = await linkEmailToUser(db, guest.id, 'linked@example.com');

      expect(updated?.email).toBe('linked@example.com');
      expect(updated?.emailVerified).toBeInstanceOf(Date);
    });

    it('returns undefined and makes no change when user already has an email', async () => {
      const user = await createUser(db, { email: 'already@example.com', displayName: 'Already' });
      const result = await linkEmailToUser(db, user.id, 'other@example.com');

      expect(result).toBeUndefined();
      const refetched = await getUserById(db, user.id);
      expect(refetched?.email).toBe('already@example.com');
    });
  });

  describe('clearUserEmail', () => {
    it('clears email and emailVerified, returns the updated row', async () => {
      const user = await createUser(db, { email: 'linked@example.com', displayName: 'Linked' });
      const result = await clearUserEmail(db, user.id);

      expect(result?.email).toBeNull();
      expect(result?.emailVerified).toBeNull();

      const refetched = await getUserById(db, user.id);
      expect(refetched?.email).toBeNull();
      expect(refetched?.emailVerified).toBeNull();
    });

    it('returns undefined when the user does not exist', async () => {
      const { userId } = await import('@cup/engine');
      const result = await clearUserEmail(db, userId('no-such-id'));
      expect(result).toBeUndefined();
    });
  });
});
