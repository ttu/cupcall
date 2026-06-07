import { describe, it, expect } from 'vitest';
import { matchId } from '../brand.js';
import { miniScoring } from '../__fixtures__/mini-tournament.js';
import type { CardInputs, ActualResults } from '../types.js';
import { scoreGroupMatches } from './group-matches.js';

// From mini-tournament fixture:
// Group A matches: mA1=A1vA2, mA2=A1vA3, mA3=A1vA4, mA4=A2vA3, mA5=A2vA4, mA6=A3vA4

function makeInputs(groupScores: CardInputs['groupScores']): CardInputs {
  return {
    groupScores,
    knockoutPicks: [],
    finishScores: {},
    specials: {},
  };
}

function makeActual(matchResults: ActualResults['matchResults']): ActualResults {
  return {
    matchResults,
    groupOrder: {},
    answers: {},
  };
}

describe('scoreGroupMatches', () => {
  it('exact score → exactScore points (6)', () => {
    const inputs = makeInputs([{ matchId: matchId('mA1'), home: 2, away: 1 }]);
    const actual = makeActual([{ matchId: matchId('mA1'), home: 2, away: 1 }]);
    expect(scoreGroupMatches(inputs, actual, miniScoring)).toBe(6);
  });

  it('correct outcome only (home win) → correctOutcome points (3)', () => {
    const inputs = makeInputs([{ matchId: matchId('mA1'), home: 1, away: 0 }]);
    const actual = makeActual([{ matchId: matchId('mA1'), home: 3, away: 1 }]);
    expect(scoreGroupMatches(inputs, actual, miniScoring)).toBe(3);
  });

  it('correct outcome only (draw) → 3', () => {
    const inputs = makeInputs([{ matchId: matchId('mA1'), home: 1, away: 1 }]);
    const actual = makeActual([{ matchId: matchId('mA1'), home: 0, away: 0 }]);
    expect(scoreGroupMatches(inputs, actual, miniScoring)).toBe(3);
  });

  it('correct outcome only (away win) → 3', () => {
    const inputs = makeInputs([{ matchId: matchId('mA1'), home: 0, away: 2 }]);
    const actual = makeActual([{ matchId: matchId('mA1'), home: 1, away: 3 }]);
    expect(scoreGroupMatches(inputs, actual, miniScoring)).toBe(3);
  });

  it('wrong prediction → 0', () => {
    const inputs = makeInputs([{ matchId: matchId('mA1'), home: 2, away: 0 }]);
    const actual = makeActual([{ matchId: matchId('mA1'), home: 0, away: 1 }]);
    expect(scoreGroupMatches(inputs, actual, miniScoring)).toBe(0);
  });

  it('unpredicted match → 0', () => {
    const inputs = makeInputs([]); // no predictions
    const actual = makeActual([{ matchId: matchId('mA1'), home: 2, away: 1 }]);
    expect(scoreGroupMatches(inputs, actual, miniScoring)).toBe(0);
  });

  it('exact score does NOT stack with the outcome point', () => {
    // Inflate correctOutcome so stacking would be visible: a stacking bug would give
    // exactScore (6) + correctOutcome (99) = 105, or award 99 instead of 6.
    const inflated = {
      ...miniScoring,
      groupMatch: { ...miniScoring.groupMatch, correctOutcome: 99 },
    };
    const inputs = makeInputs([{ matchId: matchId('mA1'), home: 2, away: 1 }]);
    const actual = makeActual([{ matchId: matchId('mA1'), home: 2, away: 1 }]);
    expect(scoreGroupMatches(inputs, actual, inflated)).toBe(6);
  });

  it('multi-match sum: exact + correct + wrong + unpredicted', () => {
    // mA1 exact (6), mA2 correct outcome (3), mA3 wrong (0), mA4 not predicted (0)
    const inputs = makeInputs([
      { matchId: matchId('mA1'), home: 2, away: 0 }, // exact
      { matchId: matchId('mA2'), home: 1, away: 0 }, // outcome only (A1 wins, actual also A1 wins)
      { matchId: matchId('mA3'), home: 2, away: 0 }, // wrong (actual is draw)
      // mA4 not in inputs → unpredicted
    ]);
    const actual = makeActual([
      { matchId: matchId('mA1'), home: 2, away: 0 }, // exact
      { matchId: matchId('mA2'), home: 3, away: 1 }, // A1 wins → correct outcome
      { matchId: matchId('mA3'), home: 1, away: 1 }, // draw, player predicted home win → wrong
      { matchId: matchId('mA4'), home: 1, away: 0 }, // unpredicted
    ]);
    expect(scoreGroupMatches(inputs, actual, miniScoring)).toBe(9); // 6 + 3 + 0 + 0
  });
});
