import { describe, it, expect } from 'vitest';
import { buildKnockoutMatrix } from './build-race-view';
import { miniTournament } from '@cup/engine/testing';
import { points } from '@cup/engine';
import type { UserId, BracketMatchKey } from '@cup/engine';
import type { LeaderboardEntry, PoolKnockoutPick } from '@cup/db';
import type { KnockoutMatchView, BracketRoundResultView } from '../domain/types';

function makeLeaderboardEntry(uid: string, displayName: string, pointsTotal = 0): LeaderboardEntry {
  return {
    userId: uid as UserId,
    displayName,
    pointsTotal: points(pointsTotal),
    breakdown: null,
    completionPercent: null,
  };
}

function makeKnockoutMatch(
  key: string,
  round: string,
  status: 'scheduled' | 'final',
  opts: {
    homeTeamId?: string;
    homeTeamName?: string;
    awayTeamId?: string;
    awayTeamName?: string;
    actualWinnerId?: string | null;
    kickoff?: string | null;
  } = {},
): KnockoutMatchView {
  return {
    bracketMatchKey: key,
    round,
    homeTeamId: opts.homeTeamId ?? null,
    homeTeamName: opts.homeTeamName ?? null,
    awayTeamId: opts.awayTeamId ?? null,
    awayTeamName: opts.awayTeamName ?? null,
    actualHome: null,
    actualAway: null,
    actualWinnerId: opts.actualWinnerId ?? null,
    actualWinnerName: null,
    kickoff: opts.kickoff ?? null,
    status,
    pickedWinnerId: null,
    pickedWinnerName: null,
    pickedOpponentId: null,
    pickedOpponentName: null,
    pickStatus: 'no-pick',
    predictedHome: null,
    predictedAway: null,
    hit: 'pending',
    projected: false,
    homeTeamConfirmed: true,
    awayTeamConfirmed: true,
    predictedHomeTeamId: null,
    predictedHomeTeamName: null,
    predictedAwayTeamId: null,
    predictedAwayTeamName: null,
    isEntryRound: false,
    homeTeamR32Pct: null,
    awayTeamR32Pct: null,
  };
}

function makePick(uid: string, key: string, winnerTeamId: string): PoolKnockoutPick {
  return {
    userId: uid as UserId,
    bracketMatchKey: key as BracketMatchKey,
    winnerTeamId,
  };
}

function makeRound(label: string, matches: KnockoutMatchView[]): BracketRoundResultView {
  return { label, matches };
}

