import { describe, expect, it } from 'vitest';
import { buildKnockoutMatchDetail } from './knockout-match-detail';
import type { KnockoutMatchView, KnockoutMatrixEntry, KnockoutMatrixCell } from './types';

function match(overrides: Partial<KnockoutMatchView> = {}): KnockoutMatchView {
  return {
    bracketMatchKey: 'qf1',
    round: 'QF',
    homeTeamId: 'ARG',
    homeTeamName: 'Argentina',
    awayTeamId: 'SEN',
    awayTeamName: 'Senegal',
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
    pickedHomeTeamId: null,
    pickedHomeTeamName: null,
    pickedAwayTeamId: null,
    pickedAwayTeamName: null,
    isEntryRound: false,
    homeTeamPredictedPct: null,
    awayTeamPredictedPct: null,
    homeTeamUserPredictedParticipant: false,
    awayTeamUserPredictedParticipant: false,
    poolPickHomePct: null,
    poolPickAwayPct: null,
    homeSlotFeederPickedId: null,
    awaySlotFeederPickedId: null,
    decidedBy: null,
    ...overrides,
  };
}

function cell(overrides: Partial<KnockoutMatrixCell> = {}): KnockoutMatrixCell {
  return {
    bracketMatchKey: 'qf1',
    hit: 'no-pick',
    points: 0,
    pickedWinnerId: null,
    pickedOpponentId: null,
    predictedHome: null,
    predictedAway: null,
    isExactScore: false,
    ...overrides,
  };
}

function entry(overrides: Partial<KnockoutMatrixEntry> = {}): KnockoutMatrixEntry {
  return {
    userId: 'u1',
    displayName: 'Alice',
    isCurrentUser: false,
    cells: [cell()],
    totalPoints: 0,
    ...overrides,
  };
}

