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

describe('buildBracketRounds — pickedOpponentStatus', () => {
  // The runner-up (2nd place) and bronze loser (4th place) are derived from the
  // SF loser chain. If the opponent team was eliminated in an earlier round,
  // pickedOpponentStatus must be 'busted', not 'pending'.

  it('marks Final pickedOpponentStatus as busted when picked opponent was eliminated in entry round', () => {
    // qf2: C1 wins → D2 eliminated.
    // User picks sf2=C1, final=A1 → final opponent = C1 (sf1 loser from user's picks).
    // But we need the FINAL opponent to be a team that was eliminated.
    // Setup: qf1: A1 wins (B2 eliminated). User picks sf1=A1, final=A1.
    // final opponent = C1 (sf2 winner that user didn't pick for Final, derived from sf2 loser of sf1).
    // Simpler: user picks sf1 winner = A1 (from qf1/qf2), sf2 winner = B1 (from qf3/qf4).
    // Final: A1 wins, opponent = B1 (sf2 winner). For B1 to be busted, B1 must have been eliminated.
    // qf3: A2 wins → B1 eliminated.
    const qf3B1Eliminated = makeMatch('qf3', 'QF', {
      homeTeamId: 'B1',
      awayTeamId: 'A2',
      winnerTeamId: 'A2',
      homeGoals: 0,
      awayGoals: 1,
      status: 'final',
    });
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [finalQf1, qf3B1Eliminated],
      {
        knockoutPicks: [
          { bracketMatchKey: 'qf1', winner: 'A1' },
          { bracketMatchKey: 'qf2', winner: 'C1' },
          { bracketMatchKey: 'qf3', winner: 'B1' }, // user predicted B1, but B1 actually lost
          { bracketMatchKey: 'qf4', winner: 'D1' },
          { bracketMatchKey: 'sf1', winner: 'A1' },
          { bracketMatchKey: 'sf2', winner: 'B1' }, // user predicted B1 wins sf2
          { bracketMatchKey: 'final', winner: 'A1' }, // A1 wins, B1 is opponent/runner-up
        ],
        finishScores: {},
      },
      [],
      [],
    );
    const finalCard = bracketRounds.find((r) => r.label === 'Final')!.matches[0]!;
    expect(finalCard.pickedOpponentId).toBe('B1');
    expect(finalCard.pickedOpponentStatus).toBe('busted');
  });

  it('marks Bronze pickedOpponentStatus as busted when picked opponent was eliminated in entry round', () => {
    // qf4: C2 wins → D1 eliminated.
    // User picks sf2=B1, bronze=C1 → bronze opponent = D1 (sf2 loser from user's qf4 pick).
    // D1 was eliminated in qf4 → pickedOpponentStatus busted.
    const qf4D1Eliminated = makeMatch('qf4', 'QF', {
      homeTeamId: 'D1',
      awayTeamId: 'C2',
      winnerTeamId: 'C2',
      homeGoals: 0,
      awayGoals: 1,
      status: 'final',
    });
    const { bronzeMatch } = buildBracketRounds(
      miniTournament,
      [finalQf1, qf4D1Eliminated],
      {
        knockoutPicks: [
          { bracketMatchKey: 'qf1', winner: 'A1' },
          { bracketMatchKey: 'qf2', winner: 'C1' },
          { bracketMatchKey: 'qf3', winner: 'B1' },
          { bracketMatchKey: 'qf4', winner: 'D1' }, // user predicted D1, but D1 actually lost
          { bracketMatchKey: 'sf1', winner: 'A1' }, // C1 is sf1 loser → bronze home
          { bracketMatchKey: 'sf2', winner: 'B1' }, // D1 is sf2 loser → bronze away
          { bracketMatchKey: 'bronze', winner: 'C1' }, // C1 wins bronze
        ],
        finishScores: {},
      },
      [],
      [],
    );
    expect(bronzeMatch!.pickedOpponentId).toBe('D1');
    expect(bronzeMatch!.pickedOpponentStatus).toBe('busted');
  });

  it('marks pickedOpponentStatus as pending when opponent is not yet confirmed and not eliminated', () => {
    // qf1 played (A1 wins), but qf2/qf3/qf4 not played. Final opponent = B1 (from sf2).
    // B1 has not been eliminated (qf3 not yet played) → pending.
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [finalQf1], // only qf1 played
      {
        knockoutPicks: [
          { bracketMatchKey: 'qf1', winner: 'A1' },
          { bracketMatchKey: 'qf2', winner: 'C1' },
          { bracketMatchKey: 'qf3', winner: 'B1' },
          { bracketMatchKey: 'qf4', winner: 'D1' },
          { bracketMatchKey: 'sf1', winner: 'A1' },
          { bracketMatchKey: 'sf2', winner: 'B1' },
          { bracketMatchKey: 'final', winner: 'A1' },
        ],
        finishScores: {},
      },
      [],
      [],
    );
    const finalCard = bracketRounds.find((r) => r.label === 'Final')!.matches[0]!;
    expect(finalCard.pickedOpponentId).toBe('B1');
    expect(finalCard.pickedOpponentStatus).toBe('pending');
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

  it('sets predictedHomeTeamId=null and pickedWinnerId=implicit-winner when home-side chain is broken by early elimination', () => {
    // qf1 played: A1 (user's pick) loses to B2 → A1 eliminated.
    // User still has sf1=A1 (stale/inconsistent pick). sf1 predicted participants are [B2, C1]
    // (actual qf1 winner B2 + user's qf2 pick C1). A1 ∉ [B2, C1] → getSfLoser(sf1) returns null
    // → predictedHomeTeamId = null.
    //
    // No explicit bronze pick; score 3-1 (home wins). deriveImplicitFinaleWinner finds
    // sfLoser(sf1) = C1 (from raw qf1/qf2 picks: A1 === sf1Winner → skip → return C1).
    // So effectivePick = C1 (implicit winner) and pickedOpponentId = D1.
    //
    // This is the "Germany 3rd place" bug scenario:
    //   predictedAwayTeamId = D1 = pickedOpponentId
    //   → the old FinalResultCard fallback (pickedOpponent !== pickRight) returns null for the left slot.
    //   Fix: FinalResultCard now tries pickedWinnerId (C1) first when predictedHomeTeamId is null.
    const qf1Played = makeMatch('qf1', 'QF', {
      homeTeamId: 'A1',
      awayTeamId: 'B2',
      winnerTeamId: 'B2',
      homeGoals: 0,
      awayGoals: 1,
      status: 'final',
    });
    const { bronzeMatch } = buildBracketRounds(
      miniTournament,
      [qf1Played],
      {
        knockoutPicks: [
          { bracketMatchKey: 'qf1', winner: 'A1' }, // user predicted A1, but A1 actually lost
          { bracketMatchKey: 'qf2', winner: 'C1' },
          { bracketMatchKey: 'qf3', winner: 'B1' },
          { bracketMatchKey: 'qf4', winner: 'D1' },
          { bracketMatchKey: 'sf1', winner: 'A1' }, // stale pick — A1 was eliminated in qf1
          { bracketMatchKey: 'sf2', winner: 'B1' }, // D1 is sf2 loser → bronze away side
          // deliberately no explicit 'bronze' pick
        ],
        finishScores: { bronze: { home: 3, away: 1 } }, // home side (C1) wins
      },
      [],
      [],
    );
    expect(bronzeMatch).not.toBeNull();
    // sf1 chain broken: predicted sf1 participants are [B2, C1] (B2 = actual qf1 winner),
    // but sf1 pick = A1 ∉ [B2, C1] → loser derivation returns null → home slot unknown.
    expect(bronzeMatch!.predictedHomeTeamId).toBeNull();
    // sf2 chain intact: D1 is sf2 loser → bronze away slot is known.
    expect(bronzeMatch!.predictedAwayTeamId).toBe('D1');
    // Implicit winner: sfLoser(sf1) via raw picks = C1 (team2=C1 ≠ sfWinner=A1); score home>away → C1 wins.
    expect(bronzeMatch!.pickedWinnerId).toBe('C1');
    // Opponent: sfLoser(sf2) = D1; pickedWinner C1 = loser1 → opponent = loser2 = D1.
    // Note: pickedOpponentId === predictedAwayTeamId here — the exact condition that hid the
    // home-side team in FinalResultCard before the fix.
    expect(bronzeMatch!.pickedOpponentId).toBe('D1');
  });
});

