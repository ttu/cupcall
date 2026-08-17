import { describe, it, expect } from 'vitest';
import {
  renameTournamentId,
  renameResultsTournamentId,
  truncateResults,
  type RawTournament,
  type RawResults,
} from './generate-demo-fixtures';

const tournament: RawTournament = {
  id: 'src-2026',
  name: 'Source Tournament',
  firstKickoff: '2026-06-01T00:00:00Z',
  knockoutRounds: [],
  scoring: {},
  teams: [],
  players: [],
  groups: [],
  groupMatches: [
    { id: 'mA1', group: 'A', home: 'AAA', away: 'BBB', kickoff: '2026-06-01T00:00:00Z' },
    { id: 'mA2', group: 'A', home: 'CCC', away: 'DDD', kickoff: '2026-06-03T00:00:00Z' },
    { id: 'mB1', group: 'B', home: 'EEE', away: 'FFF', kickoff: '2026-06-05T00:00:00Z' },
  ],
  qualification: {},
  standingsTiebreak: [],
  bracket: {},
};

const results: RawResults = {
  tournamentId: 'src-2026',
  matchResults: [
    { matchId: 'mA1', home: 2, away: 0 },
    { matchId: 'mA2', home: 1, away: 1 },
    { matchId: 'mB1', home: 3, away: 3 },
  ],
  groupOrder: { A: ['AAA', 'CCC', 'BBB', 'DDD'], B: ['EEE', 'FFF'] },
  knockout: [
    {
      round: 'Final',
      matchId: 'final',
      home: 'AAA',
      away: 'EEE',
      homeGoals: 1,
      awayGoals: 0,
      winner: 'AAA',
      kickoff: '2026-06-10T00:00:00Z',
    },
  ],
  finalMatch: { home: 'AAA', away: 'EEE', homeGoals: 1, awayGoals: 0, winner: 'AAA' },
  answers: {
    highestMatchGoals: 6,
    groupTopScoringTeam: ['AAA'],
    groupTopConcedingTeam: ['FFF'],
    firstRedCardPlayer: 'p-1',
    topScorerPlayer: ['p-2'],
  },
};

describe('renameTournamentId', () => {
  it('replaces only the id field', () => {
    const renamed = renameTournamentId(tournament, 'demo-x');
    expect(renamed.id).toBe('demo-x');
    expect(renamed.groupMatches).toEqual(tournament.groupMatches);
  });
});

describe('renameResultsTournamentId', () => {
  it('replaces only tournamentId, leaving everything else untouched', () => {
    const renamed = renameResultsTournamentId(results, 'demo-x');
    expect(renamed.tournamentId).toBe('demo-x');
    expect(renamed.answers).toEqual(results.answers);
    expect(renamed.knockout).toEqual(results.knockout);
  });
});

describe('truncateResults', () => {
  it('drops match results with kickoff after the cutoff', () => {
    const out = truncateResults(tournament, results, 'demo-x', new Date('2026-06-02T00:00:00Z'));
    expect(out.matchResults).toEqual([{ matchId: 'mA1', home: 2, away: 0 }]);
  });

  it('only keeps groupOrder for groups whose every match is at or before the cutoff', () => {
    // Group A's mA2 is after the cutoff, so group A is incomplete; group B's only
    // match (mB1) is after the cutoff too.
    const out = truncateResults(tournament, results, 'demo-x', new Date('2026-06-02T00:00:00Z'));
    expect(out.groupOrder).toEqual({});
  });

  it('keeps groupOrder for a group once every one of its matches is at or before the cutoff', () => {
    const out = truncateResults(tournament, results, 'demo-x', new Date('2026-06-03T00:00:00Z'));
    expect(out.groupOrder).toEqual({ A: ['AAA', 'CCC', 'BBB', 'DDD'] });
  });

  it('drops knockout entries with kickoff after the cutoff', () => {
    const out = truncateResults(tournament, results, 'demo-x', new Date('2026-06-05T00:00:00Z'));
    expect(out.knockout).toBeUndefined();
  });

  it('keeps knockout entries at or before the cutoff, and the matching top-level finalMatch', () => {
    const out = truncateResults(tournament, results, 'demo-x', new Date('2026-06-10T00:00:00Z'));
    expect(out.knockout).toEqual(results.knockout);
    expect(out.finalMatch).toEqual(results.finalMatch);
  });

  it('drops finalMatch when the Final has not happened by the cutoff', () => {
    const out = truncateResults(tournament, results, 'demo-x', new Date('2026-06-09T00:00:00Z'));
    expect(out.finalMatch).toBeUndefined();
  });

  it('computes highestMatchGoals from kept results only, not the original answer', () => {
    // Only mA1 (2-0, 2 goals) is kept at this cutoff — not the original answer of 6.
    const out = truncateResults(tournament, results, 'demo-x', new Date('2026-06-02T00:00:00Z'));
    expect(out.answers['highestMatchGoals']).toBe(2);
  });

  it('omits groupTopScoringTeam/groupTopConcedingTeam until every group is complete', () => {
    const out = truncateResults(tournament, results, 'demo-x', new Date('2026-06-03T00:00:00Z'));
    expect(out.answers['groupTopScoringTeam']).toBeUndefined();
    expect(out.answers['groupTopConcedingTeam']).toBeUndefined();
  });

  it('includes groupTopScoringTeam/groupTopConcedingTeam once every group is complete', () => {
    const out = truncateResults(tournament, results, 'demo-x', new Date('2026-06-05T00:00:00Z'));
    expect(out.answers['groupTopScoringTeam']).toEqual(['AAA']);
    expect(out.answers['groupTopConcedingTeam']).toEqual(['FFF']);
  });

  it('drops every other answers field (firstRedCardPlayer, topScorerPlayer, ...) regardless of cutoff', () => {
    const out = truncateResults(tournament, results, 'demo-x', new Date('2026-06-10T00:00:00Z'));
    expect(out.answers['firstRedCardPlayer']).toBeUndefined();
    expect(out.answers['topScorerPlayer']).toBeUndefined();
  });

  it('sets the new tournamentId on the output', () => {
    const out = truncateResults(tournament, results, 'demo-x', new Date('2026-06-10T00:00:00Z'));
    expect(out.tournamentId).toBe('demo-x');
  });

  it('throws when a match result references a match with no kickoff data', () => {
    const badResults: RawResults = {
      ...results,
      matchResults: [...results.matchResults, { matchId: 'unknown-match', home: 0, away: 0 }],
    };
    expect(() =>
      truncateResults(tournament, badResults, 'demo-x', new Date('2026-06-10T00:00:00Z')),
    ).toThrow(/unknown-match/);
  });
});
