import type { CardInputs, ActualResults, Scoring } from '../types.js';
import type { Points } from '../brand.js';
import { points } from '../brand.js';

/**
 * Award `pts` if `predicted` is defined, `actual` is defined, and they are strictly equal.
 * Used for single-answer bets (numbers, unique events).
 */
function scoreIfMatch<T>(predicted: T | undefined, actual: T | undefined, pts: number): number {
  if (predicted !== undefined && actual !== undefined && predicted === actual) {
    return pts;
  }
  return 0;
}

/**
 * Award `pts` if `predicted` is defined and is one of the `actuals` (tie-aware bets).
 * An empty `actuals` array is treated as "not yet resolved".
 */
function scoreIfInSet<T>(predicted: T | undefined, actuals: T[] | undefined, pts: number): number {
  if (
    predicted !== undefined &&
    actuals !== undefined &&
    actuals.length > 0 &&
    actuals.includes(predicted)
  ) {
    return pts;
  }
  return 0;
}

export function scoreSpecials(inputs: CardInputs, actual: ActualResults, scoring: Scoring): Points {
  const { specials } = inputs;
  const { answers, finalMatch } = actual;

  let total = 0;

  total += scoreIfInSet(specials.topScorerPlayer, answers.topScorerPlayer, scoring.topScorerPlayer);

  total += scoreIfInSet(
    specials.groupTopScoringTeam,
    answers.groupTopScoringTeam,
    scoring.groupTopScoringTeam,
  );

  total += scoreIfInSet(
    specials.groupTopConcedingTeam,
    answers.groupTopConcedingTeam,
    scoring.groupTopConcedingTeam,
  );

  total += scoreIfInSet(
    specials.tournamentTopScoringTeam,
    answers.tournamentTopScoringTeam,
    scoring.tournamentTopScoringTeam,
  );

  total += scoreIfInSet(
    specials.tournamentTopConcedingTeam,
    answers.tournamentTopConcedingTeam,
    scoring.tournamentTopConcedingTeam,
  );

  total += scoreIfMatch(
    specials.highestMatchGoals,
    answers.highestMatchGoals,
    scoring.highestMatchGoals,
  );

  total += scoreIfInSet(
    specials.mostYellowCardsTeam,
    answers.mostYellowCardsTeam,
    scoring.mostYellowCardsTeam,
  );

  total += scoreIfMatch(
    specials.firstRedCardPlayer,
    answers.firstRedCardPlayer,
    scoring.firstRedCardPlayer,
  );

  total += scoreIfMatch(
    specials.penaltyShootoutCount,
    answers.penaltyShootoutCount,
    scoring.penaltyShootoutCount,
  );

  // finalDecidedByPenalties: only if finalMatch is present
  if (specials.finalDecidedByPenalties !== undefined && finalMatch !== undefined) {
    const actualByPenalties = finalMatch.decidedBy === 'penalties';
    if (specials.finalDecidedByPenalties === actualByPenalties) {
      total += scoring.finalDecidedByPenalties;
    }
  }

  // finalDecisiveGoalPlayer: only if finalMatch is present
  total += scoreIfMatch(
    specials.finalDecisiveGoalPlayer,
    finalMatch?.decisiveGoalPlayer,
    scoring.finalDecisiveGoalPlayer,
  );

  return points(total);
}
