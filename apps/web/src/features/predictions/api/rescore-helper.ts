import { db } from '@/shared/db';
import { rescoreCard } from '../application/rescore';
import { loadActualResults } from '../application/load-actual-results';
import type { Tournament, UserId } from '@cup/engine';

export async function rescoreAfterEdit(
  predictionId: string,
  poolId: string,
  userId: UserId,
  tournamentDef: Tournament,
): Promise<void> {
  const actual = await loadActualResults(db, tournamentDef.id);
  await rescoreCard({
    db,
    predictionId,
    poolId,
    userId,
    tournament: tournamentDef,
    actual,
  });
}
