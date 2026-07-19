import { describe, expect, it } from 'vitest';
import { miniTournament } from '@cup/engine/testing';
import type { MatchRow, PoolGroupScore, PoolKnockoutPick } from '@cup/db';
import {
  tournamentId as asTournamentId,
  matchId as asMatchId,
  userId as asUserId,
  bracketMatchKey as asBracketMatchKey,
} from '@cup/engine';
import {
  computeChampionPick,
  computeBestSingleMatch,
  computeBiggestUpset,
  computePredictionsMade,
  computeExactScoreRatePercent,
} from './build-highlights';

const GROUP_SCORING = { exactScore: 6, correctOutcome: 3 };

function groupMatch(
  id: string,
  home: string,
  away: string,
  homeGoals: number,
  awayGoals: number,
  kickoff: string,
): MatchRow {
  return {
    id,
    tournamentId: asTournamentId(miniTournament.id),
    stage: 'group',
    groupId: 'A',
    homeTeamId: home,
    awayTeamId: away,
    kickoff: new Date(kickoff),
    homeGoals,
    awayGoals,
    homeConduct: null,
    awayConduct: null,
    winnerTeamId: null,
    decidedBy: null,
    status: 'final',
  };
}

function knockoutMatch(
  id: string,
  stage: MatchRow['stage'],
  home: string,
  away: string,
  homeGoals: number,
  awayGoals: number,
  kickoff: string,
): MatchRow {
  return {
    id,
    tournamentId: asTournamentId(miniTournament.id),
    stage,
    groupId: null,
    homeTeamId: home,
    awayTeamId: away,
    kickoff: new Date(kickoff),
    homeGoals,
    awayGoals,
    homeConduct: null,
    awayConduct: null,
    winnerTeamId: null,
    decidedBy: null,
    status: 'final',
  };
}

describe('computeChampionPick', () => {
  it('finds the most-picked final winner', () => {
    const finalKey = miniTournament.bracket.finalMatch;
    const picks: PoolKnockoutPick[] = [
      { userId: asUserId('u1'), bracketMatchKey: finalKey, winnerTeamId: 'A1' },
      { userId: asUserId('u2'), bracketMatchKey: finalKey, winnerTeamId: 'A1' },
      { userId: asUserId('u3'), bracketMatchKey: finalKey, winnerTeamId: 'B1' },
    ];
    const result = computeChampionPick(picks, miniTournament, 10);
    expect(result).toEqual({ teamId: 'A1', teamName: 'Team A1', count: 2, total: 10 });
  });

  it('returns null when there are no final-winner picks', () => {
    expect(computeChampionPick([], miniTournament, 10)).toBeNull();
  });

  it('breaks ties by Tournament.teams order', () => {
    const finalKey = miniTournament.bracket.finalMatch;
    const picks: PoolKnockoutPick[] = [
      { userId: asUserId('u1'), bracketMatchKey: finalKey, winnerTeamId: 'D4' },
      { userId: asUserId('u2'), bracketMatchKey: finalKey, winnerTeamId: 'A1' },
    ];
    // A1 appears before D4 in miniTournament.teams, and both have count 1.
    const result = computeChampionPick(picks, miniTournament, 10);
    expect(result?.teamId).toBe('A1');
  });
});

