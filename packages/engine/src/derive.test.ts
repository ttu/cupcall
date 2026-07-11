import { describe, expect, it } from 'vitest';
import { bracketMatchKey, groupId, teamId } from './brand.js';
import { miniTournament } from './__fixtures__/mini-tournament.js';
import { deriveCard } from './derive.js';
import type { CardInputs } from './types.js';

// All-draw scores → seed order in every group
// groupOrders: A=[A1,A2,A3,A4], B=[B1,B2,B3,B4], C=[C1,C2,C3,C4], D=[D1,D2,D3,D4]
// Slot resolution:
//   qf1: 1A(A1) vs 2B(B2), qf2: 1C(C1) vs 2D(D2), qf3: 1B(B1) vs 2A(A2), qf4: 1D(D1) vs 2C(C2)
// Picks: qf1→A1, qf2→C1, qf3→B1, qf4→D1
//   sf1: A1 vs C1 → A1; sf2: B1 vs D1 → B1
//   final: A1 vs B1 → A1; bronze: C1(loser sf1) vs D1(loser sf2) → C1
const allDrawScores = miniTournament.groupMatches.map((m) => ({
  matchId: m.id,
  home: 0,
  away: 0,
}));

const knockoutPicks = [
  { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
  { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
  { bracketMatchKey: bracketMatchKey('qf3'), winner: teamId('B1') },
  { bracketMatchKey: bracketMatchKey('qf4'), winner: teamId('D1') },
  { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('A1') },
  { bracketMatchKey: bracketMatchKey('sf2'), winner: teamId('B1') },
  { bracketMatchKey: bracketMatchKey('final'), winner: teamId('A1') },
  { bracketMatchKey: bracketMatchKey('bronze'), winner: teamId('C1') },
];

const input: CardInputs = {
  groupScores: allDrawScores,
  knockoutPicks,
  finishScores: {},
  specials: {},
};

describe('deriveCard', () => {
  it('produces correct groupOrders (seed order on all draws)', () => {
    const derived = deriveCard(input, miniTournament);
    expect(derived.groupOrders[groupId('A')]).toEqual(['A1', 'A2', 'A3', 'A4']);
    expect(derived.groupOrders[groupId('B')]).toEqual(['B1', 'B2', 'B3', 'B4']);
    expect(derived.groupOrders[groupId('C')]).toEqual(['C1', 'C2', 'C3', 'C4']);
    expect(derived.groupOrders[groupId('D')]).toEqual(['D1', 'D2', 'D3', 'D4']);
  });

  it('produces 8 qualifiers (top-2 from each group, bestThirdPlaced=0)', () => {
    const derived = deriveCard(input, miniTournament);
    expect(derived.qualifiers).toHaveLength(8);
    expect(derived.qualifiers).toContain(teamId('A1'));
    expect(derived.qualifiers).toContain(teamId('A2'));
    expect(derived.qualifiers).toContain(teamId('B1'));
    expect(derived.qualifiers).toContain(teamId('B2'));
    expect(derived.qualifiers).toContain(teamId('C1'));
    expect(derived.qualifiers).toContain(teamId('C2'));
    expect(derived.qualifiers).toContain(teamId('D1'));
    expect(derived.qualifiers).toContain(teamId('D2'));
    expect(derived.qualifiers).not.toContain(teamId('A3'));
  });

  it('produces correct roundOf8 (the 8 QF slot teams)', () => {
    const derived = deriveCard(input, miniTournament);
    expect(derived.roundOf8).toHaveLength(8);
    expect(derived.roundOf8).toContain(teamId('A1')); // 1A
    expect(derived.roundOf8).toContain(teamId('B2')); // 2B
    expect(derived.roundOf8).toContain(teamId('C1')); // 1C
    expect(derived.roundOf8).toContain(teamId('D2')); // 2D
    expect(derived.roundOf8).toContain(teamId('B1')); // 1B
    expect(derived.roundOf8).toContain(teamId('A2')); // 2A
    expect(derived.roundOf8).toContain(teamId('D1')); // 1D
    expect(derived.roundOf8).toContain(teamId('C2')); // 2C
  });

  it('produces correct finalists (SF winners)', () => {
    const derived = deriveCard(input, miniTournament);
    expect(derived.finalists).toHaveLength(2);
    expect(derived.finalists).toContain(teamId('A1')); // sf1 winner
    expect(derived.finalists).toContain(teamId('B1')); // sf2 winner
  });

  it('produces correct bronzePair (SF losers)', () => {
    const derived = deriveCard(input, miniTournament);
    expect(derived.bronzePair).toHaveLength(2);
    expect(derived.bronzePair).toContain(teamId('C1')); // sf1 loser
    expect(derived.bronzePair).toContain(teamId('D1')); // sf2 loser
  });

  it('produces correct topFour [finalWinner, finalLoser, bronzeWinner, bronzeLoser]', () => {
    const derived = deriveCard(input, miniTournament);
    expect(derived.topFour).toHaveLength(4);
    expect(derived.topFour[0]).toBe(teamId('A1')); // finalWinner
    expect(derived.topFour[1]).toBe(teamId('B1')); // finalLoser
    expect(derived.topFour[2]).toBe(teamId('C1')); // bronzeWinner
    expect(derived.topFour[3]).toBe(teamId('D1')); // bronzeLoser
  });

  it('produces correct roundOf4 (the 4 QF-winner picks) even without SF/Final/Bronze picks', () => {
    const partialInput: CardInputs = {
      groupScores: allDrawScores,
      knockoutPicks: knockoutPicks.filter((p) => p.bracketMatchKey.startsWith('qf')),
      finishScores: {},
      specials: {},
    };
    const derived = deriveCard(partialInput, miniTournament);
    expect(derived.topFour).toHaveLength(0); // no Final/Bronze pick → topFour stays empty
    expect(derived.roundOf4).toHaveLength(4);
    expect(derived.roundOf4).toContain(teamId('A1')); // qf1 pick
    expect(derived.roundOf4).toContain(teamId('C1')); // qf2 pick
    expect(derived.roundOf4).toContain(teamId('B1')); // qf3 pick
    expect(derived.roundOf4).toContain(teamId('D1')); // qf4 pick
  });
});
