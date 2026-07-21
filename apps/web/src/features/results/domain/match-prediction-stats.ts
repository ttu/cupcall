import type { MatchPredictionStats } from './types';

/** Win/draw/loss split and average goals across a set of predicted {home,away} scores. */
export function computeMatchPredictionStats(
  scores: { home: number; away: number }[],
): MatchPredictionStats | null {
  const total = scores.length;
  if (total === 0) return null;

  const homeWins = scores.filter((s) => s.home > s.away).length;
  const draws = scores.filter((s) => s.home === s.away).length;
  const awayWins = scores.filter((s) => s.home < s.away).length;
  const avgHome = scores.reduce((sum, s) => sum + s.home, 0) / total;
  const avgAway = scores.reduce((sum, s) => sum + s.away, 0) / total;

  return {
    homeWinPct: Math.round((homeWins / total) * 100),
    drawPct: Math.round((draws / total) * 100),
    awayWinPct: Math.round((awayWins / total) * 100),
    avgHomeGoals: Math.round(avgHome * 10) / 10,
    avgAwayGoals: Math.round(avgAway * 10) / 10,
    totalPredictions: total,
  };
}
