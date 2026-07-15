import type { CardInputs, DerivedCard, ActualResults, Scoring, ScoreBreakdown } from './types.js';
import { points } from './brand.js';
import { scoreGroupMatches } from './scoring/group-matches.js';
import { scoreGroupOrder } from './scoring/group-order.js';
import { scoreBronze, scoreFinal } from './scoring/finish-matches.js';
import {
  scoreRoundOf16,
  scoreRoundOf8,
  scoreTopFour,
  scoreTopFourTeams,
  scoreTopFourPosition,
} from './scoring/sets-rankings.js';
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
  const roundOf16 = scoreRoundOf16(derived, actual, scoring);
  const roundOf8 = scoreRoundOf8(derived, actual, scoring);
  const topFourTeams = scoreTopFourTeams(derived, actual, scoring);
  const topFourPosition = scoreTopFourPosition(derived, actual, scoring);
  // Reuses scoreTopFour (rather than re-summing the two parts here) so there is exactly one
  // place that defines "topFour = teams + position".
  const topFour = scoreTopFour(derived, actual, scoring);
  const specials = scoreSpecials(inputs, actual, scoring);
  const total = points(
    groupMatches + groupOrder + bronze + final + roundOf16 + roundOf8 + topFour + specials,
  );
  return {
    groupMatches,
    groupOrder,
    bronze,
    final,
    roundOf16,
    roundOf8,
    topFour,
    topFourTeams,
    topFourPosition,
    specials,
    total,
  };
}
