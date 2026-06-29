import { describe, expect, it } from 'vitest';
import { miniTournament } from '@cup/engine/testing';
import { tournamentId as asTournamentId } from '@cup/engine';
import type { MatchRow } from '@cup/db';
import { buildBracketRounds } from './build-bracket-rounds';

const tid = asTournamentId('mini-2026');

function makeMatch(
  id: string,
  stage: MatchRow['stage'],
  overrides: Partial<MatchRow> = {},
): MatchRow {
  return {
    id,
    tournamentId: tid,
    stage,
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
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

// miniTournament layout:
//   Entry round: QF (qf1–qf4)
//   qf1: 1A vs 2B  →  A1 vs B2  (default seed order with no group matches played)
//   qf2: 1C vs 2D  →  C1 vs D2
//   qf3: 1B vs 2A  →  B1 vs A2
//   qf4: 1D vs 2C  →  D1 vs C2
//   sf1 feeds from [qf1, qf2], sf2 feeds from [qf3, qf4]
//   final feeds from [sf1, sf2]

const finalQf1 = makeMatch('qf1', 'QF', {
  homeTeamId: 'A1',
  awayTeamId: 'B2',
  winnerTeamId: 'A1',
  homeGoals: 2,
  awayGoals: 0,
  status: 'final',
});

const finalQf2 = makeMatch('qf2', 'QF', {
  homeTeamId: 'C1',
  awayTeamId: 'D2',
  winnerTeamId: 'C1',
  homeGoals: 1,
  awayGoals: 0,
  status: 'final',
});

const finalQf3 = makeMatch('qf3', 'QF', {
  homeTeamId: 'B1',
  awayTeamId: 'A2',
  winnerTeamId: 'B1',
  homeGoals: 1,
  awayGoals: 0,
  status: 'final',
});

const finalQf4 = makeMatch('qf4', 'QF', {
  homeTeamId: 'D1',
  awayTeamId: 'C2',
  winnerTeamId: 'D1',
  homeGoals: 1,
  awayGoals: 0,
  status: 'final',
});

describe('buildBracketRounds — homeTeamUserPredictedParticipant / awayTeamUserPredictedParticipant', () => {
  it('is always false for entry-round (QF) cards', () => {
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [finalQf1],
      { knockoutPicks: [{ bracketMatchKey: 'qf1', winner: 'A1' }], finishScores: {} },
      [],
      [],
    );
    const qfRound = bracketRounds.find((r) => r.label === 'QF')!;
    const qf1Card = qfRound.matches.find((m) => m.bracketMatchKey === 'qf1')!;
    expect(qf1Card.homeTeamUserPredictedParticipant).toBe(false);
    expect(qf1Card.awayTeamUserPredictedParticipant).toBe(false);
  });

  it('is true for SF home slot when user correctly picked the QF winner', () => {
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [finalQf1, finalQf2],
      { knockoutPicks: [{ bracketMatchKey: 'qf1', winner: 'A1' }], finishScores: {} },
      [],
      [],
    );
    const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
    const sf1Card = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
    expect(sf1Card.homeTeamUserPredictedParticipant).toBe(true);
    // No pick for qf2 → away slot not predicted
    expect(sf1Card.awayTeamUserPredictedParticipant).toBe(false);
  });

  it('is false for SF home slot when user picked the losing QF team', () => {
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [finalQf1, finalQf2],
      // B2 is a valid qf1 participant but lost
      { knockoutPicks: [{ bracketMatchKey: 'qf1', winner: 'B2' }], finishScores: {} },
      [],
      [],
    );
    const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
    const sf1Card = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
    expect(sf1Card.homeTeamUserPredictedParticipant).toBe(false);
  });

  it('is false for SF home slot when user made no QF pick', () => {
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [finalQf1, finalQf2],
      { knockoutPicks: [], finishScores: {} },
      [],
      [],
    );
    const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
    const sf1Card = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
    expect(sf1Card.homeTeamUserPredictedParticipant).toBe(false);
  });

  it('is false when the QF match is not yet final (slot TBD)', () => {
    // No QF results → sf1 homeId is null (derivedParticipants has no sf1 entry)
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [],
      { knockoutPicks: [{ bracketMatchKey: 'qf1', winner: 'A1' }], finishScores: {} },
      [],
      [],
    );
    const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
    const sf1Card = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
    expect(sf1Card.homeTeamUserPredictedParticipant).toBe(false);
  });

  it('is false for all cards when inputs is null (viewer mode)', () => {
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [finalQf1, finalQf2],
      null,
      [],
      [],
    );
    const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
    const sf1Card = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
    expect(sf1Card.homeTeamUserPredictedParticipant).toBe(false);
    expect(sf1Card.awayTeamUserPredictedParticipant).toBe(false);
  });

  it('propagates correctly through a two-hop chain: QF → SF → Final', () => {
    const finalSf1 = makeMatch('sf1', 'SF', {
      homeTeamId: 'A1',
      awayTeamId: 'C1',
      winnerTeamId: 'A1',
      homeGoals: 2,
      awayGoals: 1,
      status: 'final',
    });
    const finalSf2 = makeMatch('sf2', 'SF', {
      homeTeamId: 'B1',
      awayTeamId: 'D1',
      winnerTeamId: 'B1',
      homeGoals: 1,
      awayGoals: 0,
      status: 'final',
    });
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [finalQf1, finalQf2, finalQf3, finalQf4, finalSf1, finalSf2],
      {
        knockoutPicks: [
          { bracketMatchKey: 'qf1', winner: 'A1' },
          { bracketMatchKey: 'qf2', winner: 'C1' },
          { bracketMatchKey: 'qf3', winner: 'B1' },
          { bracketMatchKey: 'qf4', winner: 'D1' },
          { bracketMatchKey: 'sf1', winner: 'A1' },
          { bracketMatchKey: 'sf2', winner: 'B1' },
        ],
        finishScores: {},
      },
      [],
      [],
    );
    const finalRound = bracketRounds.find((r) => r.label === 'Final')!;
    const finalCard = finalRound.matches[0]!;
    // User's chain correctly predicted A1 reaching Final via sf1, B1 via sf2
    expect(finalCard.homeTeamUserPredictedParticipant).toBe(true);
    expect(finalCard.awayTeamUserPredictedParticipant).toBe(true);
  });
});
