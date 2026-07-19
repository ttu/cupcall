import type { ActualResults } from '@cup/engine';

export type ResolvedBetAnswer = { isArray: boolean; scalar: unknown; array: unknown[] };

const ARRAY_ANSWER_BETS = new Set([
  'groupTopScoringTeam',
  'groupTopConcedingTeam',
  'tournamentTopScoringTeam',
  'tournamentTopConcedingTeam',
  'mostYellowCardsTeam',
  'topScorerPlayer',
]);

/**
 * Resolves a special bet's actual answer from ActualResults, normalizing the three different
 * shapes (boolean derived from finalMatch, single value from finalMatch, array/scalar from
 * answers) into one shape callers can check uniformly.
 */
export function resolveActualForBet(
  betKey: string,
  actualResults: ActualResults,
): ResolvedBetAnswer {
  if (betKey === 'finalDecidedByPenalties') {
    const val =
      actualResults.finalMatch !== undefined
        ? actualResults.finalMatch.decidedBy === 'penalties'
        : undefined;
    return { isArray: false, scalar: val, array: [] };
  }
  if (betKey === 'finalDecisiveGoalPlayer') {
    return { isArray: false, scalar: actualResults.finalMatch?.decisiveGoalPlayer, array: [] };
  }
  if (ARRAY_ANSWER_BETS.has(betKey)) {
    const arr = ((actualResults.answers as Record<string, unknown[]>)[betKey] ?? []) as unknown[];
    return { isArray: true, scalar: undefined, array: arr };
  }
  return {
    isArray: false,
    scalar: (actualResults.answers as Record<string, unknown>)[betKey],
    array: [],
  };
}

/** True once a bet has an actual answer recorded (array non-empty, or scalar set). */
export function isBetResolved(actual: ResolvedBetAnswer): boolean {
  return actual.isArray
    ? actual.array.length > 0
    : actual.scalar !== undefined && actual.scalar !== null;
}
