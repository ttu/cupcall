import { describe, it, expect } from 'vitest';
import { teamId, playerId, groupId, matchId, bracketMatchKey } from '@cup/engine';
import type { Tournament } from '@cup/engine';
import { cardIoSchema, parseCardImport } from './card-io.js';

// ---------------------------------------------------------------------------
// Minimal tournament fixture for cross-reference tests
// ---------------------------------------------------------------------------

const scoring = {
  groupMatch: { exactScore: 6, correctOutcome: 3 },
  groupOrder: { allCorrect: 6, twoCorrect: 3, oneCorrect: 1 },
  groupTopScoringTeam: 10,
  groupTopConcedingTeam: 10,
  roundOf16PerTeam: 2,
  roundOf8PerTeam: 3,
  bronze: { exactScore: 5, perTeam: 5 },
  final: { exactScore: 5, perTeam: 5 },
  topFourOrder: {
    allCorrect: 20,
    threeCorrect: 15,
    twoCorrect: 10,
    oneCorrect: 5,
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
};

const tournament: Tournament = {
  id: 'wc-2026',
  name: 'FIFA World Cup 2026',
  scoring,
  teams: [
    { id: teamId('MEX'), name: 'Mexico' },
    { id: teamId('ARG'), name: 'Argentina' },
    { id: teamId('RSA'), name: 'South Africa' },
    { id: teamId('CZE'), name: 'Czech Republic' },
  ],
  players: [
    { id: playerId('ARG-10'), name: 'L. Messi', team: teamId('ARG') },
    { id: playerId('MEX-9'), name: 'R. Jimenez', team: teamId('MEX') },
  ],
  groups: [
    { id: groupId('A'), teams: [teamId('MEX'), teamId('ARG'), teamId('RSA'), teamId('CZE')] },
  ],
  groupMatches: [
    { id: matchId('m1'), group: groupId('A'), home: teamId('MEX'), away: teamId('ARG') },
    { id: matchId('m2'), group: groupId('A'), home: teamId('RSA'), away: teamId('CZE') },
  ],
  qualification: { autoQualifyPerGroup: 2, bestThirdPlaced: 1 },
  standingsTiebreak: [
    'points',
    'h2hPoints',
    'h2hGoalDifference',
    'h2hGoalsFor',
    'goalDifference',
    'goalsFor',
    'conductScore',
  ],
  bracket: {
    rounds: ['R32', 'Final'],
    entryRound: 'R32',
    roundOf16Matches: [],
    roundOf8Matches: [bracketMatchKey('qf-1')],
    slots: [{ match: bracketMatchKey('ro32-1'), home: '1A', away: '2A' }],
    progression: [
      {
        match: bracketMatchKey('final-1'),
        from: [bracketMatchKey('sf-1'), bracketMatchKey('sf-2')],
      },
    ],
    semiFinals: [bracketMatchKey('sf-1'), bracketMatchKey('sf-2')],
    finalMatch: bracketMatchKey('final-1'),
    bronzeMatch: bracketMatchKey('bronze-1'),
  },
};

// ---------------------------------------------------------------------------
// cardIoSchema
// ---------------------------------------------------------------------------

describe('cardIoSchema', () => {
  it('parses a full card with all sections', () => {
    const input = {
      tournamentId: 'wc-2026',
      version: 1,
      groupScores: [{ matchId: 'm1', home: 2, away: 1 }],
      knockoutPicks: [{ bracketMatchKey: 'ro32-1', winner: 'ARG' }],
      finishScores: { final: { home: 3, away: 2 }, bronze: { home: 1, away: 0 } },
      specials: { topScorerPlayer: 'ARG-10', mostYellowCardsTeam: 'MEX' },
    };

    const result = cardIoSchema.parse(input);

    expect(result.tournamentId).toBe('wc-2026');
    expect(result.version).toBe(1);
    expect(result.groupScores).toHaveLength(1);
    expect(result.groupScores[0]?.matchId).toBe('m1');
    expect(result.groupScores[0]?.home).toBe(2);
    expect(result.knockoutPicks[0]?.bracketMatchKey).toBe('ro32-1');
    expect(result.knockoutPicks[0]?.winner).toBe('ARG');
    expect(result.finishScores.final?.home).toBe(3);
    expect(result.finishScores.bronze?.away).toBe(0);
    expect(result.specials.topScorerPlayer).toBe('ARG-10');
    expect(result.specials.mostYellowCardsTeam).toBe('MEX');
  });

  it('parses a partial card with only groupScores (all other sections absent)', () => {
    const input = {
      tournamentId: 'wc-2026',
      version: 1,
      groupScores: [{ matchId: 'm1', home: 1, away: 1 }],
    };

    const result = cardIoSchema.parse(input);

    expect(result.groupScores).toHaveLength(1);
    expect(result.knockoutPicks).toEqual([]);
    expect(result.finishScores).toEqual({});
    expect(result.specials).toEqual({});
  });

  it('rejects stray unknown fields (strict mode)', () => {
    const input = {
      tournamentId: 'wc-2026',
      version: 1,
      groupScores: [],
      unknownStrayField: 'this should fail',
    };

    expect(() => cardIoSchema.parse(input)).toThrow();
  });

  it('rejects when version is zero or negative', () => {
    const input = { tournamentId: 'wc-2026', version: 0, groupScores: [] };
    expect(() => cardIoSchema.parse(input)).toThrow();
  });

  it('rejects when groupScore has negative goals', () => {
    const input = {
      tournamentId: 'wc-2026',
      version: 1,
      groupScores: [{ matchId: 'm1', home: -1, away: 0 }],
    };
    expect(() => cardIoSchema.parse(input)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// parseCardImport
// ---------------------------------------------------------------------------

describe('parseCardImport', () => {
  const validPayload = {
    tournamentId: 'wc-2026',
    version: 1,
    groupScores: [{ matchId: 'm1', home: 2, away: 1 }],
    knockoutPicks: [{ bracketMatchKey: 'ro32-1', winner: 'ARG' }],
    finishScores: { final: { home: 3, away: 2 } },
    specials: { topScorerPlayer: 'ARG-10' },
  };

  it('returns ok: true with CardInputs for a valid payload', () => {
    const result = parseCardImport(validPayload, tournament);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tournamentId).toBe('wc-2026');
    expect(result.value.version).toBe(1);
    expect(result.value.groupScores[0]?.matchId).toBe('m1');
    expect(result.value.specials.topScorerPlayer).toBe('ARG-10');
  });

  it('returns ok: false with a clear message when tournamentId mismatches', () => {
    const result = parseCardImport({ ...validPayload, tournamentId: 'euro-2024' }, tournament);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/tournament id mismatch/i);
    expect(result.errors[0]).toContain('wc-2026');
    expect(result.errors[0]).toContain('euro-2024');
  });

  it('returns ok: false listing unknown team id in knockoutPicks', () => {
    const result = parseCardImport(
      {
        ...validPayload,
        knockoutPicks: [{ bracketMatchKey: 'ro32-1', winner: 'UNKNOWN_TEAM' }],
      },
      tournament,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const mentionsTeam = result.errors.some((e) => e.includes('UNKNOWN_TEAM'));
    expect(mentionsTeam).toBe(true);
  });

  it('returns ok: false listing unknown player id in specials', () => {
    const result = parseCardImport(
      {
        ...validPayload,
        specials: { topScorerPlayer: 'NO_SUCH_PLAYER' },
      },
      tournament,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const mentionsPlayer = result.errors.some((e) => e.includes('NO_SUCH_PLAYER'));
    expect(mentionsPlayer).toBe(true);
  });

  it('returns ok: false listing unknown matchId in groupScores', () => {
    const result = parseCardImport(
      {
        ...validPayload,
        groupScores: [{ matchId: 'no-such-match', home: 1, away: 0 }],
      },
      tournament,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const mentionsMatch = result.errors.some((e) => e.includes('no-such-match'));
    expect(mentionsMatch).toBe(true);
  });

  it('collects ALL cross-reference violations (not just first)', () => {
    const result = parseCardImport(
      {
        ...validPayload,
        groupScores: [
          { matchId: 'bad-match-1', home: 1, away: 0 },
          { matchId: 'bad-match-2', home: 2, away: 1 },
        ],
        specials: { topScorerPlayer: 'NO_PLAYER' },
      },
      tournament,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Should have 3 errors: 2 bad matchIds + 1 bad playerId
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('returns ok: false with structural error message for stray field', () => {
    const result = parseCardImport({ ...validPayload, unknownField: 'bad' }, tournament);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // ZodError for unrecognized key
    expect(result.errors.length).toBeGreaterThan(0);
    const errorText = result.errors.join(' ');
    expect(errorText.length).toBeGreaterThan(0);
  });

  it('accepts a partial import with only groupScores section', () => {
    const result = parseCardImport(
      { tournamentId: 'wc-2026', version: 1, groupScores: [{ matchId: 'm1', home: 0, away: 0 }] },
      tournament,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.groupScores).toHaveLength(1);
    expect(result.value.knockoutPicks).toEqual([]);
    expect(result.value.specials).toEqual({});
  });

  it('returns ok: false with unknown bracketMatchKey', () => {
    const result = parseCardImport(
      {
        ...validPayload,
        knockoutPicks: [{ bracketMatchKey: 'nonexistent-round-99', winner: 'MEX' }],
      },
      tournament,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const mentionsKey = result.errors.some((e) => e.includes('nonexistent-round-99'));
    expect(mentionsKey).toBe(true);
  });
});
