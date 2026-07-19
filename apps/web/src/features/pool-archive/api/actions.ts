'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/shared/db';
import { getActorOrThrow } from '@/features/auth';
import { assertIsOwner } from '@/shared/authz';
import { getPoolById, getTournamentById } from '@cup/db';
import { poolId as asPoolId } from '@cup/engine';
import { archivePool } from '../application/archive-pool';

const ArchivePoolSchema = z.object({ poolId: z.string() });

export async function archivePoolAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ArchivePoolSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const poolId = asPoolId(parsed.data.poolId);

  try {
    const actor = await getActorOrThrow();
    const pool = await getPoolById(db, poolId);
    if (!pool) throw new Error(`Pool ${poolId} not found`);
    assertIsOwner(pool, actor.userId);

    const tournament = await getTournamentById(db, pool.tournamentId);
    if (!tournament) throw new Error(`Tournament ${pool.tournamentId} not found`);
    if (!tournament.definition)
      throw new Error(`Tournament ${pool.tournamentId} has no definition`);

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
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
