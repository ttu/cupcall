import { describe, it, expect } from 'vitest';
import type { MatchRow } from '@cup/db';
import type { PoolKnockoutPick } from '@cup/db';
import { userId, points, bracketMatchKey, tournamentId } from '@cup/engine';
import { miniTournament } from '@cup/engine/testing';
import {
  buildKnockoutSlotDeltasForTest,
  buildKnockoutMilestoneDeltasForTest,
  buildLastDayPoints,
} from '@/shared/race-chart';

// Minimal MatchRow factory for knockout matches
function makeKnockoutMatch(
  id: string,
  status: MatchRow['status'],
  kickoff: Date | null,
  winnerTeamId: string | null,
): MatchRow {
  return {
    id,
    tournamentId: tournamentId('t1'),
    stage: 'R32',
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff,
    homeGoals: null,
    awayGoals: null,
    homeConduct: null,
    awayConduct: null,
    winnerTeamId,
    decidedBy: null,
    status,
  };
}

// A minimal Tournament-shaped fixture that HAS an R16 round.
// We only need bracket.slots, bracket.roundOf16Matches, and scoring.roundOf16PerTeam.
const defWithR16 = {
  ...miniTournament,
  bracket: {
    ...miniTournament.bracket,
    roundOf16Matches: ['r16m1', 'r16m2'] as ReturnType<typeof bracketMatchKey>[],
    slots: [
      { match: bracketMatchKey('r32m1'), home: '1A', away: '2B' },
      { match: bracketMatchKey('r32m2'), home: '1C', away: '2D' },
    ],
  },
  scoring: { ...miniTournament.scoring, roundOf16PerTeam: 3 },
};

describe('buildKnockoutSlotDeltasForTest', () => {
  it('credits roundOf16PerTeam to user who picked the winner on match day', () => {
    const matches = [makeKnockoutMatch('r32m1', 'final', new Date('2026-06-29T18:00:00Z'), 'GER')];
    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bracketMatchKey('r32m1'), winnerTeamId: 'GER' },
    ];

    const deltas = buildKnockoutSlotDeltasForTest(picks, matches, defWithR16);

    expect(deltas.get(userId('u1'))?.get('2026-06-29')).toBe(3);
  });

  it('credits nothing for a wrong pick', () => {
    const matches = [makeKnockoutMatch('r32m1', 'final', new Date('2026-06-29T18:00:00Z'), 'GER')];
    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bracketMatchKey('r32m1'), winnerTeamId: 'FRA' },
    ];

    const deltas = buildKnockoutSlotDeltasForTest(picks, matches, defWithR16);

    expect(deltas.get(userId('u1'))).toBeUndefined();
  });

  it('credits nothing when match is not yet final', () => {
    const matches = [
      makeKnockoutMatch('r32m1', 'scheduled', new Date('2026-06-29T18:00:00Z'), null),
    ];
    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bracketMatchKey('r32m1'), winnerTeamId: 'GER' },
    ];

    const deltas = buildKnockoutSlotDeltasForTest(picks, matches, defWithR16);

    expect(deltas.get(userId('u1'))).toBeUndefined();
  });

  it('accumulates points across multiple matches on the same day', () => {
    const matches = [
      makeKnockoutMatch('r32m1', 'final', new Date('2026-06-29T15:00:00Z'), 'GER'),
      makeKnockoutMatch('r32m2', 'final', new Date('2026-06-29T19:00:00Z'), 'BRA'),
    ];
    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bracketMatchKey('r32m1'), winnerTeamId: 'GER' },
      { userId: userId('u1'), bracketMatchKey: bracketMatchKey('r32m2'), winnerTeamId: 'BRA' },
    ];

    const deltas = buildKnockoutSlotDeltasForTest(picks, matches, defWithR16);

    expect(deltas.get(userId('u1'))?.get('2026-06-29')).toBe(6); // 3 + 3
  });

  it('credits different users independently on separate days', () => {
    const matches = [
      makeKnockoutMatch('r32m1', 'final', new Date('2026-06-28T18:00:00Z'), 'GER'),
      makeKnockoutMatch('r32m2', 'final', new Date('2026-06-29T18:00:00Z'), 'BRA'),
    ];
    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bracketMatchKey('r32m1'), winnerTeamId: 'GER' },
      { userId: userId('u2'), bracketMatchKey: bracketMatchKey('r32m2'), winnerTeamId: 'BRA' },
    ];

    const deltas = buildKnockoutSlotDeltasForTest(picks, matches, defWithR16);

    expect(deltas.get(userId('u1'))?.get('2026-06-28')).toBe(3);
    expect(deltas.get(userId('u2'))?.get('2026-06-29')).toBe(3);
    expect(deltas.get(userId('u1'))?.get('2026-06-29')).toBeUndefined();
  });

  it('credits user when they predicted the correct teams via cross-slot swap', () => {
    // User predicted GER for r32m1 and FRA for r32m2.
    // Actual: FRA wins r32m1, GER wins r32m2 (cross-slot swap).
    // Engine scoreRoundOf16 is set-based — {GER, FRA} ∩ {FRA, GER} = 2 teams credited.
    const matches = [
      makeKnockoutMatch('r32m1', 'final', new Date('2026-06-29T15:00:00Z'), 'FRA'),
      makeKnockoutMatch('r32m2', 'final', new Date('2026-06-29T19:00:00Z'), 'GER'),
    ];
    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bracketMatchKey('r32m1'), winnerTeamId: 'GER' },
      { userId: userId('u1'), bracketMatchKey: bracketMatchKey('r32m2'), winnerTeamId: 'FRA' },
    ];

    const deltas = buildKnockoutSlotDeltasForTest(picks, matches, defWithR16);

    // Both actual winners (FRA, GER) are in user's predicted set → 2 × 3 = 6
    expect(deltas.get(userId('u1'))?.get('2026-06-29')).toBe(6);
  });

  it('returns empty map for a tournament without an R16 round', () => {
    const matches = [makeKnockoutMatch('qf1', 'final', new Date('2026-06-29T18:00:00Z'), 'A1')];
    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bracketMatchKey('qf1'), winnerTeamId: 'A1' },
    ];

    // miniTournament has roundOf16Matches: [] — no R16 round
    const deltas = buildKnockoutSlotDeltasForTest(picks, matches, miniTournament);

    expect(deltas.size).toBe(0);
  });
});

