import type { Db } from '@cup/db';
import { getPoolArchiveWithEntries } from '@cup/db';
import type { PoolId } from '@cup/engine';
import type { AppSchema } from '@/shared/db';
import type { PoolArchiveView } from '../domain/types';
import { computeLeadChanges, computeBiggestRiser } from '../domain/race-history';
import type { StageHistoryPlayer } from '../domain/race-history';

export async function getPoolArchiveView(
  db: Db<AppSchema>,
  poolId: PoolId,
): Promise<PoolArchiveView | undefined> {
  const result = await getPoolArchiveWithEntries(db, poolId);
  if (!result) return undefined;

  const { archive, entries } = result;

  const entryViews = entries.map((e) => ({
    userId: e.userId,
    displayName: e.displayName,
    rank: e.rank,
    pointsTotal: e.pointsTotal,
    breakdown: e.breakdown,
    pointsHistory: e.pointsHistory,
    stageReasons: e.stageReasons,
  }));

  const stages = archive.recap?.stages ?? [];
  const historyPlayers: StageHistoryPlayer[] = entryViews
    .filter((e): e is typeof e & { pointsHistory: number[] } => e.pointsHistory !== null)
    .map((e) => ({
      displayName: e.displayName,
      points: e.pointsHistory,
      stageReasons: e.stageReasons,
    }));

  return {
    poolId: archive.poolId,
    poolName: archive.poolName,
    tournamentId: archive.tournamentId,
    tournamentName: archive.tournamentName,
    archivedAt: archive.archivedAt,
    entries: entryViews,
    recap: archive.recap,
    leadChanges: archive.recap
      ? computeLeadChanges(historyPlayers, stages, archive.recap.stageRoundLabels ?? [])
      : [],
    biggestRiser: archive.recap
      ? computeBiggestRiser(
          historyPlayers,
          stages,
          (archive.recap.groupCompletionStageIndex ?? 0) + 1,
        )
      : null,
  };
}
