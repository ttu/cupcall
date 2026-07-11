import { describe, expect, it } from 'vitest';
import {
  getRoundPlayedCount,
  isRoundInProgress,
  pickDefaultExpandedRound,
  getTiesCalledRatio,
} from './knockout-mobile-view';
import type { BracketRoundResultView, KnockoutMatchView } from './types';

function match(overrides: Partial<KnockoutMatchView> = {}): KnockoutMatchView {
  return {
    bracketMatchKey: 'r32-1',
    round: 'R32',
    homeTeamId: 'A1',
    homeTeamName: 'Team A1',
    awayTeamId: 'B2',
    awayTeamName: 'Team B2',
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
    pickedOpponentStatus: 'no-pick',
    predictedHome: null,
    predictedAway: null,
    hit: 'pending',
    projected: false,
    homeTeamConfirmed: true,
    awayTeamConfirmed: true,
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
    ...overrides,
  };
}

function decidedMatch(key: string, hit: KnockoutMatchView['hit']): KnockoutMatchView {
  return match({ bracketMatchKey: key, actualHome: 2, actualAway: 1, status: 'final', hit });
}

function round(label: string, matches: KnockoutMatchView[]): BracketRoundResultView {
  return { label, matches };
}

describe('getRoundPlayedCount', () => {
  it('counts decided matches out of all matches in the round', () => {
    const r = round('R32', [decidedMatch('m1', 'outcome'), match({ bracketMatchKey: 'm2' })]);
    expect(getRoundPlayedCount(r)).toEqual({ played: 1, total: 2 });
  });

  it('returns zero played for a round with nothing decided', () => {
    const r = round('R32', [match(), match({ bracketMatchKey: 'm2' })]);
    expect(getRoundPlayedCount(r)).toEqual({ played: 0, total: 2 });
  });
});

describe('isRoundInProgress', () => {
  it('is false when no matches are decided', () => {
    const r = round('R32', [match(), match({ bracketMatchKey: 'm2' })]);
    expect(isRoundInProgress(r)).toBe(false);
  });

  it('is true when some but not all matches are decided', () => {
    const r = round('R32', [decidedMatch('m1', 'outcome'), match({ bracketMatchKey: 'm2' })]);
    expect(isRoundInProgress(r)).toBe(true);
  });

  it('is false when all matches are decided', () => {
    const r = round('R32', [decidedMatch('m1', 'outcome'), decidedMatch('m2', 'missed')]);
    expect(isRoundInProgress(r)).toBe(false);
  });
});

describe('pickDefaultExpandedRound', () => {
  it('returns null for an empty bracket', () => {
    expect(pickDefaultExpandedRound([])).toBeNull();
  });

  it('returns the first round when nothing has been played yet', () => {
    const rounds = [round('R32', [match()]), round('R16', [match({ bracketMatchKey: 'm2' })])];
    expect(pickDefaultExpandedRound(rounds)).toBe('R32');
  });

  it('returns the in-progress round over a fully-completed earlier round', () => {
    const rounds = [
      round('R32', [decidedMatch('m1', 'outcome'), decidedMatch('m2', 'outcome')]),
      round('R16', [decidedMatch('m3', 'outcome'), match({ bracketMatchKey: 'm4' })]),
    ];
    expect(pickDefaultExpandedRound(rounds)).toBe('R16');
  });

  it('returns the most recently completed round when no round is in progress', () => {
    const rounds = [
      round('R32', [decidedMatch('m1', 'outcome')]),
      round('R16', [decidedMatch('m2', 'outcome')]),
      round('QF', [match({ bracketMatchKey: 'm3' })]),
    ];
    expect(pickDefaultExpandedRound(rounds)).toBe('R16');
  });
});

describe('getTiesCalledRatio', () => {
  it('counts correct picks out of decided matches, including the bronze match', () => {
    const rounds = [
      round('R32', [
        decidedMatch('m1', 'outcome'),
        decidedMatch('m2', 'missed'),
        match({ bracketMatchKey: 'm3' }),
      ]),
    ];
    const bronze = decidedMatch('bronze', 'exact');
    expect(getTiesCalledRatio(rounds, bronze)).toEqual({ correct: 2, decided: 3 });
  });

  it('handles a null bronze match', () => {
    const rounds = [round('R32', [decidedMatch('m1', 'outcome')])];
    expect(getTiesCalledRatio(rounds, null)).toEqual({ correct: 1, decided: 1 });
  });

  it('returns zero/zero when nothing is decided', () => {
    const rounds = [round('R32', [match()])];
    expect(getTiesCalledRatio(rounds, null)).toEqual({ correct: 0, decided: 0 });
  });
});
