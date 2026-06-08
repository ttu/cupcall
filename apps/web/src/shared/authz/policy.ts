/**
 * Authorization policy layer.
 *
 * These functions enforce the rules from functional-spec §6.5 (locking), §8.3
 * (owner edits), and §8.5 (card visibility). They only read — no mutations.
 *
 * Clock is always injected. No policy function may call `new Date()` or
 * `Date.now()` directly; authoritative time flows in from the caller.
 */

import type { UserId } from '@cup/engine';
import { isMember } from '@cup/db';
import type { Actor } from './actor';
import { ForbiddenError, LockedError } from './errors';

/**
 * The database handle accepted by policy functions. Derived from the
 * isMember repository signature to stay structurally compatible with
 * any Db<schema> variant the repositories expose.
 */
type PolicyDb = Parameters<typeof isMember>[0];

// ---------------------------------------------------------------------------
// Minimal pool shape needed by policy — avoid coupling to full PoolRow.
// ---------------------------------------------------------------------------

type PoolRef = {
  id: string;
  ownerId: UserId;
};

// ---------------------------------------------------------------------------
// Pure guards
// ---------------------------------------------------------------------------

/**
 * Asserts the caller is signed in. Throws `ForbiddenError` for anonymous
 * callers (`null`). Use this at the top of any handler that requires auth.
 */
export function assertSignedIn(actor: Actor | null): asserts actor is Actor {
  if (actor === null) {
    throw new ForbiddenError(
      'You must be signed in to perform this action. Please sign in and try again.',
    );
  }
}

/**
 * Asserts `userId` is the pool owner. Pure — no DB access.
 * Throws `ForbiddenError` when the user is not the owner.
 */
export function assertIsOwner(pool: PoolRef, userId: UserId): void {
  if (pool.ownerId !== userId) {
    throw new ForbiddenError(
      `User ${userId} is not the owner of pool ${pool.id}. Only the pool owner may perform this action.`,
    );
  }
}

// ---------------------------------------------------------------------------
// DB-backed membership checks
// ---------------------------------------------------------------------------

/**
 * Asserts `userId` is a current member of `poolId`.
 *
 * A user who has been kicked is removed from `pool_members`, so `isMember`
 * returns false — kicked users are denied just like non-members.
 */
export async function assertIsMember(db: PolicyDb, poolId: string, userId: UserId): Promise<void> {
  const member = await isMember(db, poolId, userId);
  if (!member) {
    throw new ForbiddenError(
      `User ${userId} is not a current member of pool ${poolId}. Kicked or non-member users are denied.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Compound edit-permission assertions
// ---------------------------------------------------------------------------

/**
 * Asserts a signed-in member may edit their own card in `pool`.
 *
 * Rules (functional-spec §6.5):
 *  - Actor must be signed in.
 *  - Actor must be a current member (not kicked).
 *  - `now` must be strictly before `lockTime` (at/after = locked).
 *
 * Throws `ForbiddenError` when not signed in or not a member.
 * Throws `LockedError` when `now >= lockTime`.
 *
 * Membership is checked BEFORE the lock so a kicked/non-member caller always gets
 * `ForbiddenError` (they have no standing), never a `LockedError` that would leak
 * the pool's lock state to someone with no access.
 */
export async function assertCanEditOwnCard(
  db: PolicyDb,
  {
    actor,
    pool,
    lockTime,
    now,
  }: {
    actor: Actor | null;
    pool: PoolRef;
    lockTime: Date;
    now: Date;
  },
): Promise<void> {
  assertSignedIn(actor);
  await assertIsMember(db, pool.id, actor.userId);

  if (now >= lockTime) {
    throw new LockedError(
      `Pool ${pool.id} is locked as of ${lockTime.toISOString()}. Members may not edit their card after lock time. Current time: ${now.toISOString()}.`,
    );
  }
}

/**
 * Asserts the pool owner may edit any member's card (functional-spec §8.3).
 *
 * Owners bypass the lock entirely — they may edit at any time. Pure: no DB access.
 * Throws `ForbiddenError` if actor is not signed in or is not the pool owner.
 */
export function assertCanOwnerEdit(actor: Actor | null, pool: PoolRef): void {
  assertSignedIn(actor);
  assertIsOwner(pool, actor.userId);
}

// ---------------------------------------------------------------------------
// Visibility queries (return boolean, never throw)
// ---------------------------------------------------------------------------

/**
 * Returns whether `actor` may view `targetUserId`'s card in `pool`.
 *
 * Rules (functional-spec §8.5):
 *  - Own card: always visible (if signed in and a current member).
 *  - Owner: any card, any time.
 *  - Other members: visible only once `now >= lockTime` (no peeking before lock).
 *  - Non-members / anonymous: never.
 */
export async function canViewCard(
  db: PolicyDb,
  {
    actor,
    pool,
    targetUserId,
    lockTime,
    now,
  }: {
    actor: Actor | null;
    pool: PoolRef;
    targetUserId: UserId;
    lockTime: Date;
    now: Date;
  },
): Promise<boolean> {
  if (actor === null) return false;

  // Owner can view any card at any time.
  if (actor.userId === pool.ownerId) return true;

  // Non-owners must be a current member.
  const actorIsMember = await isMember(db, pool.id, actor.userId);
  if (!actorIsMember) return false;

  // Own card is always visible to its owner (member viewing their own card).
  if (actor.userId === targetUserId) return true;

  // Other members' cards: only after lock.
  return now >= lockTime;
}

/**
 * Returns whether `actor` may read the `prediction_edits` audit log for `pool`.
 *
 * Rule (functional-spec §8.3): the audit log is readable by ALL current members
 * of the pool, including the owner.
 */
export async function auditVisibleTo(
  db: PolicyDb,
  {
    actor,
    pool,
  }: {
    actor: Actor | null;
    pool: PoolRef;
  },
): Promise<boolean> {
  if (actor === null) return false;

  // Owner is always a member conceptually; short-circuit avoids a DB round-trip.
  if (actor.userId === pool.ownerId) return true;

  return isMember(db, pool.id, actor.userId);
}
