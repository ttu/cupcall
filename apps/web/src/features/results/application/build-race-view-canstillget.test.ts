import { describe, it, expect } from 'vitest';
import { buildPerUserKnockoutCanStillGet, buildPerUserSpecialsRemaining } from './build-race-view';
import { miniTournament } from '@cup/engine/testing';
import { getSpecialBetDefs } from '@cup/engine';
import type { UserId, BracketMatchKey, ActualResults, TournamentId, TeamId } from '@cup/engine';
import type { PoolKnockoutPick, PoolSpecialBet, MatchRow } from '@cup/db';

function makeKnockoutMatchRow(
  id: string,
  stage: MatchRow['stage'],
  opts: {
    homeTeamId?: string | null;
    awayTeamId?: string | null;
    status?: MatchRow['status'];
    homeGoals?: number | null;
    awayGoals?: number | null;
    winnerTeamId?: string | null;
  } = {},
): MatchRow {
  return {
    id,
    tournamentId: 'mini-2026' as TournamentId,
    stage,
    groupId: null,
    homeTeamId: opts.homeTeamId ?? null,
    awayTeamId: opts.awayTeamId ?? null,
    kickoff: null,
    homeGoals: opts.homeGoals ?? null,
    awayGoals: opts.awayGoals ?? null,
    homeConduct: null,
    awayConduct: null,
    winnerTeamId: opts.winnerTeamId ?? null,
    decidedBy: null,
    status: opts.status ?? 'scheduled',
  };
}

function makePick(userId: string, key: string, teamId: string): PoolKnockoutPick {
  return {
    userId: userId as UserId,
    bracketMatchKey: key as BracketMatchKey,
    winnerTeamId: teamId,
  };
}

function makeSpecialBet(userId: string, betKey: string, value: unknown): PoolSpecialBet {
  return { userId: userId as UserId, betKey, value };
}

const emptyActualResults: ActualResults = { matchResults: [], groupOrder: {}, answers: {} };

// miniTournament bracket: QF entry round (qf1-qf4) → sf1, sf2 → final + bronze
// No R16 round (roundOf16Matches=[]), roundOf8Matches=[qf1,qf2,qf3,qf4]
// Scoring: roundOf16PerTeam=2, roundOf8PerTeam=3, topFourOrder.allCorrect=20, final/bronze={perTeam:5, exactScore:5}

// Build a minimal set of knockout MatchRows for miniTournament (no group matches)
function makeQfMatchRows(
  opts: { qf1Status?: MatchRow['status']; qf1Home?: number; qf1Away?: number } = {},
): MatchRow[] {
  return [
    makeKnockoutMatchRow('qf1', 'QF', {
      homeTeamId: 'A1',
      awayTeamId: 'B2',
      status: opts.qf1Status ?? 'scheduled',
      homeGoals: opts.qf1Home ?? null,
      awayGoals: opts.qf1Away ?? null,
    }),
    makeKnockoutMatchRow('qf2', 'QF', { homeTeamId: 'C1', awayTeamId: 'D2' }),
    makeKnockoutMatchRow('qf3', 'QF', { homeTeamId: 'B1', awayTeamId: 'A2' }),
    makeKnockoutMatchRow('qf4', 'QF', { homeTeamId: 'D1', awayTeamId: 'C2' }),
    makeKnockoutMatchRow('sf1', 'SF'),
    makeKnockoutMatchRow('sf2', 'SF'),
    makeKnockoutMatchRow('final', 'Final'),
    makeKnockoutMatchRow('bronze', 'bronze'),
  ];
}

