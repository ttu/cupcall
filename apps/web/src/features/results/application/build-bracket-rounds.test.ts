import { describe, expect, it } from 'vitest';
import { miniTournament } from '@cup/engine/testing';
import { tournamentId as asTournamentId, bracketMatchKey as bmk, userId } from '@cup/engine';
import type { MatchRow, PoolKnockoutPick } from '@cup/db';
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

describe('buildBracketRounds — impossible pick detection', () => {
  // When both match participants are known and the picked team is neither of them,
  // the pick is already lost before the match is played → busted, not pending.

  it('marks pickStatus=busted when picked team cannot appear in the match (both teams known)', () => {
    // After qf1 (A1 wins) and qf2 (C1 wins), sf1 has homeId=A1, awayId=C1.
    // User picks B2 (qf1 loser) for sf1 → B2 can never win sf1 → busted.
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [finalQf1, finalQf2],
      { knockoutPicks: [{ bracketMatchKey: 'sf1', winner: 'B2' }], finishScores: {} },
      [],
      [],
    );
    const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
    const sf1Card = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
    expect(sf1Card.pickStatus).toBe('busted');
  });

  it('keeps pickStatus=pending when picked team has not yet played and sf1 away slot is unknown', () => {
    // Only qf1 done (A1 wins); qf2 not played yet so sf1 awayId is unknown.
    // User picks C1 (from qf2, not eliminated) for sf1 → C1 could win qf2 and appear → pending.
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [finalQf1], // qf2 not yet played
      { knockoutPicks: [{ bracketMatchKey: 'sf1', winner: 'C1' }], finishScores: {} },
      [],
      [],
    );
    const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
    const sf1Card = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
    expect(sf1Card.pickStatus).toBe('pending');
  });
});

describe('buildBracketRounds — eliminated team picks', () => {
  // A team that lost a knockout match is eliminated and cannot advance to any later round.
  // Picks for such teams in SF/Final/Bronze must be 'busted', not 'pending',
  // even when the later match's participants have not yet been confirmed.

  it('marks SF pick as busted when picked team lost in the entry round', () => {
    // qf1: A1 wins → B2 is eliminated. sf1 not yet played.
    // User picks B2 for sf1 → B2 can never appear in sf1 → busted.
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [finalQf1],
      { knockoutPicks: [{ bracketMatchKey: 'sf1', winner: 'B2' }], finishScores: {} },
      [],
      [],
    );
    const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
    const sf1Card = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
    expect(sf1Card.pickStatus).toBe('busted');
  });

  it('marks Final pick as busted when picked team lost in the entry round', () => {
    // qf1: A1 wins → B2 eliminated. sf1 and Final not yet played.
    // User picks B2 for Final → busted.
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [finalQf1],
      {
        knockoutPicks: [
          { bracketMatchKey: 'qf1', winner: 'A1' },
          { bracketMatchKey: 'sf1', winner: 'A1' },
          { bracketMatchKey: 'final', winner: 'B2' },
        ],
        finishScores: {},
      },
      [],
      [],
    );
    const finalRound = bracketRounds.find((r) => r.label === 'Final')!;
    const finalCard = finalRound.matches[0]!;
    expect(finalCard.pickStatus).toBe('busted');
  });

  it('marks Bronze pick as busted when picked team lost in the entry round', () => {
    // qf1: A1 wins → B2 eliminated. Neither SF played.
    // User picks B2 for bronze → busted.
    const { bronzeMatch } = buildBracketRounds(
      miniTournament,
      [finalQf1],
      {
        knockoutPicks: [
          { bracketMatchKey: 'qf1', winner: 'A1' },
          { bracketMatchKey: 'sf1', winner: 'A1' },
          { bracketMatchKey: 'bronze', winner: 'B2' },
        ],
        finishScores: {},
      },
      [],
      [],
    );
    expect(bronzeMatch!.pickStatus).toBe('busted');
  });
});

