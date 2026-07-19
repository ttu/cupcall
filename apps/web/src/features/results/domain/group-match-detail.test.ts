import { describe, expect, it } from 'vitest';
import { buildGroupMatchDetail } from './group-match-detail';
import type { MatrixMatch, MatchMatrixEntry, MatchMatrixCell } from './types';

function match(overrides: Partial<MatrixMatch> = {}): MatrixMatch {
  return {
    matchId: 'g-a1',
    groupId: 'A',
    homeTeamId: 'ARG',
    homeTeamName: 'Argentina',
    awayTeamId: 'SEN',
    awayTeamName: 'Senegal',
    status: 'scheduled',
    kickoff: null,
    actualHome: null,
    actualAway: null,
    ...overrides,
  };
}

function cell(overrides: Partial<MatchMatrixCell> = {}): MatchMatrixCell {
  return {
    matchId: 'g-a1',
    hit: 'pending',
    points: 0,
    predictedOutcome: null,
    predictedHome: null,
    predictedAway: null,
    ...overrides,
  };
}

function entry(overrides: Partial<MatchMatrixEntry> = {}): MatchMatrixEntry {
  return {
    userId: 'u1',
    displayName: 'Alice',
    isCurrentUser: false,
    cells: [cell()],
    groupOrderPoints: 0,
    totalPoints: 0,
    ...overrides,
  };
}

describe('buildGroupMatchDetail', () => {
  it('computes pool stats from predicted scores', () => {
    const m = match();
    const entries = [
      entry({ userId: 'u1', cells: [cell({ predictedHome: 2, predictedAway: 0 })] }),
      entry({ userId: 'u2', cells: [cell({ predictedHome: 1, predictedAway: 0 })] }),
      entry({ userId: 'u3', cells: [cell({ predictedHome: 1, predictedAway: 1 })] }),
      entry({ userId: 'u4', cells: [cell({ predictedHome: 0, predictedAway: 2 })] }),
    ];

    const detail = buildGroupMatchDetail(m, entries);

    expect(detail.totalPredictions).toBe(4);
    expect(detail.poolStats).toEqual({
      homeWinPct: 50,
      drawPct: 25,
      awayWinPct: 25,
      avgHomeGoals: 1,
      avgAwayGoals: 0.8,
      totalPredictions: 4,
    });
  });

  it('returns null poolStats and insight when nobody has predicted yet', () => {
    const m = match();
    const entries = [
      entry({ userId: 'u1', cells: [cell({ predictedHome: null, predictedAway: null })] }),
    ];

    const detail = buildGroupMatchDetail(m, entries);

    expect(detail.totalPredictions).toBe(0);
    expect(detail.poolStats).toBeNull();
    expect(detail.insight).toBeNull();
  });

  it('builds a "so far" insight for an unplayed match', () => {
    const m = match({ status: 'scheduled' });
    const entries = [
      entry({ userId: 'u1', cells: [cell({ predictedHome: 2, predictedAway: 0 })] }),
      entry({ userId: 'u2', cells: [cell({ predictedHome: 1, predictedAway: 0 })] }),
      entry({ userId: 'u3', cells: [cell({ predictedHome: 0, predictedAway: 1 })] }),
    ];

    const detail = buildGroupMatchDetail(m, entries);

    expect(detail.insight).toBe('2 of 3 predicted a home win for Argentina so far.');
  });

  it('builds a "right" verdict insight when the pool majority matches the actual result', () => {
    const m = match({ status: 'final', actualHome: 2, actualAway: 0 });
    const entries = [
      entry({
        userId: 'u1',
        cells: [cell({ predictedHome: 2, predictedAway: 0, hit: 'exact', points: 6 })],
      }),
      entry({
        userId: 'u2',
        cells: [cell({ predictedHome: 1, predictedAway: 0, hit: 'outcome', points: 3 })],
      }),
      entry({
        userId: 'u3',
        cells: [cell({ predictedHome: 0, predictedAway: 1, hit: 'missed', points: 0 })],
      }),
    ];

    const detail = buildGroupMatchDetail(m, entries);

    expect(detail.insight).toBe(
      '2 of 3 predicted a home win for Argentina — the pool got it right. 1 nailed the exact score.',
    );
  });

  it('builds a "wrong" verdict insight when the pool majority differs from the actual result', () => {
    const m = match({ status: 'final', actualHome: 0, actualAway: 1 });
    const entries = [
      entry({
        userId: 'u1',
        cells: [cell({ predictedHome: 2, predictedAway: 0, hit: 'missed', points: 0 })],
      }),
      entry({
        userId: 'u2',
        cells: [cell({ predictedHome: 1, predictedAway: 0, hit: 'missed', points: 0 })],
      }),
      entry({
        userId: 'u3',
        cells: [cell({ predictedHome: 0, predictedAway: 1, hit: 'exact', points: 6 })],
      }),
    ];

    const detail = buildGroupMatchDetail(m, entries);

    expect(detail.insight).toBe(
      '2 of 3 predicted a home win for Argentina — the pool got it wrong. 1 nailed the exact score.',
    );
  });

  it('falls back to pending/no points when a row has no cell for this match', () => {
    const m = match({ matchId: 'g-a1' });
    const entries = [entry({ userId: 'u1', cells: [cell({ matchId: 'g-a2' })] })];

    const detail = buildGroupMatchDetail(m, entries);

    expect(detail.predictions[0]).toMatchObject({
      predictedHome: null,
      predictedAway: null,
      hit: 'pending',
      points: 0,
    });
  });

  it('sorts current user first, then by points desc, then displayName asc', () => {
    const m = match({ status: 'final', actualHome: 1, actualAway: 0 });
    const entries = [
      entry({
        userId: 'u1',
        displayName: 'Bob',
        isCurrentUser: false,
        cells: [cell({ predictedHome: 1, predictedAway: 0, hit: 'outcome', points: 3 })],
      }),
      entry({
        userId: 'u2',
        displayName: 'Zed',
        isCurrentUser: true,
        cells: [cell({ predictedHome: 1, predictedAway: 0, hit: 'exact', points: 6 })],
      }),
      entry({
        userId: 'u3',
        displayName: 'Amy',
        isCurrentUser: false,
        cells: [cell({ predictedHome: 1, predictedAway: 0, hit: 'outcome', points: 3 })],
      }),
    ];

    const detail = buildGroupMatchDetail(m, entries);

    expect(detail.predictions.map((p) => p.userId)).toEqual(['u2', 'u3', 'u1']);
  });
});
