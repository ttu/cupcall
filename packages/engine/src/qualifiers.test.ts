import { describe, expect, it } from 'vitest';
import { groupId, matchId, teamId } from './brand.js';
import { miniTournament } from './__fixtures__/mini-tournament.js';
import { deriveGroupOrders } from './standings.js';
import { selectQualifiers } from './qualifiers.js';
import type { GroupScore, Tournament } from './types.js';

// Helper: all-draw scores for all 24 group matches → seed order in each group
function allDrawScores(): GroupScore[] {
  return miniTournament.groupMatches.map((m) => ({ matchId: m.id, home: 0, away: 0 }));
}

describe('selectQualifiers', () => {
  it('with bestThirdPlaced=0 returns exactly the top-2 from each group (8 qualifiers)', () => {
    const scores = allDrawScores();
    const groupOrders = deriveGroupOrders(miniTournament, scores);
    const qualifiers = selectQualifiers(miniTournament, scores, groupOrders);

    // auto: top 2 from each of 4 groups = 8 teams
    expect(qualifiers).toHaveLength(8);
    // Group A seed order: A1, A2 qualify
    expect(qualifiers).toContain(teamId('A1'));
    expect(qualifiers).toContain(teamId('A2'));
    // Group B: B1, B2
    expect(qualifiers).toContain(teamId('B1'));
    expect(qualifiers).toContain(teamId('B2'));
    // Group C: C1, C2
    expect(qualifiers).toContain(teamId('C1'));
    expect(qualifiers).toContain(teamId('C2'));
    // Group D: D1, D2
    expect(qualifiers).toContain(teamId('D1'));
    expect(qualifiers).toContain(teamId('D2'));
    // Third-placed and fourth-placed teams must NOT be in qualifiers
    expect(qualifiers).not.toContain(teamId('A3'));
    expect(qualifiers).not.toContain(teamId('A4'));
  });

  it('with bestThirdPlaced=2 picks the two best third-placed teams by points then GD', () => {
    // Clone miniTournament with bestThirdPlaced=2
    const t: Tournament = {
      ...miniTournament,
      qualification: { autoQualifyPerGroup: 2, bestThirdPlaced: 2 },
    };

    // Design group scores so each group's third-placed team has distinct metrics:
    //   A3: 6pts, GD=+2 (best third overall)
    //   B3: 3pts, GD=+1
    //   C3: 3pts, GD=0
    //   D3: 0pts
    // → best thirds chosen: A3 then B3
    //
    // Group A matches (fixture order): mA1=A1vA2, mA2=A1vA3, mA3=A1vA4, mA4=A2vA3, mA5=A2vA4, mA6=A3vA4
    // Strategy: A1 wins all (9pts→1st), A2 wins 2 (6pts→2nd), A3 wins 2 out of remaining matches
    // A1: beats A2(mA1), beats A3(mA2), beats A4(mA3) → 9pts, 1st
    // A2: loses A1(mA1), beats A3(mA4), beats A4(mA5) → 6pts, 2nd
    // A3: loses A1(mA2), loses A2(mA4), beats A4(mA6) → 3pts ... too low
    // Need A3 to get 6pts as 3rd → impossible if A1(9) and A2(6) are both above.
    // Use: A1=9pts, A2=9pts, A3=6pts, A4=0pts
    // A1 beats A2 → no, then A2 can't have 9pts
    // Better: A1=9, A2=6, A3=6 → A3 is 3rd by GD tiebreak
    // A1: beats A2, A3, A4 → 9pts
    // A2: loses to A1, beats A3, beats A4 → 6pts
    // A3: loses to A1, loses to A2, beats A4 (1-0) → 3pts
    // Nope. Let's try:
    // A1 beats A2 (2-0), A1 beats A4 (1-0); A1 draws A3 (0-0) → A1: 7pts
    // A2 beats A3 (2-0), A2 beats A4 (2-0); A2 loses A1 → A2: 6pts
    // A3 draws A1 (0-0), loses A2 (0-2), beats A4 (3-0) → A3: 4pts, GF=3, GA=2, GD=+1
    // A4: loses all → 0pts
    // Standings: A1(7)>A2(6)>A3(4)>A4(0) ✓ A3 is 3rd with 4pts, GD=+1, GF=3
    const aScores: GroupScore[] = [
      { matchId: matchId('mA1'), home: 2, away: 0 }, // A1 beats A2
      { matchId: matchId('mA2'), home: 0, away: 0 }, // A1 draws A3
      { matchId: matchId('mA3'), home: 1, away: 0 }, // A1 beats A4
      { matchId: matchId('mA4'), home: 2, away: 0 }, // A2 beats A3
      { matchId: matchId('mA5'), home: 2, away: 0 }, // A2 beats A4
      { matchId: matchId('mA6'), home: 3, away: 0 }, // A3 beats A4
    ];
    // A3: 4pts, GF=3, GA=2, GD=+1

    // Group B: B3 gets 3pts, GD=0
    // B1 beats B2(2-0), B1 beats B4(1-0); B1 draws B3(1-1)
    // B2 loses B1; B2 draws B3(1-1), B2 beats B4(2-0)
    // B3 draws B1(1-1), draws B2(1-1), loses B4(0-1) → 2pts, GF=2,GA=3,GD=-1
    // Hmm, need B3 < A3 in points. Let me simplify:
    // B1 beats B2,B3,B4 (9pts); B2 beats B3,B4 (6pts); B3 beats B4 only (3pts); B4 loses all
    // B3: 3pts, GF= beat B4 score, GA = lost to B1 + lost to B2 scores
    const bScores: GroupScore[] = [
      { matchId: matchId('mB1'), home: 2, away: 0 }, // B1 beats B2
      { matchId: matchId('mB2'), home: 2, away: 0 }, // B1 beats B3
      { matchId: matchId('mB3'), home: 2, away: 0 }, // B1 beats B4
      { matchId: matchId('mB4'), home: 2, away: 0 }, // B2 beats B3
      { matchId: matchId('mB5'), home: 2, away: 0 }, // B2 beats B4
      { matchId: matchId('mB6'), home: 1, away: 0 }, // B3 beats B4
    ];
    // B3: 3pts, GF=1, GA=4, GD=-3

    // Group C: C3 gets 3pts too but worse GD than B3
    // Same pattern: C1>C2>C3>C4 but C3 beats C4 with same 1-0
    // C3: 3pts, GF=1, GA=4, GD=-3 — equal to B3, but group order C>B means B3 ranks higher
    const cScores: GroupScore[] = [
      { matchId: matchId('mC1'), home: 2, away: 0 },
      { matchId: matchId('mC2'), home: 2, away: 0 },
      { matchId: matchId('mC3'), home: 2, away: 0 },
      { matchId: matchId('mC4'), home: 2, away: 0 },
      { matchId: matchId('mC5'), home: 2, away: 0 },
      { matchId: matchId('mC6'), home: 1, away: 0 }, // C3 beats C4
    ];
    // C3: 3pts, GD=-3 (same as B3 — ties broken by group index A<B<C<D)

    // Group D: D3 (3rd place) gets 0pts — loses to D1, D2, and D4
    // D4 also loses to D1 and D2, but beats D3 → D4 is actually 3rd with 3pts
    // So instead: D3 beats D4 (D3 = 3rd with 3pts, still worst among all thirds)
    // But that makes D3 have 3pts same as B3/C3. Let's make D3 lose all including D4:
    // mD6 is D3 v D4 → home: 0, away: 3 means D4 beats D3 → D4 is 3rd
    // To make D3 be 3rd with worst stats: D3 must beat D4
    const dScores: GroupScore[] = [
      { matchId: matchId('mD1'), home: 2, away: 0 }, // D1 beats D2
      { matchId: matchId('mD2'), home: 2, away: 0 }, // D1 beats D3
      { matchId: matchId('mD3'), home: 2, away: 0 }, // D1 beats D4
      { matchId: matchId('mD4'), home: 2, away: 0 }, // D2 beats D3
      { matchId: matchId('mD5'), home: 2, away: 0 }, // D2 beats D4
      { matchId: matchId('mD6'), home: 1, away: 0 }, // D3 beats D4 (D3 is 3rd with 3pts)
    ];
    // D3: 3pts (beats D4), GF=1, GA=4, GD=-3 — same as B3 and C3 in pts/GD
    // Ranking among thirds: A3(4pts) > B3(3pts,D=-3,groupIdx=1) = C3(3pts,GD=-3,groupIdx=2) = D3(3pts,GD=-3,groupIdx=3)
    // → tie broken by groupIndex: A3 first, then B3(idx1) before C3(idx2) before D3(idx3)

    const scores: GroupScore[] = [...aScores, ...bScores, ...cScores, ...dScores];
    const groupOrders = deriveGroupOrders(t, scores);
    const qualifiers = selectQualifiers(t, scores, groupOrders);

    // auto-qualifiers = 2 per group = 8 teams
    // bestThirds = 2 more
    expect(qualifiers).toHaveLength(10);

    // First 8 are auto-qualifiers
    const autoQ = qualifiers.slice(0, 8);
    expect(autoQ).not.toContain(teamId('A3'));

    // Best thirds ranked: A3 (4pts, GD=+1) >> B3 (3pts, GD=-3) >> C3 (3pts, GD=-3, group C>B) >> D3 (0pts)
    const thirds = qualifiers.slice(8);
    expect(thirds).toHaveLength(2);
    expect(thirds[0]).toBe(teamId('A3'));
    expect(thirds[1]).toBe(teamId('B3'));
    // C3 and D3 do NOT make it
    expect(thirds).not.toContain(teamId('C3'));
    expect(thirds).not.toContain(teamId('D3'));
  });

  it('breaks ties among best thirds by conduct score when points and GD/GF are equal', () => {
    const t: Tournament = {
      ...miniTournament,
      qualification: { autoQualifyPerGroup: 2, bestThirdPlaced: 2 },
    };

    // All groups follow the same structure so that each 3rd-placed team ends up with
    // 3 pts, GD=−3, GF=1. The only differentiator is conduct score from card data.
    // B3: homeConduct=-1 in one of its lost matches (one yellow) → total conduct −1
    // A3, C3, D3: no cards → conduct 0  (but group-index fallback: A < B < C < D)
    // → B3 (conduct −1) should rank BELOW A3 (conduct 0); A3 and C3 are both 0
    //   but group-index A<C means A3 wins the 2nd spot over C3.
    // Expected order: A3 (0 pts tiebreak wins first), then C3 beats B3 on conduct.
    //
    // All thirds have 3 pts, GD=-3: so conductScore is the 4th tiebreaker here.
    //
    // Group pattern for each: seed-1 beats seed-2,3,4; seed-2 beats seed-3,4; seed-3 beats seed-4.
    // That gives seed-3 exactly 3 pts, GF=1 (beat seed-4), GA=4, GD=-3.

    function groupScores(
      prefix: string,
      ids: [string, string, string, string],
      cardMatchIndex: number | null,
      cardConduct: number,
    ): GroupScore[] {
      const [t1, t2, t3, t4] = ids;
      // matches: m1=1v2, m2=1v3, m3=1v4, m4=2v3, m5=2v4, m6=3v4
      const base: GroupScore[] = [
        { matchId: matchId(`m${prefix}1`), home: 2, away: 0 },
        { matchId: matchId(`m${prefix}2`), home: 2, away: 0 },
        { matchId: matchId(`m${prefix}3`), home: 2, away: 0 },
        { matchId: matchId(`m${prefix}4`), home: 2, away: 0 },
        { matchId: matchId(`m${prefix}5`), home: 2, away: 0 },
        { matchId: matchId(`m${prefix}6`), home: 1, away: 0 },
      ];
      if (cardMatchIndex !== null) {
        // Apply conduct penalty to the AWAY team of match at cardMatchIndex.
        // match index 1 = 1v2: t3 is away in match 2 (1v3) → seed-3 is away
        // match 4 = 2v3: t3 is away → conduct applies to t3
        base[cardMatchIndex]!.awayConduct = cardConduct;
      }
      return base;
    }

    // A3: no cards, conduct=0
    const aScores = groupScores(
      'A',
      ['A1', 'A2', 'A3', 'A4'] as [string, string, string, string],
      null,
      0,
    );
    // B3: gets a yellow in match mB4 (B2 vs B3, B3 is away) → conduct -1
    const bScores = groupScores(
      'B',
      ['B1', 'B2', 'B3', 'B4'] as [string, string, string, string],
      3,
      -1,
    );
    // C3: no cards, conduct=0
    const cScores = groupScores(
      'C',
      ['C1', 'C2', 'C3', 'C4'] as [string, string, string, string],
      null,
      0,
    );
    // D3: no cards, conduct=0
    const dScores = groupScores(
      'D',
      ['D1', 'D2', 'D3', 'D4'] as [string, string, string, string],
      null,
      0,
    );

    const scores: GroupScore[] = [...aScores, ...bScores, ...cScores, ...dScores];
    const groupOrders = deriveGroupOrders(t, scores);
    const qualifiers = selectQualifiers(t, scores, groupOrders);

    const thirds = qualifiers.slice(8);
    expect(thirds).toHaveLength(2);
    // A3 (conduct 0, group index 0) wins, then C3 (conduct 0, group index 2) over B3 (conduct -1)
    expect(thirds[0]).toBe(teamId('A3'));
    expect(thirds[1]).toBe(teamId('C3'));
    expect(thirds).not.toContain(teamId('B3'));
  });
});
