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
  return points(
    scoreTopFourMembership(derived, actual, scoring) +
      scoreTopFourPositionBonus(derived, actual, scoring),
  );
}

/** Correct top-4 (semifinalist) team predictions, set membership only — order never matters. */
function scoreTopFourMembership(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): number {
  if (actual.answers.roundOf4 === undefined) {
    return 0;
  }

  const actualSet = new Set(actual.answers.roundOf4);
  const correctCount = derived.roundOf4.filter((team) => actualSet.has(team)).length;

  return correctCount * scoring.roundOf4PerTeam;
}

/**
 * +topFourPositionBonus per team whose predicted final-standing slot (1st/2nd from the Final,
 * 3rd/4th from Bronze) exactly matches the actual slot. Resolves independently per match: 1st/2nd
 * as soon as the Final is played, 3rd/4th as soon as Bronze is played. A team can only earn this
 * if it also earned membership points — reaching the Final/Bronze match implies being one of the
 * 4 real semifinalists, so no separate membership check is needed here.
 */
function scoreTopFourPositionBonus(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): number {
  const [predictedFinalWinner, predictedFinalLoser, predictedBronzeWinner, predictedBronzeLoser] =
    derived.topFour;
  let total = 0;

  if (actual.finalMatch !== undefined) {
    const { home, away, winner } = actual.finalMatch;
    const loser = winner === home ? away : home;
    if (predictedFinalWinner === winner) total += scoring.topFourPositionBonus;
    if (predictedFinalLoser === loser) total += scoring.topFourPositionBonus;
  }

  if (actual.bronzeMatch !== undefined) {
    const { home, away, winner } = actual.bronzeMatch;
    const loser = winner === home ? away : home;
    if (predictedBronzeWinner === winner) total += scoring.topFourPositionBonus;
    if (predictedBronzeLoser === loser) total += scoring.topFourPositionBonus;
  }

  return total;
}