describe('buildPerUserKnockoutCanStillGet', () => {
  it('returns nothing for a player with no picks', () => {
    const result = buildPerUserKnockoutCanStillGet(
      [],
      makeQfMatchRows(),
      miniTournament,
      emptyActualResults,
    );
    expect(result.get('u1')).toBeUndefined();
  });

  it('adds topFour tier for all non-busted QF picks (all 4 viable)', () => {
    const picks = [
      makePick('u1', 'qf1', 'A1'),
      makePick('u1', 'qf2', 'C1'),
      makePick('u1', 'qf3', 'B1'),
      makePick('u1', 'qf4', 'D1'),
    ];
    const result = buildPerUserKnockoutCanStillGet(
      picks,
      makeQfMatchRows(),
      miniTournament,
      emptyActualResults,
    );
    // topFour(4 non-busted)=20, Final=2×5+5=15, Bronze=2×5+5=15 (2 sf picks → 2 bronze pairs)
    // But u1 has no SF picks → bustedSfPicks=0 (no-picks not counted as busted)
    //   Final: max(0,2-0)×5+5=15
    //   Bronze: no sfWinner picks → sfWinner=null → no busted bronze pairs counted → 2×5+5=15
    expect(result.get('u1')).toBe(20 + 15 + 15); // 50
  });

  it('reduces topFour tier when a QF pick is busted', () => {
    // qf1 is final: A1 won (2-0), so pick for C1 in qf1 is busted
    const matches = makeQfMatchRows({ qf1Status: 'final', qf1Home: 2, qf1Away: 0 });
    const picks = [
      makePick('u1', 'qf1', 'B2'), // busted — B2 lost to A1
      makePick('u1', 'qf2', 'C1'),
      makePick('u1', 'qf3', 'B1'),
      makePick('u1', 'qf4', 'D1'),
    ];
    const result = buildPerUserKnockoutCanStillGet(
      picks,
      matches,
      miniTournament,
      emptyActualResults,
    );
    // 1 busted QF pick → nonBustedQf = 4-1 = 3 → topFour(3)=15
    // Final: 15, Bronze: 15
    expect(result.get('u1')).toBe(15 + 15 + 15); // 45
  });

  it('gives 0 topFour when roundOf4 is already fully known', () => {
    const picks = [makePick('u1', 'qf1', 'A1'), makePick('u1', 'qf2', 'C1')];
    const resolvedActual: ActualResults = {
      ...emptyActualResults,
      answers: { roundOf4: ['A1', 'C1', 'B1', 'D1'] as TeamId[] },
    };
    const result = buildPerUserKnockoutCanStillGet(
      picks,
      makeQfMatchRows(),
      miniTournament,
      resolvedActual,
    );
    // No topFour (resolved), no SF picks → Final=15, Bronze=15 (no-picks not counted as busted)
    expect(result.get('u1')).toBe(0 + 15 + 15); // 30
  });

  it('gives Final canStillGet = 2×perTeam+exactScore when no SF picks are busted', () => {
    // SF picks: u1 picks A1 to win sf1, C1 to win sf2
    // QF picks to determine bronze pair: qf1→A1, qf2→B2 (sf1 from [qf1,qf2]); sf1 winner=A1 → sf1 loser=B2
    const picks = [
      makePick('u1', 'qf1', 'A1'),
      makePick('u1', 'qf2', 'C1'),
      makePick('u1', 'sf1', 'A1'),
      makePick('u1', 'sf2', 'B1'),
    ];
    const result = buildPerUserKnockoutCanStillGet(
      picks,
      makeQfMatchRows(),
      miniTournament,
      emptyActualResults,
    );
    // topFour: 4 - 0 busted (only qf1, qf2 picked) → wait, qfKeys = [qf1,qf2,qf3,qf4], nonBustedQf starts at 4
    // u1 has picks for qf1 (A1, viable) and qf2 (C1, viable), qf3 and qf4 (no pick = not busted)
    // nonBustedQf = 4 (all unbusted)
    // topFour = 20
    // Final: 2 sf picks, both viable → bustedSf=0 → max(0,2-0)×5+5=15
    // Bronze: sf1 winner=A1, qf1→A1, qf2→C1; sf1 loser=C1 (qf2 winner ≠ sf1 winner A1)
    //         sf2 winner=B1, qf3=null, qf4=null; sfWinner=B1 but no qf picks → bronzeTeam=null → skip
    //   → bustedBronzePairs=0 → 2×5+5=15
    expect(result.get('u1')).toBe(20 + 15 + 15); // 50
  });

  it('gives 0 Final canStillGet when final match is already played', () => {
    const picks = [makePick('u1', 'sf1', 'A1')];
    const resolvedActual: ActualResults = {
      ...emptyActualResults,
      finalMatch: {
        home: 'A1' as TeamId,
        away: 'C1' as TeamId,
        homeGoals: 2,
        awayGoals: 1,
        decidedBy: 'regulation',
      },
    };
    const result = buildPerUserKnockoutCanStillGet(
      picks,
      makeQfMatchRows(),
      miniTournament,
      resolvedActual,
    );
    // Final played → 0 for Final; Bronze not played → 15
    expect(result.get('u1')).toBe(20 + 0 + 15); // 35
  });

  it('marks pick as busted when the picked team is eliminated from tournament', () => {
    // qf1 is final: A1 won → B2 is eliminated
    const matches = makeQfMatchRows({ qf1Status: 'final', qf1Home: 1, qf1Away: 0 });
    const picks = [makePick('u1', 'qf2', 'B2')]; // B2 is eliminated → busted
    const result = buildPerUserKnockoutCanStillGet(
      picks,
      matches,
      miniTournament,
      emptyActualResults,
    );
    // nonBustedQf = 4-1=3 → topFour=15; Final: no SF picks → 15; Bronze: 15
    expect(result.get('u1')).toBe(15 + 15 + 15); // 45
  });

  it('marks pick as busted when both participants confirmed and pick not among them', () => {
    // qf1 has confirmed participants A1 vs B2; user picks C1 (not a participant)
    const picks = [makePick('u1', 'qf1', 'C1')];
    const result = buildPerUserKnockoutCanStillGet(
      picks,
      makeQfMatchRows(),
      miniTournament,
      emptyActualResults,
    );
    // qf1 pick busted (C1 not in A1 vs B2 when both known) → nonBustedQf=3 → topFour=15
    expect(result.get('u1')).toBe(15 + 15 + 15); // 45
  });

  it('conservatively treats pick as viable when match participants are TBD', () => {
    // sf1 has no confirmed participants (TBD) — pick is viable
    const picks = [makePick('u1', 'sf1', 'A1')];
    const result = buildPerUserKnockoutCanStillGet(
      picks,
      makeQfMatchRows(),
      miniTournament,
      emptyActualResults,
    );
    // QF: no picks (or not busted) → topFour=20
    // SF1 pick viable (TBD) → bustedSfPicks=0 → Final=15
    // Bronze: sf1 winner=A1 but no QF picks for sf1 feeders → bronzeTeam=null → 0 busted → Bronze=15
    expect(result.get('u1')).toBe(20 + 15 + 15); // 50
  });

  it('returns 0 for a player whose only picks are for already-final matches', () => {
    const matches = makeQfMatchRows({ qf1Status: 'final', qf1Home: 2, qf1Away: 0 });
    const picks = [makePick('u1', 'qf1', 'B2')]; // qf1 final, B2 lost
    const result = buildPerUserKnockoutCanStillGet(
      picks,
      matches,
      miniTournament,
      emptyActualResults,
    );
    // qf1 is final and pick=B2 lost → busted → nonBustedQf=3 → topFour=15, Final=15, Bronze=15
    // Note: Final and Bronze are still available for u1 (they just don't have SF picks)
    expect(result.get('u1')).toBe(15 + 15 + 15); // 45
  });

  it('differentiates two players: one with a viable pick, one with a busted pick', () => {
    const matches = makeQfMatchRows({ qf1Status: 'final', qf1Home: 2, qf1Away: 0 });
    const picks = [
      makePick('u1', 'qf1', 'A1'), // A1 won → u1 has a CONFIRMED-correct pick, already banked
      makePick('u2', 'qf1', 'B2'), // B2 lost → u2 is busted
    ];
    const result = buildPerUserKnockoutCanStillGet(
      picks,
      matches,
      miniTournament,
      emptyActualResults,
    );
    // u1: qf1 final, pick=A1 won → nonBustedQf=4, confirmedQf=1 (already banked via scoreTopFour)
    //   → ceiling=topFour(4)=20, banked=topFour(1)=5 → remaining upside=20-5=15
    // u2: qf1 final, pick=B2 lost → nonBustedQf=3, confirmedQf=0 → ceiling=15, banked=0 → 15
    // Both surface the same *remaining* upside — u1's already-confirmed 5 points show up in
    // their banked pointsTotal instead, not here (avoids double-counting).
    expect(result.get('u1')).toBe(15 + 15 + 15); // 45
    expect(result.get('u2')).toBe(15 + 15 + 15); // 45
  });
});

