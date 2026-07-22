import type { CardInputs, ActualResults, CategoryAccuracy, Scoring } from '../types.js';
import type { Points } from '../brand.js';
import { points } from '../brand.js';

function detailIfMatch<T>(predicted: T | undefined, actual: T | undefined): CategoryAccuracy {
  if (predicted === undefined || actual === undefined) return { hits: 0, attempted: 0 };
  return { hits: predicted === actual ? 1 : 0, attempted: 1 };
}

function detailIfInSet<T>(predicted: T | undefined, actuals: T[] | undefined): CategoryAccuracy {
  if (predicted === undefined || actuals === undefined || actuals.length === 0) {
    return { hits: 0, attempted: 0 };
  }
  return { hits: actuals.includes(predicted) ? 1 : 0, attempted: 1 };
}

function scoreIfMatch<T>(predicted: T | undefined, actual: T | undefined, pts: number): number {
  return detailIfMatch(predicted, actual).hits * pts;
}

function scoreIfInSet<T>(predicted: T | undefined, actuals: T[] | undefined, pts: number): number {
  return detailIfInSet(predicted, actuals).hits * pts;
}

function sum(parts: CategoryAccuracy[]): CategoryAccuracy {
  return parts.reduce(
    (acc, p) => ({ hits: acc.hits + p.hits, attempted: acc.attempted + p.attempted }),
    { hits: 0, attempted: 0 },
  );
}

export function scoreSpecialsDetail(inputs: CardInputs, actual: ActualResults): CategoryAccuracy {
  const { specials } = inputs;
  const { answers, finalMatch } = actual;

  const finalDecidedByPenaltiesPredicted =
    specials.finalDecidedByPenalties !== undefined && finalMatch !== undefined
      ? specials.finalDecidedByPenalties
      : undefined;
  const finalDecidedByPenaltiesActual =
    finalMatch !== undefined ? finalMatch.decidedBy === 'penalties' : undefined;

  return sum([
    detailIfInSet(specials.topScorerPlayer, answers.topScorerPlayer),
    detailIfInSet(specials.groupTopScoringTeam, answers.groupTopScoringTeam),
    detailIfInSet(specials.groupTopConcedingTeam, answers.groupTopConcedingTeam),
    detailIfInSet(specials.tournamentTopScoringTeam, answers.tournamentTopScoringTeam),
    detailIfInSet(specials.tournamentTopConcedingTeam, answers.tournamentTopConcedingTeam),
    detailIfMatch(specials.highestMatchGoals, answers.highestMatchGoals),
    detailIfInSet(specials.mostYellowCardsTeam, answers.mostYellowCardsTeam),
    detailIfMatch(specials.firstRedCardPlayer, answers.firstRedCardPlayer),
    detailIfMatch(specials.penaltyShootoutCount, answers.penaltyShootoutCount),
    detailIfMatch(finalDecidedByPenaltiesPredicted, finalDecidedByPenaltiesActual),
    detailIfMatch(specials.finalDecisiveGoalPlayer, finalMatch?.decisiveGoalPlayer),
  ]);
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

  if (specials.finalDecidedByPenalties !== undefined && finalMatch !== undefined) {
    const actualByPenalties = finalMatch.decidedBy === 'penalties';
    if (specials.finalDecidedByPenalties === actualByPenalties) {
      total += scoring.finalDecidedByPenalties;
    }
  }

  total += scoreIfMatch(
    specials.finalDecisiveGoalPlayer,
    finalMatch?.decisiveGoalPlayer,
    scoring.finalDecisiveGoalPlayer,
  );

  return points(total);
}