describe("buildBracketRounds — pickedHomeTeamId/pickedAwayTeamId keep showing the user's own SF picks after real results diverge", () => {
  // Regression: once both SFs are actually played, the real winners get substituted into
  // homeTeamId/awayTeamId (and into predictedHomeTeamId/predictedAwayTeamId's source,
  // userPredictedParticipants). But the "Your pick" row must keep showing what the user
  // themselves predicted for Final/Bronze, even when the real SF2 result contradicts it.
  const sf1Real = makeMatch('sf1', 'SF', {
    homeTeamId: 'A1',
    awayTeamId: 'C1',
    winnerTeamId: 'A1',
    homeGoals: 2,
    awayGoals: 1,
    status: 'final',
  });
  // Real SF2 winner is D1 — but the user picked B1 to win sf2 (see knockoutPicks below).
  const sf2Real = makeMatch('sf2', 'SF', {
    homeTeamId: 'B1',
    awayTeamId: 'D1',
    winnerTeamId: 'D1',
    homeGoals: 1,
    awayGoals: 2,
    status: 'final',
  });
  const picks = [
    { bracketMatchKey: 'qf1', winner: 'A1' },
    { bracketMatchKey: 'qf2', winner: 'C1' },
    { bracketMatchKey: 'qf3', winner: 'B1' },
    { bracketMatchKey: 'qf4', winner: 'D1' },
    { bracketMatchKey: 'sf1', winner: 'A1' },
    { bracketMatchKey: 'sf2', winner: 'B1' }, // user's pick — actual sf2 winner is D1
  ];

  it("Final: shows the user's own predicted finalists (A1, B1), not the real finalists (A1, D1)", () => {
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [finalQf1, finalQf2, finalQf3, finalQf4, sf1Real, sf2Real],
      { knockoutPicks: picks, finishScores: {} },
      [],
      [],
    );
    const finalCard = bracketRounds.find((r) => r.label === 'Final')!.matches[0]!;
    // Sanity check: the real, confirmed Final participants are A1 and D1 (D1 actually won sf2).
    expect(finalCard.homeTeamId).toBe('A1');
    expect(finalCard.awayTeamId).toBe('D1');
    // But the user's own bracket picked A1 and B1 as finalists.
    expect(finalCard.pickedHomeTeamId).toBe('A1');
    expect(finalCard.pickedAwayTeamId).toBe('B1');
  });

  it("Bronze: shows the user's own predicted SF losers (C1, D1), not the real bronze pair (C1, B1)", () => {
    const { bronzeMatch } = buildBracketRounds(
      miniTournament,
      [finalQf1, finalQf2, finalQf3, finalQf4, sf1Real, sf2Real],
      { knockoutPicks: picks, finishScores: {} },
      [],
      [],
    );
    expect(bronzeMatch).not.toBeNull();
    // Real bronze pair: C1 (lost sf1) and B1 (lost sf2 for real).
    expect(bronzeMatch!.homeTeamId).toBe('C1');
    expect(bronzeMatch!.awayTeamId).toBe('B1');
    // User's own bracket: C1 lost sf1 (matches), but the user predicted B1 to WIN sf2,
    // so the user's own bronze pair is C1 and D1 (D1 = the team the user predicted to lose sf2).
    expect(bronzeMatch!.pickedHomeTeamId).toBe('C1');
    expect(bronzeMatch!.pickedAwayTeamId).toBe('D1');
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

describe('buildBracketRounds — homeTeamPredictedPct / awayTeamPredictedPct', () => {
  it('shows 0% (not hidden) for a team nobody in the pool picked to win its feeder match', () => {
    const qf1 = makeMatch('qf1', 'QF', {
      homeTeamId: 'A1',
      awayTeamId: 'B2',
      winnerTeamId: 'A1',
      homeGoals: 2,
      awayGoals: 0,
      status: 'final',
    });
    const qf2 = makeMatch('qf2', 'QF', {
      homeTeamId: 'C1',
      awayTeamId: 'D2',
      winnerTeamId: 'C1',
      homeGoals: 1,
      awayGoals: 0,
      status: 'final',
    });
    const qf3 = makeMatch('qf3', 'QF', {
      homeTeamId: 'B1',
      awayTeamId: 'A2',
      winnerTeamId: 'B1',
      homeGoals: 1,
      awayGoals: 0,
      status: 'final',
    });
    const qf4 = makeMatch('qf4', 'QF', {
      homeTeamId: 'D1',
      awayTeamId: 'C2',
      winnerTeamId: 'D1',
      homeGoals: 1,
      awayGoals: 0,
      status: 'final',
    });
    const sf1 = makeMatch('sf1', 'SF', {
      homeTeamId: 'A1',
      awayTeamId: 'C1',
      winnerTeamId: 'A1',
      homeGoals: 1,
      awayGoals: 0,
      status: 'final',
    });
    // Every pool user picked D1 to win sf2, but B1 upsets it — B1 reaches the Final with 0 pool picks.
    const sf2 = makeMatch('sf2', 'SF', {
      homeTeamId: 'B1',
      awayTeamId: 'D1',
      winnerTeamId: 'B1',
      homeGoals: 1,
      awayGoals: 0,
      status: 'final',
    });
    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bmk('sf1'), winnerTeamId: 'A1' },
      { userId: userId('u1'), bracketMatchKey: bmk('sf2'), winnerTeamId: 'D1' },
      { userId: userId('u2'), bracketMatchKey: bmk('sf1'), winnerTeamId: 'A1' },
      { userId: userId('u2'), bracketMatchKey: bmk('sf2'), winnerTeamId: 'D1' },
    ];
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [qf1, qf2, qf3, qf4, sf1, sf2],
      null,
      [],
      picks,
    );
    const finalMatch = bracketRounds.find((r) => r.label === 'Final')!.matches[0]!;

    expect(finalMatch.homeTeamId).toBe('A1');
    expect(finalMatch.awayTeamId).toBe('B1');
    expect(finalMatch.homeTeamPredictedPct).toBe(100);
    // B1 got zero picks in the pool for sf2, but that's a known (not missing) round — must be 0, not null.
    expect(finalMatch.awayTeamPredictedPct).toBe(0);
  });

  it('attributes pct by which SF the team actually won, not by home/away slot position', () => {
    // Same bracket as above, but the real "final" match row (as synced from the external
    // results feed) lists the sf2 winner (B1) as home and the sf1 winner (A1) as away —
    // the opposite order from the sf1/sf2 progression. Real-world home/away designation
    // (e.g. FIFA's official draw) is independent of which semifinal slot a team came from.
    const qf1 = makeMatch('qf1', 'QF', {
      homeTeamId: 'A1',
      awayTeamId: 'B2',
      winnerTeamId: 'A1',
      homeGoals: 2,
      awayGoals: 0,
      status: 'final',
    });
    const qf2 = makeMatch('qf2', 'QF', {
      homeTeamId: 'C1',
      awayTeamId: 'D2',
      winnerTeamId: 'C1',
      homeGoals: 1,
      awayGoals: 0,
      status: 'final',
    });
    const qf3 = makeMatch('qf3', 'QF', {
      homeTeamId: 'B1',
      awayTeamId: 'A2',
      winnerTeamId: 'B1',
      homeGoals: 1,
      awayGoals: 0,
      status: 'final',
    });
    const qf4 = makeMatch('qf4', 'QF', {
      homeTeamId: 'D1',
      awayTeamId: 'C2',
      winnerTeamId: 'D1',
      homeGoals: 1,
      awayGoals: 0,
      status: 'final',
    });
    const sf1 = makeMatch('sf1', 'SF', {
      homeTeamId: 'A1',
      awayTeamId: 'C1',
      winnerTeamId: 'A1',
      homeGoals: 1,
      awayGoals: 0,
      status: 'final',
    });
    const sf2 = makeMatch('sf2', 'SF', {
      homeTeamId: 'B1',
      awayTeamId: 'D1',
      winnerTeamId: 'B1',
      homeGoals: 1,
      awayGoals: 0,
      status: 'final',
    });
    // Real Final row: home/away order reversed vs. sf1/sf2 progression order (B1 = sf2 winner
    // is home; A1 = sf1 winner is away) — matches how an external feed reports home/away.
    const finalRow = makeMatch('final', 'Final', {
      homeTeamId: 'B1',
      awayTeamId: 'A1',
      status: 'scheduled',
    });
    // Almost everyone picked A1 to win sf1; almost nobody picked B1 to win sf2.
    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bmk('sf1'), winnerTeamId: 'A1' },
      { userId: userId('u1'), bracketMatchKey: bmk('sf2'), winnerTeamId: 'D1' },
      { userId: userId('u2'), bracketMatchKey: bmk('sf1'), winnerTeamId: 'A1' },
      { userId: userId('u2'), bracketMatchKey: bmk('sf2'), winnerTeamId: 'D1' },
    ];
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [qf1, qf2, qf3, qf4, sf1, sf2, finalRow],
      null,
      [],
      picks,
    );
    const finalMatch = bracketRounds.find((r) => r.label === 'Final')!.matches[0]!;

    expect(finalMatch.homeTeamId).toBe('B1');
    expect(finalMatch.awayTeamId).toBe('A1');
    // A1 (away slot) actually won sf1, where 100% of the pool picked it — must reflect that,
    // not the 0% for whichever team is positionally associated with sf1's slot.
    expect(finalMatch.awayTeamPredictedPct).toBe(100);
    // B1 (home slot) actually won sf2, where 0% of the pool picked it.
    expect(finalMatch.homeTeamPredictedPct).toBe(0);
  });
});

