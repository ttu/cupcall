import type { CardInputs, ActualResults, Scoring } from '../types.js';
import type { Points } from '../brand.js';
import { points } from '../brand.js';

function outcome(home: number, away: number): 'home' | 'draw' | 'away' {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'draw';
}

export function scoreGroupMatches(
  inputs: CardInputs,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  let total = 0;

  for (const result of actual.matchResults) {
    const predicted = inputs.groupScores.find((g) => g.matchId === result.matchId);
    if (predicted === undefined) {
      // unpredicted match scores 0
      continue;
    }

    if (predicted.home === result.home && predicted.away === result.away) {
      total += scoring.groupMatch.exactScore;
    } else if (outcome(predicted.home, predicted.away) === outcome(result.home, result.away)) {
      total += scoring.groupMatch.correctOutcome;
    }
    // else 0
  }

  return points(total);
}
