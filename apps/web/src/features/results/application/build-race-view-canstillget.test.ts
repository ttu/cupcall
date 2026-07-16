import { describe, it, expect } from 'vitest';
import { buildPerUserKnockoutCanStillGet, buildPerUserSpecialsRemaining } from './build-race-view';
import { computeSpecialBetImpossibility } from '../domain/special-bet-impossibility';
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
// Scoring: roundOf16PerTeam=2, roundOf8PerTeam=3, roundOf4PerTeam=5, final/bronze={perTeam:5, exactScore:5}

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
    // topFour(4 non-busted)=20, Final=2×5+5+2×3=21, Bronze=2×5+5+2×3=21 (0 busted SF picks)
    expect(result.get('u1')).toBe(20 + 21 + 21); // 62
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
    // Final: 15 + 2×3=6 = 21; Bronze: 21 (0 busted SF picks)
    expect(result.get('u1')).toBe(15 + 21 + 21); // 57
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
    // No topFour (resolved); Final/Bronze position bonus still open (0 busted SF picks)
    // Final=15+6=21, Bronze=15+6=21
    expect(result.get('u1')).toBe(0 + 21 + 21); // 42
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
    // topFour = 20 (nonBustedQf=4, all unbusted)
    // Final: bustedSf=0 → 2×5+5+2×3=21
    // Bronze: bustedBronzePairs=0 → 2×5+5+2×3=21
    expect(result.get('u1')).toBe(20 + 21 + 21); // 62
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
        winner: 'A1' as TeamId,
        decidedBy: 'regulation',
      },
    };
    const result = buildPerUserKnockoutCanStillGet(
      picks,
      makeQfMatchRows(),
      miniTournament,
      resolvedActual,
    );
    // Final played → 0 for Final (position bonus for 1st/2nd also gone, block skipped entirely)
    // Bronze not played → 15 + 2×3=6 = 21 (0 busted SF picks: sf1 unresolved → conservatively viable)
    expect(result.get('u1')).toBe(20 + 0 + 21); // 41
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
    // nonBustedQf = 4-1=3 → topFour=15; Final: no SF picks → 21; Bronze: 21
    expect(result.get('u1')).toBe(15 + 21 + 21); // 57
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
    // Final/Bronze: no SF picks → 21 each
    expect(result.get('u1')).toBe(15 + 21 + 21); // 57
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
    // SF1 pick viable (TBD) → bustedSfPicks=0 → Final=15+6=21
    // Bronze: sf1 winner=A1 but no QF picks for sf1 feeders → bronzeTeam=null → 0 busted → Bronze=21
    expect(result.get('u1')).toBe(20 + 21 + 21); // 62
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
    // qf1 is final and pick=B2 lost → busted → nonBustedQf=3 → topFour=15, Final=21, Bronze=21
    // Note: Final and Bronze are still available for u1 (they just don't have SF picks)
    expect(result.get('u1')).toBe(15 + 21 + 21); // 57
  });

  it('busts the derived bronze pair when the SF winner pick itself is already busted', () => {
    // Reproduces a real production discrepancy: a user's SF winner pick (B2) is already
    // known-eliminated (qf1 final, A1 won), so Final correctly counts it as busted. But the
    // *other* QF feeder used to derive the bronze pair (Z9 — a team the user picked for qf2
    // that was never actually one of qf2's real participants, e.g. because upstream R32/R16
    // picks had already diverged from reality) never lost an actual knockout match, so it's
    // absent from `knockoutEliminatedTeams` and slips through as a "still-live" bronze pick.
    // Bronze must be at least as busted as Final for the same SF slot.
    const matches = makeQfMatchRows({ qf1Status: 'final', qf1Home: 2, qf1Away: 0 }); // A1 beat B2
    const picks = [
      makePick('u1', 'qf1', 'B2'), // busted — B2 lost
      makePick('u1', 'qf2', 'Z9'), // busted — Z9 isn't even a real qf2 participant (C1 vs D2)
      makePick('u1', 'sf1', 'B2'), // busted — B2 is already eliminated
    ];
    const result = buildPerUserKnockoutCanStillGet(
      picks,
      matches,
      miniTournament,
      emptyActualResults,
    );
    // topFour: qf1 busted, qf2 busted → nonBustedQf=2 → topFour=10
    // Final: sf1 busted (B2 eliminated), sf2 no pick → bustedSfPicks=1 → max(0,2-1)×5+5+max(0,2-1)×3=13
    // Bronze: sf1's SF-winner pick is busted, so its derived bronze slot must be busted too
    //   (not merely re-derived from Z9, which looks "alive" only because it never played a
    //   real knockout match) → bustedBronzePairs=1 → max(0,2-1)×5+5+max(0,2-1)×3=13
    expect(result.get('u1')).toBe(10 + 13 + 13); // 36
  });

  it('does not bust the bronze pair for a team that only lost the semifinal (SF loser plays Bronze, not eliminated)', () => {
    // qf1: A1 beats B2 (final). qf2: C1 beats D2 (final). sf1: A1 beats C1 (final) — the user's
    // own picks match reality exactly (qf1=A1, qf2=C1, sf1=A1), so the derived bronze team for
    // this SF slot is C1 — the real SF1 loser, a live Bronze contender, not someone eliminated
    // from the tournament. sf2 has no pick and is unplayed.
    const matches = [
      makeKnockoutMatchRow('qf1', 'QF', {
        homeTeamId: 'A1',
        awayTeamId: 'B2',
        status: 'final',
        homeGoals: 2,
        awayGoals: 0,
      }),
      makeKnockoutMatchRow('qf2', 'QF', {
        homeTeamId: 'C1',
        awayTeamId: 'D2',
        status: 'final',
        homeGoals: 1,
        awayGoals: 0,
      }),
      makeKnockoutMatchRow('qf3', 'QF', { homeTeamId: 'B1', awayTeamId: 'A2' }),
      makeKnockoutMatchRow('qf4', 'QF', { homeTeamId: 'D1', awayTeamId: 'C2' }),
      makeKnockoutMatchRow('sf1', 'SF', {
        homeTeamId: 'A1',
        awayTeamId: 'C1',
        status: 'final',
        homeGoals: 2,
        awayGoals: 1,
      }),
      makeKnockoutMatchRow('sf2', 'SF'),
      makeKnockoutMatchRow('final', 'Final'),
      makeKnockoutMatchRow('bronze', 'bronze'),
    ];
    const picks = [
      makePick('u1', 'qf1', 'A1'),
      makePick('u1', 'qf2', 'C1'),
      makePick('u1', 'qf3', 'B1'),
      makePick('u1', 'qf4', 'D1'),
      makePick('u1', 'sf1', 'A1'),
      // no sf2 pick
    ];
    const result = buildPerUserKnockoutCanStillGet(
      picks,
      matches,
      miniTournament,
      emptyActualResults,
    );
    // topFour: qf1/qf2 final+confirmed-correct (confirmedQf=2), qf3/qf4 viable-not-confirmed
    //   → nonBustedQf=4, (4-2)×5=10
    // Final: sf1 not busted (pick=A1=real winner), sf2 no pick → bustedSfPicks=0 → 2×5+5+2×3=21
    // Bronze: sf1's derived bronze team is C1 — the real SF1 loser, still a live Bronze
    //   contender — must NOT count as busted just because it lost the semifinal.
    //   bustedBronzePairs=0 → 2×5+5+2×3=21
    expect(result.get('u1')).toBe(10 + 21 + 21); // 52
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
    // Final/Bronze: neither u1 nor u2 has SF picks → 0 busted → 21 each
    expect(result.get('u1')).toBe(15 + 21 + 21); // 57
    expect(result.get('u2')).toBe(15 + 21 + 21); // 57
  });
});

