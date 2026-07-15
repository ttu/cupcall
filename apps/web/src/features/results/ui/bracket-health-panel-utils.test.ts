import { describe, it, expect } from 'vitest';
import { buildTopFour } from './bracket-health-panel-utils';
import type { KnockoutMatchView, PickStatus } from '../domain/types';

function mkMatch(partial: Partial<KnockoutMatchView> = {}): KnockoutMatchView {
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
    pickStatus: 'no-pick',
    pickedOpponentStatus: 'no-pick',
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
    poolPickHomePct: null,
    poolPickAwayPct: null,
    homeSlotFeederPickedId: null,
    awaySlotFeederPickedId: null,
    ...partial,
  };
}

describe('buildTopFour', () => {
  it('marks a genuinely eliminated team as busted with no wrong-match override', () => {
    const finalMatch = mkMatch({
      bracketMatchKey: 'final',
      homeTeamId: 'ESP',
      homeTeamName: 'Spain',
      awayTeamId: 'ARG',
      awayTeamName: 'Argentina',
      pickedWinnerId: 'ESP',
      pickedWinnerName: 'Spain',
      pickStatus: 'pending',
      pickedOpponentId: 'ENG',
      pickedOpponentName: 'England',
      pickedOpponentStatus: 'busted',
    });
    const bronzeMatch = mkMatch({
      bracketMatchKey: 'bronze',
      homeTeamId: 'FRA',
      homeTeamName: 'France',
      awayTeamId: 'ENG',
      awayTeamName: 'England',
      pickedWinnerId: 'GER',
      pickedWinnerName: 'Germany',
      pickStatus: 'busted',
      pickedOpponentId: 'ARG',
      pickedOpponentName: 'Argentina',
      pickedOpponentStatus: 'busted',
    });

    const rows = buildTopFour(finalMatch, bronzeMatch);

    const germany = rows.find((r) => r.position === '3rd');
    expect(germany?.status).toBe('busted');
    expect(germany?.wrongMatchLabel).toBeNull();
  });

  it('flags the predicted Final runner-up as wrong-match/Bronze when it is actually alive in Bronze', () => {
    const finalMatch = mkMatch({
      bracketMatchKey: 'final',
      homeTeamId: 'ESP',
      awayTeamId: 'ARG',
      pickedWinnerId: 'ESP',
      pickedWinnerName: 'Spain',
      pickStatus: 'pending',
      pickedOpponentId: 'ENG',
      pickedOpponentName: 'England',
      pickedOpponentStatus: 'busted',
    });
    const bronzeMatch = mkMatch({
      bracketMatchKey: 'bronze',
      homeTeamId: 'FRA',
      awayTeamId: 'ENG',
      actualWinnerId: null,
      pickedWinnerId: 'GER',
      pickedWinnerName: 'Germany',
      pickStatus: 'busted',
      pickedOpponentId: 'ARG',
      pickedOpponentName: 'Argentina',
      pickedOpponentStatus: 'busted',
    });

    const rows = buildTopFour(finalMatch, bronzeMatch);

    const england = rows.find((r) => r.position === '2nd');
    expect(england?.status).toBe('busted');
    expect(england?.wrongMatchLabel).toBe('Bronze');
  });

  it('flags the predicted Bronze loser as wrong-match/Final when it is actually alive in the Final', () => {
    const finalMatch = mkMatch({
      bracketMatchKey: 'final',
      homeTeamId: 'ESP',
      awayTeamId: 'ARG',
      actualWinnerId: null,
      pickedWinnerId: 'ESP',
      pickedWinnerName: 'Spain',
      pickStatus: 'pending',
      pickedOpponentId: 'ENG',
      pickedOpponentName: 'England',
      pickedOpponentStatus: 'busted',
    });
    const bronzeMatch = mkMatch({
      bracketMatchKey: 'bronze',
      homeTeamId: 'FRA',
      awayTeamId: 'ENG',
      pickedWinnerId: 'GER',
      pickedWinnerName: 'Germany',
      pickStatus: 'busted',
      pickedOpponentId: 'ARG',
      pickedOpponentName: 'Argentina',
      pickedOpponentStatus: 'busted',
    });

    const rows = buildTopFour(finalMatch, bronzeMatch);

    const argentina = rows.find((r) => r.position === '4th');
    expect(argentina?.status).toBe('busted');
    expect(argentina?.wrongMatchLabel).toBe('Final');
  });

  it('does not flag wrong-match once the sibling match is final and the team actually lost it', () => {
    const finalMatch = mkMatch({
      bracketMatchKey: 'final',
      homeTeamId: 'ESP',
      awayTeamId: 'ARG',
      pickedWinnerId: 'ESP',
      pickedWinnerName: 'Spain',
      pickStatus: 'pending',
      pickedOpponentId: 'ENG',
      pickedOpponentName: 'England',
      pickedOpponentStatus: 'busted',
    });
    const bronzeMatch = mkMatch({
      bracketMatchKey: 'bronze',
      homeTeamId: 'FRA',
      awayTeamId: 'ENG',
      status: 'final',
      actualWinnerId: 'FRA',
      pickedWinnerId: 'GER',
      pickedWinnerName: 'Germany',
      pickStatus: 'busted',
      pickedOpponentId: 'ARG',
      pickedOpponentName: 'Argentina',
      pickedOpponentStatus: 'busted',
    });

    const rows = buildTopFour(finalMatch, bronzeMatch);

    const england = rows.find((r) => r.position === '2nd');
    expect(england?.status).toBe('busted');
    expect(england?.wrongMatchLabel).toBeNull();
  });

  it('only overrides busted rows, leaving alive/pending/no-pick untouched', () => {
    const finalMatch = mkMatch({
      bracketMatchKey: 'final',
      homeTeamId: 'ESP',
      awayTeamId: 'ARG',
      status: 'final',
      actualWinnerId: 'ESP',
      pickedWinnerId: 'ESP',
      pickedWinnerName: 'Spain',
      pickStatus: 'alive' as PickStatus,
      pickedOpponentId: null,
      pickedOpponentStatus: 'no-pick',
    });

    const rows = buildTopFour(finalMatch, null);

    const spain = rows.find((r) => r.position === '1st');
    expect(spain?.status).toBe('alive');
    expect(spain?.wrongMatchLabel).toBeNull();
  });
});
