import type { DerivedCard, ActualResults, Scoring } from '../types.js';
import type { Points } from '../brand.js';
import { points } from '../brand.js';

export function scoreRoundOf16(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  if (actual.answers.roundOf16 === undefined) {
    return points(0);
  }

  const actualSet = new Set(actual.answers.roundOf16);
  let total = 0;

  for (const team of derived.roundOf16) {
    if (actualSet.has(team)) {
      total += scoring.roundOf16PerTeam;
    }
  }

  return points(total);
}

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

export function scoreTopFour(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  if (actual.answers.roundOf4 === undefined) {
    return points(0);
  }

  const actualSet = new Set(actual.answers.roundOf4);
  const correctCount = derived.roundOf4.filter((team) => actualSet.has(team)).length;

  return points(correctCount * scoring.roundOf4PerTeam);
}
