'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/shared/db';
import { getCurrentActor } from '@/features/auth';
import { assertIsOwner, assertSignedIn } from '@/shared/authz';
import {
  getPoolById,
  removeMember,
  recordKick,
  rotateInviteTokenHash,
  deletePool as dbDeletePool,
} from '@cup/db';
import { createPool as appCreatePool } from '../application/create-pool';
import { joinPool as appJoinPool } from '../application/join-pool';
import { generateInviteToken } from '../domain/invite';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getActorOrThrow() {
  const actor = await getCurrentActor();
  assertSignedIn(actor);
  return actor;
}

async function getOwnerPoolOrThrow(poolId: string) {
  const pool = await getPoolById(db, poolId);
  if (!pool) throw new Error(`Pool ${poolId} not found`);
  return pool;
}

// ---------------------------------------------------------------------------
// Create pool
// ---------------------------------------------------------------------------

const CreatePoolSchema = z.object({ name: z.string().min(1).max(100) });

export async function createPool(
  raw: unknown,
): Promise<{ ok: true; poolId: string } | { ok: false; error: string }> {
  const parsed = CreatePoolSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };

  try {
    const actor = await getActorOrThrow();
    const result = await appCreatePool(db, {
      ownerId: actor.userId,
      name: parsed.data.name,
      now: new Date(),
    });

    if (!result.ok) {
      const { code } = result.error;
      if (code === 'no_tournament') return { ok: false, error: 'No tournament available yet.' };
      if (code === 'pool_cap_exceeded')
        return { ok: false, error: `You can own at most ${result.error.limit} pools.` };
      if (code === 'rate_limited')
        return { ok: false, error: 'Too many pools created recently. Try again later.' };
    }

    if (!result.ok) return { ok: false, error: 'Could not create pool.' };

    revalidatePath('/pools');
    return { ok: true, poolId: result.pool.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Join pool
// ---------------------------------------------------------------------------

const JoinPoolSchema = z.object({ token: z.string().min(1) });

export async function joinPool(
  raw: unknown,
): Promise<{ ok: true; poolId: string; alreadyMember: boolean } | { ok: false; error: string }> {
  const parsed = JoinPoolSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };

  try {
    const actor = await getActorOrThrow();
    const result = await appJoinPool(db, {
      userId: actor.userId,
      token: parsed.data.token,
      now: new Date(),
    });

    if (!result.ok) {
      const { code } = result.error;
      if (code === 'not_found') return { ok: false, error: 'Invite link is invalid.' };
      if (code === 'token_expired') return { ok: false, error: 'Invite link has expired.' };
      if (code === 'kicked') return { ok: false, error: 'You have been removed from this pool.' };
      if (code === 'pool_full')
        return { ok: false, error: `This pool is full (max ${result.error.limit} members).` };
      if (code === 'rate_limited')
        return { ok: false, error: 'Too many join attempts. Try again later.' };
      return { ok: false, error: 'Could not join pool.' };
    }

    revalidatePath('/pools');
    revalidatePath(`/pools/${result.poolId}`);
    return { ok: true, poolId: result.poolId, alreadyMember: result.alreadyMember };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Kick member
// ---------------------------------------------------------------------------

const KickMemberSchema = z.object({
  poolId: z.string(),
  targetUserId: z.string(),
});

export async function kickMember(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = KickMemberSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId, targetUserId } = parsed.data;

  try {
    const actor = await getActorOrThrow();
    const pool = await getOwnerPoolOrThrow(poolId);
    assertIsOwner(pool, actor.userId);

    if (targetUserId === pool.ownerId) {
      return { ok: false, error: 'The pool owner cannot be kicked.' };
    }

    await removeMember(
      db,
      poolId,
      actor.userId === targetUserId ? actor.userId : (targetUserId as import('@cup/engine').UserId),
    );
    await recordKick(db, poolId, targetUserId as import('@cup/engine').UserId);

    revalidatePath(`/pools/${poolId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Rotate token
// ---------------------------------------------------------------------------

const RotateTokenSchema = z.object({ poolId: z.string() });

export async function rotateToken(
  raw: unknown,
): Promise<{ ok: true; newToken: string } | { ok: false; error: string }> {
  const parsed = RotateTokenSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId } = parsed.data;

  try {
    const actor = await getActorOrThrow();
    const pool = await getOwnerPoolOrThrow(poolId);
    assertIsOwner(pool, actor.userId);

    const newToken = generateInviteToken();
    await rotateInviteTokenHash(db, poolId, newToken);

    revalidatePath(`/pools/${poolId}`);
    return { ok: true, newToken };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Delete pool
// ---------------------------------------------------------------------------

const DeletePoolSchema = z.object({ poolId: z.string() });

export async function deletePool(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = DeletePoolSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId } = parsed.data;

  try {
    const actor = await getActorOrThrow();
    const pool = await getOwnerPoolOrThrow(poolId);
    assertIsOwner(pool, actor.userId);

    await dbDeletePool(db, poolId);
    revalidatePath('/pools');
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }

  redirect('/pools');
}
