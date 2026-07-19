import type {
  KnockoutMatchDetail,
  KnockoutMatchDetailPrediction,
  KnockoutMatchHit,
  KnockoutMatchView,
  KnockoutMatrixCell,
  KnockoutMatrixEntry,
} from './types';
import { resolveGoalsByTeamId } from './predicted-goals';
import { cellBelongsToMatch } from './knockout-cell-key';

/**
 * Final/Bronze matches are split into 'teams'/'score' matrix columns (see buildKnockoutMatrix), so
 * a match's cells can no longer be found by exact bracketMatchKey equality. Find every cell for
 * this match — one for a normal round, one or two for Final/Bronze — so the summary sheet can show
 * a single combined pick.
 */
function findMatchCells(row: KnockoutMatrixEntry, bracketMatchKey: string): KnockoutMatrixCell[] {
  return row.cells.filter((cell) => cellBelongsToMatch(cell.bracketMatchKey, bracketMatchKey));
}

/** Combines a match's (possibly split) cells into the single hit/points the summary sheet shows. */
function combineMatchCells(cells: KnockoutMatrixCell[]): {
  cell: Omit<KnockoutMatrixCell, 'bracketMatchKey'> | null;
  hit: KnockoutMatchHit;
  points: number;
} {
  if (cells.length === 0) return { cell: null, hit: 'no-pick', points: 0 };

  const points = cells.reduce((sum, c) => sum + c.points, 0);
  const primary = cells[0]!;

  let hit: KnockoutMatchHit;
  if (primary.pickedWinnerId === null) hit = 'no-pick';
  else if (cells.some((c) => c.hit === 'impossible')) hit = 'impossible';
  else if (cells.some((c) => c.hit === 'pending')) hit = 'pending';
  else hit = points > 0 ? 'hit' : 'miss';

  return { cell: primary, hit, points };
}

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
    const { cell: c, hit, points } = combineMatchCells(findMatchCells(row, match.bracketMatchKey));
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
      hit,
      isExactScore: c?.isExactScore ?? false,
      points,
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
