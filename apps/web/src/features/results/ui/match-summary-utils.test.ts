import { describe, it, expect } from 'vitest';
import { resolvePredictionHitDisplay, isPenaltyWinnerPick } from './match-summary-utils';
import type { KnockoutMatchDetailPrediction } from '../domain/types';

function prediction(
  overrides: Partial<KnockoutMatchDetailPrediction> = {},
): KnockoutMatchDetailPrediction {
  return {
    userId: 'u1',
    displayName: 'Alice',
    isCurrentUser: false,
    pickedTeamId: 'ARG',
    pickedTeamName: 'Argentina',
    pickedOpponentId: null,
    pickedOpponentName: null,
    predictedHome: null,
    predictedAway: null,
    hit: 'hit',
    isExactScore: false,
    points: 5,
    ...overrides,
  };
}

describe('resolvePredictionHitDisplay', () => {
  it('maps a winner-only hit to the outcome MatchHit chip', () => {
    const result = resolvePredictionHitDisplay(prediction({ hit: 'hit' }), false);
    expect(result).toEqual({ kind: 'matchHit', hit: 'outcome' });
  });

  it('maps a Final/Bronze exact-score hit to the exact MatchHit chip', () => {
    const result = resolvePredictionHitDisplay(
      prediction({ hit: 'hit', isExactScore: true }),
      true,
    );
    expect(result).toEqual({ kind: 'matchHit', hit: 'exact' });
  });

  it('maps a Final/Bronze non-exact hit to the outcome MatchHit chip', () => {
    const result = resolvePredictionHitDisplay(
      prediction({ hit: 'hit', isExactScore: false }),
      true,
    );
    expect(result).toEqual({ kind: 'matchHit', hit: 'outcome' });
  });

  it('never returns exact for a non-Final/Bronze tie even if isExactScore were true', () => {
    const result = resolvePredictionHitDisplay(
      prediction({ hit: 'hit', isExactScore: true }),
      false,
    );
    expect(result).toEqual({ kind: 'matchHit', hit: 'outcome' });
  });

  it('maps a miss to the missed MatchHit chip', () => {
    const result = resolvePredictionHitDisplay(prediction({ hit: 'miss' }), false);
    expect(result).toEqual({ kind: 'matchHit', hit: 'missed' });
  });

  it('maps pending to a muted custom chip', () => {
    const result = resolvePredictionHitDisplay(prediction({ hit: 'pending' }), false);
    expect(result).toEqual({ kind: 'custom', label: 'Pending', tone: 'muted' });
  });

  it('maps no-pick to a muted custom chip', () => {
    const result = resolvePredictionHitDisplay(
      prediction({ hit: 'no-pick', pickedTeamId: null }),
      false,
    );
    expect(result).toEqual({ kind: 'custom', label: 'No pick', tone: 'muted' });
  });

  it('maps impossible to a red custom chip', () => {
    const result = resolvePredictionHitDisplay(prediction({ hit: 'impossible' }), false);
    expect(result).toEqual({ kind: 'custom', label: 'Impossible', tone: 'red' });
  });
});

describe('isPenaltyWinnerPick', () => {
  it('is true when the predicted score is a tie', () => {
    const result = isPenaltyWinnerPick(prediction({ predictedHome: 2, predictedAway: 2 }));
    expect(result).toBe(true);
  });

  it('is false when the predicted score is not a tie', () => {
    const result = isPenaltyWinnerPick(prediction({ predictedHome: 2, predictedAway: 1 }));
    expect(result).toBe(false);
  });

  it('is false when no score was predicted (non-Final/Bronze rounds)', () => {
    const result = isPenaltyWinnerPick(prediction({ predictedHome: null, predictedAway: null }));
    expect(result).toBe(false);
  });
});
