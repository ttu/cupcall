import type { CardInputs, ActualResults, CategoryAccuracy, Scoring } from '../types.js';
import type { Points } from '../brand.js';
import { points } from '../brand.js';

function outcome(home: number, away: number): 'home' | 'draw' | 'away' {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'draw';
}

function classifyGroupMatch(
  predicted: { home: number; away: number },
  result: { home: number; away: number },
): 'exact' | 'outcome' | 'miss' {
  if (predicted.home === result.home && predicted.away === result.away) return 'exact';
  if (outcome(predicted.home, predicted.away) === outcome(result.home, result.away)) {
    return 'outcome';
  }
  return 'miss';
}

export function scoreGroupMatches(
  inputs: CardInputs,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  let total = 0;

  for (const result of actual.matchResults) {
    const predicted = inputs.groupScores.find((g) => g.matchId === result.matchId);
    if (predicted === undefined) continue;

    const classification = classifyGroupMatch(predicted, result);
    if (classification === 'exact') total += scoring.groupMatch.exactScore;
    else if (classification === 'outcome') total += scoring.groupMatch.correctOutcome;
  }

  return points(total);
}

export function scoreGroupMatchesDetail(
  inputs: CardInputs,
  actual: ActualResults,
): CategoryAccuracy {
  let hits = 0;
  let attempted = 0;

  for (const result of actual.matchResults) {
    const predicted = inputs.groupScores.find((g) => g.matchId === result.matchId);
    if (predicted === undefined) continue;

    attempted++;
    if (classifyGroupMatch(predicted, result) !== 'miss') hits++;
  }

  return { hits, attempted };
}
