import { computeRemainingMaxPoints, getSpecialBetDefs } from '@cup/engine';
import type { Tournament, ActualResults } from '@cup/engine';
import type { MatchRow } from '@cup/db';

const ARRAY_ANSWER_BETS = new Set([
  'groupTopScoringTeam',
  'groupTopConcedingTeam',
  'tournamentTopScoringTeam',
  'tournamentTopConcedingTeam',
  'mostYellowCardsTeam',
  'topScorerPlayer',
]);

function isSpecialBetPending(betKey: string, actualResults: ActualResults): boolean {
  if (betKey === 'finalDecidedByPenalties') return actualResults.finalMatch === undefined;
  if (betKey === 'finalDecisiveGoalPlayer')
    return actualResults.finalMatch?.decisiveGoalPlayer === undefined;
  if (ARRAY_ANSWER_BETS.has(betKey)) {
    const arr = (actualResults.answers as Record<string, unknown[]>)[betKey];
    return !arr || arr.length === 0;
  }
  return (actualResults.answers as Record<string, unknown>)[betKey] === undefined;
}

/**
 * Computes the maximum points still available pool-wide.
 *
 * Group and knockout contributions are category-level (binary: either the
 * category is resolved or all its max points remain). Specials count all
 * pending bet definitions regardless of whether a user made a pick — matching
 * the "still available" stat card in the results view.
 *
 * The result is pool-wide (same for every player) and should be used for
 * both the per-player "+Avail" column and the "Still available" stat card so
 * the two displays are always consistent.
 */
export function computeCanStillGet(
  def: Tournament,
  allMatches: MatchRow[],
  actualResults: ActualResults,
): number {
  const finalMatchIds = new Set(allMatches.filter((m) => m.status === 'final').map((m) => m.id));
  const totalMax = computeRemainingMaxPoints(def, { finalMatchIds: new Set() });
  const remainingMax = computeRemainingMaxPoints(def, { finalMatchIds });

  const groupRemaining = remainingMax.groupMatches + remainingMax.groupOrder;

  const knockoutRemaining =
    (actualResults.answers.roundOf16 !== undefined ? 0 : totalMax.roundOf16) +
    (actualResults.answers.roundOf8 !== undefined ? 0 : totalMax.roundOf8) +
    (actualResults.answers.topFourOrder !== undefined ? 0 : totalMax.topFour) +
    (actualResults.bronzeMatch !== undefined ? 0 : totalMax.bronze) +
    (actualResults.finalMatch !== undefined ? 0 : totalMax.final);

  const specialsRemaining = getSpecialBetDefs(def.scoring)
    .filter((d) => d.points > 0)
    .reduce((sum, d) => (isSpecialBetPending(d.key, actualResults) ? sum + d.points : sum), 0);

  return groupRemaining + knockoutRemaining + specialsRemaining;
}