describe('buildKnockoutMatrix', () => {
  it('returns empty arrays when there are no matches and no players', () => {
    const { knockoutMatrix, knockoutMatrixMatches } = buildKnockoutMatrix({
      leaderboard: [],
      userId: null,
      bracketRounds: [],
      bronzeMatch: null,
      poolKnockoutPicks: [],
      def: miniTournament,
    });
    expect(knockoutMatrix).toHaveLength(0);
    expect(knockoutMatrixMatches).toHaveLength(0);
  });

  it('produces a hit cell when the user correctly picked the winner of a final match', () => {
    const alice = makeLeaderboardEntry('u1', 'Alice');
    const sfMatch = makeKnockoutMatch('sf1', 'SF', 'final', { actualWinnerId: 'A1' });

    const { knockoutMatrix, knockoutMatrixMatches } = buildKnockoutMatrix({
      leaderboard: [alice],
      userId: 'u1',
      bracketRounds: [makeRound('SF', [sfMatch])],
      bronzeMatch: null,
      poolKnockoutPicks: [makePick('u1', 'sf1', 'A1')],
      def: miniTournament,
    });

    expect(knockoutMatrixMatches).toHaveLength(1);
    expect(knockoutMatrixMatches[0]!.bracketMatchKey).toBe('sf1');
    expect(knockoutMatrixMatches[0]!.round).toBe('SF');
    expect(knockoutMatrixMatches[0]!.status).toBe('final');

    expect(knockoutMatrix).toHaveLength(1);
    const cell = knockoutMatrix[0]!.cells[0]!;
    expect(cell.hit).toBe('hit');
  });

  it('awards final.perTeam points for a correct SF pick', () => {
    const alice = makeLeaderboardEntry('u1', 'Alice');
    const sfMatch = makeKnockoutMatch('sf1', 'SF', 'final', { actualWinnerId: 'A1' });

    const { knockoutMatrix } = buildKnockoutMatrix({
      leaderboard: [alice],
      userId: null,
      bracketRounds: [makeRound('SF', [sfMatch])],
      bronzeMatch: null,
      poolKnockoutPicks: [makePick('u1', 'sf1', 'A1')],
      def: miniTournament,
    });

    const cell = knockoutMatrix[0]!.cells[0]!;
    expect(cell.points).toBe(miniTournament.scoring.final.perTeam); // 5
    expect(knockoutMatrix[0]!.totalPoints).toBe(miniTournament.scoring.final.perTeam);
  });

  it('produces a miss cell when the user picked the wrong winner', () => {
    const alice = makeLeaderboardEntry('u1', 'Alice');
    const qfMatch = makeKnockoutMatch('qf1', 'QF', 'final', { actualWinnerId: 'A1' });

    const { knockoutMatrix } = buildKnockoutMatrix({
      leaderboard: [alice],
      userId: null,
      bracketRounds: [makeRound('QF', [qfMatch])],
      bronzeMatch: null,
      poolKnockoutPicks: [makePick('u1', 'qf1', 'B2')],
      def: miniTournament,
    });

    const cell = knockoutMatrix[0]!.cells[0]!;
    expect(cell.hit).toBe('miss');
    expect(cell.points).toBe(0);
    expect(cell.pickedWinnerId).toBe('B2');
  });

  it('produces a no-pick cell when the match is final but the user has no pick', () => {
    const alice = makeLeaderboardEntry('u1', 'Alice');
    const qfMatch = makeKnockoutMatch('qf1', 'QF', 'final', { actualWinnerId: 'A1' });

    const { knockoutMatrix } = buildKnockoutMatrix({
      leaderboard: [alice],
      userId: null,
      bracketRounds: [makeRound('QF', [qfMatch])],
      bronzeMatch: null,
      poolKnockoutPicks: [],
      def: miniTournament,
    });

    const cell = knockoutMatrix[0]!.cells[0]!;
    expect(cell.hit).toBe('no-pick');
    expect(cell.points).toBe(0);
    expect(cell.pickedWinnerId).toBeNull();
  });

  it('produces a pending cell when the match has not yet been played', () => {
    const alice = makeLeaderboardEntry('u1', 'Alice');
    const qfMatch = makeKnockoutMatch('qf1', 'QF', 'scheduled');

    const { knockoutMatrix } = buildKnockoutMatrix({
      leaderboard: [alice],
      userId: null,
      bracketRounds: [makeRound('QF', [qfMatch])],
      bronzeMatch: null,
      poolKnockoutPicks: [makePick('u1', 'qf1', 'A1')],
      def: miniTournament,
    });

    const cell = knockoutMatrix[0]!.cells[0]!;
    expect(cell.hit).toBe('pending');
    expect(cell.points).toBe(0);
    expect(cell.pickedWinnerId).toBe('A1');
  });

  it('includes bronze match and gives bronze.perTeam points for a hit', () => {
    const alice = makeLeaderboardEntry('u1', 'Alice');
    const bronze = makeKnockoutMatch('bronze', 'Bronze', 'final', { actualWinnerId: 'C1' });

    const { knockoutMatrix, knockoutMatrixMatches } = buildKnockoutMatrix({
      leaderboard: [alice],
      userId: null,
      bracketRounds: [],
      bronzeMatch: bronze,
      poolKnockoutPicks: [makePick('u1', 'bronze', 'C1')],
      def: miniTournament,
    });

    expect(knockoutMatrixMatches).toHaveLength(1);
    const cell = knockoutMatrix[0]!.cells[0]!;
    expect(cell.hit).toBe('hit');
    expect(cell.points).toBe(miniTournament.scoring.bronze.perTeam); // 5
  });

  it('sorts knockoutMatrix entries by totalPoints DESC', () => {
    const alice = makeLeaderboardEntry('u1', 'Alice');
    const bob = makeLeaderboardEntry('u2', 'Bob');
    const sfMatch = makeKnockoutMatch('sf1', 'SF', 'final', { actualWinnerId: 'A1' });

    const { knockoutMatrix } = buildKnockoutMatrix({
      leaderboard: [alice, bob],
      userId: null,
      bracketRounds: [makeRound('SF', [sfMatch])],
      bronzeMatch: null,
      poolKnockoutPicks: [
        makePick('u1', 'sf1', 'B1'), // miss → 0 pts
        makePick('u2', 'sf1', 'A1'), // hit → 5 pts
      ],
      def: miniTournament,
    });

    expect(knockoutMatrix[0]!.userId).toBe('u2');
    expect(knockoutMatrix[1]!.userId).toBe('u1');
  });

  it('sorts knockoutMatrixMatches by kickoff ascending, nulls last', () => {
    const alice = makeLeaderboardEntry('u1', 'Alice');
    const qf1 = makeKnockoutMatch('qf1', 'QF', 'final', { kickoff: '2026-07-05T15:00:00.000Z' });
    const qf2 = makeKnockoutMatch('qf2', 'QF', 'final', { kickoff: '2026-07-04T15:00:00.000Z' });
    const qf3 = makeKnockoutMatch('qf3', 'QF', 'scheduled', { kickoff: null });

    const { knockoutMatrixMatches } = buildKnockoutMatrix({
      leaderboard: [alice],
      userId: null,
      bracketRounds: [makeRound('QF', [qf1, qf2, qf3])],
      bronzeMatch: null,
      poolKnockoutPicks: [],
      def: miniTournament,
    });

    expect(knockoutMatrixMatches[0]!.bracketMatchKey).toBe('qf2'); // earlier date
    expect(knockoutMatrixMatches[1]!.bracketMatchKey).toBe('qf1'); // later date
    expect(knockoutMatrixMatches[2]!.bracketMatchKey).toBe('qf3'); // null last
  });

  it('marks isCurrentUser correctly', () => {
    const alice = makeLeaderboardEntry('u1', 'Alice');
    const bob = makeLeaderboardEntry('u2', 'Bob');

    const { knockoutMatrix } = buildKnockoutMatrix({
      leaderboard: [alice, bob],
      userId: 'u1',
      bracketRounds: [],
      bronzeMatch: null,
      poolKnockoutPicks: [],
      def: miniTournament,
    });

    const aliceEntry = knockoutMatrix.find((e) => e.userId === 'u1')!;
    const bobEntry = knockoutMatrix.find((e) => e.userId === 'u2')!;
    expect(aliceEntry.isCurrentUser).toBe(true);
    expect(bobEntry.isCurrentUser).toBe(false);
  });

  it('credits a hit when the actual winner was picked in a different slot of the same round', () => {
    // User predicted FRA to win qf1, but FRA actually played and won qf2.
    // The matrix should still credit a hit for qf2 (and miss for qf1).
    const alice = makeLeaderboardEntry('u1', 'Alice');
    const qf1 = makeKnockoutMatch('qf1', 'QF', 'final', { actualWinnerId: 'GER' });
    const qf2 = makeKnockoutMatch('qf2', 'QF', 'final', { actualWinnerId: 'FRA' });

    const { knockoutMatrix } = buildKnockoutMatrix({
      leaderboard: [alice],
      userId: null,
      bracketRounds: [makeRound('QF', [qf1, qf2])],
      bronzeMatch: null,
      // User picked FRA for qf1, GER for qf2 — both teams advanced, just in swapped slots
      poolKnockoutPicks: [makePick('u1', 'qf1', 'FRA'), makePick('u1', 'qf2', 'GER')],
      def: miniTournament,
    });

    const qf1Cell = knockoutMatrix[0]!.cells.find((c) => c.bracketMatchKey === 'qf1')!;
    const qf2Cell = knockoutMatrix[0]!.cells.find((c) => c.bracketMatchKey === 'qf2')!;
    // GER won qf1; user had GER in QF picks (for qf2) → hit
    expect(qf1Cell.hit).toBe('hit');
    // FRA won qf2; user had FRA in QF picks (for qf1) → hit
    expect(qf2Cell.hit).toBe('hit');
  });

  it('QF picks give 0 points (topFour is holistic scoring in mini-tournament)', () => {
    const alice = makeLeaderboardEntry('u1', 'Alice');
    const qfMatch = makeKnockoutMatch('qf1', 'QF', 'final', { actualWinnerId: 'A1' });

    const { knockoutMatrix } = buildKnockoutMatrix({
      leaderboard: [alice],
      userId: null,
      bracketRounds: [makeRound('QF', [qfMatch])],
      bronzeMatch: null,
      poolKnockoutPicks: [makePick('u1', 'qf1', 'A1')],
      def: miniTournament,
    });

    const cell = knockoutMatrix[0]!.cells[0]!;
    expect(cell.hit).toBe('hit');
    expect(cell.points).toBe(0);
    expect(knockoutMatrix[0]!.totalPoints).toBe(0);
  });
});
