import type { CardInputs, DerivedCard, ActualResults, Scoring, ScoreBreakdown } from './types.js';
import { points } from './brand.js';
import { scoreGroupMatches } from './scoring/group-matches.js';
import { scoreGroupOrder } from './scoring/group-order.js';
import { scoreBronze, scoreFinal } from './scoring/finish-matches.js';
import { scoreRoundOf8, scoreTopFour } from './scoring/sets-rankings.js';
import { scoreSpecials } from './scoring/specials.js';

export function scoreCard(
  derived: DerivedCard,
  inputs: CardInputs,
  actual: ActualResults,
  scoring: Scoring,
): ScoreBreakdown {
  const groupMatches = scoreGroupMatches(inputs, actual, scoring);
  const groupOrder = scoreGroupOrder(derived, actual, scoring);
  const bronze = scoreBronze(inputs, derived, actual, scoring);
  const final = scoreFinal(inputs, derived, actual, scoring);
  const roundOf8 = scoreRoundOf8(derived, actual, scoring);
  const topFour = scoreTopFour(derived, actual, scoring);
  const specials = scoreSpecials(inputs, actual, scoring);
  const total = points(groupMatches + groupOrder + bronze + final + roundOf8 + topFour + specials);
  return { groupMatches, groupOrder, bronze, final, roundOf8, topFour, specials, total };
}
