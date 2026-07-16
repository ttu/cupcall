import { describe, expect, it } from 'vitest';
import { miniTournament } from '@cup/engine/testing';
import { computeR32QualHealth, computeBracketHealth } from './bracket-health';
import type {
  GroupResultView,
  GroupStandingRow,
  KnockoutMatchView,
  BracketRoundResultView,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function row(
  teamId: string,
  qualifies: 'auto' | 'best-third' | false,
  eliminated: boolean,
): GroupStandingRow {
  return {
    position: 1,
    teamId,
    teamName: teamId,
    played: 3,
    won: 1,
    drawn: 1,
    lost: 1,
    goalsFor: 3,
    goalsAgainst: 3,
    goalDifference: 0,
    points: 4,
    conduct: 0,
    qualifies,
    eliminated,
    predictedPosition: null,
    poolMostPredictedPosition: null,
    poolMostPredictedPct: null,
    fifaRanking: null,
  };
}

function group(standing: GroupStandingRow[]): GroupResultView {
  return {
    groupId: 'A',
    completedMatches: [],
    todayMatches: [],
    upcomingMatches: [],
    standing,
    groupPoints: null,
  };
}

function match(pickStatus: KnockoutMatchView['pickStatus'], key = 'qf1'): KnockoutMatchView {
  return {
    bracketMatchKey: key,
    round: 'QF',
    homeTeamId: 'A1',
    homeTeamName: 'Team A1',
    awayTeamId: 'B2',
    awayTeamName: 'Team B2',
    actualHome: null,
    actualAway: null,
    actualWinnerId: null,
    actualWinnerName: null,
    kickoff: null,
    status: 'scheduled',
    pickedWinnerId: 'A1',
    pickedWinnerName: 'Team A1',
    pickedOpponentId: null,
    pickedOpponentName: null,
    pickStatus,
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

function round(label: string, matches: KnockoutMatchView[]): BracketRoundResultView {
  return { label, matches };
}

// ---------------------------------------------------------------------------
// computeR32QualHealth
// ---------------------------------------------------------------------------

describe('computeR32QualHealth', () => {
  it('counts an auto-qualifying team as alive', () => {
    const result = computeR32QualHealth(['T1'], [group([row('T1', 'auto', false)])]);
    expect(result.alivePicks).toBe(1);
    expect(result.bustedPicks).toBe(0);
    expect(result.pendingPicks).toBe(0);
  });

  it('counts a best-third qualifying team as alive', () => {
    const result = computeR32QualHealth(['T3'], [group([row('T3', 'best-third', false)])]);
    expect(result.alivePicks).toBe(1);
    expect(result.bustedPicks).toBe(0);
  });

  it('counts a team with qualifies=best-third and eliminated=true as alive (regression)', () => {
    // A team can have qualifies='best-third' (set by live marking) but eliminated=true
    // (set by an inconsistent bestThirdsSet). qualifies wins — the team is alive.
    const result = computeR32QualHealth(['T3'], [group([row('T3', 'best-third', true)])]);
    expect(result.alivePicks).toBe(1);
    expect(result.bustedPicks).toBe(0);
  });

  it('counts a non-qualifying eliminated team as busted', () => {
    const result = computeR32QualHealth(['T4'], [group([row('T4', false, true)])]);
    expect(result.bustedPicks).toBe(1);
    expect(result.alivePicks).toBe(0);
    expect(result.pendingPicks).toBe(0);
  });

  it('counts a non-qualifying non-eliminated team as pending (group not done)', () => {
    const result = computeR32QualHealth(['T3'], [group([row('T3', false, false)])]);
    expect(result.pendingPicks).toBe(1);
    expect(result.alivePicks).toBe(0);
    expect(result.bustedPicks).toBe(0);
  });

  it('counts a team not in any standing as pending', () => {
    const result = computeR32QualHealth(['UNKNOWN'], [group([row('T1', 'auto', false)])]);
    expect(result.pendingPicks).toBe(1);
    expect(result.alivePicks).toBe(0);
    expect(result.bustedPicks).toBe(0);
  });

  it('returns correct totals for a mixed set of picks', () => {
    const groupResults = [
      group([row('T1', 'auto', false), row('T2', 'auto', false)]),
      group([row('T3', 'best-third', false), row('T4', false, true)]),
    ];
    const result = computeR32QualHealth(['T1', 'T2', 'T3', 'T4', 'UNKNOWN'], groupResults);
    expect(result.alivePicks).toBe(3); // T1, T2, T3
    expect(result.bustedPicks).toBe(1); // T4
    expect(result.pendingPicks).toBe(1); // UNKNOWN
    expect(result.totalPicks).toBe(5);
    expect(result.label).toBe('R32');
    expect(result.earnedPoints).toBe(0);
    expect(result.maxPossiblePoints).toBe(0);
  });

  it('returns zero totals for an empty qualifier list', () => {
    const result = computeR32QualHealth([], []);
    expect(result.alivePicks).toBe(0);
    expect(result.bustedPicks).toBe(0);
    expect(result.pendingPicks).toBe(0);
    expect(result.totalPicks).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeBracketHealth
// ---------------------------------------------------------------------------

describe('computeBracketHealth', () => {
  it('returns all-zero health for empty rounds with no bronze', () => {
    const health = computeBracketHealth([], null, miniTournament);
    expect(health.totalPicks).toBe(0);
    expect(health.alivePicks).toBe(0);
    expect(health.pendingPicks).toBe(0);
    expect(health.bustedPicks).toBe(0);
    expect(health.missedPicks).toBe(0);
    expect(health.perRound).toHaveLength(0);
  });

  it('aggregates pick statuses across all rounds', () => {
    const rounds = [
      round('QF', [match('alive'), match('busted'), match('pending'), match('no-pick')]),
      round('SF', [match('alive'), match('no-pick')]),
    ];
    const health = computeBracketHealth(rounds, null, miniTournament);
    expect(health.totalPicks).toBe(6);
    expect(health.alivePicks).toBe(2);
    expect(health.bustedPicks).toBe(1);
    expect(health.pendingPicks).toBe(1);
    expect(health.missedPicks).toBe(2);
  });

  it('includes the bronze match in overall totals', () => {
    const rounds = [round('QF', [match('alive')])];
    const bronze = match('busted');
    const health = computeBracketHealth(rounds, bronze, miniTournament);
    expect(health.totalPicks).toBe(2);
    expect(health.alivePicks).toBe(1);
    expect(health.bustedPicks).toBe(1);
  });

  it('includes bronze as a Bronze perRound entry', () => {
    const rounds = [round('QF', [match('alive'), match('alive')])];
    const health = computeBracketHealth(rounds, match('busted'), miniTournament);
    // QF maps to 'SF' via scoring map (feeding SF); bronze → 'Bronze'
    expect(health.perRound).toHaveLength(2);
    expect(health.perRound[0]!.label).toBe('SF');
    expect(health.perRound[1]!.label).toBe('Bronze');
  });

  it('maps QF picks to SF row (4 picks) and SF picks to Finalist row (2 picks)', () => {
    const rounds = [
      round('QF', [match('alive'), match('alive'), match('busted'), match('pending')]),
      round('SF', [match('alive'), match('no-pick')]),
    ];
    const health = computeBracketHealth(rounds, null, miniTournament);
    const sfRow = health.perRound.find((r) => r.label === 'SF')!;
    expect(sfRow.alivePicks).toBe(2);
    expect(sfRow.bustedPicks).toBe(1);
    expect(sfRow.pendingPicks).toBe(1);
    expect(sfRow.totalPicks).toBe(4);

    const finalist = health.perRound.find((r) => r.label === 'Finalist')!;
    expect(finalist.alivePicks).toBe(1);
    expect(finalist.totalPicks).toBe(2);
  });

  it('shows Final as its own perRound entry', () => {
    const rounds = [round('QF', [match('alive')]), round('Final', [match('pending')])];
    const health = computeBracketHealth(rounds, null, miniTournament);
    const finalRow = health.perRound.find((r) => r.label === 'Final');
    expect(finalRow).toBeDefined();
    expect(finalRow!.totalPicks).toBe(1);
    expect(finalRow!.pendingPicks).toBe(1);
  });

  it('uses 0 pts per pick for SF row (QF picks have no per-team scoring)', () => {
    const rounds = [round('QF', [match('alive'), match('alive'), match('pending')])];
    const health = computeBracketHealth(rounds, null, miniTournament);
    const sfRow = health.perRound[0]!;
    expect(sfRow.label).toBe('SF');
    expect(sfRow.earnedPoints).toBe(0);
    expect(sfRow.maxPossiblePoints).toBe(0);
  });
});
