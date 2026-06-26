import { describe, it, expect } from 'vitest';
import { resultsSchema } from './results.js';

const validResultsJson = {
  matchResults: [
    { matchId: 'm1', home: 2, away: 1 },
    { matchId: 'm2', home: 0, away: 0 },
  ],
  groupOrder: {
    A: ['MEX', 'ARG', 'RSA', 'KOR'],
  },
  bronzeMatch: { home: 'NED', away: 'POR', homeGoals: 2, awayGoals: 1 },
  finalMatch: {
    home: 'ARG',
    away: 'FRA',
    homeGoals: 3,
    awayGoals: 2,
    decidedBy: 'penalties',
    decisiveGoalPlayer: 'ARG-10',
  },
  answers: {
    roundOf8: ['ARG', 'BRA', 'FRA', 'ESP', 'ENG', 'NED', 'POR', 'CRO'],
    topFourOrder: ['ARG', 'FRA', 'NED', 'POR'],
    groupTopScoringTeam: 'ESP',
    groupTopConcedingTeam: 'RSA',
    tournamentTopScoringTeam: 'ARG',
    tournamentTopConcedingTeam: 'RSA',
    highestMatchGoals: 7,
    mostYellowCardsTeam: 'CRO',
    firstRedCardPlayer: 'GER-4',
    penaltyShootoutCount: 5,
    topScorerPlayer: 'FRA-9',
  },
};

describe('resultsSchema', () => {
  it('parses valid results JSON and transforms ids to branded types', () => {
    const result = resultsSchema.parse(validResultsJson);

    expect(result.matchResults).toHaveLength(2);
    expect(result.matchResults[0]?.matchId).toBe('m1');
    expect(result.matchResults[0]?.home).toBe(2);
    expect(result.matchResults[0]?.away).toBe(1);

    // groupOrder keys are branded GroupIds, values are branded TeamIds
    const groupA = result.groupOrder['A' as keyof typeof result.groupOrder];
    expect(groupA).toEqual(['MEX', 'ARG', 'RSA', 'KOR']);

    expect(result.bronzeMatch?.home).toBe('NED');
    expect(result.bronzeMatch?.homeGoals).toBe(2);

    expect(result.finalMatch?.home).toBe('ARG');
    expect(result.finalMatch?.decidedBy).toBe('penalties');
    expect(result.finalMatch?.decisiveGoalPlayer).toBe('ARG-10');

    expect(result.answers.roundOf8).toHaveLength(8);
    // Single-string answers are normalised to single-element arrays
    expect(result.answers.groupTopScoringTeam).toEqual(['ESP']);
    expect(result.answers.penaltyShootoutCount).toBe(5);
  });

  it('strips extra top-level fields instead of failing (non-strict)', () => {
    const withExtra = {
      ...validResultsJson,
      knockout: [{ round: 'QF', matchId: 'qf-1', home: 'ARG', away: 'BRA' }],
      unexpectedField: 'should be stripped',
    };
    // Should not throw — extra fields are tolerated
    expect(() => resultsSchema.parse(withExtra)).not.toThrow();
    const result = resultsSchema.parse(withExtra);
    // Extra field is stripped in the output
    expect('unexpectedField' in result).toBe(false);
  });

  it('parses with optional bronzeMatch and finalMatch absent', () => {
    const { bronzeMatch: _b, finalMatch: _f, ...withoutFinish } = validResultsJson;
    const result = resultsSchema.parse(withoutFinish);
    expect(result.bronzeMatch).toBeUndefined();
    expect(result.finalMatch).toBeUndefined();
  });

  it('parses with partial answers (empty object)', () => {
    const result = resultsSchema.parse({ ...validResultsJson, answers: {} });
    expect(result.answers).toEqual({});
  });

  it('throws when a matchResult is missing goals', () => {
    const bad = {
      ...validResultsJson,
      matchResults: [{ matchId: 'm1', home: 2 }], // missing away
    };
    expect(() => resultsSchema.parse(bad)).toThrow();
  });

  it('throws when groupOrder value is not an array', () => {
    const bad = {
      ...validResultsJson,
      groupOrder: { A: 'MEX' },
    };
    expect(() => resultsSchema.parse(bad)).toThrow();
  });

  it('throws when finalMatch decidedBy is an invalid enum', () => {
    const bad = {
      ...validResultsJson,
      finalMatch: { ...validResultsJson.finalMatch, decidedBy: 'overtime' },
    };
    expect(() => resultsSchema.parse(bad)).toThrow();
  });

  it('accepts an array of team ids for groupTopScoringTeam (tie scenario)', () => {
    const withTie = {
      ...validResultsJson,
      answers: { ...validResultsJson.answers, groupTopScoringTeam: ['ESP', 'GER'] },
    };
    const result = resultsSchema.parse(withTie);
    expect(result.answers.groupTopScoringTeam).toEqual(['ESP', 'GER']);
  });

  it('accepts an array of player ids for topScorerPlayer (tied top scorers)', () => {
    const withTie = {
      ...validResultsJson,
      answers: { ...validResultsJson.answers, topScorerPlayer: ['FRA-9', 'ARG-10'] },
    };
    const result = resultsSchema.parse(withTie);
    expect(result.answers.topScorerPlayer).toEqual(['FRA-9', 'ARG-10']);
  });
});
