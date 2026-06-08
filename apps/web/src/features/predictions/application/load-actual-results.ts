import type { AppSchema } from '@/shared/db';
import type { Db } from '@cup/db';
import { getActualResults } from '@cup/db';
import type { ActualResults } from '@cup/engine';

export async function loadActualResults(
  db: Db<AppSchema>,
  tournamentId: string,
): Promise<ActualResults> {
  return getActualResults(db, tournamentId);
}
