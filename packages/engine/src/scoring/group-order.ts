import type { DerivedCard, ActualResults, Scoring } from '../types.js';
import type { Points, GroupId } from '../brand.js';
import { points } from '../brand.js';

function groupOrderPoints(positionsCorrect: number, scoring: Scoring): number {
  switch (positionsCorrect) {
    case 4:
      return scoring.groupOrder.allCorrect;
    case 2:
      return scoring.groupOrder.twoCorrect;
    case 1:
      return scoring.groupOrder.oneCorrect;
    // Exactly 3 is impossible in a 4-permutation (if 3 are right, the 4th must be too),
    // so it — and 0 — fall through to no points.
    default:
      return 0;
  }
}

export function scoreGroupOrder(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  let total = 0;

  // Keys are GroupId by construction of DerivedCard.groupOrders (Record<GroupId, ...>).
  for (const groupIdKey of Object.keys(derived.groupOrders) as GroupId[]) {
    const actualOrder = actual.groupOrder[groupIdKey];
    const derivedOrder = derived.groupOrders[groupIdKey];
    // Skip groups not yet decided, or (structurally impossible) missing derived order.
    if (actualOrder === undefined || derivedOrder === undefined) continue;

    let positionsCorrect = 0;
    for (let i = 0; i < derivedOrder.length; i++) {
      if (derivedOrder[i] === actualOrder[i]) {
        positionsCorrect++;
      }
    }

    total += groupOrderPoints(positionsCorrect, scoring);
  }

  return points(total);
}
