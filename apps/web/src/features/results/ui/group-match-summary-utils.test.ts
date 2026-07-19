import { describe, it, expect } from 'vitest';
import { resolveGroupPredictionHitDisplay } from './group-match-summary-utils';
import type { GroupMatchDetailPrediction } from '../domain/types';

function prediction(
  overrides: Partial<GroupMatchDetailPrediction> = {},
): GroupMatchDetailPrediction {
  return {
    userId: 'u1',
    displayName: 'Alice',
    isCurrentUser: false,
    predictedHome: 2,
    predictedAway: 0,
    hit: 'exact',
    points: 6,
    ...overrides,
  };
}

describe('resolveGroupPredictionHitDisplay', () => {
  it('maps an exact hit to the exact MatchHit chip', () => {
    expect(resolveGroupPredictionHitDisplay(prediction({ hit: 'exact' }))).toEqual({
      kind: 'matchHit',
      hit: 'exact',
    });
  });

  it('maps an outcome hit to the outcome MatchHit chip', () => {
    expect(resolveGroupPredictionHitDisplay(prediction({ hit: 'outcome' }))).toEqual({
      kind: 'matchHit',
      hit: 'outcome',
    });
  });

  it('maps a missed hit to the missed MatchHit chip', () => {
    expect(resolveGroupPredictionHitDisplay(prediction({ hit: 'missed' }))).toEqual({
      kind: 'matchHit',
      hit: 'missed',
    });
  });

  it('maps no prediction to a muted "No pick" chip, even if hit happens to be pending', () => {
    expect(
      resolveGroupPredictionHitDisplay(
        prediction({ predictedHome: null, predictedAway: null, hit: 'pending' }),
      ),
    ).toEqual({ kind: 'custom', label: 'No pick', tone: 'muted' });
  });

  it('maps a pending hit with a prediction to a muted "Pending" chip', () => {
    expect(
      resolveGroupPredictionHitDisplay(
        prediction({ predictedHome: 1, predictedAway: 1, hit: 'pending' }),
      ),
    ).toEqual({ kind: 'custom', label: 'Pending', tone: 'muted' });
  });
});
