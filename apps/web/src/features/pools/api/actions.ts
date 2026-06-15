'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { db } from '@/shared/db';
import { getActorOrThrow } from '@/features/auth';
import { checkBetaCode } from '@/features/auth/beta-code';
import { assertIsOwner } from '@/shared/authz';
import {
  getPoolById,
  getPoolByInviteTokenHash,
  removeMember,
  recordKick,
  rotateInviteTokenHash,
  clearInviteToken,
  rotateViewToken as dbRotateViewToken,
  clearViewToken as dbClearViewToken,
  deletePool as dbDeletePool,
  createGuestUser,
  getTournamentById,
  getActualResults,
  upsertLoginToken,
  isMember,
  checkRateLimit,
  RATE_LIMITS,
  deletePrediction,
  deleteScore,
} from '@cup/db';
import { assertIsMember } from '@/shared/authz';
import { signInAsExistingGuest } from '@/features/auth';
import { rescoreCard } from '@/features/predictions';
import { createPool as appCreatePool } from '../application/create-pool';
import { joinPool as appJoinPool } from '../application/join-pool';
import {
  generateInviteToken,
  generateViewToken,
  generateLoginToken,
  buildLoginUrl,
} from '../domain/invite';
import {
  buildPoolExport,
  restorePoolFromBackup,
  PoolBackupSchema,
} from '../application/pool-backup';
import type { PoolBackup } from '../application/pool-backup';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOwnerPoolOrThrow(poolId: string) {
  const pool = await getPoolById(db, poolId);
  if (!pool) throw new Error(`Pool ${poolId} not found`);
  return pool;
}

// ---------------------------------------------------------------------------
// Create pool
// ---------------------------------------------------------------------------

const CreatePoolSchema = z.object({
  name: z.string().min(1).max(100),
  tournamentId: z.string().min(1).optional(),
});

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
      ...(parsed.data.tournamentId ? { tournamentId: parsed.data.tournamentId } : {}),
      now: new Date(),
    });

    if (!result.ok) {
      const { code } = result.error;
      if (code === 'no_tournament') return { ok: false, error: 'No tournament available yet.' };
      if (code === 'tournament_not_found') return { ok: false, error: 'Tournament not found.' };
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
// Leave pool (member self-removal)
// ---------------------------------------------------------------------------

const LeavePoolSchema = z.object({ poolId: z.string() });

export async function leavePool(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = LeavePoolSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId } = parsed.data;

  try {
    const actor = await getActorOrThrow();
    const pool = await getOwnerPoolOrThrow(poolId);

    if (actor.userId === pool.ownerId) {
      return { ok: false, error: 'Pool owners cannot leave. Delete the pool instead.' };
    }

    await assertIsMember(db, poolId, actor.userId);
    await deletePrediction(db, poolId, actor.userId);
    await deleteScore(db, poolId, actor.userId);
    await removeMember(db, poolId, actor.userId);

    revalidatePath('/pools');
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }

  redirect('/pools');
}

// ---------------------------------------------------------------------------
// Clear invite link
// ---------------------------------------------------------------------------

const ClearInviteLinkSchema = z.object({ poolId: z.string() });