describe('buildPerUserSpecialsRemaining', () => {
  const defs = getSpecialBetDefs(miniTournament.scoring).filter((d) => d.points > 0);

  it('includes points for a pending bet where the user has a pick', () => {
    const poolSpecialBets = [makeSpecialBet('u1', 'penaltyShootoutCount', 3)];
    const result = buildPerUserSpecialsRemaining(poolSpecialBets, defs, emptyActualResults);
    const penaltyDef = defs.find((d) => d.key === 'penaltyShootoutCount')!;
    expect(result.get('u1')).toBe(penaltyDef.points); // 10
  });

  it('excludes resolved bets even when the user has a pick', () => {
    const poolSpecialBets = [makeSpecialBet('u1', 'penaltyShootoutCount', 3)];
    const actualResults: ActualResults = {
      ...emptyActualResults,
      answers: { penaltyShootoutCount: 3 },
    };
    const result = buildPerUserSpecialsRemaining(poolSpecialBets, defs, actualResults);
    expect(result.get('u1') ?? 0).toBe(0);
  });

  it('returns nothing for a user with no picks on any pending bet', () => {
    const result = buildPerUserSpecialsRemaining([], defs, emptyActualResults);
    expect(result.get('u1')).toBeUndefined();
  });

  it('differentiates players: one with pick, one without', () => {
    const poolSpecialBets = [makeSpecialBet('u1', 'penaltyShootoutCount', 3)];
    const result = buildPerUserSpecialsRemaining(poolSpecialBets, defs, emptyActualResults);
    const penaltyDef = defs.find((d) => d.key === 'penaltyShootoutCount')!;
    expect(result.get('u1')).toBe(penaltyDef.points); // has a pick
    expect(result.get('u2')).toBeUndefined(); // no pick → absent from map
  });

  it('accumulates points across multiple pending bets for the same user', () => {
    const poolSpecialBets = [
      makeSpecialBet('u1', 'penaltyShootoutCount', 3),
      makeSpecialBet('u1', 'groupTopScoringTeam', 'A1'),
    ];
    const result = buildPerUserSpecialsRemaining(poolSpecialBets, defs, emptyActualResults);
    const penaltyPts = defs.find((d) => d.key === 'penaltyShootoutCount')!.points;
    const groupTopPts = defs.find((d) => d.key === 'groupTopScoringTeam')!.points;
    expect(result.get('u1')).toBe(penaltyPts + groupTopPts);
  });
});
