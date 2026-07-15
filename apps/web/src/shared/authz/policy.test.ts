/**
 * Integration tests for the authz policy layer.
 *
 * Uses a real in-memory PGlite database (via makeTestDb) with actual
 * repository calls — no mocks except the injected clock.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import { createUser, createPool, addMember, removeMember, recordKick, tournaments } from '@cup/db';
import { tournamentId as asTournamentId } from '@cup/engine';
import type { UserId, PoolId } from '@cup/engine';
import {
  ForbiddenError,
  LockedError,
  assertSignedIn,
  assertIsOwner,
  assertIsMember,
  assertCanEditOwnCard,
  assertCanOwnerEdit,
  canViewCard,
  auditVisibleTo,
} from './index';
import type { Actor } from './index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A fixed lock time used throughout these tests. */
const LOCK_TIME = new Date('2026-06-11T18:00:00Z');
/** A moment well before lock. */
const BEFORE_LOCK = new Date('2026-06-11T17:59:59Z');
/** The lock instant itself — counts as locked. */
const AT_LOCK = new Date('2026-06-11T18:00:00Z');
/** A moment well after lock. */
const AFTER_LOCK = new Date('2026-06-12T00:00:00Z');
/** A join time clearly before lock (early joiner). */
const JOINED_BEFORE_LOCK = new Date('2026-06-10T10:00:00Z');
/** A join time at lock (late joiner — joined exactly at first kickoff). */
const JOINED_AT_LOCK = new Date('2026-06-11T18:00:00Z');
/** A join time after lock (late joiner). */
const JOINED_AFTER_LOCK = new Date('2026-06-12T00:00:00Z');

function actor(userId: UserId): Actor {
  return { userId };
}

// ---------------------------------------------------------------------------
// Test fixture setup
// ---------------------------------------------------------------------------

