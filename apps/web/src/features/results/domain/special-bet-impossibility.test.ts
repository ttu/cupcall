import { describe, expect, it } from 'vitest';
import { miniTournament } from '@cup/engine/testing';
import { tournamentId as asTournamentId } from '@cup/engine';
import type { MatchRow } from '@cup/db';
import { computeSpecialBetImpossibility } from './special-bet-impossibility';

function groupMatch(
  id: string,
  groupId: string,
  home: string,
  away: string,
  homeGoals: number | null,
  awayGoals: number | null,
  status: MatchRow['status'] = 'final',
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
    winnerTeamId:
      homeGoals === null || awayGoals === null || homeGoals === awayGoals
        ? null
        : homeGoals > awayGoals
          ? home
          : away,
    decidedBy: null,
    status,
  };
}

function koMatch(
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

// Group A, fully played: seed 1 (A1) wins every match — A1 (9pts) and A2 (6pts) qualify,
// A3/A4 (1pt each) are eliminated. A1 scores 9, concedes 0; A4 scores 1, concedes 9.
function groupAWithA1Dominant(): MatchRow[] {
  return [
    groupMatch('mA1', 'A', 'A1', 'A2', 3, 0),
    groupMatch('mA2', 'A', 'A1', 'A3', 3, 0),
    groupMatch('mA3', 'A', 'A1', 'A4', 3, 0),
    groupMatch('mA4', 'A', 'A2', 'A3', 3, 0),
    groupMatch('mA5', 'A', 'A2', 'A4', 3, 0),
    groupMatch('mA6', 'A', 'A3', 'A4', 1, 1),
  ];
}

// Group A, fully played: seed 1 (A1) loses every match it plays against A2/A3/A4 directly —
// A2 (9pts) and A3 (6pts) qualify; A1 and A4 are eliminated.
function groupAWithA1Eliminated(): MatchRow[] {
  return [
    groupMatch('mA1', 'A', 'A1', 'A2', 0, 3),
    groupMatch('mA2', 'A', 'A1', 'A3', 0, 3),
    groupMatch('mA3', 'A', 'A1', 'A4', 0, 3),
    groupMatch('mA4', 'A', 'A2', 'A3', 2, 0),
    groupMatch('mA5', 'A', 'A2', 'A4', 2, 0),
    groupMatch('mA6', 'A', 'A3', 'A4', 1, 0),
  ];
}

// Same dominant-seed-1 pattern for a generic group letter, used to complete the other
// groups when a test needs the whole group stage (not just group A) finished.
function groupWithSeed1Dominant(g: 'B' | 'C' | 'D'): MatchRow[] {
  return [
    groupMatch(`m${g}1`, g, `${g}1`, `${g}2`, 3, 0),
    groupMatch(`m${g}2`, g, `${g}1`, `${g}3`, 3, 0),
    groupMatch(`m${g}3`, g, `${g}1`, `${g}4`, 3, 0),
    groupMatch(`m${g}4`, g, `${g}2`, `${g}3`, 3, 0),
    groupMatch(`m${g}5`, g, `${g}2`, `${g}4`, 3, 0),
    groupMatch(`m${g}6`, g, `${g}3`, `${g}4`, 1, 1),
  ];
}

function fullGroupStageA1Dominant(): MatchRow[] {
  return [
    ...groupAWithA1Dominant(),
    ...groupWithSeed1Dominant('B'),
    ...groupWithSeed1Dominant('C'),
    ...groupWithSeed1Dominant('D'),
  ];
}

describe('computeSpecialBetImpossibility — groupTopScoringTeam / groupTopConcedingTeam', () => {
  it('is not impossible while the team’s group still has unplayed matches', () => {
    const matches = [
      groupMatch('mA1', 'A', 'A1', 'A2', 3, 0),
      groupMatch('mA2', 'A', 'A1', 'A3', 0, 0, 'scheduled'),
    ];
    const oracle = computeSpecialBetImpossibility(miniTournament, matches);
    expect(oracle.isImpossible('groupTopScoringTeam', 'A2')).toBe(false);
  });

  it('is impossible once the group is fully played and the pick is not among the leaders', () => {
    const matches = groupAWithA1Dominant();
    const oracle = computeSpecialBetImpossibility(miniTournament, matches);
    expect(oracle.isImpossible('groupTopScoringTeam', 'A2')).toBe(true);
  });

  it('is not impossible for the team currently tied at the top of its group', () => {
    const matches = groupAWithA1Dominant();
    const oracle = computeSpecialBetImpossibility(miniTournament, matches);
    expect(oracle.isImpossible('groupTopScoringTeam', 'A1')).toBe(false);
  });

  it('most-conceded uses the conceding leader, not the scoring leader', () => {
    const matches = groupAWithA1Dominant(); // A4 concedes the most (3+3+3=9), A1 concedes least
    const oracle = computeSpecialBetImpossibility(miniTournament, matches);
    expect(oracle.isImpossible('groupTopConcedingTeam', 'A1')).toBe(true);
    expect(oracle.isImpossible('groupTopConcedingTeam', 'A4')).toBe(false);
  });

  it('is not impossible when every team in the group is still tied at zero (no leader yet)', () => {
    const matches = [
      groupMatch('mA1', 'A', 'A1', 'A2', 0, 0),
      groupMatch('mA2', 'A', 'A1', 'A3', 0, 0),
      groupMatch('mA3', 'A', 'A1', 'A4', 0, 0),
      groupMatch('mA4', 'A', 'A2', 'A3', 0, 0),
      groupMatch('mA5', 'A', 'A2', 'A4', 0, 0),
      groupMatch('mA6', 'A', 'A3', 'A4', 0, 0),
    ];
    const oracle = computeSpecialBetImpossibility(miniTournament, matches);
    expect(oracle.isImpossible('groupTopScoringTeam', 'A2')).toBe(false);
  });
});

describe('computeSpecialBetImpossibility — tournamentTopScoringTeam / tournamentTopConcedingTeam', () => {
  it('is not impossible for a team that is eliminated but still the current leader', () => {
    const matches = [
      groupMatch('mA1', 'A', 'A1', 'A2', 5, 0),
      koMatch('qf1', 'QF', 'A1', 'B1', 0, 3),
    ];
    const oracle = computeSpecialBetImpossibility(miniTournament, matches);
    // A1 is eliminated (lost its QF) but still leads overall on goals (5 vs B1's 3).
    expect(oracle.isImpossible('tournamentTopScoringTeam', 'A1')).toBe(false);
  });

  it('is impossible once a team is eliminated and no longer among the current leaders', () => {
    const matches = [
      groupMatch('mA1', 'A', 'A1', 'A2', 5, 0),
      koMatch('qf1', 'QF', 'A2', 'C1', 0, 3),
    ];
    const oracle = computeSpecialBetImpossibility(miniTournament, matches);
    // A2 scored 0 total and is eliminated (lost its QF) — can never catch A1's 5.
    expect(oracle.isImpossible('tournamentTopScoringTeam', 'A2')).toBe(true);
  });

  it('is not impossible for a team still alive in the knockout stage', () => {
    const matches = [...groupAWithA1Dominant(), koMatch('qf1', 'QF', 'A1', 'B1', 2, 0)];
    const oracle = computeSpecialBetImpossibility(miniTournament, matches);
    expect(oracle.isImpossible('tournamentTopScoringTeam', 'A1')).toBe(false);
  });

  it('is impossible once the whole group stage ends and the team failed to qualify', () => {
    const matches = fullGroupStageA1Dominant(); // A3/B3/C3/D3 (and the 4th-place teams) fail to qualify
    const oracle = computeSpecialBetImpossibility(miniTournament, matches);
    // A3 scored only 1 goal all group stage; A1/B1/C1/D1 are tied at 9 and A3 has no more matches.
    expect(oracle.isImpossible('tournamentTopScoringTeam', 'A3')).toBe(true);
  });

  it('most-conceded (tournament) uses the conceding leader', () => {
    const matches = fullGroupStageA1Dominant();
    const oracle = computeSpecialBetImpossibility(miniTournament, matches);
    // A1/B1/C1/D1 concede 0 across the group stage and are still alive (not "done") — never impossible via this path.
    expect(oracle.isImpossible('tournamentTopConcedingTeam', 'A1')).toBe(false);
  });

  it('is not impossible for a team still mid-group-stage (qualification undecided)', () => {
    // One match played; the rest of the tournament's group matches are still scheduled —
    // matches the real data shape, where every group match row exists from the start.
    const matches = fullGroupStageA1Dominant().map((m) =>
      m.id === 'mA1'
        ? m
        : {
            ...m,
            homeGoals: null,
            awayGoals: null,
            winnerTeamId: null,
            status: 'scheduled' as const,
          },
    );
    const oracle = computeSpecialBetImpossibility(miniTournament, matches);
    expect(oracle.isImpossible('tournamentTopScoringTeam', 'A2')).toBe(false);
  });
});

describe('computeSpecialBetImpossibility — highestMatchGoals', () => {
  it('is impossible once the current max already exceeds the prediction', () => {
    const matches = [groupMatch('mA1', 'A', 'A1', 'A2', 4, 2)]; // 6 goals
    const oracle = computeSpecialBetImpossibility(miniTournament, matches);
    expect(oracle.isImpossible('highestMatchGoals', 5)).toBe(true);
  });

  it('is not impossible when the current max is at or below the prediction', () => {
    const matches = [groupMatch('mA1', 'A', 'A1', 'A2', 2, 2)]; // 4 goals
    const oracle = computeSpecialBetImpossibility(miniTournament, matches);
    expect(oracle.isImpossible('highestMatchGoals', 4)).toBe(false);
    expect(oracle.isImpossible('highestMatchGoals', 5)).toBe(false);
  });

  it('is not impossible when no match has been played yet', () => {
    const oracle = computeSpecialBetImpossibility(miniTournament, []);
    expect(oracle.isImpossible('highestMatchGoals', 3)).toBe(false);
  });
});

describe('computeSpecialBetImpossibility — penaltyShootoutCount', () => {
  it('is impossible once the current count already exceeds the prediction', () => {
    const matches = [
      koMatch('qf1', 'QF', 'A1', 'B1', 1, 1, 'penalties'),
      koMatch('qf2', 'QF', 'C1', 'D1', 2, 2, 'penalties'),
    ];
    const oracle = computeSpecialBetImpossibility(miniTournament, matches);
    expect(oracle.isImpossible('penaltyShootoutCount', 1)).toBe(true);
  });

  it('is not impossible when the current count is at or below the prediction', () => {
    const matches = [koMatch('qf1', 'QF', 'A1', 'B1', 1, 1, 'penalties')];
    const oracle = computeSpecialBetImpossibility(miniTournament, matches);
    expect(oracle.isImpossible('penaltyShootoutCount', 1)).toBe(false);
    expect(oracle.isImpossible('penaltyShootoutCount', 2)).toBe(false);
  });
});

describe('computeSpecialBetImpossibility — finalDecisiveGoalPlayer', () => {
  it('is impossible once the predicted player’s team loses a knockout match', () => {
    const matches = [...groupAWithA1Dominant(), koMatch('qf1', 'QF', 'A1', 'B1', 0, 3)];
    const oracle = computeSpecialBetImpossibility(miniTournament, matches);
    // Fixture player A1-P belongs to team A1.
    expect(oracle.isImpossible('finalDecisiveGoalPlayer', 'A1-P')).toBe(true);
  });

  it('is not impossible while the player’s team is still alive', () => {
    const matches = [...groupAWithA1Dominant(), koMatch('qf1', 'QF', 'A1', 'B1', 3, 0)];
    const oracle = computeSpecialBetImpossibility(miniTournament, matches);
    expect(oracle.isImpossible('finalDecisiveGoalPlayer', 'A1-P')).toBe(false);
  });

  it('is impossible once the player’s team fails to qualify from the group stage', () => {
    const matches = [
      ...groupAWithA1Eliminated(),
      ...groupWithSeed1Dominant('B'),
      ...groupWithSeed1Dominant('C'),
      ...groupWithSeed1Dominant('D'),
    ];
    const oracle = computeSpecialBetImpossibility(miniTournament, matches);
    // A1 finished last in this group layout — never qualifies, never plays again.
    expect(oracle.isImpossible('finalDecisiveGoalPlayer', 'A1-P')).toBe(true);
  });
});

describe('computeSpecialBetImpossibility — non-derivable bets', () => {
  it('never returns impossible for bets with no live data source', () => {
    const matches = fullGroupStageA1Dominant();
    const oracle = computeSpecialBetImpossibility(miniTournament, matches);
    expect(oracle.isImpossible('topScorerPlayer', 'A1-P')).toBe(false);
    expect(oracle.isImpossible('firstRedCardPlayer', 'A1-P')).toBe(false);
    expect(oracle.isImpossible('mostYellowCardsTeam', 'A1')).toBe(false);
    expect(oracle.isImpossible('finalDecidedByPenalties', true)).toBe(false);
  });
});