describe('buildBracketRounds — regulation-decided matches (winnerTeamId null)', () => {
  // In the DB, winnerTeamId is only stored for penalty-decided matches (ties after 90 min).
  // Regulation/extra-time winners must be derived from the score.
  // Without this fix, all picks on regulation-decided matches appear as "pending" in bracket health.

  it('sets pickStatus=alive when user picked the regulation winner (winnerTeamId null)', () => {
    const qf1Regulation = makeMatch('qf1', 'QF', {
      homeTeamId: 'A1',
      awayTeamId: 'B2',
      winnerTeamId: null, // regulation win — DB does not store winner
      homeGoals: 2,
      awayGoals: 0,
      status: 'final',
    });
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [qf1Regulation],
      { knockoutPicks: [{ bracketMatchKey: 'qf1', winner: 'A1' }], finishScores: {} },
      [],
      [],
    );
    const qfRound = bracketRounds.find((r) => r.label === 'QF')!;
    const qf1Card = qfRound.matches.find((m) => m.bracketMatchKey === 'qf1')!;
    expect(qf1Card.pickStatus).toBe('alive');
    expect(qf1Card.hit).toBe('outcome');
    expect(qf1Card.actualWinnerId).toBe('A1');
  });

  it('sets pickStatus=busted when user picked the regulation loser (winnerTeamId null)', () => {
    const qf1Regulation = makeMatch('qf1', 'QF', {
      homeTeamId: 'A1',
      awayTeamId: 'B2',
      winnerTeamId: null,
      homeGoals: 2,
      awayGoals: 0,
      status: 'final',
    });
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [qf1Regulation],
      { knockoutPicks: [{ bracketMatchKey: 'qf1', winner: 'B2' }], finishScores: {} },
      [],
      [],
    );
    const qfRound = bracketRounds.find((r) => r.label === 'QF')!;
    const qf1Card = qfRound.matches.find((m) => m.bracketMatchKey === 'qf1')!;
    expect(qf1Card.pickStatus).toBe('busted');
    expect(qf1Card.hit).toBe('missed');
  });

  it('propagates regulation winner into SF slots (winnerTeamId null on QF matches)', () => {
    // QF matches decided in regulation — winner must flow into SF participants.
    const qf1Reg = makeMatch('qf1', 'QF', {
      homeTeamId: 'A1',
      awayTeamId: 'B2',
      winnerTeamId: null,
      homeGoals: 2,
      awayGoals: 0,
      status: 'final',
    });
    const qf2Reg = makeMatch('qf2', 'QF', {
      homeTeamId: 'C1',
      awayTeamId: 'D2',
      winnerTeamId: null,
      homeGoals: 1,
      awayGoals: 0,
      status: 'final',
    });
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [qf1Reg, qf2Reg],
      {
        knockoutPicks: [
          { bracketMatchKey: 'qf1', winner: 'A1' },
          { bracketMatchKey: 'qf2', winner: 'C1' },
          { bracketMatchKey: 'sf1', winner: 'A1' },
        ],
        finishScores: {},
      },
      [],
      [],
    );
    const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
    const sf1Card = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
    // SF should know A1 and C1 are the confirmed participants
    expect(sf1Card.homeTeamId).toBe('A1');
    expect(sf1Card.awayTeamId).toBe('C1');
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

  it('sets predictedHomeTeamId=sf1-winner and predictedAwayTeamId=sf2-winner for Final', () => {
    // Contract: predictedHomeTeamId / predictedAwayTeamId must preserve home/away slot order
    // so that predictedHome score always corresponds to the home-side team and
    // predictedAway score always corresponds to the away-side team.
    // FinalResultCard relies on this to show "Your pick: [home] 2–1 [away]" correctly.
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [],
      { knockoutPicks: fullBracketPicks, finishScores: { final: { home: 2, away: 1 } } },
      [],
      [],
    );
    const finalCard = bracketRounds.find((r) => r.label === 'Final')!.matches[0]!;
    // A1 is the sf1 winner → fills the home slot
    expect(finalCard.predictedHomeTeamId).toBe('A1');
    // B1 is the sf2 winner → fills the away slot
    expect(finalCard.predictedAwayTeamId).toBe('B1');
  });

  it('sets predictedHomeTeamId=sf1-loser and predictedAwayTeamId=sf2-loser for Bronze', () => {
    // Same slot-order contract for the Bronze match.
    // sf1 loser = C1 (A1 beat C1 in sf1), sf2 loser = D1 (B1 beat D1 in sf2).
    const { bronzeMatch } = buildBracketRounds(
      miniTournament,
      [],
      { knockoutPicks: fullBracketPicks, finishScores: { bronze: { home: 3, away: 1 } } },
      [],
      [],
    );
    expect(bronzeMatch).not.toBeNull();
    expect(bronzeMatch!.predictedHomeTeamId).toBe('C1');
    expect(bronzeMatch!.predictedAwayTeamId).toBe('D1');
  });
});

describe('buildBracketRounds — poolPickHomePct / poolPickAwayPct', () => {
  // qf1: A1 (home) vs B2 (away), not yet played
  const scheduledQf1 = makeMatch('qf1', 'QF', {
    homeTeamId: 'A1',
    awayTeamId: 'B2',
    status: 'scheduled',
  });

  it('populates poolPickHomePct and poolPickAwayPct from pool knockout picks', () => {
    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bmk('qf1'), winnerTeamId: 'A1' },
      { userId: userId('u2'), bracketMatchKey: bmk('qf1'), winnerTeamId: 'A1' },
      { userId: userId('u3'), bracketMatchKey: bmk('qf1'), winnerTeamId: 'B2' },
    ];
    const { bracketRounds } = buildBracketRounds(miniTournament, [scheduledQf1], null, [], picks);
    const qfRound = bracketRounds.find((r) => r.label === 'QF')!;
    const match = qfRound.matches.find((m) => m.bracketMatchKey === 'qf1')!;
    // 2 of 3 users picked A1 (home) → 67%; 1 of 3 picked B2 (away) → 33%
    expect(match.poolPickHomePct).toBe(67);
    expect(match.poolPickAwayPct).toBe(33);
  });

  it('returns null pcts when no pool picks exist', () => {
    const { bracketRounds } = buildBracketRounds(miniTournament, [scheduledQf1], null, [], []);
    const qfRound = bracketRounds.find((r) => r.label === 'QF')!;
    const match = qfRound.matches.find((m) => m.bracketMatchKey === 'qf1')!;
    expect(match.poolPickHomePct).toBeNull();
    expect(match.poolPickAwayPct).toBeNull();
  });

  it('returns null pcts when teams are TBD (homeTeamId or awayTeamId is null)', () => {
    // sf1 has no DB row yet — both slots are null until QFs resolve
    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bmk('sf1'), winnerTeamId: 'A1' },
    ];
    // Only pass the scheduled QF matches so group-stage data is missing → sf1 slots are null
    const { bracketRounds } = buildBracketRounds(miniTournament, [], null, [], picks);
    const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
    const sf1Match = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
    // Both team slots are null → pcts must be null
    expect(sf1Match.homeTeamId).toBeNull();
    expect(sf1Match.awayTeamId).toBeNull();
    expect(sf1Match.poolPickHomePct).toBeNull();
    expect(sf1Match.poolPickAwayPct).toBeNull();
  });
});
