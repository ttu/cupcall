import { describe, it, expect } from 'vitest';
import { miniTournament } from '@cup/engine/testing';
import { points } from '@cup/engine';
import type { UserId, BracketMatchKey, ActualResults } from '@cup/engine';
import type {
  LeaderboardEntry,
  MatchRow,
  PoolKnockoutPick,
  PoolFinishScore,
  PoolSpecialBet,
} from '@cup/db';
import type { KnockoutMatchView, BracketRoundResultView } from './types';
import { buildFinalScenarioView } from './final-scenario';

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
    homeTeamId?: string | null;
    homeTeamName?: string | null;
    awayTeamId?: string | null;
    awayTeamName?: string | null;
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
    actualHome: null,
    actualAway: null,
    actualWinnerId: null,
    actualWinnerName: null,
    kickoff: null,
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

function makeRound(label: string, matches: KnockoutMatchView[]): BracketRoundResultView {
  return { label, matches };
}

function makePick(uid: string, key: string, winnerTeamId: string): PoolKnockoutPick {
  return { userId: uid as UserId, bracketMatchKey: key as BracketMatchKey, winnerTeamId };
}

function makeFinishScore(
  uid: string,
  home: number,
  away: number,
  teamIds?: { homeTeamId: string; awayTeamId: string },
): PoolFinishScore {
  return {
    userId: uid as UserId,
    match: 'final',
    home,
    away,
    homeTeamId: teamIds?.homeTeamId ?? null,
    awayTeamId: teamIds?.awayTeamId ?? null,
  };
}

function makeSpecialBet(uid: string, betKey: string, value: unknown): PoolSpecialBet {
  return { userId: uid as UserId, betKey, value };
}

function groupMatch(
  id: string,
  groupId: string,
  home: string,
  away: string,
  homeGoals: number,
  awayGoals: number,
): MatchRow {
  return {
    id,
    tournamentId: miniTournament.id as unknown as MatchRow['tournamentId'],
    stage: 'group',
    groupId,
    homeTeamId: home,
    awayTeamId: away,
    kickoff: null,
    homeGoals,
    awayGoals,
    homeConduct: null,
    awayConduct: null,
    winnerTeamId: homeGoals > awayGoals ? home : away,
    decidedBy: null,
    status: 'final',
  };
}

const emptyActualResults: ActualResults = { matchResults: [], groupOrder: {}, answers: {} };

// The Final: A1 (home) vs B1 (away), both finalists confirmed, not yet played.
const finalScheduled = makeKnockoutMatch('final', 'Final', 'scheduled', {
  homeTeamId: 'A1',
  homeTeamName: 'Team A1',
  awayTeamId: 'B1',
  awayTeamName: 'Team B1',
});
const finalPlayed = makeKnockoutMatch('final', 'Final', 'final', {
  homeTeamId: 'A1',
  awayTeamId: 'B1',
});
const bronzePlayed = makeKnockoutMatch('bronze', 'Bronze', 'final', {
  homeTeamId: 'C1',
  awayTeamId: 'D1',
});
const bronzeScheduled = makeKnockoutMatch('bronze', 'Bronze', 'scheduled', {
  homeTeamId: 'C1',
  awayTeamId: 'D1',
});

const baseParams = {
  allMatches: [] as MatchRow[],
  def: miniTournament,
  poolKnockoutPicks: [] as PoolKnockoutPick[],
  poolFinishScores: [] as PoolFinishScore[],
  poolSpecialBets: [] as PoolSpecialBet[],
  actualResults: emptyActualResults,
};

describe('buildFinalScenarioView — trigger', () => {
  it('is null when the Final has already been played', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 10)],
      bracketRounds: [makeRound('Final', [finalPlayed])],
      bronzeMatch: bronzePlayed,
    });
    expect(view).toBeNull();
  });

  it('is null when Bronze has not been played yet', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 10)],
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzeScheduled,
    });
    expect(view).toBeNull();
  });

  it('is null when both finalists are not yet confirmed', () => {
    const halfKnown = makeKnockoutMatch('final', 'Final', 'scheduled', {
      homeTeamId: 'A1',
      awayTeamId: null,
    });
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 10)],
      bracketRounds: [makeRound('Final', [halfKnown])],
      bronzeMatch: bronzePlayed,
    });
    expect(view).toBeNull();
  });

  it('is null when the leaderboard is empty', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [],
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    expect(view).toBeNull();
  });

  it('is active with correct team ids/names when only the Final remains', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 10)],
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    expect(view).not.toBeNull();
    expect(view!.homeTeamId).toBe('A1');
    expect(view!.homeTeamName).toBe('Team A1');
    expect(view!.awayTeamId).toBe('B1');
    expect(view!.awayTeamName).toBe('Team B1');
  });
});

