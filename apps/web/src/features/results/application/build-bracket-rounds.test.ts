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

describe('buildBracketRounds — hit computation / cross-slot stage picks', () => {
  // Scenario: only qf1 (A1 vs B2) is in the DB. User's direct pick for qf1 is A2
  // (wrong — not a participant in qf1), and for qf3 they picked A1 (also wrong for qf3,
  // but A1 IS in qf1's participants). Cross-slot adjusts both. Since qf3 has no DB row,
  // the old stagePicksMap missed A1; qf1 should be 'outcome', not 'missed'.
  it('credits outcome when the actual winner was picked for a different unplayed entry-round match (cross-slot)', () => {
    const qf1 = makeMatch('qf1', 'QF', {
      homeTeamId: 'A1',
      awayTeamId: 'B2',
      winnerTeamId: 'A1',
      homeGoals: 1,
      awayGoals: 0,
      status: 'final',
    });
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [qf1], // qf3 is NOT in the DB yet
      {
        knockoutPicks: [
          { bracketMatchKey: 'qf1', winner: 'A2' }, // wrong direct pick for qf1
          { bracketMatchKey: 'qf3', winner: 'A1' }, // picks A1, which won qf1
        ],
        finishScores: {},
      },
      [],
      [],
    );
    const qfRound = bracketRounds.find((r) => r.label === 'QF')!;
    const qf1Card = qfRound.matches.find((m) => m.bracketMatchKey === 'qf1')!;
    expect(qf1Card.hit).toBe('outcome');
  });

  it('returns missed when the actual winner was not picked in any entry-round match', () => {
    const qf1 = makeMatch('qf1', 'QF', {
      homeTeamId: 'A1',
      awayTeamId: 'B2',
      winnerTeamId: 'A1',
      homeGoals: 1,
      awayGoals: 0,
      status: 'final',
    });
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [qf1],
      {
        knockoutPicks: [
          { bracketMatchKey: 'qf1', winner: 'B1' }, // B1 not in qf1, A1 not picked anywhere
        ],
        finishScores: {},
      },
      [],
      [],
    );
    const qfRound = bracketRounds.find((r) => r.label === 'QF')!;
    const qf1Card = qfRound.matches.find((m) => m.bracketMatchKey === 'qf1')!;
    expect(qf1Card.hit).toBe('missed');
  });
});

