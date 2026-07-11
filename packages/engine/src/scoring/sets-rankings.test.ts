import { describe, it, expect } from 'vitest';
import { teamId, type TeamId } from '../brand.js';
import { miniScoring } from '../__fixtures__/mini-tournament.js';
import type { DerivedCard, ActualResults } from '../types.js';
import { scoreRoundOf16, scoreRoundOf8, scoreTopFour } from './sets-rankings.js';

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

function makeDerived(
  roundOf8: TeamId[],
  roundOf4: TeamId[],
  roundOf16: TeamId[] = [],
): DerivedCard {
  return {
    groupOrders: {},
    qualifiers: [],
    roundOf16,
    roundOf8,
    finalists: [],
    bronzePair: [],
    topFour: [],
    roundOf4,
  };
}

function makeActual(opts: {
  roundOf16?: TeamId[];
  roundOf8?: TeamId[];
  roundOf4?: TeamId[];
}): ActualResults {
  return {
    matchResults: [],
    groupOrder: {},
    answers: {
      ...(opts.roundOf16 !== undefined ? { roundOf16: opts.roundOf16 } : {}),
      ...(opts.roundOf8 !== undefined ? { roundOf8: opts.roundOf8 } : {}),
      ...(opts.roundOf4 !== undefined ? { roundOf4: opts.roundOf4 } : {}),
    },
  };
}

describe('scoreRoundOf16', () => {
  it('12 of 16 correct → 12 × 2 = 24', () => {
    const r16 = [
      A1,
      A2,
      A3,
      A4,
      B1,
      B2,
      B3,
      B4,
      teamId('C1'),
      teamId('C2'),
      teamId('C3'),
      teamId('C4'),
      teamId('D1'),
      teamId('D2'),
      teamId('D3'),
      teamId('D4'),
    ];
    const actual16 = [
      A1,
      A2,
      A3,
      A4,
      B1,
      B2,
      B3,
      B4,
      teamId('C1'),
      teamId('C2'),
      teamId('C3'),
      teamId('C4'),
      teamId('E1'),
      teamId('E2'),
      teamId('E3'),
      teamId('E4'),
    ];
    const derived = makeDerived([], [], r16);
    const actual = makeActual({ roundOf16: actual16 });
    expect(scoreRoundOf16(derived, actual, miniScoring)).toBe(24);
  });

  it('all 16 correct → 16 × 2 = 32', () => {
    const r16 = [
      A1,
      A2,
      A3,
      A4,
      B1,
      B2,
      B3,
      B4,
      teamId('C1'),
      teamId('C2'),
      teamId('C3'),
      teamId('C4'),
      teamId('D1'),
      teamId('D2'),
      teamId('D3'),
      teamId('D4'),
    ];
    const derived = makeDerived([], [], r16);
    const actual = makeActual({ roundOf16: r16 });
    expect(scoreRoundOf16(derived, actual, miniScoring)).toBe(32);
  });

  it('absent actual roundOf16 → 0', () => {
    const r16 = [
      A1,
      A2,
      A3,
      A4,
      B1,
      B2,
      B3,
      B4,
      teamId('C1'),
      teamId('C2'),
      teamId('C3'),
      teamId('C4'),
      teamId('D1'),
      teamId('D2'),
      teamId('D3'),
      teamId('D4'),
    ];
    const derived = makeDerived([], [], r16);
    const actual = makeActual({});
    expect(scoreRoundOf16(derived, actual, miniScoring)).toBe(0);
  });

  it('order is irrelevant — set membership only', () => {
    const r16 = [A1, A2, B1, B2];
    const derived = makeDerived([], [], r16);
    const actual = makeActual({ roundOf16: [B2, B1, A2, A1] });
    expect(scoreRoundOf16(derived, actual, miniScoring)).toBe(8);
  });
});

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
  it('absent actual roundOf4 → 0', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const actual = makeActual({});
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(0);
  });

  it('1 of 4 predicted teams confirmed in roundOf4 → 1 × roundOf4PerTeam = 5', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const actual = makeActual({ roundOf4: [ARG, BRA, teamId('X1'), teamId('X2')] });
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(5);
  });

  it('2 of 4 predicted teams confirmed → 2 × roundOf4PerTeam = 10', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const actual = makeActual({ roundOf4: [ARG, FRA, teamId('X1'), teamId('X2')] });
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(10);
  });

  it('3 of 4 predicted teams confirmed → 3 × roundOf4PerTeam = 15', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const actual = makeActual({ roundOf4: [ARG, FRA, NED, teamId('X1')] });
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(15);
  });

  it('all 4 predicted teams confirmed → 4 × roundOf4PerTeam = 20', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const actual = makeActual({ roundOf4: [ARG, FRA, NED, POR] });
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(20);
  });

  it('order is irrelevant — set membership only', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const actual = makeActual({ roundOf4: [POR, NED, FRA, ARG] });
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(20);
  });

  it('completely wrong prediction → 0', () => {
    const derived = makeDerived([], [A1, A2, A3, A4]);
    const actual = makeActual({ roundOf4: [B1, B2, B3, B4] });
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(0);
  });

  it('score never decreases as roundOf4 grows incrementally', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const afterOneQf = scoreTopFour(derived, makeActual({ roundOf4: [ARG] }), miniScoring);
    const afterTwoQf = scoreTopFour(derived, makeActual({ roundOf4: [ARG, FRA] }), miniScoring);
    expect(afterTwoQf).toBeGreaterThanOrEqual(afterOneQf);
  });
});