describe('authz policy', () => {
  let db: Awaited<ReturnType<typeof makeTestDb>>;
  let ownerId: UserId;
  let memberId: UserId;
  let lateMemberId: UserId;
  let outsiderId: UserId;
  let poolId: PoolId;

  beforeEach(async () => {
    db = await makeTestDb();

    // Create a tournament (required FK for the pool).
    const tId = `wc-${crypto.randomUUID()}`;
    await db.insert(tournaments).values({
      id: tId,
      name: 'Test Tournament',
      firstKickoff: LOCK_TIME,
      scoringConfig: {
        groupMatch: { exactScore: 6, correctOutcome: 3 },
        groupOrder: { allCorrect: 6, twoCorrect: 3, oneCorrect: 1 },
        groupTopScoringTeam: 10,
        groupTopConcedingTeam: 10,
        roundOf16PerTeam: 2,
        roundOf8PerTeam: 3,
        bronze: { exactScore: 5, perTeam: 5 },
        final: { exactScore: 5, perTeam: 5 },
        roundOf4PerTeam: 5,
        topFourPositionBonus: 3,
        tournamentTopScoringTeam: 10,
        tournamentTopConcedingTeam: 10,
        highestMatchGoals: 10,
        mostYellowCardsTeam: 15,
        firstRedCardPlayer: 20,
        penaltyShootoutCount: 10,
        finalDecidedByPenalties: 10,
        finalDecisiveGoalPlayer: 20,
        topScorerPlayer: 15,
      },
    });

    // Create users.
    const ownerUser = await createUser(db, {
      email: `owner-${crypto.randomUUID()}@test.com`,
      displayName: 'Owner',
    });
    const memberUser = await createUser(db, {
      email: `member-${crypto.randomUUID()}@test.com`,
      displayName: 'Member',
    });
    const lateMemberUser = await createUser(db, {
      email: `late-${crypto.randomUUID()}@test.com`,
      displayName: 'Late Member',
    });
    const outsiderUser = await createUser(db, {
      email: `outsider-${crypto.randomUUID()}@test.com`,
      displayName: 'Outsider',
    });

    ownerId = ownerUser.id;
    memberId = memberUser.id;
    lateMemberId = lateMemberUser.id;
    outsiderId = outsiderUser.id;

    // Create a pool owned by ownerUser.
    const pool = await createPool(db, {
      tournamentId: asTournamentId(tId),
      ownerId,
      name: 'Test Pool',
      inviteTokenHash: `hash-${crypto.randomUUID()}`,
    });
    poolId = pool.id;

    // memberId joined before lock (early joiner); lateMemberId joined after.
    await addMember(db, poolId, memberId, JOINED_BEFORE_LOCK);
    await addMember(db, poolId, lateMemberId, JOINED_AFTER_LOCK);
  });

  // -------------------------------------------------------------------------
  // assertSignedIn
  // -------------------------------------------------------------------------

  describe('assertSignedIn', () => {
    it('does not throw for a signed-in actor', () => {
      expect(() => assertSignedIn(actor(memberId))).not.toThrow();
    });

    it('throws ForbiddenError for a null actor', () => {
      expect(() => assertSignedIn(null)).toThrowError(ForbiddenError);
    });

    it('ForbiddenError has a clear actionable message', () => {
      expect(() => assertSignedIn(null)).toThrowError(/sign in/i);
    });
  });

  // -------------------------------------------------------------------------
  // assertIsOwner
  // -------------------------------------------------------------------------

  describe('assertIsOwner', () => {
    it('does not throw when the user is the pool owner', () => {
      expect(() => assertIsOwner({ id: poolId, ownerId }, ownerId)).not.toThrow();
    });

    it('throws ForbiddenError when the user is not the owner', () => {
      expect(() => assertIsOwner({ id: poolId, ownerId }, memberId)).toThrowError(ForbiddenError);
    });

    it('error message identifies the user and pool', () => {
      expect(() => assertIsOwner({ id: poolId, ownerId }, memberId)).toThrowError(poolId);
    });
  });

  // -------------------------------------------------------------------------
  // assertIsMember
  // -------------------------------------------------------------------------

  describe('assertIsMember', () => {
    it('does not throw for a current member', async () => {
      await expect(assertIsMember(db, poolId, memberId)).resolves.not.toThrow();
    });

    it('throws ForbiddenError for a non-member', async () => {
      await expect(assertIsMember(db, poolId, outsiderId)).rejects.toThrowError(ForbiddenError);
    });

    it('throws ForbiddenError for a kicked user', async () => {
      // Kick: remove from pool_members, record in pool_kicks.
      await removeMember(db, poolId, memberId);
      await recordKick(db, poolId, memberId);

      await expect(assertIsMember(db, poolId, memberId)).rejects.toThrowError(ForbiddenError);
    });
  });

  // -------------------------------------------------------------------------
  // assertCanEditOwnCard
  // -------------------------------------------------------------------------

  describe('assertCanEditOwnCard', () => {
    it('allows a current member to edit their card before lock', async () => {
      await expect(
        assertCanEditOwnCard(db, {
          actor: actor(memberId),
          pool: { id: poolId, ownerId },
          lockTime: LOCK_TIME,
          now: BEFORE_LOCK,
        }),
      ).resolves.not.toThrow();
    });

    it('throws LockedError when now equals lockTime', async () => {
      await expect(
        assertCanEditOwnCard(db, {
          actor: actor(memberId),
          pool: { id: poolId, ownerId },
          lockTime: LOCK_TIME,
          now: AT_LOCK,
        }),
      ).rejects.toThrowError(LockedError);
    });

    it('throws LockedError when now is after lockTime', async () => {
      await expect(
        assertCanEditOwnCard(db, {
          actor: actor(memberId),
          pool: { id: poolId, ownerId },
          lockTime: LOCK_TIME,
          now: AFTER_LOCK,
        }),
      ).rejects.toThrowError(LockedError);
    });

    it('throws ForbiddenError for an anonymous caller (null actor)', async () => {
      await expect(
        assertCanEditOwnCard(db, {
          actor: null,
          pool: { id: poolId, ownerId },
          lockTime: LOCK_TIME,
          now: BEFORE_LOCK,
        }),
      ).rejects.toThrowError(ForbiddenError);
    });

    it('throws ForbiddenError for a non-member before lock', async () => {
      await expect(
        assertCanEditOwnCard(db, {
          actor: actor(outsiderId),
          pool: { id: poolId, ownerId },
          lockTime: LOCK_TIME,
          now: BEFORE_LOCK,
        }),
      ).rejects.toThrowError(ForbiddenError);
    });

    it('throws ForbiddenError for a kicked user before lock', async () => {
      await removeMember(db, poolId, memberId);
      await recordKick(db, poolId, memberId);

      await expect(
        assertCanEditOwnCard(db, {
          actor: actor(memberId),
          pool: { id: poolId, ownerId },
          lockTime: LOCK_TIME,
          now: BEFORE_LOCK,
        }),
      ).rejects.toThrowError(ForbiddenError);
    });

    it('throws ForbiddenError (not LockedError) for a kicked user after lock', async () => {
      // Membership is checked before the lock, so a user with no standing is
      // forbidden regardless of time — the lock state is never leaked to them.
      await removeMember(db, poolId, memberId);
      await recordKick(db, poolId, memberId);

      await expect(
        assertCanEditOwnCard(db, {
          actor: actor(memberId),
          pool: { id: poolId, ownerId },
          lockTime: LOCK_TIME,
          now: AFTER_LOCK,
        }),
      ).rejects.toThrowError(ForbiddenError);
    });

    // -------------------------------------------------------------------------
    // Late joiner (joined at or after lockTime) — per-item access
    // -------------------------------------------------------------------------

    it("allows a late joiner to edit an item with no result (itemLock: 'unlocked')", async () => {
      await expect(
        assertCanEditOwnCard(db, {
          actor: actor(lateMemberId),
          pool: { id: poolId, ownerId },
          lockTime: LOCK_TIME,
          now: AFTER_LOCK,
          itemLock: 'unlocked',
        }),
      ).resolves.not.toThrow();
    });

    it("blocks a late joiner when itemLock is 'locked'", async () => {
      await expect(
        assertCanEditOwnCard(db, {
          actor: actor(lateMemberId),
          pool: { id: poolId, ownerId },
          lockTime: LOCK_TIME,
          now: AFTER_LOCK,
          itemLock: 'locked',
        }),
      ).rejects.toThrowError(LockedError);
    });

    it("blocks a late joiner when itemLock is 'pending'", async () => {
      await expect(
        assertCanEditOwnCard(db, {
          actor: actor(lateMemberId),
          pool: { id: poolId, ownerId },
          lockTime: LOCK_TIME,
          now: AFTER_LOCK,
          itemLock: 'pending',
        }),
      ).rejects.toThrowError(LockedError);
    });

    it('blocks a late joiner when itemLock is omitted (safe default)', async () => {
      await expect(
        assertCanEditOwnCard(db, {
          actor: actor(lateMemberId),
          pool: { id: poolId, ownerId },
          lockTime: LOCK_TIME,
          now: AFTER_LOCK,
        }),
      ).rejects.toThrowError(LockedError);
    });

    it("blocks an early joiner after lock even when itemLock is 'unlocked'", async () => {
      await expect(
        assertCanEditOwnCard(db, {
          actor: actor(memberId),
          pool: { id: poolId, ownerId },
          lockTime: LOCK_TIME,
          now: AFTER_LOCK,
          itemLock: 'unlocked',
        }),
      ).rejects.toThrowError(LockedError);
    });

    it('allows a member who joined exactly at lockTime (boundary: late joiner, within window)', async () => {
      const atLockUser = await createUser(db, {
        email: `at-lock-${crypto.randomUUID()}@test.com`,
        displayName: 'At Lock Member',
      });
      await addMember(db, poolId, atLockUser.id, JOINED_AT_LOCK);
      // 1 hour after joining — well within the 4-hour prediction window.
      const withinWindow = new Date(JOINED_AT_LOCK.getTime() + 60 * 60 * 1000);

      await expect(
        assertCanEditOwnCard(db, {
          actor: actor(atLockUser.id),
          pool: { id: poolId, ownerId },
          lockTime: LOCK_TIME,
          now: withinWindow,
          itemLock: 'unlocked',
        }),
      ).resolves.not.toThrow();
    });

    it('blocks a late joiner after the 4-hour prediction window closes', async () => {
      // lateMemberId joined at JOINED_AFTER_LOCK; 5h later the window has expired.
      const afterWindow = new Date(JOINED_AFTER_LOCK.getTime() + 5 * 60 * 60 * 1000);

      await expect(
        assertCanEditOwnCard(db, {
          actor: actor(lateMemberId),
          pool: { id: poolId, ownerId },
          lockTime: LOCK_TIME,
          now: afterWindow,
          itemLock: 'unlocked',
        }),
      ).rejects.toThrowError(LockedError);
    });
  });

  // -------------------------------------------------------------------------
  // assertCanOwnerEdit
  // -------------------------------------------------------------------------

  describe('assertCanOwnerEdit', () => {
    it('allows the owner to edit regardless of lock time (no time check performed)', () => {
      // Pure check — takes no `now`/`lockTime`, so the owner bypasses the lock entirely.
      expect(() => assertCanOwnerEdit(actor(ownerId), { id: poolId, ownerId })).not.toThrow();
    });

    it('throws ForbiddenError when a non-owner tries to use owner edit', () => {
      expect(() => assertCanOwnerEdit(actor(memberId), { id: poolId, ownerId })).toThrowError(
        ForbiddenError,
      );
    });

    it('throws ForbiddenError for anonymous caller', () => {
      expect(() => assertCanOwnerEdit(null, { id: poolId, ownerId })).toThrowError(ForbiddenError);
    });
  });

  // -------------------------------------------------------------------------
  // canViewCard
  // -------------------------------------------------------------------------

  describe('canViewCard', () => {
    it('member can always view their own card before lock', async () => {
      const result = await canViewCard(db, {
        actor: actor(memberId),
        pool: { id: poolId, ownerId },
        targetUserId: memberId,
        lockTime: LOCK_TIME,
        now: BEFORE_LOCK,
      });
      expect(result).toBe(true);
    });

    it('member can always view their own card after lock', async () => {
      const result = await canViewCard(db, {
        actor: actor(memberId),
        pool: { id: poolId, ownerId },
        targetUserId: memberId,
        lockTime: LOCK_TIME,
        now: AFTER_LOCK,
      });
      expect(result).toBe(true);
    });

    it("member cannot view another member's card before lock", async () => {
      // Add a second member to view.
      const second = await createUser(db, {
        email: `second-${crypto.randomUUID()}@test.com`,
        displayName: 'Second',
      });
      await addMember(db, poolId, second.id);

      const result = await canViewCard(db, {
        actor: actor(memberId),
        pool: { id: poolId, ownerId },
        targetUserId: second.id,
        lockTime: LOCK_TIME,
        now: BEFORE_LOCK,
      });
      expect(result).toBe(false);
    });

    it("member can view another member's card exactly at lock time (>= boundary)", async () => {
      const second = await createUser(db, {
        email: `second-${crypto.randomUUID()}@test.com`,
        displayName: 'Second',
      });
      await addMember(db, poolId, second.id);

      const result = await canViewCard(db, {
        actor: actor(memberId),
        pool: { id: poolId, ownerId },
        targetUserId: second.id,
        lockTime: LOCK_TIME,
        now: AT_LOCK,
      });
      expect(result).toBe(true);
    });

    it("member can view another member's card after lock", async () => {
      const second = await createUser(db, {
        email: `second-${crypto.randomUUID()}@test.com`,
        displayName: 'Second',
      });
      await addMember(db, poolId, second.id);

      const result = await canViewCard(db, {
        actor: actor(memberId),
        pool: { id: poolId, ownerId },
        targetUserId: second.id,
        lockTime: LOCK_TIME,
        now: AFTER_LOCK,
      });
      expect(result).toBe(true);
    });

    it('owner can view any card before lock', async () => {
      const result = await canViewCard(db, {
        actor: actor(ownerId),
        pool: { id: poolId, ownerId },
        targetUserId: memberId,
        lockTime: LOCK_TIME,
        now: BEFORE_LOCK,
      });
      expect(result).toBe(true);
    });

    it('owner can view any card after lock', async () => {
      const result = await canViewCard(db, {
        actor: actor(ownerId),
        pool: { id: poolId, ownerId },
        targetUserId: memberId,
        lockTime: LOCK_TIME,
        now: AFTER_LOCK,
      });
      expect(result).toBe(true);
    });

    it('anonymous actor cannot view any card', async () => {
      const result = await canViewCard(db, {
        actor: null,
        pool: { id: poolId, ownerId },
        targetUserId: memberId,
        lockTime: LOCK_TIME,
        now: AFTER_LOCK,
      });
      expect(result).toBe(false);
    });

    it('non-member cannot view any card even after lock', async () => {
      const result = await canViewCard(db, {
        actor: actor(outsiderId),
        pool: { id: poolId, ownerId },
        targetUserId: memberId,
        lockTime: LOCK_TIME,
        now: AFTER_LOCK,
      });
      expect(result).toBe(false);
    });

    it('kicked user cannot view another member card after lock', async () => {
      await removeMember(db, poolId, memberId);
      await recordKick(db, poolId, memberId);

      const result = await canViewCard(db, {
        actor: actor(memberId),
        pool: { id: poolId, ownerId },
        targetUserId: ownerId,
        lockTime: LOCK_TIME,
        now: AFTER_LOCK,
      });
      expect(result).toBe(false);
    });

    it('kicked user cannot view even their own card (no longer a member)', async () => {
      await removeMember(db, poolId, memberId);
      await recordKick(db, poolId, memberId);

      const result = await canViewCard(db, {
        actor: actor(memberId),
        pool: { id: poolId, ownerId },
        targetUserId: memberId,
        lockTime: LOCK_TIME,
        now: AFTER_LOCK,
      });
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // auditVisibleTo
  // -------------------------------------------------------------------------

  describe('auditVisibleTo', () => {
    it('returns true for a current member', async () => {
      const result = await auditVisibleTo(db, {
        actor: actor(memberId),
        pool: { id: poolId, ownerId },
      });
      expect(result).toBe(true);
    });

    it('returns true for the owner', async () => {
      const result = await auditVisibleTo(db, {
        actor: actor(ownerId),
        pool: { id: poolId, ownerId },
      });
      expect(result).toBe(true);
    });

    it('returns false for a non-member', async () => {
      const result = await auditVisibleTo(db, {
        actor: actor(outsiderId),
        pool: { id: poolId, ownerId },
      });
      expect(result).toBe(false);
    });

    it('returns false for an anonymous caller', async () => {
      const result = await auditVisibleTo(db, {
        actor: null,
        pool: { id: poolId, ownerId },
      });
      expect(result).toBe(false);
    });

    it('returns false for a kicked user', async () => {
      await removeMember(db, poolId, memberId);
      await recordKick(db, poolId, memberId);

      const result = await auditVisibleTo(db, {
        actor: actor(memberId),
        pool: { id: poolId, ownerId },
      });
      expect(result).toBe(false);
    });
  });
});