describe('buildKnockoutMilestoneDeltasForTest', () => {
  const entry = {
    userId: userId('u1'),
    displayName: 'Alice',
    pointsTotal: points(30),
    completionPercent: 100,
    breakdown: {
      groupMatches: points(0),
      groupOrder: points(0),
      roundOf16: points(6), // should NOT appear here — handled by slot deltas
      roundOf8: points(9),
      topFour: points(5),
      final: points(10),
      bronze: points(0),
      specials: points(5),
      total: points(35),
    },
  };

  // Local fixture — 4 R16 matches + 2 QF matches; distinct from module-level defWithR16 (Task 1)
  const milestoneR16Matches = ['r16m1', 'r16m2', 'r16m3', 'r16m4'] as ReturnType<
    typeof bracketMatchKey
  >[];
  const milestoneQFMatches = ['qf1', 'qf2'] as ReturnType<typeof bracketMatchKey>[];
  const milestoneDef = {
    ...miniTournament,
    bracket: {
      ...miniTournament.bracket,
      roundOf16Matches: milestoneR16Matches,
      roundOf8Matches: milestoneQFMatches,
    },
  };

  it('attributes roundOf8 to R16 completion date (not QF completion) when R16 exists', () => {
    // All R16 matches done on Jun 29; QF matches done on Jul 3
    const allMatches: MatchRow[] = [
      ...milestoneR16Matches.map((id, i) =>
        makeKnockoutMatch(id, 'final', new Date(`2026-06-29T${10 + i}:00:00Z`), 'T1'),
      ),
      ...milestoneQFMatches.map((id) =>
        makeKnockoutMatch(id, 'final', new Date('2026-07-03T18:00:00Z'), 'T1'),
      ),
      makeKnockoutMatch('final', 'final', new Date('2026-07-10T18:00:00Z'), 'T1'),
      makeKnockoutMatch('bronze', 'final', new Date('2026-07-09T18:00:00Z'), 'T1'),
    ];

    const deltas = buildKnockoutMilestoneDeltasForTest([entry], allMatches, milestoneDef);

    // roundOf8 credited to Jun 29 (last R16 match day), NOT Jul 3
    expect(deltas.get(userId('u1'))?.get('2026-06-29')).toBe(9);
    expect(deltas.get(userId('u1'))?.get('2026-07-03')).toBeUndefined();
  });

  it('does NOT attribute roundOf16 points (handled by slot deltas instead)', () => {
    const allMatches: MatchRow[] = [
      ...milestoneR16Matches.map((id) =>
        makeKnockoutMatch(id, 'final', new Date('2026-06-29T18:00:00Z'), 'T1'),
      ),
      makeKnockoutMatch('final', 'final', new Date('2026-07-10T18:00:00Z'), 'T1'),
      makeKnockoutMatch('bronze', 'final', new Date('2026-07-09T18:00:00Z'), 'T1'),
    ];

    const deltas = buildKnockoutMilestoneDeltasForTest([entry], allMatches, milestoneDef);

    // roundOf16 = 6 should NOT appear on any date
    const allPoints = [...(deltas.get(userId('u1'))?.values() ?? [])];
    const total = allPoints.reduce((a, b) => a + b, 0);
    // roundOf8(9) + topFour(5) + final(10) + specials(5) = 29; roundOf16(6) NOT included
    expect(total).toBe(29);
  });

  it('keeps current roundOf8 date for tournaments without R16 (mini-tournament)', () => {
    // mini-tournament: roundOf16Matches = [], roundOf8Matches = [qf1,qf2,qf3,qf4]
    const qfDoneMatch = makeKnockoutMatch('qf1', 'final', new Date('2026-06-25T18:00:00Z'), 'A1');
    const allMatches: MatchRow[] = [
      qfDoneMatch,
      makeKnockoutMatch('qf2', 'final', new Date('2026-06-25T20:00:00Z'), 'B1'),
      makeKnockoutMatch('qf3', 'final', new Date('2026-06-26T18:00:00Z'), 'C1'),
      makeKnockoutMatch('qf4', 'final', new Date('2026-06-26T20:00:00Z'), 'D1'),
      makeKnockoutMatch('final', 'final', new Date('2026-06-28T18:00:00Z'), 'A1'),
      makeKnockoutMatch('bronze', 'final', new Date('2026-06-27T18:00:00Z'), 'B1'),
    ];

    const miniEntry = { ...entry };
    const deltas = buildKnockoutMilestoneDeltasForTest([miniEntry], allMatches, miniTournament);

    // For mini, roundOf8 credited when all 4 QF matches done = Jun 26
    expect(deltas.get(userId('u1'))?.get('2026-06-26')).toBe(9);
  });
});

