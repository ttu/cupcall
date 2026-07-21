'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { db } from '@/shared/db';
import { getActorOrThrow, checkBetaCode } from '@/features/auth';
import { assertIsOwner } from '@/shared/authz';
import type { Actor } from '@/shared/authz';
import { userId, poolId as asPoolId, tournamentId as asTournamentId } from '@cup/engine';
import type { PoolId, UserId } from '@cup/engine';
import type { PoolRow } from '@cup/db';
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
import { rescoreCard } from '@/shared/card-scoring';
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

// Helpers

async function getPoolOrThrow(poolId: PoolId) {
  const pool = await getPoolById(db, poolId);
  if (!pool) throw new Error(`Pool ${poolId} not found`);
  return pool;
}

/**
 * Loads the actor and pool, runs `action`, and converts any thrown error
 * (e.g. from an `assertIs*` guard) into an `{ ok: false, error }` result.
 */
async function withPool<T extends { ok: boolean }>(
  poolId: PoolId,
  action: (pool: PoolRow, actor: Actor) => Promise<T>,
): Promise<T | { ok: false; error: string }> {
  try {
    const actor = await getActorOrThrow();
    const pool = await getPoolOrThrow(poolId);
    return await action(pool, actor);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

const PoolIdOnlySchema = z.object({ poolId: z.string() });

/**
 * Scaffold for owner-only pool actions that take just `{ poolId }`: parses the input,
 * asserts ownership, runs `mutate`, revalidates the pool page, and wraps errors as
 * `{ ok: false, error }`.
 */
async function withOwnerPoolMutation<T extends Record<string, unknown>>(
  raw: unknown,
  mutate: (poolId: PoolId) => Promise<T>,
): Promise<({ ok: true } & T) | { ok: false; error: string }> {
  const parsed = PoolIdOnlySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const poolId = asPoolId(parsed.data.poolId);

  return withPool(poolId, async (pool, actor) => {
    assertIsOwner(pool, actor.userId);
    const result = await mutate(poolId);
    revalidatePath(`/pools/${poolId}`);
    return { ok: true, ...result };
  });
}

/** Asserts the actor owns the pool and isn't targeting the owner themself. */
function assertOwnerNotTargetingSelf(
  pool: PoolRow,
  actor: Actor,
  targetUserId: UserId,
  errorMessage: string,
): void {
  assertIsOwner(pool, actor.userId);
  if (targetUserId === pool.ownerId) {
    throw new Error(errorMessage);
  }
}

// Create pool

const CreatePoolSchema = z.object({
  name: z.string().min(1).max(100),
  tournamentId: z.string().min(1).optional(),
});

export async function createPool(
  raw: unknown,
): Promise<{ ok: true; poolId: PoolId } | { ok: false; error: string }> {
  const parsed = CreatePoolSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };

  try {
    const actor = await getActorOrThrow();
    const result = await appCreatePool(db, {
      ownerId: actor.userId,
      name: parsed.data.name,
      ...(parsed.data.tournamentId
        ? { tournamentId: asTournamentId(parsed.data.tournamentId) }
        : {}),
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

// Join pool

const JoinPoolSchema = z.object({ token: z.string().min(1) });

export async function joinPool(
  raw: unknown,
): Promise<{ ok: true; poolId: PoolId; alreadyMember: boolean } | { ok: false; error: string }> {
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

// Kick member

const KickMemberSchema = z.object({
  poolId: z.string(),
  targetUserId: z.string(),
});

export async function kickMember(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = KickMemberSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId: rawPoolId, targetUserId: rawTargetUserId } = parsed.data;
  const poolId = asPoolId(rawPoolId);
  const targetUserId = userId(rawTargetUserId);

  return withPool(poolId, async (pool, actor) => {
    assertOwnerNotTargetingSelf(pool, actor, targetUserId, 'The pool owner cannot be kicked.');

    await deletePrediction(db, poolId, targetUserId);
    await deleteScore(db, poolId, targetUserId);
    await removeMember(db, poolId, targetUserId);
    await recordKick(db, poolId, targetUserId);

    revalidatePath(`/pools/${poolId}`);
    return { ok: true };
  });
}

// Leave pool (member self-removal)

const LeavePoolSchema = z.object({ poolId: z.string() });

export async function leavePool(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = LeavePoolSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId: rawPoolId } = parsed.data;
  const poolId = asPoolId(rawPoolId);

  const result = await withPool(poolId, async (pool, actor) => {
    if (actor.userId === pool.ownerId) {
      return { ok: false, error: 'Pool owners cannot leave. Delete the pool instead.' };
    }

    await assertIsMember(db, poolId, actor.userId);
    await deletePrediction(db, poolId, actor.userId);
    await deleteScore(db, poolId, actor.userId);
    await removeMember(db, poolId, actor.userId);

    revalidatePath('/pools');
    return { ok: true } as const;
  });
  if (!result.ok) return result;

  redirect('/pools');
}

// Clear invite link

export async function clearInviteLink(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return withOwnerPoolMutation(raw, async (poolId) => {
    await clearInviteToken(db, poolId);
    return {};
  });
}

// Rotate token

export async function rotateToken(
  raw: unknown,
): Promise<{ ok: true; newToken: string } | { ok: false; error: string }> {
  return withOwnerPoolMutation(raw, async (poolId) => {
    const newToken = generateInviteToken();
    await rotateInviteTokenHash(db, poolId, newToken);
    return { newToken };
  });
}

// Rotate view token

export async function rotateViewToken(
  raw: unknown,
): Promise<{ ok: true; newToken: string } | { ok: false; error: string }> {
  return withOwnerPoolMutation(raw, async (poolId) => {
    const newToken = generateViewToken();
    await dbRotateViewToken(db, poolId, newToken);
    return { newToken };
  });
}

// Clear view link

export async function clearViewLink(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return withOwnerPoolMutation(raw, async (poolId) => {
    await dbClearViewToken(db, poolId);
    return {};
  });
}

// Delete pool

const DeletePoolSchema = z.object({ poolId: z.string() });

export async function deletePool(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = DeletePoolSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId: rawPoolId } = parsed.data;
  const poolId = asPoolId(rawPoolId);

  const result = await withPool(poolId, async (pool, actor) => {
    assertIsOwner(pool, actor.userId);

    await dbDeletePool(db, poolId);
    revalidatePath('/pools');
    return { ok: true } as const;
  });
  if (!result.ok) return result;

  redirect('/pools');
}

// Join as guest (no email required — name only)

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

// Generate member login link (owner only)

const GenerateMemberLoginLinkSchema = z.object({
  poolId: z.string(),
  targetUserId: z.string(),
});

export async function generateMemberLoginLink(
  raw: unknown,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const parsed = GenerateMemberLoginLinkSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId: rawPoolId, targetUserId: rawTargetUserId } = parsed.data;
  const poolId = asPoolId(rawPoolId);
  const targetUserId = userId(rawTargetUserId);

  return withPool(poolId, async (pool, actor) => {
    assertOwnerNotTargetingSelf(
      pool,
      actor,
      targetUserId,
      'Cannot generate a login link for the pool owner.',
    );

    const inPool = await isMember(db, poolId, targetUserId);
    if (!inPool) return { ok: false, error: 'User is not a member of this pool.' };

    const token = generateLoginToken();
    await upsertLoginToken(db, targetUserId, token);

    return { ok: true, url: buildLoginUrl(token) };
  });
}

// Rotate own login token (guest users only)

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

// Export pool (backup)

const ExportPoolSchema = z.object({ poolId: z.string() });

export async function exportPool(
  raw: unknown,
): Promise<{ ok: true; data: PoolBackup } | { ok: false; error: string }> {
  const parsed = ExportPoolSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId: rawPoolId } = parsed.data;
  const poolId = asPoolId(rawPoolId);

  try {
    const actor = await getActorOrThrow();
    const pool = await getPoolOrThrow(poolId);
    await assertIsMember(db, poolId, actor.userId);

    const backup = await buildPoolExport(db, poolId, pool.name, pool.tournamentId);
    return { ok: true, data: backup };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// Import pool (restore from backup)

const ImportPoolSchema = z.object({
  poolId: z.string(),
  backupData: PoolBackupSchema,
});

export async function importPool(
  raw: unknown,
): Promise<{ ok: true; membersRestored: number } | { ok: false; error: string }> {
  const parsed = ImportPoolSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId: rawPoolId, backupData } = parsed.data;
  const poolId = asPoolId(rawPoolId);

  try {
    const actor = await getActorOrThrow();
    const pool = await getPoolOrThrow(poolId);
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