describe('buildBracketRounds — entry-round pickStatus with cross-slot adjustment', () => {
  // miniTournament entry-round layout:
  //   qf1: 1A vs 2B  (A1 vs B2)
  //   qf2: 1C vs 2D  (C1 vs D2)
  //   qf3: 1B vs 2A  (B1 vs A2)
  //   qf4: 1D vs 2C  (D1 vs C2)

  it('credits alive when team was picked for a different slot and won (cross-slot pickStatus)', () => {
    // User picks C1 for qf1 (wrong slot — C1 is actually in qf2 [C1, D2]).
    // C1 wins qf2 → qf2 effective pick is C1 → alive.
    // qf1 effective pick: C1 not in [A1, B2], no other participant in allEntryPickedTeams → no-pick.
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [
        makeMatch('qf1', 'QF', {
          homeTeamId: 'A1',
          awayTeamId: 'B2',
          winnerTeamId: 'A1',
          homeGoals: 1,
          awayGoals: 0,
          status: 'final',
        }),
        makeMatch('qf2', 'QF', {
          homeTeamId: 'C1',
          awayTeamId: 'D2',
          winnerTeamId: 'C1',
          homeGoals: 1,
          awayGoals: 0,
          status: 'final',
        }),
      ],
      { knockoutPicks: [{ bracketMatchKey: 'qf1', winner: 'C1' }], finishScores: {} },
      [],
      [],
    );
    const qfRound = bracketRounds.find((r) => r.label === 'QF')!;
    const qf1Card = qfRound.matches.find((m) => m.bracketMatchKey === 'qf1')!;
    const qf2Card = qfRound.matches.find((m) => m.bracketMatchKey === 'qf2')!;

    expect(qf2Card.pickStatus).toBe('alive');
    expect(qf2Card.pickedWinnerId).toBe('C1');
    expect(qf1Card.pickStatus).toBe('no-pick');
    expect(qf1Card.pickedWinnerId).toBeNull();
  });

  it('cross-slot pick for unplayed slot shows pending when match not yet played', () => {
    // qf2 not in DB yet (unplayed). C1 was picked for qf1 (wrong slot, C1 is in qf2).
    // qf2 effective pick = C1 → pending (no winner yet).
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [
        makeMatch('qf1', 'QF', {
          homeTeamId: 'A1',
          awayTeamId: 'B2',
          winnerTeamId: 'A1',
          homeGoals: 1,
          awayGoals: 0,
          status: 'final',
        }),
      ],
      { knockoutPicks: [{ bracketMatchKey: 'qf1', winner: 'C1' }], finishScores: {} },
      [],
      [],
    );
    const qfRound = bracketRounds.find((r) => r.label === 'QF')!;
    const qf2Card = qfRound.matches.find((m) => m.bracketMatchKey === 'qf2')!;

    expect(qf2Card.pickStatus).toBe('pending');
  });

  it('direct valid pick is used as-is without cross-slot substitution', () => {
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [finalQf1],
      { knockoutPicks: [{ bracketMatchKey: 'qf1', winner: 'A1' }], finishScores: {} },
      [],
      [],
    );
    const qfRound = bracketRounds.find((r) => r.label === 'QF')!;
    const qf1Card = qfRound.matches.find((m) => m.bracketMatchKey === 'qf1')!;

    expect(qf1Card.pickStatus).toBe('alive');
    expect(qf1Card.pickedWinnerId).toBe('A1');
  });
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

  it('shows the confirmed winner as homeTeamId (not predictedHomeTeamId) when only one feeder QF is final', () => {
    // qf1 done (A1 won), qf2 pending — sf1 home slot should be A1 as confirmed,
    // not surfaced as predictedHomeTeamId.
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [finalQf1],
      {
        knockoutPicks: [
          { bracketMatchKey: 'qf1', winner: 'A1' },
          { bracketMatchKey: 'qf2', winner: 'C1' },
        ],
        finishScores: {},
      },
      [],
      [],
    );
    const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
    const sf1Card = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
    // Known winner must be surfaced as the actual team ID, not as a predicted fill.
    expect(sf1Card.homeTeamId).toBe('A1');
    expect(sf1Card.predictedHomeTeamId).toBeNull();
    // Away slot still unknown — may be filled from user's pick.
    expect(sf1Card.awayTeamId).toBeNull();
    // User correctly predicted A1 to reach sf1.
    expect(sf1Card.homeTeamUserPredictedParticipant).toBe(true);
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

describe('Final/Bronze: implicit pickedWinnerId from finish score when no explicit knock pick', () => {
  // Scenario: user saved the Final/Bronze score before filling in SF picks.
  // The implicit winner was never stored. Later, SF (and QF) picks were added.
  // At render time we must derive the winner from the score + SF picks so both
  // finalists appear in the "Your pick" row of FinalResultCard.

  const fullBracketPicks = [
    { bracketMatchKey: 'qf1', winner: 'A1' },
    { bracketMatchKey: 'qf2', winner: 'C1' },
    { bracketMatchKey: 'qf3', winner: 'B1' },
    { bracketMatchKey: 'qf4', winner: 'D1' },
    { bracketMatchKey: 'sf1', winner: 'A1' },
    { bracketMatchKey: 'sf2', winner: 'B1' },
    // deliberately NO 'final' or 'bronze' knockout pick
  ];

  it('derives pickedWinnerId and pickedOpponentId for Final when score picks home side', () => {
    // finishScore: A1 (sf1 winner = home side) wins 2-1
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [],
      { knockoutPicks: fullBracketPicks, finishScores: { final: { home: 2, away: 1 } } },
      [],
      [],
    );
    const finalRound = bracketRounds.find((r) => r.label === 'Final')!;
    const finalCard = finalRound.matches[0]!;
    expect(finalCard.pickedWinnerId).toBe('A1');
    expect(finalCard.pickedOpponentId).toBe('B1');
  });

  it('derives pickedWinnerId and pickedOpponentId for Final when score picks away side', () => {
    // finishScore: B1 (sf2 winner = away side) wins 0-3
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [],
      { knockoutPicks: fullBracketPicks, finishScores: { final: { home: 0, away: 3 } } },
      [],
      [],
    );
    const finalRound = bracketRounds.find((r) => r.label === 'Final')!;
    const finalCard = finalRound.matches[0]!;
    expect(finalCard.pickedWinnerId).toBe('B1');
    expect(finalCard.pickedOpponentId).toBe('A1');
  });

  it('derives pickedWinnerId and pickedOpponentId for Bronze when score picks home side', () => {
    // Bronze home side = sf1 loser = C1 (sf1 winner was A1, C1 was the other QF winner)
    // Bronze away side = sf2 loser = D1 (sf2 winner was B1, D1 was the other QF winner)
    // finishScore: C1 wins 3-1
    const { bronzeMatch } = buildBracketRounds(
      miniTournament,
      [],
      { knockoutPicks: fullBracketPicks, finishScores: { bronze: { home: 3, away: 1 } } },
      [],
      [],
    );
    expect(bronzeMatch).not.toBeNull();
    expect(bronzeMatch!.pickedWinnerId).toBe('C1');
    expect(bronzeMatch!.pickedOpponentId).toBe('D1');
  });

  it('leaves pickedWinnerId null for tied score (tiebreak required)', () => {
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [],
      { knockoutPicks: fullBracketPicks, finishScores: { final: { home: 1, away: 1 } } },
      [],
      [],
    );
    const finalRound = bracketRounds.find((r) => r.label === 'Final')!;
    const finalCard = finalRound.matches[0]!;
    expect(finalCard.pickedWinnerId).toBeNull();
  });
});
