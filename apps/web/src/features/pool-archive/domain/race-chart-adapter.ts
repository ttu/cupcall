import type { RaceChartData, RaceChartPlayer } from '@/features/results';
import { RACE_COLORS } from '@/features/results';
import type { UserId } from '@cup/engine';
import type { PoolArchiveView } from './types';

/** Adapts a frozen archive's recap + per-entry points history into the shape `RaceChart` expects. */
export function toRaceChartData(
  view: PoolArchiveView,
  viewerUserId: UserId | null,
): RaceChartData | null {
  if (!view.recap) return null;

  const stages = view.recap.stages;
  let colorIdx = 0;

  const chartPlayers: RaceChartPlayer[] = view.entries
    .filter((e): e is typeof e & { pointsHistory: number[] } => e.pointsHistory !== null)
    .map((e) => {
      const isCurrentUser = viewerUserId !== null && e.userId === viewerUserId;
      const color = isCurrentUser
        ? 'var(--green-500)'
        : (RACE_COLORS[colorIdx++] ?? 'var(--ink-muted)');
      return {
        userId: e.userId ?? e.displayName,
        displayName: e.displayName,
        isCurrentUser,
        color,
        points: e.pointsHistory,
      };
    });

  return { chartStages: stages, chartNowIndex: stages.length - 1, chartPlayers };
}
