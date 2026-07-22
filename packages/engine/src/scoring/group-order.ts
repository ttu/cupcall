import type { DerivedCard, ActualResults, CategoryAccuracy, Scoring } from '../types.js';
import type { Points, GroupId, TeamId } from '../brand.js';
import { points } from '../brand.js';

function groupOrderPoints(positionsCorrect: number, scoring: Scoring): number {
  switch (positionsCorrect) {
    case 4:
      return scoring.groupOrder.allCorrect;
    case 2:
      return scoring.groupOrder.twoCorrect;
    case 1:
      return scoring.groupOrder.oneCorrect;
    default:
      return 0;
  }
}

function countPositionsCorrect(derivedOrder: TeamId[], actualOrder: TeamId[]): number {
  let positionsCorrect = 0;
  for (let i = 0; i < derivedOrder.length; i++) {
    if (derivedOrder[i] === actualOrder[i]) positionsCorrect++;
  }
  return positionsCorrect;
}

export function scoreGroupOrder(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  let total = 0;

  for (const groupIdKey of Object.keys(derived.groupOrders) as GroupId[]) {
    const actualOrder = actual.groupOrder[groupIdKey];
    const derivedOrder = derived.groupOrders[groupIdKey];
    if (actualOrder === undefined || derivedOrder === undefined) continue;

    total += groupOrderPoints(countPositionsCorrect(derivedOrder, actualOrder), scoring);
  }

  return points(total);
}

export function scoreGroupOrderDetail(
  derived: DerivedCard,
  actual: ActualResults,
): CategoryAccuracy {
  let hits = 0;
  let attempted = 0;

  for (const groupIdKey of Object.keys(derived.groupOrders) as GroupId[]) {
    const actualOrder = actual.groupOrder[groupIdKey];
    const derivedOrder = derived.groupOrders[groupIdKey];
    if (actualOrder === undefined || derivedOrder === undefined) continue;

    attempted += derivedOrder.length;
    hits += countPositionsCorrect(derivedOrder, actualOrder);
  }

  return { hits, attempted };
}
