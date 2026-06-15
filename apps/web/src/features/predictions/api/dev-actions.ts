'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/shared/db';
import { getActorOrThrow } from '@/features/auth';
import { getPoolById, getTournamentById, getOrCreatePrediction, upsertGroupScore } from '@cup/db';
import { rescoreAfterEdit } from './rescore-helper';

async function loadPoolAndTournament(poolId: string) {
  const pool = await getPoolById(db, poolId);
  if (!pool) throw new Error(`Pool ${poolId} not found`);
  const tournament = await getTournamentById(db, pool.tournamentId);
  if (!tournament) throw new Error(`Tournament ${pool.tournamentId} not found`);
  if (!tournament.definition)
    throw new Error(
      `Tournament definition not loaded for ${pool.tournamentId}. Run pnpm sync first.`,
    );
  return { pool, tournament };
}

const DevFillSchema = z.object({ poolId: z.string() });

export async function devFillRandomGroupScores(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (process.env.NODE_ENV !== 'development') return { ok: false, error: 'Dev only' };

  const parsed = DevFillSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId } = parsed.data;

  try {
    const { userId } = await getActorOrThrow();
    const { pool, tournament } = await loadPoolAndTournament(poolId);
    const tournamentDef = tournament.definition!;

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: pool.tournamentId,
    });

    for (const match of tournamentDef.groupMatches) {
      const home = Math.floor(Math.random() * 5);
      const away = Math.floor(Math.random() * 5);
      await upsertGroupScore(db, prediction.id, match.id, home, away);
    }

    await rescoreAfterEdit(prediction.id, poolId, userId, tournamentDef);

    revalidatePath(`/pools/${poolId}/predict`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
