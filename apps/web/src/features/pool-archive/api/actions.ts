'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/shared/db';
import { getActorOrThrow } from '@/features/auth';
import { assertIsOwner, ForbiddenError, LockedError, NotFoundError } from '@/shared/authz';
import { logger } from '@/shared/observability/logger';
import { getPoolById, getTournamentById } from '@cup/db';
import { poolId as asPoolId } from '@cup/engine';
import { archivePool } from '../application/archive-pool';

const ArchivePoolSchema = z.object({ poolId: z.string() });

/**
 * Logs the raw error (or Zod validation failure) with structured context for diagnostics,
 * then returns a message safe to send to the client. Authz-guard failures stay
 * distinguishable but sanitized; everything else collapses to one generic message so
 * internals never leak to the caller.
 */
function safeErrorMessage(
  op: string,
  error: unknown,
  context: Record<string, unknown> = {},
): string {
  logger.error({ op, ...context, error }, `pool-archive:${op} — action failed`);

  if (error instanceof ForbiddenError) return 'You do not have permission to perform this action.';
  if (error instanceof LockedError) return 'This pool is locked and can no longer be changed.';
  if (error instanceof NotFoundError) return 'Pool or tournament not found.';
  return 'Something went wrong. Please try again.';
}

export async function archivePoolAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ArchivePoolSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn(
      { op: 'archivePool', issues: parsed.error.issues },
      'pool-archive:archivePool — invalid input',
    );
    return { ok: false, error: 'Invalid request.' };
  }
  const poolId = asPoolId(parsed.data.poolId);

  try {
    const actor = await getActorOrThrow();
    const pool = await getPoolById(db, poolId);
    if (!pool) throw new NotFoundError(`Pool ${poolId} not found`);
    assertIsOwner(pool, actor.userId);

    const tournament = await getTournamentById(db, pool.tournamentId);
    if (!tournament) throw new NotFoundError(`Tournament ${pool.tournamentId} not found`);
    if (!tournament.definition)
      throw new NotFoundError(`Tournament ${pool.tournamentId} has no definition`);

    await archivePool(db, {
      poolId,
      poolName: pool.name,
      tournamentId: pool.tournamentId,
      tournamentName: tournament.name,
      archivedBy: actor.userId,
      def: tournament.definition,
      scoring: tournament.scoringConfig,
    });

    revalidatePath(`/pools/${poolId}`);
    revalidatePath(`/pools/${poolId}/archive`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: safeErrorMessage('archivePool', e, { poolId }) };
  }
}
