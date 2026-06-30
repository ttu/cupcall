import type { RaceChartPlayer } from '../domain/types';

const ZOOM_OPTIONS = [14, 7, 5] as const;
export type ZoomDays = 'all' | (typeof ZOOM_OPTIONS)[number];

export function visibleZoomOptions(nowIndex: number): ZoomDays[] {
  return ['all', ...ZOOM_OPTIONS.filter((n) => n < nowIndex)];
}

export function sliceToWindow(
  stages: string[],
  players: RaceChartPlayer[],
  nowIndex: number,
  zoomDays: 'all' | number,
): { stages: string[]; players: RaceChartPlayer[]; nowIndex: number } {
  if (zoomDays === 'all') return { stages, players, nowIndex };
  const startIdx = Math.max(0, nowIndex - zoomDays + 1);
  const slicedStages = stages.slice(startIdx, nowIndex + 1);
  const slicedPlayers = players.map((p) => ({
    ...p,
    points: p.points.slice(startIdx, nowIndex + 1),
  }));
  return { stages: slicedStages, players: slicedPlayers, nowIndex: slicedStages.length - 1 };
}
