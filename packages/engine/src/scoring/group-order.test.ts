import { describe, it, expect } from 'vitest';
import { groupId, teamId } from '../brand.js';
import { miniScoring } from '../__fixtures__/mini-tournament.js';
import type { DerivedCard, ActualResults } from '../types.js';
import { scoreGroupOrder } from './group-order.js';

// Helper to build minimal DerivedCard with only groupOrders populated
function makeDerived(groupOrders: DerivedCard['groupOrders']): DerivedCard {
  return {
    groupOrders,
    qualifiers: [],
    roundOf16: [],
    roundOf8: [],
    finalists: [],
    bronzePair: [],
    topFour: [],
    roundOf4: [],
  };
}

// Helper to build minimal ActualResults with only groupOrder populated
function makeActual(groupOrder: ActualResults['groupOrder']): ActualResults {
  return {
    matchResults: [],
    groupOrder,
    answers: {},
  };
}

// Team ids for Group A from mini-tournament: A1, A2, A3, A4
const [A1, A2, A3, A4] = [teamId('A1'), teamId('A2'), teamId('A3'), teamId('A4')];
// Team ids for Group B: B1, B2, B3, B4
const [B1, B2, B3, B4] = [teamId('B1'), teamId('B2'), teamId('B3'), teamId('B4')];
const gA = groupId('A');
const gB = groupId('B');

describe('scoreGroupOrder', () => {
  it('all 4 positions correct → allCorrect points (6)', () => {
    const derived = makeDerived({ [gA]: [A1, A2, A3, A4] });
    const actual = makeActual({ [gA]: [A1, A2, A3, A4] });
    expect(scoreGroupOrder(derived, actual, miniScoring)).toBe(6);
  });

  it('exactly 2 positions correct → twoCorrect points (3)', () => {
    // A1 correct at 0, A4 correct at 3; A2 and A3 swapped
    const derived = makeDerived({ [gA]: [A1, A2, A3, A4] });
    const actual = makeActual({ [gA]: [A1, A3, A2, A4] });
    expect(scoreGroupOrder(derived, actual, miniScoring)).toBe(3);
  });

  it('exactly 1 position correct → oneCorrect points (1)', () => {
    // Only A1 correct at position 0; rest fully scrambled
    const derived = makeDerived({ [gA]: [A1, A2, A3, A4] });
    const actual = makeActual({ [gA]: [A1, A4, A2, A3] });
    expect(scoreGroupOrder(derived, actual, miniScoring)).toBe(1);
  });

  it('0 positions correct → 0', () => {
    // Completely reversed order
    const derived = makeDerived({ [gA]: [A1, A2, A3, A4] });
    const actual = makeActual({ [gA]: [A4, A3, A2, A1] });
    expect(scoreGroupOrder(derived, actual, miniScoring)).toBe(0);
  });

  it('group absent from actual → contributes 0', () => {
    const derived = makeDerived({ [gA]: [A1, A2, A3, A4] });
    const actual = makeActual({}); // groupOrder empty → group A absent
    expect(scoreGroupOrder(derived, actual, miniScoring)).toBe(0);
  });

  it('multi-group sum: allCorrect + twoCorrect = 6 + 3 = 9', () => {
    const derived = makeDerived({
      [gA]: [A1, A2, A3, A4], // all 4 correct
      [gB]: [B1, B2, B3, B4], // 2 correct (B1 and B4)
    });
    const actual = makeActual({
      [gA]: [A1, A2, A3, A4],
      [gB]: [B1, B3, B2, B4], // B1 and B4 correct, B2 and B3 swapped
    });
    expect(scoreGroupOrder(derived, actual, miniScoring)).toBe(9);
  });

  it('multi-group: one group absent from actual → only present group scored', () => {
    const derived = makeDerived({
      [gA]: [A1, A2, A3, A4], // all 4 correct
      [gB]: [B1, B2, B3, B4], // absent from actual
    });
    const actual = makeActual({
      [gA]: [A1, A2, A3, A4], // all correct
      // gB absent
    });
    expect(scoreGroupOrder(derived, actual, miniScoring)).toBe(6);
  });
});
