import { describe, it, expect } from 'vitest';
import { deriveOpponentStatus } from './top-four-picks';
import type { KnockoutMatchView } from './types';

function match(overrides: Partial<KnockoutMatchView>): KnockoutMatchView {
  return {
    bracketMatchKey: 'final',
    round: 'Final',
    homeTeamId: null,
    homeTeamName: null,
    awayTeamId: null,
    awayTeamName: null,
    actualHome: null,
    actualAway: null,
    actualWinnerId: null,
    actualWinnerName: null,
    kickoff: null,
    status: 'scheduled',
    pickedWinnerId: null,
    pickedWinnerName: null,
    pickedOpponentId: null,
    pickedOpponentName: null,
    pickStatus: 'pending',
    predictedHome: null,
    predictedAway: null,
    hit: 'pending',
    projected: false,
    homeTeamConfirmed: false,
    awayTeamConfirmed: false,
    predictedHomeTeamId: null,
    predictedHomeTeamName: null,
    predictedAwayTeamId: null,
    predictedAwayTeamName: null,
    isEntryRound: false,
    homeTeamPredictedPct: null,
    awayTeamPredictedPct: null,
    homeTeamUserPredictedParticipant: false,
    awayTeamUserPredictedParticipant: false,
    ...overrides,
  };
}

describe('deriveOpponentStatus', () => {
  it('returns no-pick when pickedOpponentId is null', () => {
    expect(deriveOpponentStatus(match({}), null)).toBe('no-pick');
  });

  it('returns pending when match teams are not yet confirmed', () => {
    expect(deriveOpponentStatus(match({}), 'FRA')).toBe('pending');
  });

  it('returns pending when only one team slot is confirmed', () => {
    expect(deriveOpponentStatus(match({ homeTeamId: 'ESP' }), 'FRA')).toBe('pending');
  });

  it('returns alive when picked opponent is the home team in the confirmed match', () => {
    expect(deriveOpponentStatus(match({ homeTeamId: 'FRA', awayTeamId: 'ESP' }), 'FRA')).toBe(
      'alive',
    );
  });

  it('returns alive when picked opponent is the away team in the confirmed match', () => {
    expect(deriveOpponentStatus(match({ homeTeamId: 'ESP', awayTeamId: 'FRA' }), 'FRA')).toBe(
      'alive',
    );
  });

  it('returns busted when both teams are confirmed and neither is the picked opponent', () => {
    expect(deriveOpponentStatus(match({ homeTeamId: 'ESP', awayTeamId: 'GER' }), 'FRA')).toBe(
      'busted',
    );
  });
});
