import type {
  CardInputs,
  DerivedCard,
  ActualResults,
  Scoring,
  ScoreBreakdown,
  AccuracyBreakdown,
  CategoryAccuracy,
} from './types.js';
import { points } from './brand.js';
import { scoreGroupMatches, scoreGroupMatchesDetail } from './scoring/group-matches.js';
import { scoreGroupOrder, scoreGroupOrderDetail } from './scoring/group-order.js';
import {
  scoreBronze,
  scoreFinal,
  scoreBronzeDetail,
  scoreFinalDetail,
} from './scoring/finish-matches.js';
import {
  scoreRoundOf16,
  scoreRoundOf8,
  scoreTopFour,
  scoreTopFourTeams,
  scoreTopFourPosition,
  scoreRoundOf16Detail,
  scoreRoundOf8Detail,
  scoreTopFourTeamsDetail,
  scoreTopFourPositionDetail,
} from './scoring/sets-rankings.js';
import { scoreSpecials, scoreSpecialsDetail } from './scoring/specials.js';

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

function sumAccuracy(parts: CategoryAccuracy[]): CategoryAccuracy {
  return parts.reduce(
    (acc, p) => ({ hits: acc.hits + p.hits, attempted: acc.attempted + p.attempted }),
    { hits: 0, attempted: 0 },
  );
}

export function scoreCardAccuracy(
  derived: DerivedCard,
  inputs: CardInputs,
  actual: ActualResults,
): AccuracyBreakdown {
  const groupMatches = scoreGroupMatchesDetail(inputs, actual);
  const groupOrder = scoreGroupOrderDetail(derived, actual);
  const bronze = scoreBronzeDetail(inputs, derived, actual);
  const final = scoreFinalDetail(inputs, derived, actual);
  const roundOf16 = scoreRoundOf16Detail(derived, actual);
  const roundOf8 = scoreRoundOf8Detail(derived, actual);
  const topFourTeams = scoreTopFourTeamsDetail(derived, actual);
  const topFourPosition = scoreTopFourPositionDetail(derived, actual);
  const specials = scoreSpecialsDetail(inputs, actual);

  return {
    groupMatches,
    groupOrder,
    bronze,
    final,
    roundOf16,
    roundOf8,
    topFourTeams,
    topFourPosition,
    specials,
    total: sumAccuracy([
      groupMatches,
      groupOrder,
      bronze,
      final,
      roundOf16,
      roundOf8,
      topFourTeams,
      topFourPosition,
      specials,
    ]),
  };
}
