import { describe, it, expect } from 'vitest';
import {
  buildKnockoutMatrix,
  buildSpecialsMatrix,
  buildProjectedEntries,
  buildPerUserSpecialsRemaining,
  buildPointsRaceView,
} from './build-race-view';
import { computeSpecialBetImpossibility } from '../domain/special-bet-impossibility';
import { miniTournament } from '@cup/engine/testing';
import { points } from '@cup/engine';
import type { UserId, BracketMatchKey, ActualResults } from '@cup/engine';
import type {
  LeaderboardEntry,
  PoolKnockoutPick,
  PoolSpecialBet,
  PoolFinishScore,
  MatchRow,
} from '@cup/db';
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
    actualHome?: number | null;
    actualAway?: number | null;
    kickoff?: string | null;
  } = {},
): KnockoutMatchView {
  return {
    bracketMatchKey: key,
    round,
    homeTeamId: opts.homeTeamId ?? null,
    homeTeamName: opts.homeTeamName ?? null,
    homeTeamFifaRanking: null,
    awayTeamId: opts.awayTeamId ?? null,
    awayTeamName: opts.awayTeamName ?? null,
    awayTeamFifaRanking: null,
    actualHome: opts.actualHome ?? null,
    actualAway: opts.actualAway ?? null,
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
    predictedGoalsByTeam: null,
    hit: 'pending',
    points: 0,
    projected: false,
    homeTeamConfirmed: true,
    awayTeamConfirmed: true,
    predictedHomeTeamId: null,
    predictedHomeTeamName: null,
    predictedAwayTeamId: null,
    predictedAwayTeamName: null,
    pickedHomeTeamId: null,
    pickedHomeTeamName: null,
    pickedAwayTeamId: null,
    pickedAwayTeamName: null,
    isEntryRound: false,
    homeTeamPredictedPct: null,
    awayTeamPredictedPct: null,
    homeTeamUserPredictedParticipant: false,
    awayTeamUserPredictedParticipant: false,
    poolPickHomePct: null,
    poolPickAwayPct: null,
    pickedOpponentStatus: 'no-pick',
    homeSlotFeederPickedId: null,
    awaySlotFeederPickedId: null,
    decidedBy: null,
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

function makeFinishScore(
  uid: string,
  match: 'final' | 'bronze',
  home: number,
  away: number,
  teamIds?: { homeTeamId: string; awayTeamId: string },
): PoolFinishScore {
  return {
    userId: uid as UserId,
    match,
    home,
    away,
    homeTeamId: teamIds?.homeTeamId ?? null,
    awayTeamId: teamIds?.awayTeamId ?? null,
  };
}

describe('buildKnockoutMatrix', () => {
  it('returns empty arrays when there are no matches and no players', () => {
    const { knockoutMatrix, knockoutMatrixMatches } = buildKnockoutMatrix({
      leaderboard: [],
      userId: null,
      bracketRounds: [],
      bronzeMatch: null,
      poolKnockoutPicks: [],
      poolFinishScores: [],
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
      poolFinishScores: [],
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
      poolFinishScores: [],
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
      poolFinishScores: [],
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
      poolFinishScores: [],
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
      poolFinishScores: [],
      def: miniTournament,
    });

    const cell = knockoutMatrix[0]!.cells[0]!;
    expect(cell.hit).toBe('pending');
    expect(cell.points).toBe(0);
    expect(cell.pickedWinnerId).toBe('A1');
  });

  it('produces an impossible cell when the match is pending, both teams are known, and the pick is neither', () => {
    const alice = makeLeaderboardEntry('u1', 'Alice');
    // Both teams are already confirmed for this QF match
    const qfMatch = makeKnockoutMatch('qf1', 'QF', 'scheduled', {
      homeTeamId: 'BRA',
      awayTeamId: 'ARG',
    });

    const { knockoutMatrix } = buildKnockoutMatrix({
      leaderboard: [alice],
      userId: null,
      bracketRounds: [makeRound('QF', [qfMatch])],
      bronzeMatch: null,
      poolKnockoutPicks: [makePick('u1', 'qf1', 'ESP')], // ESP is not a participant
      poolFinishScores: [],
      def: miniTournament,
    });

    const cell = knockoutMatrix[0]!.cells[0]!;
    expect(cell.hit).toBe('impossible');
    expect(cell.points).toBe(0);
    expect(cell.pickedWinnerId).toBe('ESP');
  });

  it('shows the cross-slot team when the raw slot pick no longer matches the real fixture', () => {
    // Hexa's group-order prediction routed Norway into what turned out, in reality, to be the
    // France vs Sweden R32 slot. Hexa separately predicted France to win a different R32 slot.
    // The match summary for the real France vs Sweden fixture should show France (the team Hexa
    // actually picked to win this fixture), not the raw "NOR" stored against this slot.
    const hexa = makeLeaderboardEntry('u1', 'Hexa');
    const franceSweden = makeKnockoutMatch('ro32-3', 'R32', 'final', {
      homeTeamId: 'FRA',
      awayTeamId: 'SWE',
      actualWinnerId: 'FRA',
    });
    const otherSlot = makeKnockoutMatch('ro32-7', 'R32', 'scheduled');

    const { knockoutMatrix } = buildKnockoutMatrix({
      leaderboard: [hexa],
      userId: null,
      bracketRounds: [makeRound('R32', [franceSweden, otherSlot])],
      bronzeMatch: null,
      poolKnockoutPicks: [makePick('u1', 'ro32-3', 'NOR'), makePick('u1', 'ro32-7', 'FRA')],
      poolFinishScores: [],
      def: miniTournament,
    });

    const cell = knockoutMatrix[0]!.cells.find((c) => c.bracketMatchKey === 'ro32-3')!;
    expect(cell.pickedWinnerId).toBe('FRA');
    expect(cell.hit).toBe('hit');
  });

  it('includes bronze match as Teams/Score columns and gives bronze.perTeam points for a correct team', () => {
    const alice = makeLeaderboardEntry('u1', 'Alice');
    const bronze = makeKnockoutMatch('bronze', 'Bronze', 'final', {
      homeTeamId: 'C1',
      awayTeamId: 'D1',
      actualWinnerId: 'C1',
    });

    const { knockoutMatrix, knockoutMatrixMatches } = buildKnockoutMatrix({
      leaderboard: [alice],
      userId: null,
      bracketRounds: [],
      bronzeMatch: bronze,
      poolKnockoutPicks: [makePick('u1', 'bronze', 'C1')],
      poolFinishScores: [],
      def: miniTournament,
    });

    expect(knockoutMatrixMatches).toHaveLength(2);
    const teamsCell = knockoutMatrix[0]!.cells.find((c) => c.bracketMatchKey === 'bronze:teams')!;
    expect(teamsCell.hit).toBe('hit');
    expect(teamsCell.points).toBe(miniTournament.scoring.bronze.perTeam); // 5 (only C1 derivable, D1 unknown)
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
      poolFinishScores: [],
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
      poolFinishScores: [],
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
      poolFinishScores: [],
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
      poolFinishScores: [],
      def: miniTournament,
    });

    const qf1Cell = knockoutMatrix[0]!.cells.find((c) => c.bracketMatchKey === 'qf1')!;
    const qf2Cell = knockoutMatrix[0]!.cells.find((c) => c.bracketMatchKey === 'qf2')!;
    // GER won qf1; user had GER in QF picks (for qf2) → hit
    expect(qf1Cell.hit).toBe('hit');
    // FRA won qf2; user had FRA in QF picks (for qf1) → hit
    expect(qf2Cell.hit).toBe('hit');
  });

  it('credits roundOf4PerTeam for a correct QF pick (topFour reward, since QF winners become semifinalists)', () => {
    const alice = makeLeaderboardEntry('u1', 'Alice');
    const qfMatch = makeKnockoutMatch('qf1', 'QF', 'final', { actualWinnerId: 'A1' });

    const { knockoutMatrix } = buildKnockoutMatrix({
      leaderboard: [alice],
      userId: null,
      bracketRounds: [makeRound('QF', [qfMatch])],
      bronzeMatch: null,
      poolKnockoutPicks: [makePick('u1', 'qf1', 'A1')],
      poolFinishScores: [],
      def: miniTournament,
    });

    const cell = knockoutMatrix[0]!.cells[0]!;
    expect(cell.hit).toBe('hit');
    expect(cell.points).toBe(miniTournament.scoring.roundOf4PerTeam);
    expect(knockoutMatrix[0]!.totalPoints).toBe(miniTournament.scoring.roundOf4PerTeam);
  });

  describe('final/bronze: effective pick derived from finish score', () => {
    it('derives pickedWinnerId from home win in a non-tied final score (pending match)', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'scheduled', {
        homeTeamId: 'USA',
        awayTeamId: 'BRA',
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        // Stale knockoutPick pointing to away team — should be overridden by finish score
        poolKnockoutPicks: [makePick('u1', 'final', 'BRA')],
        poolFinishScores: [makeFinishScore('u1', 'final', 2, 1)],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.hit).toBe('pending');
      expect(cell.pickedWinnerId).toBe('USA');
    });

    it('derives pickedWinnerId from away win in a non-tied final score (pending match)', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'scheduled', {
        homeTeamId: 'USA',
        awayTeamId: 'BRA',
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [],
        poolFinishScores: [makeFinishScore('u1', 'final', 0, 3)],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.pickedWinnerId).toBe('BRA');
    });

    it('derives pickedWinnerId from the finish score even when the actual winner matches (non-tied)', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'final', {
        homeTeamId: 'USA',
        awayTeamId: 'BRA',
        actualWinnerId: 'USA',
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        // Stale knockoutPick pointing to BRA — should be overridden; USA wins 2-1
        poolKnockoutPicks: [makePick('u1', 'final', 'BRA')],
        poolFinishScores: [makeFinishScore('u1', 'final', 2, 1)],
        def: miniTournament,
      });

      // Final's only matrix column is Final·Score, which needs actualHome/actualAway (not set on
      // this fixture) to ever register a hit — so hit isn't asserted here. pickedWinnerId is.
      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.pickedWinnerId).toBe('USA');
    });

    it('scores a miss when the actual winner does not match the finish-score-derived pick', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'final', {
        homeTeamId: 'USA',
        awayTeamId: 'BRA',
        actualWinnerId: 'BRA',
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [],
        poolFinishScores: [makeFinishScore('u1', 'final', 2, 1)],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.hit).toBe('miss');
      expect(cell.pickedWinnerId).toBe('USA');
    });

    it('uses knockoutPick.winner when finish score is tied (explicit penalty pick)', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'scheduled', {
        homeTeamId: 'USA',
        awayTeamId: 'BRA',
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [makePick('u1', 'final', 'BRA')],
        poolFinishScores: [makeFinishScore('u1', 'final', 1, 1)],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.pickedWinnerId).toBe('BRA');
    });

    it('shows null pickedWinnerId when finish score is tied and no explicit winner pick exists', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'scheduled', {
        homeTeamId: 'USA',
        awayTeamId: 'BRA',
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [],
        poolFinishScores: [makeFinishScore('u1', 'final', 1, 1)],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.pickedWinnerId).toBeNull();
    });

    it('falls back to knockoutPick.winner when no finish score exists', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'scheduled', {
        homeTeamId: 'USA',
        awayTeamId: 'BRA',
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [makePick('u1', 'final', 'USA')],
        poolFinishScores: [],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.pickedWinnerId).toBe('USA');
    });

    it('falls back to knockoutPick.winner when teams are not yet known (null slots)', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'scheduled'); // homeTeamId/awayTeamId default to null

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [makePick('u1', 'final', 'USA')],
        poolFinishScores: [makeFinishScore('u1', 'final', 2, 0)],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.pickedWinnerId).toBe('USA');
    });

    it('applies finish-score logic to bronze match too', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const bronze = makeKnockoutMatch('bronze', 'Bronze', 'final', {
        homeTeamId: 'ARG',
        awayTeamId: 'FRA',
        actualWinnerId: 'ARG',
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [],
        bronzeMatch: bronze,
        poolKnockoutPicks: [makePick('u1', 'bronze', 'FRA')],
        poolFinishScores: [makeFinishScore('u1', 'bronze', 3, 1)],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.hit).toBe('hit');
      expect(cell.pickedWinnerId).toBe('ARG');
    });

    it('does not apply finish-score logic to non-final/bronze matches', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const sfMatch = makeKnockoutMatch('sf1', 'SF', 'final', {
        homeTeamId: 'USA',
        awayTeamId: 'BRA',
        actualWinnerId: 'BRA',
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('SF', [sfMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [makePick('u1', 'sf1', 'USA')],
        // A finish score for 'final' should not affect this SF match
        poolFinishScores: [makeFinishScore('u1', 'final', 2, 0)],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.hit).toBe('miss');
      expect(cell.pickedWinnerId).toBe('USA');
    });

    it('derives pickedWinnerId from bracket chain when Final teams unknown and SF picks present (home wins)', () => {
      // miniTournament bracket: Final home = SF1 winner, away = SF2 winner
      // SF1 fed by qf1 + qf2; SF2 fed by qf3 + qf4
      // User picks A1 for SF1 → A1 is the projected home side of the Final
      // Score 2-1 → home wins → derived winner = A1
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'scheduled');
      // homeTeamId/awayTeamId default to null — Final participants unknown

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [
          makePick('u1', 'sf1', 'A1'), // user picks A1 to win SF1 → home side of Final
          makePick('u1', 'sf2', 'C1'), // user picks C1 to win SF2 → away side of Final
        ],
        poolFinishScores: [makeFinishScore('u1', 'final', 2, 1)],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.hit).toBe('pending');
      expect(cell.pickedWinnerId).toBe('A1');
    });

    it('derives pickedWinnerId from bracket chain when Final teams unknown (away wins)', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'scheduled');

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [makePick('u1', 'sf1', 'A1'), makePick('u1', 'sf2', 'C1')],
        poolFinishScores: [makeFinishScore('u1', 'final', 0, 3)],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.pickedWinnerId).toBe('C1'); // SF2 winner = away side
    });

    it('shows null pickedWinnerId when Final teams unknown, score is non-tied, but SF picks are missing', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'scheduled');

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [], // no SF picks → chain incomplete
        poolFinishScores: [makeFinishScore('u1', 'final', 2, 0)],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.pickedWinnerId).toBeNull();
    });

    it('derives Bronze winner from bracket chain when Bronze teams unknown (SF loser path)', () => {
      // miniTournament Bronze: home = SF1 loser, away = SF2 loser
      // SF1 (from qf1, qf2): user picks A1 for sf1, A1 for qf1, B1 for qf2
      //   → SF1 loser = B1 (A1 won SF1, B1 was the other QF winner)
      // SF2 (from qf3, qf4): user picks C1 for sf2, C1 for qf3, D1 for qf4
      //   → SF2 loser = D1
      // Bronze: home = B1, away = D1; score 3-1 → home wins → winner = B1
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const bronzeMatch = makeKnockoutMatch('bronze', 'Bronze', 'scheduled');

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [],
        bronzeMatch: bronzeMatch,
        poolKnockoutPicks: [
          makePick('u1', 'qf1', 'A1'),
          makePick('u1', 'qf2', 'B1'),
          makePick('u1', 'sf1', 'A1'), // A1 wins SF1 → B1 is SF1 loser
          makePick('u1', 'qf3', 'C1'),
          makePick('u1', 'qf4', 'D1'),
          makePick('u1', 'sf2', 'C1'), // C1 wins SF2 → D1 is SF2 loser
        ],
        poolFinishScores: [makeFinishScore('u1', 'bronze', 3, 1)],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.hit).toBe('pending');
      expect(cell.pickedWinnerId).toBe('B1'); // home side (SF1 loser) wins 3-1
    });

    it('derives pickedWinnerId from the user own SF picks even when the real Final teams are already known and differ from those picks', () => {
      // Real world: SF1 winner is A1 (matches the user's pick), but SF2's real winner is C2 —
      // the user actually picked C1 to win SF2. So the real/derived Final is A1 vs C2, but the
      // user's own predicted Final (per their SF picks) is A1 vs C1.
      // The user's finish score (1-2, away wins) must be interpreted against their OWN Final
      // (A1 home / C1 away), not the real one, so the derived winner should be C1, not C2.
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'scheduled', {
        homeTeamId: 'A1',
        awayTeamId: 'C2',
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [
          makePick('u1', 'sf1', 'A1'), // matches reality → home side of Final
          makePick('u1', 'sf2', 'C1'), // diverges from reality (real winner is C2)
        ],
        poolFinishScores: [makeFinishScore('u1', 'final', 1, 2)],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.pickedWinnerId).toBe('C1');
    });
  });

  describe('pickedOpponentId (final/bronze only)', () => {
    it('derives the other finalist from the SF pick chain when Final teams are unknown', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'scheduled');

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [makePick('u1', 'sf1', 'A1'), makePick('u1', 'sf2', 'C1')],
        poolFinishScores: [makeFinishScore('u1', 'final', 2, 1)],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.pickedWinnerId).toBe('A1');
      expect(cell.pickedOpponentId).toBe('C1');
    });

    it('derives the SF loser opponent for a Bronze pick', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const bronzeMatch = makeKnockoutMatch('bronze', 'Bronze', 'scheduled');

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [],
        bronzeMatch,
        poolKnockoutPicks: [
          makePick('u1', 'qf1', 'A1'),
          makePick('u1', 'qf2', 'B1'),
          makePick('u1', 'sf1', 'A1'), // A1 wins SF1 → B1 is SF1 loser
          makePick('u1', 'qf3', 'C1'),
          makePick('u1', 'qf4', 'D1'),
          makePick('u1', 'sf2', 'C1'), // C1 wins SF2 → D1 is SF2 loser
        ],
        poolFinishScores: [makeFinishScore('u1', 'bronze', 3, 1)],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.pickedWinnerId).toBe('B1');
      expect(cell.pickedOpponentId).toBe('D1');
    });

    it('is null for non-final/bronze rounds', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const qfMatch = makeKnockoutMatch('qf1', 'QF', 'final', { actualWinnerId: 'A1' });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('QF', [qfMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [makePick('u1', 'qf1', 'A1')],
        poolFinishScores: [],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.pickedOpponentId).toBeNull();
    });
  });

  describe('predicted score fields on cell (final/bronze only)', () => {
    it('populates predictedHome/predictedAway from the finish score on a final match', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'final', {
        homeTeamId: 'USA',
        awayTeamId: 'BRA',
        actualWinnerId: 'USA',
        actualHome: 2,
        actualAway: 1,
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [],
        poolFinishScores: [makeFinishScore('u1', 'final', 2, 1)],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.predictedHome).toBe(2);
      expect(cell.predictedAway).toBe(1);
    });

    it('marks isExactScore true when the finish score matches the actual score exactly', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'final', {
        homeTeamId: 'USA',
        awayTeamId: 'BRA',
        actualWinnerId: 'USA',
        actualHome: 2,
        actualAway: 1,
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [],
        poolFinishScores: [makeFinishScore('u1', 'final', 2, 1)],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.isExactScore).toBe(true);
    });

    it('marks isExactScore false when the finish score does not match the actual score', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'final', {
        homeTeamId: 'USA',
        awayTeamId: 'BRA',
        actualWinnerId: 'USA',
        actualHome: 2,
        actualAway: 0,
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [],
        poolFinishScores: [makeFinishScore('u1', 'final', 2, 1)],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.isExactScore).toBe(false);
    });

    it('leaves predictedHome/predictedAway null and isExactScore false when no finish score exists', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'final', {
        homeTeamId: 'USA',
        awayTeamId: 'BRA',
        actualWinnerId: 'USA',
        actualHome: 2,
        actualAway: 1,
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [makePick('u1', 'final', 'USA')],
        poolFinishScores: [],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.predictedHome).toBeNull();
      expect(cell.predictedAway).toBeNull();
      expect(cell.isExactScore).toBe(false);
    });

    it('populates the same fields for a bronze match', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const bronze = makeKnockoutMatch('bronze', 'Bronze', 'final', {
        homeTeamId: 'ARG',
        awayTeamId: 'FRA',
        actualWinnerId: 'ARG',
        actualHome: 3,
        actualAway: 1,
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [],
        bronzeMatch: bronze,
        poolKnockoutPicks: [],
        poolFinishScores: [makeFinishScore('u1', 'bronze', 3, 1)],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.predictedHome).toBe(3);
      expect(cell.predictedAway).toBe(1);
      expect(cell.isExactScore).toBe(true);
    });

    it('leaves predictedHome/predictedAway null and isExactScore false for non-final/bronze rounds', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const sfMatch = makeKnockoutMatch('sf1', 'SF', 'final', {
        homeTeamId: 'USA',
        awayTeamId: 'BRA',
        actualWinnerId: 'USA',
        actualHome: 2,
        actualAway: 1,
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('SF', [sfMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [makePick('u1', 'sf1', 'USA')],
        poolFinishScores: [],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.predictedHome).toBeNull();
      expect(cell.predictedAway).toBeNull();
      expect(cell.isExactScore).toBe(false);
    });

    it('populates predictedScoreByTeam when the finish score has a team-id snapshot', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'final', {
        homeTeamId: 'USA',
        awayTeamId: 'BRA',
        actualWinnerId: 'USA',
        actualHome: 2,
        actualAway: 1,
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [],
        poolFinishScores: [
          makeFinishScore('u1', 'final', 2, 1, { homeTeamId: 'USA', awayTeamId: 'BRA' }),
        ],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.predictedScoreByTeam).toEqual(
        expect.arrayContaining([
          { teamId: 'USA', goals: 2 },
          { teamId: 'BRA', goals: 1 },
        ]),
      );
    });

    it('leaves predictedScoreByTeam null when the finish score has no team-id snapshot', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'final', {
        homeTeamId: 'USA',
        awayTeamId: 'BRA',
        actualWinnerId: 'USA',
        actualHome: 2,
        actualAway: 1,
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [],
        poolFinishScores: [makeFinishScore('u1', 'final', 2, 1)], // no snapshot
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.predictedScoreByTeam).toBeNull();
      // predictedHome/predictedAway (legacy fields) stay populated as before.
      expect(cell.predictedHome).toBe(2);
      expect(cell.predictedAway).toBe(1);
    });

    it('regression: isExactScore is true via team identity even when the real match home/away is swapped relative to the predicted pair', () => {
      // This is the bug from the bug report: user correctly predicted USA beating BRA 2-1.
      // The predicted pair was captured as home=USA/away=BRA. The REAL match happens to have
      // BRA as home and USA as away (an unrelated real-world draw outcome) — same two teams,
      // same two actual goal counts, just a different real home/away assignment. The predicted
      // score is still exactly correct by team identity and must be marked isExactScore.
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'final', {
        homeTeamId: 'BRA',
        awayTeamId: 'USA',
        actualWinnerId: 'USA',
        actualHome: 1, // BRA (real home) scored 1
        actualAway: 2, // USA (real away) scored 2
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [],
        poolFinishScores: [
          // User's own predicted pair: home=USA/away=BRA (their own SF-derived orientation)
          makeFinishScore('u1', 'final', 2, 1, { homeTeamId: 'USA', awayTeamId: 'BRA' }),
        ],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.isExactScore).toBe(true);
      expect(cell.pickedWinnerId).toBe('USA');
    });
  });

  describe('eliminated team picks', () => {
    it('marks SF pick as impossible when picked team was eliminated in a prior QF', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const qf1 = makeKnockoutMatch('qf1', 'QF', 'final', {
        homeTeamId: 'A1',
        awayTeamId: 'B2',
        actualWinnerId: 'A1',
      });
      const sf1 = makeKnockoutMatch('sf1', 'SF', 'scheduled');

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('QF', [qf1]), makeRound('SF', [sf1])],
        bronzeMatch: null,
        poolKnockoutPicks: [makePick('u1', 'sf1', 'B2')],
        poolFinishScores: [],
        def: miniTournament,
      });

      const sfCell = knockoutMatrix[0]!.cells.find((c) => c.bracketMatchKey === 'sf1')!;
      expect(sfCell.hit).toBe('impossible');
      expect(sfCell.pickedWinnerId).toBe('B2');
    });

    it('marks Bronze pick as impossible when picked team was eliminated in a prior QF', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const qf1 = makeKnockoutMatch('qf1', 'QF', 'final', {
        homeTeamId: 'A1',
        awayTeamId: 'B2',
        actualWinnerId: 'A1',
      });
      const bronze = makeKnockoutMatch('bronze', 'Bronze', 'scheduled');

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('QF', [qf1])],
        bronzeMatch: bronze,
        poolKnockoutPicks: [makePick('u1', 'bronze', 'B2')],
        poolFinishScores: [],
        def: miniTournament,
      });

      const bronzeCell = knockoutMatrix[0]!.cells.find(
        (c) => c.bracketMatchKey === 'bronze:teams',
      )!;
      expect(bronzeCell.hit).toBe('impossible');
      expect(bronzeCell.pickedWinnerId).toBe('B2');
    });

    it('marks Final pick as impossible when picked team was eliminated in a prior SF', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const sf1 = makeKnockoutMatch('sf1', 'SF', 'final', {
        homeTeamId: 'A1',
        awayTeamId: 'B1',
        actualWinnerId: 'A1',
      });
      const final = makeKnockoutMatch('final', 'Final', 'scheduled');

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('SF', [sf1]), makeRound('Final', [final])],
        bronzeMatch: null,
        poolKnockoutPicks: [makePick('u1', 'final', 'B1')],
        poolFinishScores: [],
        def: miniTournament,
      });

      const finalCell = knockoutMatrix[0]!.cells.find((c) => c.bracketMatchKey === 'final:score')!;
      expect(finalCell.hit).toBe('impossible');
      expect(finalCell.pickedWinnerId).toBe('B1');
    });

    it('keeps a Bronze pick pending for a team that only lost the semifinal (SF loser plays Bronze, not eliminated)', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const sf1 = makeKnockoutMatch('sf1', 'SF', 'final', {
        homeTeamId: 'A1',
        awayTeamId: 'B1',
        actualWinnerId: 'A1',
      });
      const bronze = makeKnockoutMatch('bronze', 'Bronze', 'scheduled', {
        homeTeamId: 'B1',
        awayTeamId: 'D1',
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('SF', [sf1])],
        bronzeMatch: bronze,
        poolKnockoutPicks: [makePick('u1', 'bronze', 'B1')],
        poolFinishScores: [],
        def: miniTournament,
      });

      const bronzeCell = knockoutMatrix[0]!.cells.find(
        (c) => c.bracketMatchKey === 'bronze:teams',
      )!;
      expect(bronzeCell.hit).toBe('pending');
      expect(bronzeCell.pickedWinnerId).toBe('B1');
    });

    it('keeps pending for a still-alive team in an unresolved match (no regression)', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const sf1 = makeKnockoutMatch('sf1', 'SF', 'scheduled');

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('SF', [sf1])],
        bronzeMatch: null,
        poolKnockoutPicks: [makePick('u1', 'sf1', 'A1')],
        poolFinishScores: [],
        def: miniTournament,
      });

      const sfCell = knockoutMatrix[0]!.cells.find((c) => c.bracketMatchKey === 'sf1')!;
      expect(sfCell.hit).toBe('pending');
    });
  });

  describe('Bronze splits into Teams/Score columns', () => {
    it('produces two columns for Bronze: Teams and Score', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const bronze = makeKnockoutMatch('bronze', 'Bronze', 'final', {
        homeTeamId: 'ARG',
        awayTeamId: 'FRA',
        actualWinnerId: 'ARG',
        actualHome: 3,
        actualAway: 1,
      });

      const { knockoutMatrix, knockoutMatrixMatches } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [],
        bronzeMatch: bronze,
        poolKnockoutPicks: [],
        poolFinishScores: [
          makeFinishScore('u1', 'bronze', 3, 1, { homeTeamId: 'ARG', awayTeamId: 'FRA' }),
        ],
        def: miniTournament,
      });

      expect(knockoutMatrixMatches).toHaveLength(2);
      expect(knockoutMatrixMatches[0]!.variant).toBe('teams');
      expect(knockoutMatrixMatches[1]!.variant).toBe('score');

      const cells = knockoutMatrix[0]!.cells;
      expect(cells).toHaveLength(2);
      // Only one predicted team (ARG, the picked winner) is known here — no SF picks were
      // supplied, so pickedOpponentId can't be derived — but ARG alone is enough for 1×perTeam.
      expect(cells[0]!.points).toBe(miniTournament.scoring.bronze.perTeam); // 5
      expect(cells[1]!.points).toBe(miniTournament.scoring.bronze.exactScore); // 5 (exact score)
      expect(knockoutMatrix[0]!.totalPoints).toBe(10);
    });

    it('awards 2×perTeam for Bronze·Teams when both predicted teams (winner + derived opponent) played', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const bronze = makeKnockoutMatch('bronze', 'Bronze', 'final', {
        homeTeamId: 'B1',
        awayTeamId: 'D1',
        actualWinnerId: 'B1',
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [],
        bronzeMatch: bronze,
        // Full SF/QF chain so both bronze contestants (SF losers) are derivable: B1 and D1.
        // Explicit 'bronze' pick makes B1 the effective winner (no finish score to derive it from).
        poolKnockoutPicks: [
          makePick('u1', 'qf1', 'A1'),
          makePick('u1', 'qf2', 'B1'),
          makePick('u1', 'sf1', 'A1'), // A1 wins SF1 → B1 is SF1 loser
          makePick('u1', 'qf3', 'C1'),
          makePick('u1', 'qf4', 'D1'),
          makePick('u1', 'sf2', 'C1'), // C1 wins SF2 → D1 is SF2 loser
          makePick('u1', 'bronze', 'B1'),
        ],
        poolFinishScores: [],
        def: miniTournament,
      });

      const teamsCell = knockoutMatrix[0]!.cells.find((c) => c.bracketMatchKey === 'bronze:teams')!;
      expect(teamsCell.points).toBe(miniTournament.scoring.bronze.perTeam * 2); // 10
    });

    it('gives 0 Bronze·Teams points when neither predicted team played', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const bronze = makeKnockoutMatch('bronze', 'Bronze', 'final', {
        homeTeamId: 'X1',
        awayTeamId: 'X2',
        actualWinnerId: 'X1',
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [],
        bronzeMatch: bronze,
        poolKnockoutPicks: [makePick('u1', 'bronze', 'ZZ')], // ZZ is not a participant
        poolFinishScores: [],
        def: miniTournament,
      });

      const teamsCell = knockoutMatrix[0]!.cells.find((c) => c.bracketMatchKey === 'bronze:teams')!;
      expect(teamsCell.points).toBe(0);
      expect(teamsCell.hit).toBe('miss');
    });
  });

  describe('Final produces a single Score column (Teams already covered by the SF columns)', () => {
    it('produces exactly one Final column, variant "score"', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'final', {
        homeTeamId: 'USA',
        awayTeamId: 'BRA',
        actualWinnerId: 'USA',
        actualHome: 2,
        actualAway: 1,
      });

      const { knockoutMatrix, knockoutMatrixMatches } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        poolKnockoutPicks: [],
        poolFinishScores: [
          makeFinishScore('u1', 'final', 2, 1, { homeTeamId: 'USA', awayTeamId: 'BRA' }),
        ],
        def: miniTournament,
      });

      expect(knockoutMatrixMatches).toHaveLength(1);
      expect(knockoutMatrixMatches[0]!.bracketMatchKey).toBe('final:score');
      expect(knockoutMatrixMatches[0]!.variant).toBe('score');

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.points).toBe(miniTournament.scoring.final.exactScore); // 5
      expect(cell.hit).toBe('hit');
    });

    it('gives 0 Final·Score points when the winner was guessed right but the score was not exact', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice');
      const finalMatch = makeKnockoutMatch('final', 'Final', 'final', {
        homeTeamId: 'USA',
        awayTeamId: 'BRA',
        actualWinnerId: 'USA',
        actualHome: 2,
        actualAway: 1,
      });

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [makeRound('Final', [finalMatch])],
        bronzeMatch: null,
        // Predicted USA to win, but 3-0 instead of the actual 2-1 — winner right, score wrong.
        poolFinishScores: [
          makeFinishScore('u1', 'final', 3, 0, { homeTeamId: 'USA', awayTeamId: 'BRA' }),
        ],
        poolKnockoutPicks: [],
        def: miniTournament,
      });

      const cell = knockoutMatrix[0]!.cells[0]!;
      expect(cell.points).toBe(0);
      expect(cell.hit).toBe('miss');
    });
  });

  describe('Standings column (topFourPosition)', () => {
    it('reads standingsPoints from breakdown.topFourPosition and folds it into totalPoints', () => {
      const alice: LeaderboardEntry = {
        ...makeLeaderboardEntry('u1', 'Alice'),
        breakdown: {
          groupMatches: points(0),
          groupOrder: points(0),
          roundOf16: points(0),
          roundOf8: points(0),
          topFour: points(6),
          topFourTeams: points(0),
          topFourPosition: points(6),
          final: points(0),
          bronze: points(0),
          specials: points(0),
          total: points(6),
        },
      };

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [],
        bronzeMatch: null,
        poolKnockoutPicks: [],
        poolFinishScores: [],
        def: miniTournament,
      });

      expect(knockoutMatrix[0]!.standingsPoints).toBe(6);
      expect(knockoutMatrix[0]!.totalPoints).toBe(6);
    });

    it('defaults standingsPoints to 0 when breakdown is null (viewer mode)', () => {
      const alice = makeLeaderboardEntry('u1', 'Alice'); // breakdown: null

      const { knockoutMatrix } = buildKnockoutMatrix({
        leaderboard: [alice],
        userId: null,
        bracketRounds: [],
        bronzeMatch: null,
        poolKnockoutPicks: [],
        poolFinishScores: [],
        def: miniTournament,
      });

      expect(knockoutMatrix[0]!.standingsPoints).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// buildSpecialsMatrix
// ---------------------------------------------------------------------------

function makeSpecialBet(userId: string, betKey: string, value: unknown): PoolSpecialBet {
  return { userId: userId as UserId, betKey, value };
}

const emptyActualResults: ActualResults = {
  matchResults: [],
  groupOrder: {},
  answers: {},
};

function makeGroupMatchRow(
  id: string,
  home: string,
  away: string,
  homeGoals: number,
  awayGoals: number,
): MatchRow {
  return {
    id,
    tournamentId: miniTournament.id as import('@cup/engine').TournamentId,
    stage: 'group',
    groupId: 'A',
    homeTeamId: home,
    awayTeamId: away,
    kickoff: null,
    homeGoals,
    awayGoals,
    homeConduct: null,
    awayConduct: null,
    winnerTeamId: homeGoals === awayGoals ? null : homeGoals > awayGoals ? home : away,
    decidedBy: null,
    status: 'final',
  };
}

describe('buildSpecialsMatrix', () => {
  it('returns rows for all leaderboard members sorted by totalPoints DESC', () => {
    const leaderboard = [makeLeaderboardEntry('u1', 'Alice'), makeLeaderboardEntry('u2', 'Bob')];
    const poolSpecialBets: PoolSpecialBet[] = [
      makeSpecialBet('u1', 'groupTopScoringTeam', 'A1'),
      makeSpecialBet('u2', 'groupTopScoringTeam', 'B1'),
    ];
    const actualResults: ActualResults = {
      ...emptyActualResults,
      answers: { groupTopScoringTeam: ['A1'] as import('@cup/engine').TeamId[] },
    };

    const { specialsMatrix } = buildSpecialsMatrix({
      leaderboard,
      userId: 'u1',
      poolSpecialBets,
      actualResults,
      def: miniTournament,
    });

    // u1 has a hit, u2 doesn't — u1 should be first
    expect(specialsMatrix[0]!.userId).toBe('u1');
    expect(specialsMatrix[0]!.totalPoints).toBe(10);
    expect(specialsMatrix[1]!.userId).toBe('u2');
    expect(specialsMatrix[1]!.totalPoints).toBe(0);
  });

  it('marks array-answer bet as hit when user pick is in the actual array', () => {
    const leaderboard = [makeLeaderboardEntry('u1', 'Alice')];
    const poolSpecialBets = [makeSpecialBet('u1', 'groupTopScoringTeam', 'A1')];
    const actualResults: ActualResults = {
      ...emptyActualResults,
      answers: { groupTopScoringTeam: ['A1', 'B1'] as import('@cup/engine').TeamId[] },
    };

    const { specialsMatrix } = buildSpecialsMatrix({
      leaderboard,
      userId: null,
      poolSpecialBets,
      actualResults,
      def: miniTournament,
    });

    const cell = specialsMatrix[0]!.cells.find((c) => c.betKey === 'groupTopScoringTeam')!;
    expect(cell.hit).toBe('hit');
    expect(cell.points).toBe(10);
  });

  it('marks scalar bet as hit when pick matches actual', () => {
    const leaderboard = [makeLeaderboardEntry('u1', 'Alice')];
    const poolSpecialBets = [makeSpecialBet('u1', 'penaltyShootoutCount', 3)];
    const actualResults: ActualResults = {
      ...emptyActualResults,
      answers: { penaltyShootoutCount: 3 },
    };

    const { specialsMatrix } = buildSpecialsMatrix({
      leaderboard,
      userId: null,
      poolSpecialBets,
      actualResults,
      def: miniTournament,
    });

    const cell = specialsMatrix[0]!.cells.find((c) => c.betKey === 'penaltyShootoutCount')!;
    expect(cell.hit).toBe('hit');
    expect(cell.points).toBe(10);
  });

  it('marks bet as pending when no actual result yet', () => {
    const leaderboard = [makeLeaderboardEntry('u1', 'Alice')];
    const poolSpecialBets = [makeSpecialBet('u1', 'penaltyShootoutCount', 3)];

    const { specialsMatrix } = buildSpecialsMatrix({
      leaderboard,
      userId: null,
      poolSpecialBets,
      actualResults: emptyActualResults,
      def: miniTournament,
    });

    const cell = specialsMatrix[0]!.cells.find((c) => c.betKey === 'penaltyShootoutCount')!;
    expect(cell.hit).toBe('pending');
    expect(cell.points).toBe(0);
  });

  it('marks bet as no-pick when user has no pick and bet is resolved', () => {
    const leaderboard = [makeLeaderboardEntry('u1', 'Alice')];
    const actualResults: ActualResults = {
      ...emptyActualResults,
      answers: { penaltyShootoutCount: 3 },
    };

    const { specialsMatrix } = buildSpecialsMatrix({
      leaderboard,
      userId: null,
      poolSpecialBets: [],
      actualResults,
      def: miniTournament,
    });

    const cell = specialsMatrix[0]!.cells.find((c) => c.betKey === 'penaltyShootoutCount')!;
    expect(cell.hit).toBe('no-pick');
    expect(cell.pickLabel).toBeNull();
  });

  it('marks bet as missed when pick is wrong and bet is resolved', () => {
    const leaderboard = [makeLeaderboardEntry('u1', 'Alice')];
    const poolSpecialBets = [makeSpecialBet('u1', 'penaltyShootoutCount', 2)];
    const actualResults: ActualResults = {
      ...emptyActualResults,
      answers: { penaltyShootoutCount: 3 },
    };

    const { specialsMatrix } = buildSpecialsMatrix({
      leaderboard,
      userId: null,
      poolSpecialBets,
      actualResults,
      def: miniTournament,
    });

    const cell = specialsMatrix[0]!.cells.find((c) => c.betKey === 'penaltyShootoutCount')!;
    expect(cell.hit).toBe('missed');
    expect(cell.pickLabel).toBe('2');
  });

  it('computes pickLabel: team → team ID, bool → Y/N, number → string', () => {
    const leaderboard = [makeLeaderboardEntry('u1', 'Alice')];
    const poolSpecialBets = [
      makeSpecialBet('u1', 'groupTopScoringTeam', 'A1'),
      makeSpecialBet('u1', 'finalDecidedByPenalties', true),
      makeSpecialBet('u1', 'penaltyShootoutCount', 7),
    ];

    const { specialsMatrix } = buildSpecialsMatrix({
      leaderboard,
      userId: null,
      poolSpecialBets,
      actualResults: emptyActualResults,
      def: miniTournament,
    });

    const cells = specialsMatrix[0]!.cells;
    const teamCell = cells.find((c) => c.betKey === 'groupTopScoringTeam')!;
    const boolCell = cells.find((c) => c.betKey === 'finalDecidedByPenalties')!;
    const numCell = cells.find((c) => c.betKey === 'penaltyShootoutCount')!;

    expect(teamCell.pickLabel).toBe('A1');
    expect(boolCell.pickLabel).toBe('Y');
    expect(numCell.pickLabel).toBe('7');
  });

  it('computes pickLabel for player bet from last word of name uppercased max 6 chars', () => {
    const leaderboard = [makeLeaderboardEntry('u1', 'Alice')];
    // miniTournament players have IDs like "A1-P" and names like "Player A1"
    const playerId = miniTournament.players[0]!.id;
    const poolSpecialBets = [makeSpecialBet('u1', 'topScorerPlayer', playerId)];

    const { specialsMatrix } = buildSpecialsMatrix({
      leaderboard,
      userId: null,
      poolSpecialBets,
      actualResults: emptyActualResults,
      def: miniTournament,
    });

    const cell = specialsMatrix[0]!.cells.find((c) => c.betKey === 'topScorerPlayer')!;
    // "Player A1" → last word "A1" uppercased = "A1"
    expect(cell.pickLabel).toBe('A1');
  });

  it('excludes bets with points === 0 from specialsMatrixBets', () => {
    const zeroScoring = {
      ...miniTournament.scoring,
      penaltyShootoutCount: 0,
    };
    const defWithZero = { ...miniTournament, scoring: zeroScoring };

    const { specialsMatrixBets } = buildSpecialsMatrix({
      leaderboard: [],
      userId: null,
      poolSpecialBets: [],
      actualResults: emptyActualResults,
      def: defWithZero,
    });

    expect(specialsMatrixBets.every((b) => b.betKey !== 'penaltyShootoutCount')).toBe(true);
  });

  it('sets actualPickLabel on resolved bets, null on pending', () => {
    const actualResults: ActualResults = {
      ...emptyActualResults,
      answers: { groupTopScoringTeam: ['A1'] as import('@cup/engine').TeamId[] },
    };

    const { specialsMatrixBets } = buildSpecialsMatrix({
      leaderboard: [],
      userId: null,
      poolSpecialBets: [],
      actualResults,
      def: miniTournament,
    });

    const resolved = specialsMatrixBets.find((b) => b.betKey === 'groupTopScoringTeam')!;
    const pending = specialsMatrixBets.find((b) => b.betKey === 'penaltyShootoutCount')!;

    expect(resolved.actualPickLabel).toBe('A1');
    expect(pending.actualPickLabel).toBeNull();
  });

  it('marks a cell as missed early when the pick is mathematically impossible, without an actual answer', () => {
    const leaderboard = [makeLeaderboardEntry('u1', 'Alice')];
    const poolSpecialBets = [makeSpecialBet('u1', 'highestMatchGoals', 5)];
    const matches = [makeGroupMatchRow('mA1', 'A1', 'A2', 4, 2)]; // 6 goals already, exceeds the pick of 5

    const { specialsMatrix } = buildSpecialsMatrix({
      leaderboard,
      userId: null,
      poolSpecialBets,
      actualResults: emptyActualResults,
      def: miniTournament,
      matches,
    });

    const cell = specialsMatrix[0]!.cells.find((c) => c.betKey === 'highestMatchGoals')!;
    expect(cell.hit).toBe('missed');
    expect(cell.points).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildPerUserSpecialsRemaining
// ---------------------------------------------------------------------------

describe('buildPerUserSpecialsRemaining', () => {
  const specialDefs = [
    { key: 'highestMatchGoals', points: 10 },
    { key: 'penaltyShootoutCount', points: 10 },
  ];

  it('counts every pending pick when nothing is impossible yet', () => {
    const poolSpecialBets = [
      makeSpecialBet('u1', 'highestMatchGoals', 5),
      makeSpecialBet('u1', 'penaltyShootoutCount', 2),
    ];
    const impossibility = computeSpecialBetImpossibility(miniTournament, []);

    const result = buildPerUserSpecialsRemaining(
      poolSpecialBets,
      specialDefs,
      emptyActualResults,
      impossibility,
    );

    expect(result.get('u1')).toBe(20);
  });

  it('excludes points for a pick that is already mathematically impossible', () => {
    const poolSpecialBets = [
      makeSpecialBet('u1', 'highestMatchGoals', 5), // impossible: 6 goals already scored
      makeSpecialBet('u1', 'penaltyShootoutCount', 2), // still open
    ];
    const matches = [makeGroupMatchRow('mA1', 'A1', 'A2', 4, 2)]; // 6 goals
    const impossibility = computeSpecialBetImpossibility(miniTournament, matches);

    const result = buildPerUserSpecialsRemaining(
      poolSpecialBets,
      specialDefs,
      emptyActualResults,
      impossibility,
    );

    expect(result.get('u1')).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// buildProjectedEntries
// ---------------------------------------------------------------------------

describe('buildProjectedEntries', () => {
  it('sets canStillGet for all entries from canStillGetByUser map', () => {
    const alice = makeLeaderboardEntry('u1', 'Alice', 100);
    const bob = makeLeaderboardEntry('u2', 'Bob', 80);
    const stillLive = new Map([
      ['u1', 20],
      ['u2', 15],
    ]);
    const canStillGet = new Map([
      ['u1', 60],
      ['u2', 40],
    ]);

    const entries = buildProjectedEntries([alice, bob], 'u1', stillLive, canStillGet);

    const aliceEntry = entries.find((e) => e.userId === 'u1')!;
    const bobEntry = entries.find((e) => e.userId === 'u2')!;
    expect(aliceEntry.canStillGet).toBe(60);
    expect(bobEntry.canStillGet).toBe(40);
  });

  it('defaults canStillGet to 0 for users absent from canStillGetByUser map', () => {
    const alice = makeLeaderboardEntry('u1', 'Alice', 100);
    const stillLive = new Map<string, number>();
    const canStillGet = new Map<string, number>(); // u1 absent

    const entries = buildProjectedEntries([alice], 'u1', stillLive, canStillGet);

    expect(entries[0]!.canStillGet).toBe(0);
  });

  it('canStillGet is non-negative for all entries', () => {
    const leaderboard = [
      makeLeaderboardEntry('u1', 'Alice', 150),
      makeLeaderboardEntry('u2', 'Bob', 100),
      makeLeaderboardEntry('u3', 'Carol', 50),
    ];
    const stillLive = new Map([
      ['u1', 0],
      ['u2', 30],
      ['u3', 50],
    ]);
    const canStillGet = new Map([
      ['u1', 0],
      ['u2', 80],
      ['u3', 120],
    ]);

    const entries = buildProjectedEntries(leaderboard, null, stillLive, canStillGet);

    expect(entries.every((e) => e.canStillGet >= 0)).toBe(true);
  });

  it('ranks user with more available points higher when current points are nearly equal', () => {
    // Regression: projection must use per-user canStillGet, not a global remaining max.
    // User 2 has 1 fewer current point but 13 more available — should project higher.
    const u1 = makeLeaderboardEntry('u1', 'Niksmann', 229);
    const u2 = makeLeaderboardEntry('u2', 'TNH81', 228);
    const stillLive = new Map([
      ['u1', 78], // hitRate × 155
      ['u2', 85], // same hitRate × 168 (more available → higher)
    ]);
    const canStillGet = new Map([
      ['u1', 155],
      ['u2', 168],
    ]);

    const entries = buildProjectedEntries([u1, u2], null, stillLive, canStillGet);

    const e1 = entries.find((e) => e.userId === 'u1')!;
    const e2 = entries.find((e) => e.userId === 'u2')!;
    expect(e2.projectedPoints).toBeGreaterThan(e1.projectedPoints);
    expect(e2.projectedRank).toBe(1);
    expect(e1.projectedRank).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// buildPointsRaceView — finalScenario wiring
// ---------------------------------------------------------------------------

describe('buildPointsRaceView — finalScenario', () => {
  it('is null when the tournament has not reached the only-Final-left state', () => {
    const leaderboard = [makeLeaderboardEntry('u1', 'Alice', 10)];
    const { finalScenario } = buildPointsRaceView({
      leaderboard,
      userId: null,
      allMatches: [],
      poolGroupScores: [],
      def: miniTournament,
      myTotalCanStillGet: 0,
      bracketRounds: [],
      bronzeMatch: null,
      poolKnockoutPicks: [],
      poolFinishScores: [],
      poolSpecialBets: [],
      actualResults: emptyActualResults,
    });
    expect(finalScenario).toBeNull();
  });

  it('is populated once only the Final remains', () => {
    const finalMatch = makeKnockoutMatch('final', 'Final', 'scheduled', {
      homeTeamId: 'A1',
      awayTeamId: 'B1',
    });
    const bronzeMatch = makeKnockoutMatch('bronze', 'Bronze', 'final', {
      homeTeamId: 'C1',
      awayTeamId: 'D1',
    });
    const leaderboard = [
      makeLeaderboardEntry('u1', 'Alice', 60),
      makeLeaderboardEntry('u2', 'Bob', 40),
    ];
    const { finalScenario } = buildPointsRaceView({
      leaderboard,
      userId: null,
      allMatches: [],
      poolGroupScores: [],
      def: miniTournament,
      myTotalCanStillGet: 0,
      bracketRounds: [makeRound('Final', [finalMatch])],
      bronzeMatch,
      poolKnockoutPicks: [],
      poolFinishScores: [],
      poolSpecialBets: [],
      actualResults: emptyActualResults,
    });
    expect(finalScenario).not.toBeNull();
    expect(finalScenario!.homeTeamId).toBe('A1');
    expect(finalScenario!.home.projectedWinnerDisplayName).toBe('Alice');
    expect(finalScenario!.away.projectedWinnerDisplayName).toBe('Alice');
  });
});
