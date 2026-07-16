import type {
  KnockoutMatchDetail,
  KnockoutMatchDetailPrediction,
  KnockoutMatchView,
  KnockoutMatrixEntry,
} from './types';
import { resolveGoalsByTeamId } from './predicted-goals';

function resolveTeamName(match: KnockoutMatchView, teamId: string): string | null {
  if (teamId === match.homeTeamId) return match.homeTeamName;
  if (teamId === match.awayTeamId) return match.awayTeamName;
  if (teamId === match.predictedHomeTeamId) return match.predictedHomeTeamName;
  if (teamId === match.predictedAwayTeamId) return match.predictedAwayTeamName;
  return null;
}

function buildInsight(
  match: KnockoutMatchView,
  totalPredictions: number,
  homePickCount: number,
  awayPickCount: number,
  exactScoreCount: number,
): string | null {
  if (totalPredictions === 0) return null;

  const majoritySide: 'home' | 'away' = awayPickCount > homePickCount ? 'away' : 'home';
  const majorityCount = majoritySide === 'home' ? homePickCount : awayPickCount;
  const majorityTeamId = majoritySide === 'home' ? match.homeTeamId : match.awayTeamId;
  const majorityTeamName =
    (majoritySide === 'home' ? match.homeTeamName : match.awayTeamName) ??
    majorityTeamId ??
    'that side';

  if (match.status !== 'final' || match.actualWinnerId === null) {
    return `${majorityCount} of ${totalPredictions} have backed ${majorityTeamName} so far.`;
  }

  const gotItRight = majorityTeamId !== null && majorityTeamId === match.actualWinnerId;
  const base = `${majorityCount} of ${totalPredictions} backed ${majorityTeamName} — the pool got it ${gotItRight ? 'right' : 'wrong'}.`;

  if (exactScoreCount === 0) return base;
  return `${base} ${exactScoreCount} nailed the exact score.`;
}

export function buildKnockoutMatchDetail(
  match: KnockoutMatchView,
  knockoutMatrix: KnockoutMatrixEntry[],
): KnockoutMatchDetail {
  const predictions: KnockoutMatchDetailPrediction[] = knockoutMatrix.map((row) => {
    const c = row.cells.find((cell) => cell.bracketMatchKey === match.bracketMatchKey);
    const pickedTeamId = c?.pickedWinnerId ?? null;
    const pickedOpponentId = c?.pickedOpponentId ?? null;

    let predictedHome = c?.predictedHome ?? null;
    let predictedAway = c?.predictedAway ?? null;
    const scoreByTeam = c?.predictedScoreByTeam ?? null;
    const pickedGoals = resolveGoalsByTeamId(scoreByTeam, pickedTeamId);
    const opponentGoals = resolveGoalsByTeamId(scoreByTeam, pickedOpponentId);
    if (pickedGoals !== null && opponentGoals !== null) {
      predictedHome = pickedGoals;
      predictedAway = opponentGoals;
    }

    return {
      userId: row.userId,
      displayName: row.displayName,
      isCurrentUser: row.isCurrentUser,
      pickedTeamId,
      pickedTeamName: pickedTeamId !== null ? resolveTeamName(match, pickedTeamId) : null,
      pickedOpponentId,
      pickedOpponentName:
        pickedOpponentId !== null ? resolveTeamName(match, pickedOpponentId) : null,
      predictedHome,
      predictedAway,
      hit: c?.hit ?? 'no-pick',
      isExactScore: c?.isExactScore ?? false,
      points: c?.points ?? 0,
    };
  });

  const homePickCount = predictions.filter((p) => p.pickedTeamId === match.homeTeamId).length;
  const awayPickCount = predictions.filter((p) => p.pickedTeamId === match.awayTeamId).length;
  const totalPredictions = predictions.filter((p) => p.pickedTeamId !== null).length;
  const exactScoreCount = predictions.filter((p) => p.isExactScore).length;

  const sorted = predictions.toSorted((a, b) => {
    if (a.isCurrentUser !== b.isCurrentUser) return a.isCurrentUser ? -1 : 1;
    if (a.points !== b.points) return b.points - a.points;
    return a.displayName.localeCompare(b.displayName);
  });

  return {
    totalPredictions,
    homePickCount,
    awayPickCount,
    homePickPct: totalPredictions > 0 ? Math.round((homePickCount / totalPredictions) * 100) : null,
    awayPickPct: totalPredictions > 0 ? Math.round((awayPickCount / totalPredictions) * 100) : null,
    insight: buildInsight(match, totalPredictions, homePickCount, awayPickCount, exactScoreCount),
    predictions: sorted,
  };
}
