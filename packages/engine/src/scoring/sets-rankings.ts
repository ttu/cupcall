import type { DerivedCard, ActualResults, CategoryAccuracy, Scoring } from '../types.js';
import type { Points, TeamId } from '../brand.js';
import { points } from '../brand.js';

function setMembershipDetail(
  predicted: TeamId[],
  actualSet: TeamId[] | undefined,
): CategoryAccuracy {
  if (actualSet === undefined) return { hits: 0, attempted: 0 };
  const set = new Set(actualSet);
  return { hits: predicted.filter((t) => set.has(t)).length, attempted: predicted.length };
}

export function scoreRoundOf16Detail(
  derived: DerivedCard,
  actual: ActualResults,
): CategoryAccuracy {
  return setMembershipDetail(derived.roundOf16, actual.answers.roundOf16);
}

export function scoreRoundOf8Detail(derived: DerivedCard, actual: ActualResults): CategoryAccuracy {
  return setMembershipDetail(derived.roundOf8, actual.answers.roundOf8);
}

export function scoreTopFourTeamsDetail(
  derived: DerivedCard,
  actual: ActualResults,
): CategoryAccuracy {
  return setMembershipDetail(derived.roundOf4, actual.answers.roundOf4);
}

/**
 * Single atomic slot prediction (e.g. "predicted Final winner"). Attempted only when the player
 * made this specific pick AND the actual team for that slot is known (i.e. the match is decided);
 * a missing pick for one slot never blocks attempts on the other slots — see DerivedCard.topFour,
 * which may hold fewer than 4 entries for a partial card.
 */
function slotDetail(
  predicted: TeamId | undefined,
  actualTeam: TeamId | undefined,
): CategoryAccuracy {
  if (predicted === undefined || actualTeam === undefined) return { hits: 0, attempted: 0 };
  return { hits: predicted === actualTeam ? 1 : 0, attempted: 1 };
}

function sumAccuracy(a: CategoryAccuracy, b: CategoryAccuracy): CategoryAccuracy {
  return { hits: a.hits + b.hits, attempted: a.attempted + b.attempted };
}

/** Winner/loser slot detail for one decided match (Final or Bronze) against its two predicted slots. */
function matchSlotDetail(
  match: ActualResults['finalMatch'] | ActualResults['bronzeMatch'],
  predictedWinner: TeamId | undefined,
  predictedLoser: TeamId | undefined,
): CategoryAccuracy {
  const winner = match?.winner;
  const loser =
    match === undefined ? undefined : match.winner === match.home ? match.away : match.home;

  return sumAccuracy(slotDetail(predictedWinner, winner), slotDetail(predictedLoser, loser));
}

/**
 * 4 independent atomic predictions (final winner/loser slot, bronze winner/loser slot), each
 * attempted only once the player has made that specific slot's pick AND its match is decided.
 * See DerivedCard.topFour and scoreTopFourPosition.
 */
export function scoreTopFourPositionDetail(
  derived: DerivedCard,
  actual: ActualResults,
): CategoryAccuracy {
  const [predictedFinalWinner, predictedFinalLoser, predictedBronzeWinner, predictedBronzeLoser] =
    derived.topFour;

  return sumAccuracy(
    matchSlotDetail(actual.finalMatch, predictedFinalWinner, predictedFinalLoser),
    matchSlotDetail(actual.bronzeMatch, predictedBronzeWinner, predictedBronzeLoser),
  );
}

export function scoreRoundOf16(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  return points(scoreRoundOf16Detail(derived, actual).hits * scoring.roundOf16PerTeam);
}

export function scoreRoundOf8(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  return points(scoreRoundOf8Detail(derived, actual).hits * scoring.roundOf8PerTeam);
}

export function scoreTopFour(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  return points(
    scoreTopFourTeams(derived, actual, scoring) + scoreTopFourPosition(derived, actual, scoring),
  );
}

/** Correct top-4 (semifinalist) team predictions, set membership only — order never matters. */
export function scoreTopFourTeams(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  return points(scoreTopFourTeamsDetail(derived, actual).hits * scoring.roundOf4PerTeam);
}

/**
 * +topFourPositionBonus per team whose predicted final-standing slot (1st/2nd from the Final,
 * 3rd/4th from Bronze) exactly matches the actual slot. See scoreTopFourPositionDetail.
 */
export function scoreTopFourPosition(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  return points(scoreTopFourPositionDetail(derived, actual).hits * scoring.topFourPositionBonus);
}
