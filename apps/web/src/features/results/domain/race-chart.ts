import type { UserId } from '@cup/engine';
import type { LeaderboardEntry } from '@cup/db';
import type { RaceChartPlayer } from './types';
import { AVATAR_PALETTE } from '@/shared/ui';

export type RaceChartData = {
  chartStages: string[];
  chartNowIndex: number;
  chartPlayers: RaceChartPlayer[];
};

/** Builds chart-only race data (actual data, no projection) from leaderboard alone. */
export function buildRaceChartData(leaderboard: LeaderboardEntry[], userId: UserId): RaceChartData {
  const hasGroupPoints = leaderboard.some(
    (e) => e.breakdown && e.breakdown.groupMatches + e.breakdown.groupOrder > 0,
  );

  const chartStages: string[] = ['Start'];
  if (hasGroupPoints) chartStages.push('Group Stage');
  chartStages.push('Now');
  const chartNowIndex = chartStages.length - 1;

  const chartPlayers: RaceChartPlayer[] = leaderboard.map((e, index) => {
    const isCurrentUser = e.userId === userId;
    const color = AVATAR_PALETTE[index % AVATAR_PALETTE.length] ?? 'var(--ink-muted)';

    const pts: number[] = [0];
    if (hasGroupPoints) {
      pts.push(e.breakdown ? e.breakdown.groupMatches + e.breakdown.groupOrder : 0);
    }
    pts.push(e.pointsTotal);

    return { userId: e.userId, displayName: e.displayName, isCurrentUser, color, points: pts };
  });

  chartPlayers.sort((a, b) => (a.isCurrentUser ? 1 : 0) - (b.isCurrentUser ? 1 : 0));

  return { chartStages, chartNowIndex, chartPlayers };
}
