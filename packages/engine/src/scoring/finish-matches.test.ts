import { describe, it, expect } from 'vitest';
import { teamId, type TeamId } from '../brand.js';
import { miniScoring } from '../__fixtures__/mini-tournament.js';
import type { CardInputs, DerivedCard, ActualResults } from '../types.js';
import { scoreBronze, scoreFinal } from './finish-matches.js';

// Team ids used in tests
const A1 = teamId('A1');
const A2 = teamId('A2');
const B1 = teamId('B1');
const B2 = teamId('B2');

function makeDerived(finalists: TeamId[], bronzePair: TeamId[]): DerivedCard {
  return {
    groupOrders: {},
    qualifiers: [],
    roundOf16: [],
    roundOf8: [],
    finalists,
    bronzePair,
    topFour: [],
  };
}

function makeInputs(
  finalScore?: { home: number; away: number },
  bronzeScore?: { home: number; away: number },
): CardInputs {
  return {
    groupScores: [],
    knockoutPicks: [],
    finishScores: {
      ...(finalScore !== undefined ? { final: finalScore } : {}),
      ...(bronzeScore !== undefined ? { bronze: bronzeScore } : {}),
    },
    specials: {},
  };
}

function makeActual(opts?: {
  finalMatch?: ActualResults['finalMatch'];
  bronzeMatch?: ActualResults['bronzeMatch'];
}): ActualResults {
  return {
    matchResults: [],
    groupOrder: {},
    answers: {},
    ...(opts?.finalMatch !== undefined ? { finalMatch: opts.finalMatch } : {}),
    ...(opts?.bronzeMatch !== undefined ? { bronzeMatch: opts.bronzeMatch } : {}),
  };
}

describe('scoreFinal', () => {
  it('both teams correct + exact score → 15 (10 teams + 5 exact)', () => {
    // Derived finalists: A1, A2. Actual final: A1 vs A2 3-2. Predicted 3-2.
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs({ home: 3, away: 2 });
    const actual = makeActual({
      finalMatch: { home: A1, away: A2, homeGoals: 3, awayGoals: 2 },
    });
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(15);
  });

  it('both teams correct, wrong score → 10', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs({ home: 1, away: 0 });
    const actual = makeActual({
      finalMatch: { home: A1, away: A2, homeGoals: 3, awayGoals: 2 },
    });
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(10);
  });

  it('one team correct + exact score → 5 + 5 = 10', () => {
    // A1 correct, A2 wrong (actual has B1). Exact score matches.
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs({ home: 3, away: 2 });
    const actual = makeActual({
      finalMatch: { home: A1, away: B1, homeGoals: 3, awayGoals: 2 },
    });
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(10);
  });

  it('predicted 3-2, actual 2-3 (sides swapped) → no exact points', () => {
    // Both teams correct (A1 and A2 in match, sides swapped), but score does not match exactly
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs({ home: 3, away: 2 }); // predicted 3-2
    const actual = makeActual({
      finalMatch: { home: A2, away: A1, homeGoals: 2, awayGoals: 3 }, // actual 2-3
    });
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(10); // 10 teams + 0 exact
  });

  it('predicted 2-3, actual 3-2 (sides swapped, teams wrong) → no exact points', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs({ home: 2, away: 3 }); // predicted 2-3
    const actual = makeActual({
      finalMatch: { home: B1, away: B2, homeGoals: 3, awayGoals: 2 }, // actual 3-2
    });
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(0); // 0 teams + 0 exact
  });

  it('zero teams correct + wrong score → 0', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs({ home: 1, away: 0 });
    const actual = makeActual({
      finalMatch: { home: B1, away: B2, homeGoals: 3, awayGoals: 2 },
    });
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(0);
  });

  it('actual finalMatch absent → 0', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs({ home: 3, away: 2 });
    const actual = makeActual({}); // no finalMatch
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(0);
  });

  it('finishScores.final absent → teams still scored, exact 0', () => {
    // Both teams correct, no predicted score → 10 teams + 0 exact
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs(undefined); // no final score
    const actual = makeActual({
      finalMatch: { home: A1, away: A2, homeGoals: 3, awayGoals: 2 },
    });
    expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(10);
  });
});

describe('scoreBronze', () => {
  it('both teams correct + exact score → 15', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs(undefined, { home: 1, away: 0 });
    const actual = makeActual({
      bronzeMatch: { home: B1, away: B2, homeGoals: 1, awayGoals: 0 },
    });
    expect(scoreBronze(inputs, derived, actual, miniScoring)).toBe(15);
  });

  it('actual bronzeMatch absent → 0', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs(undefined, { home: 1, away: 0 });
    const actual = makeActual({}); // no bronzeMatch
    expect(scoreBronze(inputs, derived, actual, miniScoring)).toBe(0);
  });

  it('bronze uses bronzePair, not finalists', () => {
    // bronzePair = [B1, B2], finalists = [A1, A2]
    // actual bronze: B1 vs B2 → both in bronzePair → 10 teams
    // actual final: A1 vs A2 → but we call scoreBronze, not scoreFinal
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs(undefined, { home: 2, away: 1 });
    const actual = makeActual({
      bronzeMatch: { home: B1, away: B2, homeGoals: 2, awayGoals: 1 },
    });
    expect(scoreBronze(inputs, derived, actual, miniScoring)).toBe(15);
  });

  it('predicted 3-0, actual 0-3 (sides swapped) → no exact points for bronze', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs(undefined, { home: 3, away: 0 }); // predicted 3-0
    const actual = makeActual({
      bronzeMatch: { home: B2, away: B1, homeGoals: 0, awayGoals: 3 }, // actual 0-3
    });
    // Both teams correct (B1 and B2 in bronzePair), but score doesn't match exactly
    expect(scoreBronze(inputs, derived, actual, miniScoring)).toBe(10);
  });
});
