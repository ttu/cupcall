import { describe, expect, it } from 'vitest';
import { miniTournament } from '@cup/engine/testing';
import { tournamentId as asTournamentId } from '@cup/engine';
import type { MatchRow } from '@cup/db';
import {
  computeGroupTopScoringLeader,
  computeGroupTopConcedingLeader,
  computeTournamentTopScoringLeader,
  computeTournamentTopConcedingLeader,
  computeHighestMatchGoalsLeader,
  computePenaltyShootoutCountLeader,
} from './special-bet-current';

function groupFinal(
  id: string,
  groupId: string,
  home: string,
  away: string,
  homeGoals: number,
  awayGoals: number,
): MatchRow {
  return {
    id,
    tournamentId: asTournamentId(miniTournament.id),
    stage: 'group',
    groupId,
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

function koFinal(
  id: string,
  stage: 'QF' | 'SF' | 'Final' | 'bronze',
  home: string,
  away: string,
  homeGoals: number,
  awayGoals: number,
  decidedBy: MatchRow['decidedBy'] = 'regulation',
): MatchRow {
  return {
    id,
    tournamentId: asTournamentId(miniTournament.id),
    stage,
    groupId: null,
    homeTeamId: home,
    awayTeamId: away,
    kickoff: null,
    homeGoals,
    awayGoals,
    homeConduct: null,
    awayConduct: null,
    winnerTeamId: homeGoals >= awayGoals ? home : away,
    decidedBy,
    status: 'final',
  };
}

describe('computeGroupTopScoringLeader', () => {
  it('returns null when no matches have been played', () => {
    expect(computeGroupTopScoringLeader(miniTournament, [])).toBeNull();
  });

  it('returns null when all played matches are 0-0', () => {
    const matches = [groupFinal('mA1', 'A', 'A1', 'A2', 0, 0)];
    expect(computeGroupTopScoringLeader(miniTournament, matches)).toBeNull();
  });

  it('returns single leader with goal count and team id', () => {
    const matches = [
      groupFinal('mA1', 'A', 'A1', 'A2', 3, 1),
      groupFinal('mA2', 'A', 'A3', 'A4', 0, 0),
    ];
    const leader = computeGroupTopScoringLeader(miniTournament, matches);
    expect(leader).not.toBeNull();
    expect(leader!.display).toBe('Team A1');
    expect(leader!.detail).toBe('3 goals');
    expect(leader!.teamIds).toEqual(['A1']);
  });

  it('lists tied leaders in tournament team order', () => {
    const matches = [
      groupFinal('mA1', 'A', 'A1', 'A2', 2, 0),
      groupFinal('mB1', 'B', 'B1', 'B2', 2, 0),
    ];
    const leader = computeGroupTopScoringLeader(miniTournament, matches);
    expect(leader!.display).toBe('Team A1, Team B1');
    expect(leader!.teamIds).toEqual(['A1', 'B1']);
    expect(leader!.detail).toBe('2 goals');
  });

  it('ignores knockout matches', () => {
    const matches = [
      groupFinal('mA1', 'A', 'A1', 'A2', 1, 0),
      koFinal('qf1', 'QF', 'A1', 'B1', 5, 0),
    ];
    const leader = computeGroupTopScoringLeader(miniTournament, matches);
    expect(leader!.detail).toBe('1 goals'); // QF goals excluded
  });

  it('ignores matches without scores', () => {
    const matches: MatchRow[] = [
      {
        ...groupFinal('mA1', 'A', 'A1', 'A2', 0, 0),
        homeGoals: null,
        awayGoals: null,
        status: 'scheduled',
      },
    ];
    expect(computeGroupTopScoringLeader(miniTournament, matches)).toBeNull();
  });
});

describe('computeGroupTopConcedingLeader', () => {
  it('returns the team(s) with most goals against in group stage', () => {
    const matches = [
      groupFinal('mA1', 'A', 'A1', 'A2', 4, 0), // A2 concedes 4
      groupFinal('mB1', 'B', 'B1', 'B2', 0, 0),
    ];
    const leader = computeGroupTopConcedingLeader(miniTournament, matches);
    expect(leader!.display).toBe('Team A2');
    expect(leader!.detail).toBe('4 goals');
    expect(leader!.teamIds).toEqual(['A2']);
  });

  it('ignores knockout matches', () => {
    const matches = [
      groupFinal('mA1', 'A', 'A1', 'A2', 1, 0),
      koFinal('qf1', 'QF', 'B1', 'A2', 5, 0), // A2 concedes 0, B1 concedes 5 in KO — should be ignored
    ];
    const leader = computeGroupTopConcedingLeader(miniTournament, matches);
    expect(leader!.display).toBe('Team A2');
    expect(leader!.detail).toBe('1 goals');
  });
});

describe('computeTournamentTopScoringLeader', () => {
  it('includes knockout goals', () => {
    const matches = [
      groupFinal('mA1', 'A', 'A1', 'A2', 1, 0),
      koFinal('qf1', 'QF', 'A1', 'B1', 3, 0),
    ];
    const leader = computeTournamentTopScoringLeader(miniTournament, matches);
    expect(leader!.display).toBe('Team A1');
    expect(leader!.detail).toBe('4 goals');
  });

  it('returns null when no scored matches', () => {
    expect(computeTournamentTopScoringLeader(miniTournament, [])).toBeNull();
  });
});

describe('computeTournamentTopConcedingLeader', () => {
  it('aggregates conceded across group + knockout', () => {
    const matches = [
      groupFinal('mA1', 'A', 'A1', 'A2', 2, 0), // A2 concedes 2
      koFinal('qf1', 'QF', 'B1', 'A2', 3, 0), // A2 concedes 3
    ];
    const leader = computeTournamentTopConcedingLeader(miniTournament, matches);
    expect(leader!.display).toBe('Team A2');
    expect(leader!.detail).toBe('5 goals');
  });
});

describe('computeHighestMatchGoalsLeader', () => {
  it('returns null when no scored matches', () => {
    expect(computeHighestMatchGoalsLeader([])).toBeNull();
  });

  it('returns max with "1 match" when single max', () => {
    const matches = [
      groupFinal('mA1', 'A', 'A1', 'A2', 3, 1), // 4
      groupFinal('mA2', 'A', 'A3', 'A4', 0, 0), // 0
    ];
    const leader = computeHighestMatchGoalsLeader(matches);
    expect(leader!.display).toBe('4');
    expect(leader!.detail).toBe('1 match');
    expect(leader!.teamIds).toEqual([]);
  });

  it('counts ties with "N matches"', () => {
    const matches = [
      groupFinal('mA1', 'A', 'A1', 'A2', 3, 1),
      groupFinal('mB1', 'B', 'B1', 'B2', 2, 2),
      groupFinal('mC1', 'C', 'C1', 'C2', 4, 0),
    ];
    const leader = computeHighestMatchGoalsLeader(matches);
    expect(leader!.display).toBe('4');
    expect(leader!.detail).toBe('3 matches');
  });

  it('ignores matches without a score', () => {
    const matches: MatchRow[] = [
      {
        ...groupFinal('mA1', 'A', 'A1', 'A2', 0, 0),
        homeGoals: null,
        awayGoals: null,
        status: 'scheduled',
      },
    ];
    expect(computeHighestMatchGoalsLeader(matches)).toBeNull();
  });
});

describe('computePenaltyShootoutCountLeader', () => {
  it('returns null when count is 0', () => {
    const matches = [koFinal('qf1', 'QF', 'A1', 'B1', 2, 1, 'regulation')];
    expect(computePenaltyShootoutCountLeader(matches)).toBeNull();
  });

  it('counts only matches decided by penalties', () => {
    const matches = [
      koFinal('qf1', 'QF', 'A1', 'B1', 1, 1, 'penalties'),
      koFinal('qf2', 'QF', 'C1', 'D1', 2, 2, 'penalties'),
      koFinal('qf3', 'QF', 'A2', 'B2', 1, 0, 'regulation'),
    ];
    const leader = computePenaltyShootoutCountLeader(matches);
    expect(leader!.display).toBe('2');
    expect(leader!.detail).toBe('');
    expect(leader!.teamIds).toEqual([]);
  });
});
