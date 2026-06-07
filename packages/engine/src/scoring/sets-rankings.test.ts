import { describe, it, expect } from 'vitest';
import { teamId, type TeamId } from '../brand.js';
import { miniScoring } from '../__fixtures__/mini-tournament.js';
import type { DerivedCard, ActualResults } from '../types.js';
import { scoreRoundOf8, scoreTopFour } from './sets-rankings.js';

// Team ids used in tests
const A1 = teamId('A1');
const A2 = teamId('A2');
const A3 = teamId('A3');
const A4 = teamId('A4');
const B1 = teamId('B1');
const B2 = teamId('B2');
const B3 = teamId('B3');
const B4 = teamId('B4');

// §7.7 top-4 scenario teams
const ARG = teamId('ARG');
const FRA = teamId('FRA');
const NED = teamId('NED');
const POR = teamId('POR');
const BRA = teamId('BRA');

function makeDerived(roundOf8: TeamId[], topFour: TeamId[]): DerivedCard {
  return {
    groupOrders: {},
    qualifiers: [],
    roundOf8,
    finalists: [],
    bronzePair: [],
    topFour,
  };
}

function makeActual(opts: { roundOf8?: TeamId[]; topFourOrder?: TeamId[] }): ActualResults {
  return {
    matchResults: [],
    groupOrder: {},
    answers: {
      ...(opts.roundOf8 !== undefined ? { roundOf8: opts.roundOf8 } : {}),
      ...(opts.topFourOrder !== undefined ? { topFourOrder: opts.topFourOrder } : {}),
    },
  };
}

describe('scoreRoundOf8', () => {
  it('6 of 8 correct → 6 × 3 = 18', () => {
    const derived = makeDerived([A1, A2, A3, A4, B1, B2, B3, B4], []);
    // A1..A4 and B1..B2 are in actual set (6); B3 and B4 are not
    const actual = makeActual({ roundOf8: [A1, A2, A3, A4, B1, B2, teamId('C1'), teamId('C2')] });
    expect(scoreRoundOf8(derived, actual, miniScoring)).toBe(18);
  });

  it('all 8 correct → 8 × 3 = 24', () => {
    const derived = makeDerived([A1, A2, A3, A4, B1, B2, B3, B4], []);
    const actual = makeActual({ roundOf8: [A1, A2, A3, A4, B1, B2, B3, B4] });
    expect(scoreRoundOf8(derived, actual, miniScoring)).toBe(24);
  });

  it('absent actual roundOf8 → 0', () => {
    const derived = makeDerived([A1, A2, A3, A4, B1, B2, B3, B4], []);
    const actual = makeActual({});
    expect(scoreRoundOf8(derived, actual, miniScoring)).toBe(0);
  });

  it('0 correct → 0', () => {
    const derived = makeDerived([A1, A2, A3, A4, B1, B2, B3, B4], []);
    const actual = makeActual({
      roundOf8: [
        teamId('C1'),
        teamId('C2'),
        teamId('C3'),
        teamId('C4'),
        teamId('D1'),
        teamId('D2'),
        teamId('D3'),
        teamId('D4'),
      ],
    });
    expect(scoreRoundOf8(derived, actual, miniScoring)).toBe(0);
  });

  it('order is irrelevant — set membership only', () => {
    const derived = makeDerived([A1, A2, B1, B2, A3, A4, B3, B4], []);
    // Same teams as derived but in different order in actual
    const actual = makeActual({ roundOf8: [B4, B3, A4, A3, B2, B1, A2, A1] });
    expect(scoreRoundOf8(derived, actual, miniScoring)).toBe(24);
  });
});

describe('scoreTopFour', () => {
  it('all 4 correct positions → tier 20 (beats consolation 4×2=8)', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const actual = makeActual({ topFourOrder: [ARG, FRA, NED, POR] });
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(20);
  });

  it('§7.7 case: derived [ARG,FRA,NED,POR] vs actual [ARG,NED,FRA,BRA] → tier 1=5, consolation 3×2=6, max=6', () => {
    // ARG at index 0 matches → 1 position correct → tier = 5
    // ARG, FRA, NED are in actual set (BRA replaces POR) → 3 teams × 2 = 6
    // max(5, 6) = 6
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const actual = makeActual({ topFourOrder: [ARG, NED, FRA, BRA] });
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(6);
  });

  it('tier wins: 3 correct positions → tier 15 > consolation 3×2=6', () => {
    // ARG, FRA, NED correct at positions 0,1,2; POR vs BRA at position 3 → 3 correct
    // tier = 15; consolation: ARG,FRA,NED in actual set (3 teams) = 6
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const actual = makeActual({ topFourOrder: [ARG, FRA, NED, BRA] });
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(15);
  });

  it('consolation wins: 0 correct positions but 4 teams present → 0 vs 4×2=8', () => {
    // derived [ARG,FRA,NED,POR] vs actual [POR,NED,FRA,ARG] → 0 index-aligned
    // all 4 derived teams appear in actual → consolation = 8
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const actual = makeActual({ topFourOrder: [POR, NED, FRA, ARG] });
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(8);
  });

  it('absent actual topFourOrder → 0', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const actual = makeActual({});
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(0);
  });

  it('completely wrong prediction → 0', () => {
    const derived = makeDerived([], [A1, A2, A3, A4]);
    const actual = makeActual({ topFourOrder: [B1, B2, B3, B4] });
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(0);
  });

  it('two positions correct → tier 10, consolation 3×2=6, max=10', () => {
    // ARG correct at 0, FRA correct at 1, NED vs BRA at 2, POR vs NED at 3 → 2 correct
    // teams in actual: ARG, FRA (NED is at position 3 in actual, POR not in actual)
    // actual [ARG,FRA,BRA,NED]: ARG at 0, FRA at 1 = 2 correct; ARG,FRA,NED in actual set = 3 teams
    // consolation = 3×2=6, tier = 10, max = 10
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const actual = makeActual({ topFourOrder: [ARG, FRA, BRA, NED] });
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(10);
  });
});