export async function clearInviteLink(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ClearInviteLinkSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId } = parsed.data;

  try {
    const actor = await getActorOrThrow();
    const pool = await getOwnerPoolOrThrow(poolId);
    assertIsOwner(pool, actor.userId);

    await clearInviteToken(db, poolId);
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
// Rotate view token
// ---------------------------------------------------------------------------

const RotateViewTokenSchema = z.object({ poolId: z.string() });

export async function rotateViewToken(
  raw: unknown,
): Promise<{ ok: true; newToken: string } | { ok: false; error: string }> {
  const parsed = RotateViewTokenSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId } = parsed.data;

  try {
    const actor = await getActorOrThrow();
    const pool = await getOwnerPoolOrThrow(poolId);
    assertIsOwner(pool, actor.userId);

    const newToken = generateViewToken();
    await dbRotateViewToken(db, poolId, newToken);

    revalidatePath(`/pools/${poolId}`);
    return { ok: true, newToken };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Clear view link
// ---------------------------------------------------------------------------

const ClearViewLinkSchema = z.object({ poolId: z.string() });

export async function clearViewLink(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ClearViewLinkSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId } = parsed.data;

  try {
    const actor = await getActorOrThrow();
    const pool = await getOwnerPoolOrThrow(poolId);
    assertIsOwner(pool, actor.userId);

    await dbClearViewToken(db, poolId);
    revalidatePath(`/pools/${poolId}`);
    return { ok: true };
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

// ---------------------------------------------------------------------------
// Join as guest (no email required — name only)
// ---------------------------------------------------------------------------

const JoinAsGuestSchema = z.object({
  displayName: z.string().trim().min(2, 'Name must be at least 2 characters').max(50),
  token: z.string().min(1),
  betaCode: z.string().optional(),
});

/**
 * Creates a guest user with only a display name, joins them to the pool
 * identified by `token`, then opens a session (no email, no password).
 * On success this redirects to the pool page and never returns.
 */
export async function joinAsGuest(raw: unknown): Promise<{ ok: false; error: string }> {
  const parsed = JoinAsGuestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'Invalid input.' };
  }
  const { displayName, token, betaCode } = parsed.data;

  const codeError = checkBetaCode(betaCode ?? null);
  if (codeError) return { ok: false, error: codeError };

  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? 'unknown';
  const ipRl = await checkRateLimit(db, {
    key: `join:guest:ip:${ip}`,
    limit: RATE_LIMITS.joinGuestIp.limit,
    windowMs: RATE_LIMITS.joinGuestIp.windowMs,
    now: new Date(),
  });
  if (!ipRl.allowed) return { ok: false, error: 'Too many attempts. Try again later.' };

  const pool = await getPoolByInviteTokenHash(db, token);
  if (!pool) return { ok: false, error: 'Invite link is invalid or has been removed.' };

  if (pool.tokenExpiresAt && new Date() >= pool.tokenExpiresAt) {
    return { ok: false, error: 'Invite link has expired.' };
  }

  const user = await createGuestUser(db, { displayName });

  const joinResult = await appJoinPool(db, { userId: user.id, token, now: new Date() });
  if (!joinResult.ok) {
    const { code } = joinResult.error;
    if (code === 'pool_full')
      return { ok: false, error: `This pool is full (max ${joinResult.error.limit} members).` };
    if (code === 'rate_limited') return { ok: false, error: 'Too many attempts. Try again later.' };
    return { ok: false, error: 'Could not join pool.' };
  }

  // Opens a session cookie and redirects — never returns on success.
  await signInAsExistingGuest(user.id, `/pools/${joinResult.poolId}`);

  // Unreachable; satisfies the return type.
  return { ok: false, error: 'Unexpected error.' };
}

// ---------------------------------------------------------------------------
// Generate member login link (owner only)
// ---------------------------------------------------------------------------

const GenerateMemberLoginLinkSchema = z.object({
  poolId: z.string(),
  targetUserId: z.string(),
});

export async function generateMemberLoginLink(
  raw: unknown,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const parsed = GenerateMemberLoginLinkSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId, targetUserId } = parsed.data;

  try {
    const actor = await getActorOrThrow();
    const pool = await getOwnerPoolOrThrow(poolId);
    assertIsOwner(pool, actor.userId);

    if (targetUserId === pool.ownerId) {
      return { ok: false, error: 'Cannot generate a login link for the pool owner.' };
    }

    const inPool = await isMember(db, poolId, targetUserId as import('@cup/engine').UserId);
    if (!inPool) return { ok: false, error: 'User is not a member of this pool.' };

    const token = generateLoginToken();
    await upsertLoginToken(db, targetUserId as import('@cup/engine').UserId, token);

    return { ok: true, url: buildLoginUrl(token) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Rotate own login token (guest users only)
// ---------------------------------------------------------------------------

export async function rotateMyLoginToken(): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  try {
    const actor = await getActorOrThrow();
    const token = generateLoginToken();
    await upsertLoginToken(db, actor.userId, token);
    return { ok: true, token };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Export pool (backup)
// ---------------------------------------------------------------------------

const ExportPoolSchema = z.object({ poolId: z.string() });

export async function exportPool(
  raw: unknown,
): Promise<{ ok: true; data: PoolBackup } | { ok: false; error: string }> {
  const parsed = ExportPoolSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId } = parsed.data;

  try {
    const actor = await getActorOrThrow();
    const pool = await getOwnerPoolOrThrow(poolId);
    await assertIsMember(db, poolId, actor.userId);

    const backup = await buildPoolExport(db, poolId, pool.name, pool.tournamentId);
    return { ok: true, data: backup };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Import pool (restore from backup)
// ---------------------------------------------------------------------------

const ImportPoolSchema = z.object({
  poolId: z.string(),
  backupData: PoolBackupSchema,
});

export async function importPool(
  raw: unknown,
): Promise<{ ok: true; membersRestored: number } | { ok: false; error: string }> {
  const parsed = ImportPoolSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId, backupData } = parsed.data;

  try {
    const actor = await getActorOrThrow();
    const pool = await getOwnerPoolOrThrow(poolId);
    assertIsOwner(pool, actor.userId);

    if (backupData.tournamentId !== pool.tournamentId) {
      return {
        ok: false,
        error: `Backup is for tournament "${backupData.tournamentId}" but pool uses "${pool.tournamentId}".`,
      };
    }

    const tournament = await getTournamentById(db, pool.tournamentId);
    if (!tournament?.definition) {
      return { ok: false, error: 'Tournament definition not loaded. Run pnpm sync first.' };
    }

    const { membersRestored, restoredPredictions } = await restorePoolFromBackup(
      db,
      poolId,
      pool.tournamentId,
      backupData,
      actor.userId,
    );

    const actual = await getActualResults(db, pool.tournamentId);
    await Promise.all(
      restoredPredictions.map(({ predictionId, userId }) =>
        rescoreCard({
          db,
          predictionId,
          poolId,
          userId,
          tournament: tournament.definition!,
          actual,
        }),
      ),
    );

    revalidatePath(`/pools/${poolId}`);
    return { ok: true, membersRestored };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