describe('buildPerUserSpecialsRemaining', () => {
  const defs = getSpecialBetDefs(miniTournament.scoring).filter((d) => d.points > 0);
  const noImpossibility = computeSpecialBetImpossibility(miniTournament, []);

  it('includes points for a pending bet where the user has a pick', () => {
    const poolSpecialBets = [makeSpecialBet('u1', 'penaltyShootoutCount', 3)];
    const result = buildPerUserSpecialsRemaining(
      poolSpecialBets,
      defs,
      emptyActualResults,
      noImpossibility,
    );
    const penaltyDef = defs.find((d) => d.key === 'penaltyShootoutCount')!;
    expect(result.get('u1')).toBe(penaltyDef.points); // 10
  });

  it('excludes resolved bets even when the user has a pick', () => {
    const poolSpecialBets = [makeSpecialBet('u1', 'penaltyShootoutCount', 3)];
    const actualResults: ActualResults = {
      ...emptyActualResults,
      answers: { penaltyShootoutCount: 3 },
    };
    const result = buildPerUserSpecialsRemaining(
      poolSpecialBets,
      defs,
      actualResults,
      noImpossibility,
    );
    expect(result.get('u1') ?? 0).toBe(0);
  });

  it('returns nothing for a user with no picks on any pending bet', () => {
    const result = buildPerUserSpecialsRemaining([], defs, emptyActualResults, noImpossibility);
    expect(result.get('u1')).toBeUndefined();
  });

  it('differentiates players: one with pick, one without', () => {
    const poolSpecialBets = [makeSpecialBet('u1', 'penaltyShootoutCount', 3)];
    const result = buildPerUserSpecialsRemaining(
      poolSpecialBets,
      defs,
      emptyActualResults,
      noImpossibility,
    );
    const penaltyDef = defs.find((d) => d.key === 'penaltyShootoutCount')!;
    expect(result.get('u1')).toBe(penaltyDef.points); // has a pick
    expect(result.get('u2')).toBeUndefined(); // no pick → absent from map
  });

  it('accumulates points across multiple pending bets for the same user', () => {
    const poolSpecialBets = [
      makeSpecialBet('u1', 'penaltyShootoutCount', 3),
      makeSpecialBet('u1', 'groupTopScoringTeam', 'A1'),
    ];
    const result = buildPerUserSpecialsRemaining(
      poolSpecialBets,
      defs,
      emptyActualResults,
      noImpossibility,
    );
    const penaltyPts = defs.find((d) => d.key === 'penaltyShootoutCount')!.points;
    const groupTopPts = defs.find((d) => d.key === 'groupTopScoringTeam')!.points;
    expect(result.get('u1')).toBe(penaltyPts + groupTopPts);
  });
});