describe('buildLastDayPoints during knockout (R32) phase', () => {
  const tournamentWithR16 = defWithR16; // defined above in this file

  it('returns slot-win points for the last complete R32 match day', () => {
    // Jun 29: two R32 matches (both final). Jun 30: one match still scheduled.
    const allMatches: MatchRow[] = [
      makeKnockoutMatch('r32m1', 'final', new Date('2026-06-29T15:00:00Z'), 'GER'),
      makeKnockoutMatch('r32m2', 'final', new Date('2026-06-29T19:00:00Z'), 'BRA'),
      makeKnockoutMatch('r16m1', 'scheduled', null, null),
      makeKnockoutMatch('r16m2', 'scheduled', null, null),
    ];

    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bracketMatchKey('r32m1'), winnerTeamId: 'GER' }, // correct
      { userId: userId('u1'), bracketMatchKey: bracketMatchKey('r32m2'), winnerTeamId: 'ARG' }, // wrong
      { userId: userId('u2'), bracketMatchKey: bracketMatchKey('r32m1'), winnerTeamId: 'FRA' }, // wrong
      { userId: userId('u2'), bracketMatchKey: bracketMatchKey('r32m2'), winnerTeamId: 'BRA' }, // correct
    ];

    const leaderboard = [
      {
        userId: userId('u1'),
        displayName: 'Alice',
        pointsTotal: points(3),
        completionPercent: 50,
        breakdown: null,
      },
      {
        userId: userId('u2'),
        displayName: 'Bob',
        pointsTotal: points(3),
        completionPercent: 50,
        breakdown: null,
      },
    ];

    const result = buildLastDayPoints(leaderboard, allMatches, [], tournamentWithR16, picks);

    expect(result).not.toBeNull();
    expect(result!.date).toBe('2026-06-29');
    expect(result!.pointsByUser[userId('u1')]).toBe(3); // 1 correct × roundOf16PerTeam(3)
    expect(result!.pointsByUser[userId('u2')]).toBe(3); // 1 correct × roundOf16PerTeam(3)
  });

  it('returns null when no complete match day exists yet', () => {
    const allMatches: MatchRow[] = [
      makeKnockoutMatch('r32m1', 'scheduled', new Date('2026-07-01T18:00:00Z'), null),
    ];

    const result = buildLastDayPoints([], allMatches, [], tournamentWithR16, []);

    expect(result).toBeNull();
  });
});
