import type { Db } from '@cup/db';
import {
  getPoolByInviteTokenHash,
  isKicked,
  isMember,
  addMember,
  countPoolMembers,
  checkRateLimit,
  RATE_LIMITS,
  getOrCreatePrediction,
} from '@cup/db';
import type { UserId, PoolId } from '@cup/engine';

/** Maximum members per pool (functional-spec §9). */
const MAX_MEMBERS_PER_POOL = 30;

export type JoinPoolError =
  | { code: 'not_found' }
  | { code: 'token_expired' }
  | { code: 'kicked' }
  | { code: 'pool_full'; limit: number }
  | { code: 'rate_limited' };

export type JoinPoolResult =
  | { ok: true; poolId: PoolId; alreadyMember: boolean }
  | { ok: false; error: JoinPoolError };

export async function joinPool(
  db: Db<import('@/shared/db').AppSchema>,
  input: { userId: UserId; token: string; now: Date },
): Promise<JoinPoolResult> {
  const { userId, token, now } = input;

  // Look up pool by raw token (stored directly in inviteTokenHash column).
  const pool = await getPoolByInviteTokenHash(db, token);
  if (!pool) {
    return { ok: false, error: { code: 'not_found' } };
  }

  // Token expiry.
  if (pool.tokenExpiresAt !== null && now >= pool.tokenExpiresAt) {
    return { ok: false, error: { code: 'token_expired' } };
  }

  // Kicked users cannot rejoin.
  if (await isKicked(db, pool.id, userId)) {
    return { ok: false, error: { code: 'kicked' } };
  }

  // Already a member — idempotent no-op.
  if (await isMember(db, pool.id, userId)) {
    return { ok: true, poolId: pool.id, alreadyMember: true };
  }

  // Pool size cap + membership insert, wrapped in one transaction so two concurrent joins
  // can't both pass the count check and push membership past MAX_MEMBERS_PER_POOL.
  const joinOutcome = await db.transaction(async (tx) => {
    const memberCount = await countPoolMembers(tx, pool.id);
    if (memberCount >= MAX_MEMBERS_PER_POOL) {
      return {
        ok: false as const,
        error: { code: 'pool_full' as const, limit: MAX_MEMBERS_PER_POOL },
      };
    }

    // Rate limit.
    const rl = await checkRateLimit(tx, {
      key: `join:user:${userId}`,
      limit: RATE_LIMITS.join.limit,
      windowMs: RATE_LIMITS.join.windowMs,
      now,
    });
    if (!rl.allowed) {
      return { ok: false as const, error: { code: 'rate_limited' as const } };
    }

    await addMember(tx, pool.id, userId);
    await getOrCreatePrediction(tx, {
      poolId: pool.id,
      userId,
      tournamentId: pool.tournamentId,
    });

    return { ok: true as const };
  });

  if (!joinOutcome.ok) {
    return { ok: false, error: joinOutcome.error };
  }

  return { ok: true, poolId: pool.id, alreadyMember: false };
}