describe('computeBestSingleMatch', () => {
  it('picks the group match with the most exact-score guesses', () => {
    const allMatches = [
      groupMatch('m1', 'A1', 'A2', 2, 1, '2026-06-01'),
      groupMatch('m2', 'A3', 'A4', 1, 1, '2026-06-02'),
    ];
    const groupScores: PoolGroupScore[] = [
      { userId: asUserId('u1'), matchId: 'm1', home: 2, away: 1 },
      { userId: asUserId('u2'), matchId: 'm1', home: 2, away: 1 },
      { userId: asUserId('u3'), matchId: 'm1', home: 0, away: 0 },
      { userId: asUserId('u1'), matchId: 'm2', home: 1, away: 1 },
    ];
    const result = computeBestSingleMatch(
      groupScores,
      allMatches,
      miniTournament,
      GROUP_SCORING,
      3,
    );
    expect(result?.matchId).toBe(asMatchId('m1'));
    expect(result?.exactCount).toBe(2);
    expect(result?.description).toBe('Team A1 2-1 Team A2');
  });

  it('returns null when no group match has any exact guesses', () => {
    const allMatches = [groupMatch('m1', 'A1', 'A2', 2, 1, '2026-06-01')];
    const groupScores: PoolGroupScore[] = [
      { userId: asUserId('u1'), matchId: 'm1', home: 0, away: 0 },
    ];
    expect(
      computeBestSingleMatch(groupScores, allMatches, miniTournament, GROUP_SCORING, 1),
    ).toBeNull();
  });

  it('breaks ties by earliest kickoff', () => {
    const allMatches = [
      groupMatch('m1', 'A1', 'A2', 2, 1, '2026-06-02'),
      groupMatch('m2', 'A3', 'A4', 1, 1, '2026-06-01'),
    ];
    const groupScores: PoolGroupScore[] = [
      { userId: asUserId('u1'), matchId: 'm1', home: 2, away: 1 },
      { userId: asUserId('u1'), matchId: 'm2', home: 1, away: 1 },
    ];
    const result = computeBestSingleMatch(
      groupScores,
      allMatches,
      miniTournament,
      GROUP_SCORING,
      1,
    );
    expect(result?.matchId).toBe(asMatchId('m2')); // earlier kickoff, same exactCount (1)
  });
});

describe('computeBiggestUpset', () => {
  it('finds the resolved knockout tie with the fewest correct picks', () => {
    const allMatches = [
      knockoutMatch('qf1', 'QF', 'A1', 'B2', 2, 1, '2026-06-10'),
      knockoutMatch('qf2', 'QF', 'C1', 'D2', 0, 3, '2026-06-11'),
    ];
    const picks: PoolKnockoutPick[] = [
      { userId: asUserId('u1'), bracketMatchKey: asBracketMatchKey('qf1'), winnerTeamId: 'A1' },
      { userId: asUserId('u2'), bracketMatchKey: asBracketMatchKey('qf1'), winnerTeamId: 'A1' },
      { userId: asUserId('u1'), bracketMatchKey: asBracketMatchKey('qf2'), winnerTeamId: 'D2' },
    ];
    const result = computeBiggestUpset(picks, allMatches, miniTournament, 3);
    expect(result?.matchId).toBe(asMatchId('qf2'));
    expect(result?.pickCount).toBe(1);
    expect(result?.winnerTeam).toBe('Team D2');
    expect(result?.loserTeam).toBe('Team C1');
    expect(result?.round).toBe('Quarterfinal');
  });

  it('returns null when there are no resolved knockout ties', () => {
    expect(computeBiggestUpset([], [], miniTournament, 3)).toBeNull();
  });

  it('returns null when every resolved tie has zero correct picks', () => {
    const allMatches = [knockoutMatch('qf1', 'QF', 'A1', 'B2', 2, 1, '2026-06-10')];
    expect(computeBiggestUpset([], allMatches, miniTournament, 3)).toBeNull();
  });
});

describe('computePredictionsMade', () => {
  it('sums all four counts', () => {
    expect(
      computePredictionsMade({
        groupScores: 24,
        knockoutPicks: 7,
        finishScores: 2,
        specialBets: 11,
      }),
    ).toBe(44);
  });
});

describe('computeExactScoreRatePercent', () => {
  it('computes the percentage of exact group-match guesses', () => {
    const allMatches = [
      groupMatch('m1', 'A1', 'A2', 2, 1, '2026-06-01'),
      groupMatch('m2', 'A3', 'A4', 1, 1, '2026-06-02'),
    ];
    const groupScores: PoolGroupScore[] = [
      { userId: asUserId('u1'), matchId: 'm1', home: 2, away: 1 }, // exact
      { userId: asUserId('u1'), matchId: 'm2', home: 0, away: 0 }, // outcome only
    ];
    expect(computeExactScoreRatePercent(groupScores, allMatches, GROUP_SCORING)).toBe(50);
  });

  it('returns 0 when there are no group guesses on final matches', () => {
    expect(computeExactScoreRatePercent([], [], GROUP_SCORING)).toBe(0);
  });
});
