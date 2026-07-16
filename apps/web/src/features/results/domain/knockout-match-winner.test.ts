import { describe, expect, it } from 'vitest';
import type { MatchRow } from '@cup/db';
import {
  resolveActualWinner,
  computeKnockoutEliminatedTeams,
  computeSemiFinalLoserTeams,
} from './knockout-match-winner';

function makeMatch(overrides: Partial<MatchRow> = {}): MatchRow {
  return {
    id: 'm1',
    tournamentId: 'wc-2026' as MatchRow['tournamentId'],
    stage: 'QF',
    groupId: null,
    homeTeamId: 'A1',
    awayTeamId: 'B1',
    kickoff: null,
    homeGoals: null,
    awayGoals: null,
    homeConduct: null,
    awayConduct: null,
    winnerTeamId: null,
    decidedBy: null,
    status: 'scheduled',
    ...overrides,
  };
}

describe('resolveActualWinner', () => {
  it('returns null for a null match', () => {
    expect(resolveActualWinner(null)).toBeNull();
  });

  it('prefers the stored winnerTeamId (penalties) over the score', () => {
    const m = makeMatch({
      status: 'final',
      homeGoals: 1,
      awayGoals: 1,
      winnerTeamId: 'B1',
    });
    expect(resolveActualWinner(m)).toBe('B1');
  });

  it('derives the winner from the score when winnerTeamId is null (regulation/extra-time)', () => {
    const m = makeMatch({ status: 'final', homeGoals: 2, awayGoals: 0 });
    expect(resolveActualWinner(m)).toBe('A1');
  });

  it('returns null for an unplayed match', () => {
    expect(resolveActualWinner(makeMatch({ status: 'scheduled' }))).toBeNull();
  });

  it('returns null for a final match with an unresolved tie (should not happen, but no winner to derive)', () => {
    const m = makeMatch({ status: 'final', homeGoals: 1, awayGoals: 1, winnerTeamId: null });
    expect(resolveActualWinner(m)).toBeNull();
  });
});

describe('computeKnockoutEliminatedTeams', () => {
  it('adds the loser of every final knockout match', () => {
    const matches = [
      makeMatch({
        id: 'qf1',
        homeTeamId: 'A1',
        awayTeamId: 'B1',
        status: 'final',
        winnerTeamId: 'A1',
      }),
      makeMatch({
        id: 'qf2',
        homeTeamId: 'C1',
        awayTeamId: 'D1',
        status: 'final',
        winnerTeamId: 'D1',
      }),
    ];
    const eliminated = computeKnockoutEliminatedTeams(matches);
    expect(eliminated).toEqual(new Set(['B1', 'C1']));
  });

  it('ignores group-stage matches', () => {
    const matches = [
      makeMatch({
        id: 'g1',
        stage: 'group',
        homeTeamId: 'A1',
        awayTeamId: 'B1',
        status: 'final',
        homeGoals: 3,
        awayGoals: 0,
      }),
    ];
    expect(computeKnockoutEliminatedTeams(matches).size).toBe(0);
  });

  it('ignores unplayed knockout matches', () => {
    const matches = [makeMatch({ status: 'scheduled' })];
    expect(computeKnockoutEliminatedTeams(matches).size).toBe(0);
  });
});

describe('computeSemiFinalLoserTeams', () => {
  it('returns the loser of a final semifinal match', () => {
    const matches = [
      makeMatch({
        id: 'sf1',
        homeTeamId: 'A1',
        awayTeamId: 'C1',
        status: 'final',
        winnerTeamId: 'A1',
      }),
    ];
    expect(computeSemiFinalLoserTeams(matches, ['sf1', 'sf2'])).toEqual(new Set(['C1']));
  });

  it('ignores non-semifinal matches even if they are final', () => {
    const matches = [
      makeMatch({
        id: 'qf1',
        homeTeamId: 'A1',
        awayTeamId: 'B1',
        status: 'final',
        winnerTeamId: 'A1',
      }),
    ];
    expect(computeSemiFinalLoserTeams(matches, ['sf1', 'sf2']).size).toBe(0);
  });

  it('ignores an unplayed semifinal', () => {
    const matches = [makeMatch({ id: 'sf1', status: 'scheduled' })];
    expect(computeSemiFinalLoserTeams(matches, ['sf1', 'sf2']).size).toBe(0);
  });
});