describe('buildBracketRounds — feeder pick busted (team not in upcoming entry-round match)', () => {
  // Scenario maps to the production bug:
  //   r32m86 (ARG vs CPV) → qf1 (A1 vs B2): user picks A1 — valid ✓
  //   r32m88 (AUS vs EGY) → qf2 (C1 vs D2): user picks X3 — NOT a participant ✗
  //   r16m95 → sf1: home predicted A1, away TBD — should expose the busted feeder pick teamId on awaySlotFeederPickedId
  it('sets awaySlotFeederPickedId to the busted pick teamId on sf1 when qf2 pick is not a match participant', () => {
    // No QF matches played yet; group stage settled so qf1=A1/B2, qf2=C1/D2 are derived.
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [],
      {
        knockoutPicks: [
          { bracketMatchKey: 'qf1', winner: 'A1' }, // valid: A1 is in qf1 (1A vs 2B)
          { bracketMatchKey: 'qf2', winner: 'X3' }, // invalid: X3 is not in qf2 (C1 vs D2)
          { bracketMatchKey: 'sf1', winner: 'A1' }, // user's SF pick
        ],
        finishScores: {},
      },
      [],
      [],
    );
    const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
    const sf1Card = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;

    // Home predicted team is A1 (user's qf1 pick propagated through)
    expect(sf1Card.predictedHomeTeamId).toBe('A1');
    // Away slot is empty — X3 is not a qf2 participant so no chain is possible
    expect(sf1Card.predictedAwayTeamId).toBeNull();
    expect(sf1Card.awayTeamId).toBeNull();
    // The away feeder pick is already definitively wrong → flag it
    expect(sf1Card.awaySlotFeederPickedId).toBe('X3');
    // The home feeder pick is valid → not flagged
    expect(sf1Card.homeSlotFeederPickedId).toBeNull();
  });

  it('does not flag feederPickBusted when qf2 pick is absent (no pick made)', () => {
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [],
      {
        knockoutPicks: [
          { bracketMatchKey: 'qf1', winner: 'A1' },
          // no qf2 pick
        ],
        finishScores: {},
      },
      [],
      [],
    );
    const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
    const sf1Card = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
    // No pick → TBD, not missed pick
    expect(sf1Card.awaySlotFeederPickedId).toBeNull();
  });

  it('does not flag feederPickBusted when the feeder pick is valid but match unplayed', () => {
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [],
      {
        knockoutPicks: [
          { bracketMatchKey: 'qf1', winner: 'A1' },
          { bracketMatchKey: 'qf2', winner: 'C1' }, // valid: C1 is in qf2
        ],
        finishScores: {},
      },
      [],
      [],
    );
    const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
    const sf1Card = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
    expect(sf1Card.awaySlotFeederPickedId).toBeNull();
    expect(sf1Card.homeSlotFeederPickedId).toBeNull();
  });

  it('does not flag feederPickBusted for entry-round cards', () => {
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [],
      {
        knockoutPicks: [{ bracketMatchKey: 'qf1', winner: 'X3' }],
        finishScores: {},
      },
      [],
      [],
    );
    const qfRound = bracketRounds.find((r) => r.label === 'QF')!;
    const qf1Card = qfRound.matches.find((m) => m.bracketMatchKey === 'qf1')!;
    expect(qf1Card.homeSlotFeederPickedId).toBeNull();
    expect(qf1Card.awaySlotFeederPickedId).toBeNull();
  });
});
