import { describe, it, expect } from 'vitest';
import { tournamentSchema } from './tournament.js';

const validTournamentJson = {
  id: 'wc-2026',
  name: 'FIFA World Cup 2026',
  knockoutRounds: ['R32', 'R16', 'QF', 'SF', 'Final'],
  scoring: {
    groupMatch: { exactScore: 6, correctOutcome: 3 },
    groupOrder: { allCorrect: 6, twoCorrect: 3, oneCorrect: 1 },
    groupTopScoringTeam: 10,
    groupTopConcedingTeam: 10,
    roundOf8PerTeam: 3,
    bronze: { exactScore: 5, perTeam: 5 },
    final: { exactScore: 5, perTeam: 5 },
    topFourOrder: {
      allCorrect: 20,
      threeCorrect: 15,
      twoCorrect: 10,
      oneCorrect: 5,
      teamRightWrongPlace: 2,
    },
    tournamentTopScoringTeam: 10,
    tournamentTopConcedingTeam: 10,
    highestMatchGoals: 10,
    mostYellowCardsTeam: 15,
    firstRedCardPlayer: 20,
    penaltyShootoutCount: 10,
    finalDecidedByPenalties: 10,
    finalDecisiveGoalPlayer: 20,
    topScorerPlayer: 15,
  },
  teams: [
    { id: 'MEX', name: 'Mexico' },
    { id: 'ARG', name: 'Argentina' },
    { id: 'RSA', name: 'South Africa' },
    { id: 'KOR', name: 'South Korea' },
  ],
  players: [{ id: 'ARG-10', name: 'L. Messi', team: 'ARG' }],
  groups: [{ id: 'A', teams: ['MEX', 'ARG', 'RSA', 'KOR'] }],
  groupMatches: [
    { id: 'm1', group: 'A', home: 'MEX', away: 'ARG' },
    { id: 'm2', group: 'A', home: 'RSA', away: 'KOR' },
  ],
  qualification: { autoQualifyPerGroup: 2, bestThirdPlaced: 1 },
  standingsTiebreak: [
    'points',
    'h2hPoints',
    'h2hGoalDifference',
    'h2hGoalsFor',
    'goalDifference',
    'goalsFor',
  ],
  bracket: {
    rounds: ['R32', 'Final'],
    entryRound: 'R32',
    roundOf8Matches: ['ro8-1'],
    slots: [{ match: 'ro32-1', home: '1A', away: '2A' }],
    progression: [{ match: 'final-1', from: ['ro32-1'] }],
    semiFinals: ['sf-1'],
    finalMatch: 'final-1',
    bronzeMatch: 'bronze-1',
  },
};

describe('tournamentSchema', () => {
  it('parses a valid tournament JSON and transforms ids to branded types', () => {
    const result = tournamentSchema.parse(validTournamentJson);

    expect(result.id).toBe('wc-2026');
    expect(result.name).toBe('FIFA World Cup 2026');
    expect(result.teams).toHaveLength(4);
    expect(result.teams[0]?.id).toBe('MEX');
    expect(result.players[0]?.id).toBe('ARG-10');
    expect(result.groups[0]?.id).toBe('A');
    expect(result.groups[0]?.teams).toEqual(['MEX', 'ARG', 'RSA', 'KOR']);
    expect(result.groupMatches[0]?.id).toBe('m1');
    expect(result.qualification.autoQualifyPerGroup).toBe(2);
    expect(result.standingsTiebreak).toEqual([
      'points',
      'h2hPoints',
      'h2hGoalDifference',
      'h2hGoalsFor',
      'goalDifference',
      'goalsFor',
    ]);
    expect(result.bracket.finalMatch).toBe('final-1');
    expect(result.bracket.bronzeMatch).toBe('bronze-1');
    expect(result.scoring.groupMatch.exactScore).toBe(6);
    expect(result.scoring.topFourOrder.allCorrect).toBe(20);
  });

  it('strips knockoutRounds (display-only label, not part of the engine type)', () => {
    // tournament.json carries knockoutRounds (§4.1) but the engine Tournament has no such
    // field, so it must be stripped from the parsed output rather than leak through.
    const result = tournamentSchema.parse(validTournamentJson);
    expect('knockoutRounds' in result).toBe(false);

    // Parsing also succeeds when the optional field is absent entirely.
    const { knockoutRounds: _omit, ...withoutKnockoutRounds } = validTournamentJson;
    expect(() => tournamentSchema.parse(withoutKnockoutRounds)).not.toThrow();
  });

  it('throws when scoring block is empty object', () => {
    expect(() => tournamentSchema.parse({ ...validTournamentJson, scoring: {} })).toThrow();
  });

  it('throws when scoring is missing required nested field', () => {
    const badScoring = {
      ...validTournamentJson.scoring,
      groupMatch: { exactScore: 6 }, // missing correctOutcome
    };
    expect(() => tournamentSchema.parse({ ...validTournamentJson, scoring: badScoring })).toThrow();
  });

  it('throws when teams is missing', () => {
    const { teams: _, ...withoutTeams } = validTournamentJson;
    expect(() => tournamentSchema.parse(withoutTeams)).toThrow();
  });

  it('throws on invalid standingsTiebreak value', () => {
    expect(() =>
      tournamentSchema.parse({
        ...validTournamentJson,
        standingsTiebreak: ['points', 'invalid-key'],
      }),
    ).toThrow();
  });
});
