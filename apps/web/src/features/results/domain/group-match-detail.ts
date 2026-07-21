import type {
  GroupMatchDetail,
  GroupMatchDetailPrediction,
  MatchMatrixEntry,
  MatrixMatch,
} from './types';
import { computeMatchPredictionStats } from './match-prediction-stats';
import { sortPredictionsForDisplay } from './sort-predictions-for-display';

type ScoredPrediction = { predictedHome: number; predictedAway: number };

function hasScore(
  p: GroupMatchDetailPrediction,
): p is GroupMatchDetailPrediction & ScoredPrediction {
  return p.predictedHome !== null && p.predictedAway !== null;
}

function buildPoolStats(scored: ScoredPrediction[]) {
  return computeMatchPredictionStats(
    scored.map((p) => ({ home: p.predictedHome, away: p.predictedAway })),
  );
}

/** The actual outcome, or null when the match hasn't finished (or somehow has partial scores). */
function classifyResult(match: MatrixMatch): 'home' | 'draw' | 'away' | null {
  if (match.actualHome === null || match.actualAway === null) return null;
  if (match.actualHome > match.actualAway) return 'home';
  if (match.actualHome === match.actualAway) return 'draw';
  return 'away';
}

type MajorityOutcome = { count: number; label: string; matchesActual: boolean };

/** Picks the most-predicted outcome (home/draw/away) among the pool's scored predictions. */
function resolveMajorityOutcome(scored: ScoredPrediction[], match: MatrixMatch): MajorityOutcome {
  const homeWins = scored.filter((p) => p.predictedHome > p.predictedAway).length;
  const draws = scored.filter((p) => p.predictedHome === p.predictedAway).length;
  const awayWins = scored.filter((p) => p.predictedHome < p.predictedAway).length;
  const actual = classifyResult(match);

  const home: MajorityOutcome = {
    count: homeWins,
    label: `a home win for ${match.homeTeamName}`,
    matchesActual: actual === 'home',
  };
  const draw: MajorityOutcome = {
    count: draws,
    label: 'a draw',
    matchesActual: actual === 'draw',
  };
  const away: MajorityOutcome = {
    count: awayWins,
    label: `an away win for ${match.awayTeamName}`,
    matchesActual: actual === 'away',
  };

  return [home, draw, away].reduce((best, c) => (c.count > best.count ? c : best), home);
}

function buildInsight(
  match: MatrixMatch,
  scored: ScoredPrediction[],
  totalPredictions: number,
  exactScoreCount: number,
): string | null {
  if (totalPredictions === 0) return null;

  const majority = resolveMajorityOutcome(scored, match);
  const base = `${majority.count} of ${totalPredictions} predicted ${majority.label}`;

  if (match.status !== 'final') return `${base} so far.`;

  const verdict = `${base} — the pool got it ${majority.matchesActual ? 'right' : 'wrong'}.`;
  if (exactScoreCount === 0) return verdict;
  return `${verdict} ${exactScoreCount} nailed the exact score.`;
}

export function buildGroupMatchDetail(
  match: MatrixMatch,
  matchMatrix: MatchMatrixEntry[],
): GroupMatchDetail {
  const predictions: GroupMatchDetailPrediction[] = matchMatrix.map((row) => {
    const cell = row.cells.find((c) => c.matchId === match.matchId) ?? null;
    return {
      userId: row.userId,
      displayName: row.displayName,
      isCurrentUser: row.isCurrentUser,
      predictedHome: cell?.predictedHome ?? null,
      predictedAway: cell?.predictedAway ?? null,
      hit: cell?.hit ?? 'pending',
      points: cell?.points ?? 0,
    };
  });

  const scored = predictions.filter(hasScore);
  const poolStats = buildPoolStats(scored);
  const exactScoreCount = predictions.filter((p) => p.hit === 'exact').length;

  const sorted = sortPredictionsForDisplay(predictions);

  return {
    totalPredictions: scored.length,
    poolStats,
    insight: buildInsight(match, scored, scored.length, exactScoreCount),
    predictions: sorted,
  };
}
