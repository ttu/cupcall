import { db } from '@/shared/db';
import { rescoreCard } from '../application/rescore';
import { loadActualResults } from '../application/load-actual-results';
import { getPredictionInputs } from '@cup/db';
import type { Tournament, UserId, ActualResults, CardInputs } from '@cup/engine';

export async function rescoreAfterEdit(
  predictionId: string,
  poolId: string,
  userId: UserId,
  tournamentDef: Tournament,
  /** Pre-loaded actual results — skips the DB fetch when provided. */
  actual?: ActualResults,
  /** Pre-loaded card inputs — skips the DB fetch when provided. */
  inputs?: CardInputs,
): Promise<void> {
  const [resolvedActual, resolvedInputs] = await Promise.all([
    actual ?? loadActualResults(db, tournamentDef.id),
    inputs ?? getPredictionInputs(db, predictionId),
  ]);
  await rescoreCard({
    db,
    predictionId,
    poolId,
    userId,
    tournament: tournamentDef,
    actual: resolvedActual,
    inputs: resolvedInputs,
  });
}