describe('buildKnockoutMatchDetail', () => {
  it('counts and rounds home/away picks', () => {
    const m = match();
    const entries = [
      entry({ userId: 'u1', cells: [cell({ pickedWinnerId: 'ARG', hit: 'pending' })] }),
      entry({ userId: 'u2', cells: [cell({ pickedWinnerId: 'ARG', hit: 'pending' })] }),
      entry({ userId: 'u3', cells: [cell({ pickedWinnerId: 'ARG', hit: 'pending' })] }),
      entry({ userId: 'u4', cells: [cell({ pickedWinnerId: 'SEN', hit: 'pending' })] }),
    ];

    const detail = buildKnockoutMatchDetail(m, entries);

    expect(detail.totalPredictions).toBe(4);
    expect(detail.homePickCount).toBe(3);
    expect(detail.awayPickCount).toBe(1);
    expect(detail.homePickPct).toBe(75);
    expect(detail.awayPickPct).toBe(25);
  });

  it('excludes no-pick rows from totalPredictions', () => {
    const m = match();
    const entries = [
      entry({ userId: 'u1', cells: [cell({ pickedWinnerId: 'ARG', hit: 'pending' })] }),
      entry({ userId: 'u2', cells: [cell({ pickedWinnerId: null, hit: 'no-pick' })] }),
    ];

    const detail = buildKnockoutMatchDetail(m, entries);

    expect(detail.totalPredictions).toBe(1);
    expect(detail.homePickCount).toBe(1);
    expect(detail.awayPickCount).toBe(0);
  });

  it('returns null percentages and insight when nobody has predicted yet', () => {
    const m = match();
    const entries = [
      entry({ userId: 'u1', cells: [cell({ pickedWinnerId: null, hit: 'no-pick' })] }),
    ];

    const detail = buildKnockoutMatchDetail(m, entries);

    expect(detail.homePickPct).toBeNull();
    expect(detail.awayPickPct).toBeNull();
    expect(detail.insight).toBeNull();
  });

  it('phrases the insight as unresolved when the match has not been played', () => {
    const m = match({ status: 'scheduled', actualWinnerId: null });
    const entries = [
      entry({ userId: 'u1', cells: [cell({ pickedWinnerId: 'ARG', hit: 'pending' })] }),
      entry({ userId: 'u2', cells: [cell({ pickedWinnerId: 'SEN', hit: 'pending' })] }),
      entry({ userId: 'u3', cells: [cell({ pickedWinnerId: 'ARG', hit: 'pending' })] }),
    ];

    const detail = buildKnockoutMatchDetail(m, entries);

    expect(detail.insight).toBe('2 of 3 have backed Argentina so far.');
  });

  it('phrases the insight as "got it right" when the majority pick matches the actual winner', () => {
    const m = match({ status: 'final', actualWinnerId: 'ARG', actualHome: 2, actualAway: 0 });
    const entries = [
      entry({ userId: 'u1', cells: [cell({ pickedWinnerId: 'ARG', hit: 'hit', points: 5 })] }),
      entry({ userId: 'u2', cells: [cell({ pickedWinnerId: 'SEN', hit: 'miss' })] }),
      entry({ userId: 'u3', cells: [cell({ pickedWinnerId: 'ARG', hit: 'hit', points: 5 })] }),
    ];

    const detail = buildKnockoutMatchDetail(m, entries);

    expect(detail.insight).toBe('2 of 3 backed Argentina — the pool got it right.');
  });

  it('phrases the insight as "got it wrong" when the majority pick lost', () => {
    const m = match({ status: 'final', actualWinnerId: 'SEN', actualHome: 0, actualAway: 1 });
    const entries = [
      entry({ userId: 'u1', cells: [cell({ pickedWinnerId: 'ARG', hit: 'miss' })] }),
      entry({ userId: 'u2', cells: [cell({ pickedWinnerId: 'ARG', hit: 'miss' })] }),
      entry({ userId: 'u3', cells: [cell({ pickedWinnerId: 'SEN', hit: 'hit', points: 5 })] }),
    ];

    const detail = buildKnockoutMatchDetail(m, entries);

    expect(detail.insight).toBe('2 of 3 backed Argentina — the pool got it wrong.');
  });

  it('appends the exact-score clause for Final/Bronze when someone nailed the score', () => {
    const m = match({
      bracketMatchKey: 'final',
      status: 'final',
      actualWinnerId: 'ARG',
      actualHome: 2,
      actualAway: 0,
    });
    const entries = [
      entry({
        userId: 'u1',
        cells: [
          cell({
            bracketMatchKey: 'final',
            pickedWinnerId: 'ARG',
            hit: 'hit',
            points: 5,
            predictedHome: 2,
            predictedAway: 0,
            isExactScore: true,
          }),
        ],
      }),
      entry({
        userId: 'u2',
        cells: [
          cell({
            bracketMatchKey: 'final',
            pickedWinnerId: 'ARG',
            hit: 'hit',
            points: 5,
            predictedHome: 1,
            predictedAway: 0,
            isExactScore: false,
          }),
        ],
      }),
    ];

    const detail = buildKnockoutMatchDetail(m, entries);

    expect(detail.insight).toBe(
      '2 of 2 backed Argentina — the pool got it right. 1 nailed the exact score.',
    );
  });

  it('omits the exact-score clause when nobody nailed it', () => {
    const m = match({
      bracketMatchKey: 'final',
      status: 'final',
      actualWinnerId: 'ARG',
      actualHome: 2,
      actualAway: 0,
    });
    const entries = [
      entry({
        userId: 'u1',
        cells: [
          cell({
            bracketMatchKey: 'final',
            pickedWinnerId: 'ARG',
            hit: 'hit',
            points: 5,
            predictedHome: 1,
            predictedAway: 0,
            isExactScore: false,
          }),
        ],
      }),
    ];

    const detail = buildKnockoutMatchDetail(m, entries);

    expect(detail.insight).toBe('1 of 1 backed Argentina — the pool got it right.');
  });

  it('maps each entry into a prediction row with resolved team name', () => {
    const m = match();
    const entries = [
      entry({
        userId: 'u1',
        displayName: 'Alice',
        cells: [cell({ pickedWinnerId: 'ARG', hit: 'pending' })],
      }),
    ];

    const detail = buildKnockoutMatchDetail(m, entries);

    expect(detail.predictions).toEqual([
      {
        userId: 'u1',
        displayName: 'Alice',
        isCurrentUser: false,
        pickedTeamId: 'ARG',
        pickedTeamName: 'Argentina',
        pickedOpponentId: null,
        pickedOpponentName: null,
        predictedHome: null,
        predictedAway: null,
        hit: 'pending',
        isExactScore: false,
        points: 0,
      },
    ]);
  });

  it('resolves pickedOpponentName from the match for Final/Bronze predictions', () => {
    const m = match({
      bracketMatchKey: 'final',
      homeTeamId: 'ARG',
      homeTeamName: 'Argentina',
      awayTeamId: 'SEN',
      awayTeamName: 'Senegal',
    });
    const entries = [
      entry({
        userId: 'u1',
        cells: [cell({ bracketMatchKey: 'final', pickedWinnerId: 'ARG', pickedOpponentId: 'SEN' })],
      }),
    ];

    const detail = buildKnockoutMatchDetail(m, entries);

    expect(detail.predictions[0]!.pickedOpponentId).toBe('SEN');
    expect(detail.predictions[0]!.pickedOpponentName).toBe('Senegal');
  });

  it('falls back to the raw team id when the name cannot be resolved from the match', () => {
    const m = match({ homeTeamId: 'ARG', homeTeamName: 'Argentina' });
    const entries = [
      entry({
        userId: 'u1',
        cells: [cell({ pickedWinnerId: 'UNKNOWN_TEAM', hit: 'pending' })],
      }),
    ];

    const detail = buildKnockoutMatchDetail(m, entries);

    expect(detail.predictions[0]!.pickedTeamName).toBeNull();
  });

  it('pins the current user first regardless of points', () => {
    const m = match();
    const entries = [
      entry({
        userId: 'u1',
        displayName: 'Bob',
        totalPoints: 0,
        isCurrentUser: false,
        cells: [cell({ points: 5, hit: 'hit', pickedWinnerId: 'ARG' })],
      }),
      entry({
        userId: 'u2',
        displayName: 'Carol',
        isCurrentUser: true,
        cells: [cell({ points: 0, hit: 'miss', pickedWinnerId: 'SEN' })],
      }),
    ];

    const detail = buildKnockoutMatchDetail(m, entries);

    expect(detail.predictions.map((p) => p.userId)).toEqual(['u2', 'u1']);
  });

  it('sorts the rest by points descending after the pinned current-user row', () => {
    const m = match();
    const entries = [
      entry({ userId: 'u1', displayName: 'Bob', cells: [cell({ points: 5, hit: 'hit' })] }),
      entry({ userId: 'u2', displayName: 'Carol', cells: [cell({ points: 10, hit: 'hit' })] }),
      entry({ userId: 'u3', displayName: 'Dave', cells: [cell({ points: 0, hit: 'miss' })] }),
    ];

    const detail = buildKnockoutMatchDetail(m, entries);

    expect(detail.predictions.map((p) => p.userId)).toEqual(['u2', 'u1', 'u3']);
  });

  it('tie-breaks equal points by displayName ascending', () => {
    const m = match();
    const entries = [
      entry({ userId: 'u1', displayName: 'Zoe', cells: [cell({ points: 5, hit: 'hit' })] }),
      entry({ userId: 'u2', displayName: 'Amy', cells: [cell({ points: 5, hit: 'hit' })] }),
    ];

    const detail = buildKnockoutMatchDetail(m, entries);

    expect(detail.predictions.map((p) => p.displayName)).toEqual(['Amy', 'Zoe']);
  });
});
