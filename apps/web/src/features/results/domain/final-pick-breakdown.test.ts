import { describe, expect, it } from 'vitest';
import { computeFinalPickBreakdown } from './final-pick-breakdown';
import type { KnockoutMatchView } from './types';

type MatchFixture = Pick<
  KnockoutMatchView,
  'homeTeamId' | 'awayTeamId' | 'actualHome' | 'actualAway' | 'hit'
>;

function match(overrides: Partial<MatchFixture>): MatchFixture {
  return {
    homeTeamId: 'ESP',
    awayTeamId: 'ARG',
    actualHome: 1,
    actualAway: 0,
    hit: 'outcome',
    ...overrides,
  };
}

describe('computeFinalPickBreakdown', () => {
  it('is pending when the actual score is not in yet', () => {
    const result = computeFinalPickBreakdown(
      match({ actualHome: null, actualAway: null }),
      'ESP',
      'POR',
    );
    expect(result).toEqual({
      leftCorrect: false,
      rightCorrect: false,
      scoreExact: false,
      isPending: true,
      tier: 'pending',
    });
  });

  it('is full when both teams and the exact score are correct', () => {
    const result = computeFinalPickBreakdown(match({ hit: 'exact' }), 'ESP', 'ARG');
    expect(result).toEqual({
      leftCorrect: true,
      rightCorrect: true,
      scoreExact: true,
      isPending: false,
      tier: 'full',
    });
  });

  it('is partial when only the winner is correct (the reported bug case)', () => {
    // User picked ESP 2-1 POR; actual final was ESP 1-0 ARG.
    const result = computeFinalPickBreakdown(match({ hit: 'outcome' }), 'ESP', 'POR');
    expect(result).toEqual({
      leftCorrect: true,
      rightCorrect: false,
      scoreExact: false,
      isPending: false,
      tier: 'partial',
    });
  });

  it('is partial when only the correct runner-up was picked, winner wrong', () => {
    // User picked POR 2-1 ARG; actual final was ESP 1-0 ARG. ARG (runner-up) is correct,
    // the predicted winner POR is not — this used to render as a full miss.
    const result = computeFinalPickBreakdown(match({ hit: 'missed' }), 'POR', 'ARG');
    expect(result).toEqual({
      leftCorrect: false,
      rightCorrect: true,
      scoreExact: false,
      isPending: false,
      tier: 'partial',
    });
  });

  it('is partial when both teams are correct but the score is wrong', () => {
    const result = computeFinalPickBreakdown(match({ hit: 'outcome' }), 'ESP', 'ARG');
    expect(result).toEqual({
      leftCorrect: true,
      rightCorrect: true,
      scoreExact: false,
      isPending: false,
      tier: 'partial',
    });
  });

  it('is zero when neither team is correct', () => {
    const result = computeFinalPickBreakdown(match({ hit: 'missed' }), 'POR', 'BRA');
    expect(result).toEqual({
      leftCorrect: false,
      rightCorrect: false,
      scoreExact: false,
      isPending: false,
      tier: 'zero',
    });
  });

  it('treats a null pick side as not correct', () => {
    const result = computeFinalPickBreakdown(match({ hit: 'missed' }), null, 'ARG');
    expect(result.leftCorrect).toBe(false);
    expect(result.rightCorrect).toBe(true);
    expect(result.tier).toBe('partial');
  });
});