describe('buildFinalScenarioView — clinched baseline', () => {
  it('a single-member pool is trivially clinched in both scenarios', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 10)],
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    expect(view!.home.status).toBe('clinched');
    expect(view!.home.projectedWinnerUserId).toBe('u1');
    expect(view!.away.status).toBe('clinched');
    expect(view!.away.projectedWinnerUserId).toBe('u1');
  });

  it('the higher-pointsTotal player is clinched when no picks or bets are involved', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [
        makeLeaderboardEntry('u1', 'Alice', 100),
        makeLeaderboardEntry('u2', 'Bob', 80),
      ],
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    expect(view!.home.status).toBe('clinched');
    expect(view!.home.projectedWinnerDisplayName).toBe('Alice');
    expect(view!.home.projectedPoints).toBe(100);
  });

  it('ties break by displayName ascending, matching the leaderboard tie-break', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Zack', 50), makeLeaderboardEntry('u2', 'Amy', 50)],
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    expect(view!.home.projectedWinnerDisplayName).toBe('Amy');
  });
});

describe('buildFinalScenarioView — position bonus flips the projected winner', () => {
  // sf1 feeds qf1+qf2, sf2 feeds qf3+qf4 in miniTournament's bracket (see __fixtures__/mini-tournament.ts).
  // Both players pick consistent SF chains resolving to {A1, B1} as their predicted finalist pair —
  // only their Final-winner pick differs, isolating the positionBonus effect.
  function consistentPicks(uid: string, finalWinner: 'A1' | 'B1'): PoolKnockoutPick[] {
    return [
      makePick(uid, 'qf1', 'A1'),
      makePick(uid, 'qf2', 'C1'),
      makePick(uid, 'qf3', 'B1'),
      makePick(uid, 'qf4', 'D1'),
      makePick(uid, 'sf1', 'A1'),
      makePick(uid, 'sf2', 'B1'),
      makePick(uid, 'final', finalWinner),
    ];
  }

  it('a correct winner pick with a consistent SF chain earns 2x topFourPositionBonus (3 each)', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 50), makeLeaderboardEntry('u2', 'Bob', 55)],
      poolKnockoutPicks: [...consistentPicks('u1', 'A1'), ...consistentPicks('u2', 'B1')],
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    // Home scenario (A1 wins): Alice picked A1 correctly (+3 winner, +3 opponent=B1) -> 56.
    // Bob picked B1 (wrong team, wrong opponent too) -> stays 55. Alice leads, clinched (no pending items).
    expect(view!.home.projectedWinnerDisplayName).toBe('Alice');
    expect(view!.home.projectedPoints).toBe(56);
    expect(view!.home.status).toBe('clinched');

    // Away scenario (B1 wins): Bob picked B1 correctly -> 55 + 6 = 61. Alice picked A1 (wrong) -> stays 50.
    expect(view!.away.projectedWinnerDisplayName).toBe('Bob');
    expect(view!.away.projectedPoints).toBe(61);
    expect(view!.away.status).toBe('clinched');
  });
});

describe('buildFinalScenarioView — must-hit checklist', () => {
  it("lists only as many of the leader's own pending items as needed, highest-value first", () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 50), makeLeaderboardEntry('u2', 'Bob', 48)],
      poolSpecialBets: [
        makeSpecialBet('u1', 'mostYellowCardsTeam', 'A1'), // 15 pts
        makeSpecialBet('u1', 'groupTopScoringTeam', 'A1'), // 10 pts
        makeSpecialBet('u2', 'highestMatchGoals', 5), // 10 pts
      ],
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    // Bob's ceiling = 48 + 10 = 58 > Alice's 50 -> not clinched.
    // Alice needs > 8 more; her highest pending item alone (15) clears it.
    expect(view!.home.status).toBe('checklist');
    expect(view!.home.mustHit).toHaveLength(1);
    expect(view!.home.mustHit[0]!.points).toBe(15);
  });

  it("is too-close-to-call when even all of the leader's pending items fall short", () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 50), makeLeaderboardEntry('u2', 'Bob', 60)],
      poolSpecialBets: [
        makeSpecialBet('u1', 'mostYellowCardsTeam', 'A1'), // 15 pts
        makeSpecialBet('u1', 'groupTopScoringTeam', 'A1'), // 10 pts
        makeSpecialBet('u2', 'highestMatchGoals', 5), // 10 pts
      ],
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    // No picks for either user -> positionBonus is 0 everywhere, so lockedScore is just
    // pointsTotal: Bob (60) > Alice (50) -> Bob is the leader. maxRivalCeiling = Alice's ceiling
    // = 50 + 15 + 10 = 75. Bob's lockedScore (60) < 75 -> not clinched. Bob's only pending item
    // is his 10-pt bet: running = 60 + 10 = 70, still not > 75 -> falls short even using
    // everything he has.
    expect(view!.home.projectedWinnerDisplayName).toBe('Bob');
    expect(view!.home.status).toBe('too-close');
    expect(view!.home.mustHit).toHaveLength(1);
    expect(view!.home.mustHit[0]!.points).toBe(10);
  });

  it("excludes an already-resolved special bet from a rival's ceiling", () => {
    const resolvedActuals: ActualResults = {
      ...emptyActualResults,
      answers: { highestMatchGoals: 7 },
    };
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 56), makeLeaderboardEntry('u2', 'Bob', 55)],
      poolSpecialBets: [makeSpecialBet('u2', 'highestMatchGoals', 5)],
      actualResults: resolvedActuals,
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    // Bob's highestMatchGoals bet is already resolved (actual=7) -> not a pending item -> ceiling stays 55.
    expect(view!.home.status).toBe('clinched');
  });

  it("excludes a mathematically impossible special bet pick from a rival's ceiling", () => {
    const groupAFull: MatchRow[] = [
      groupMatch('mA1', 'A', 'A1', 'A2', 3, 0),
      groupMatch('mA2', 'A', 'A1', 'A3', 3, 0),
      groupMatch('mA3', 'A', 'A1', 'A4', 3, 0),
      groupMatch('mA4', 'A', 'A2', 'A3', 3, 0),
      groupMatch('mA5', 'A', 'A2', 'A4', 3, 0),
      groupMatch('mA6', 'A', 'A3', 'A4', 1, 1),
    ];
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 56), makeLeaderboardEntry('u2', 'Bob', 55)],
      poolSpecialBets: [makeSpecialBet('u2', 'groupTopScoringTeam', 'A2')], // A1 dominates -> A2 pick is dead
      allMatches: groupAFull,
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    expect(view!.home.status).toBe('clinched');
  });
});

