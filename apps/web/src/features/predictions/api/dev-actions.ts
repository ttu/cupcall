'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/shared/db';
import { getActorOrThrow } from '@/features/auth';
import { getOrCreatePrediction, upsertGroupScore } from '@cup/db';
import { poolId as asPoolId } from '@cup/engine';
import { rescoreAfterEdit } from './rescore-helper';
import { loadPoolAndTournament } from './actions';

const DevFillSchema = z.object({ poolId: z.string() });

export async function devFillRandomGroupScores(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (process.env.NODE_ENV !== 'development') return { ok: false, error: 'Dev only' };

  const parsed = DevFillSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId: rawPoolId } = parsed.data;
  const poolId = asPoolId(rawPoolId);

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
      // Dev-only seed data (gated above); no security relevance to Math.random() here.
      // eslint-disable-next-line sonarjs/pseudo-random
      const home = Math.floor(Math.random() * 5);
      // eslint-disable-next-line sonarjs/pseudo-random
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
