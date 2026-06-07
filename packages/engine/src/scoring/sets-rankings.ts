import type { DerivedCard, ActualResults, Scoring } from '../types.js';
import type { Points } from '../brand.js';
import { points } from '../brand.js';

export function scoreRoundOf8(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  if (actual.answers.roundOf8 === undefined) {
    return points(0);
  }

  const actualSet = new Set(actual.answers.roundOf8);
  let total = 0;

  for (const team of derived.roundOf8) {
    if (actualSet.has(team)) {
      total += scoring.roundOf8PerTeam;
    }
  }

  return points(total);
}

function topFourTierPoints(positionsCorrect: number, scoring: Scoring): number {
  switch (positionsCorrect) {
    case 4:
      return scoring.topFourOrder.allCorrect;
    case 3:
      return scoring.topFourOrder.threeCorrect;
    case 2:
      return scoring.topFourOrder.twoCorrect;
    case 1:
      return scoring.topFourOrder.oneCorrect;
    default:
      return 0;
  }
}

export function scoreTopFour(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  if (actual.answers.topFourOrder === undefined) {
    return points(0);
  }

  const actualOrder = actual.answers.topFourOrder;

  // (a) Position tier: count index-aligned matches
  let positionsCorrect = 0;
  for (let i = 0; i < derived.topFour.length; i++) {
    if (derived.topFour[i] === actualOrder[i]) {
      positionsCorrect++;
    }
  }
  const tier = topFourTierPoints(positionsCorrect, scoring);

  // (b) Team consolation: count derived teams that appear anywhere in actual top-4
  const actualSet = new Set(actualOrder);
  const teamsInActual = derived.topFour.filter((team) => actualSet.has(team)).length;
  const consolation = teamsInActual * scoring.topFourOrder.teamRightWrongPlace;

  return points(Math.max(tier, consolation));
}