describe('buildFinalScenarioView — Final exact-score pending item', () => {
  // A snapshot-backed finish score also drives pickedWinner resolution (resolveFinaleWinner's
  // team-id-snapshot branch short-circuits before touching bracket picks at all), so a non-tied
  // prediction contributes BOTH a positionBonus (in whichever scenario it implies) and — only in
  // that same scenario — the exact-score pending item. Both tests below account for that combined
  // effect explicitly rather than assuming the item is the only thing moving.

  it('contributes a pending item only in the scenario matching the implied winner', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 45), makeLeaderboardEntry('u2', 'Bob', 44)],
      poolFinishScores: [makeFinishScore('u1', 2, 1, { homeTeamId: 'A1', awayTeamId: 'B1' })],
      poolSpecialBets: [makeSpecialBet('u2', 'highestMatchGoals', 5)], // Bob's own 10-pt pending item
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    // Home (A1 wins): Alice's 2-1 prediction implies A1 -> pickedWinner='A1' matches scenarioWinner
    // -> +3 positionBonus (no opponent pick, so only the winner half applies) -> lockedScore 48.
    // Bob stays at 44. Alice leads; maxRivalCeiling = Bob's ceiling = 44 + 10 = 54. 48 < 54 -> not
    // clinched. Alice's only pending item here is the 5-pt exact score (implied winner matches) ->
    // running = 48 + 5 = 53, still <= 54 -> too-close, but the item IS present.
    expect(view!.home.status).toBe('too-close');
    expect(view!.home.mustHit).toHaveLength(1);
    expect(view!.home.mustHit[0]!.points).toBe(5);

    // Away (B1 wins): Alice's implied winner (A1) doesn't match -> no positionBonus, no exact-score
    // item -> lockedScore 45, pendingItems empty. Bob unchanged at 44 + [10]. Alice still leads
    // (45 > 44); maxRivalCeiling = 54; not clinched; but Alice has nothing pending to list.
    expect(view!.away.status).toBe('too-close');
    expect(view!.away.mustHit).toHaveLength(0);
  });

  it('is pending in both scenarios when the predicted score is a draw', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 40), makeLeaderboardEntry('u2', 'Bob', 38)],
      poolFinishScores: [makeFinishScore('u1', 1, 1, { homeTeamId: 'A1', awayTeamId: 'B1' })],
      poolSpecialBets: [makeSpecialBet('u2', 'highestMatchGoals', 5)], // Bob's own 10-pt pending item
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    // A tied prediction never implies a winner, so resolveFinaleWinner returns null before even
    // looking at the snapshot -> Alice's positionBonus is 0 in both scenarios, isolating the
    // exact-score item's own behavior. Alice leads 40 > 38 either way; maxRivalCeiling = Bob's
    // ceiling = 38 + 10 = 48; not clinched. Alice's only pending item (the 5-pt draw prediction) is
    // present in both scenarios -> mustHit has exactly 1 item both times.
    expect(view!.home.status).toBe('too-close');
    expect(view!.home.mustHit).toHaveLength(1);
    expect(view!.home.mustHit[0]!.points).toBe(5);
    expect(view!.away.status).toBe('too-close');
    expect(view!.away.mustHit).toHaveLength(1);
    expect(view!.away.mustHit[0]!.points).toBe(5);
  });

  it('is never included when the finish score has no team-id snapshot', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 40), makeLeaderboardEntry('u2', 'Bob', 38)],
      poolFinishScores: [makeFinishScore('u1', 1, 1)], // tied, no homeTeamId/awayTeamId snapshot
      poolSpecialBets: [makeSpecialBet('u2', 'highestMatchGoals', 5)],
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    // Same point totals as the draw test above, but no snapshot -> exactScorePoints can never be
    // awarded (finish-matches.ts), so no pending item should appear at all, in either scenario —
    // contrast with the previous test's mustHit length of 1.
    expect(view!.home.mustHit).toHaveLength(0);
    expect(view!.away.mustHit).toHaveLength(0);
  });
});
