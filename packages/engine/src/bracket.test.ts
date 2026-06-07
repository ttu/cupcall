import { describe, expect, it } from 'vitest';
import { bracketMatchKey, groupId, teamId, type GroupId, type TeamId } from './brand.js';
import { miniTournament } from './__fixtures__/mini-tournament.js';
import { deriveGroupOrders } from './standings.js';
import { selectQualifiers } from './qualifiers.js';
import { buildBracket, resolveSlot } from './bracket.js';
import type { GroupScore, KnockoutPick } from './types.js';

// All-draw scores → seed order in each group
// groupOrders: A=[A1,A2,A3,A4], B=[B1,B2,B3,B4], C=[C1,C2,C3,C4], D=[D1,D2,D3,D4]
const allDrawScores: GroupScore[] = miniTournament.groupMatches.map((m) => ({
  matchId: m.id,
  home: 0,
  away: 0,
}));

// Slot resolution with seed order:
//   1A = A1, 2B = B2, 1C = C1, 2D = D2, 1B = B1, 2A = A2, 1D = D1, 2C = C2
// QF matches:
//   qf1: A1 (home) vs B2 (away)
//   qf2: C1 (home) vs D2 (away)
//   qf3: B1 (home) vs A2 (away)
//   qf4: D1 (home) vs C2 (away)
// SF progression:
//   sf1: winner(qf1) vs winner(qf2)
//   sf2: winner(qf3) vs winner(qf4)
// Final:
//   final: winner(sf1) vs winner(sf2)
// Bronze:
//   bronze: loser(sf1) vs loser(sf2)

describe('buildBracket', () => {
  it('correctly slots 8 teams into roundOf8', () => {
    const groupOrders = deriveGroupOrders(miniTournament, allDrawScores);
    const qualifiers = selectQualifiers(miniTournament, allDrawScores, groupOrders);

    // picks: pick A1 wins qf1, C1 wins qf2, B1 wins qf3, D1 wins qf4
    // → sf1: A1 vs C1 → pick A1; sf2: B1 vs D1 → pick B1
    // → final: A1 vs B1 → pick A1; bronze: C1 vs D1 → pick C1
    const picks: KnockoutPick[] = [
      { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
      { bracketMatchKey: bracketMatchKey('qf3'), winner: teamId('B1') },
      { bracketMatchKey: bracketMatchKey('qf4'), winner: teamId('D1') },
      { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('sf2'), winner: teamId('B1') },
      { bracketMatchKey: bracketMatchKey('final'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('bronze'), winner: teamId('C1') },
    ];

    const result = buildBracket(miniTournament, groupOrders, qualifiers, picks);

    // roundOf8 should contain all 8 slotted QF participants in slot order
    // (qf1..qf4, home then away): [1A,2B, 1C,2D, 1B,2A, 1D,2C]
    expect(result.roundOf8).toEqual([
      teamId('A1'),
      teamId('B2'),
      teamId('C1'),
      teamId('D2'),
      teamId('B1'),
      teamId('A2'),
      teamId('D1'),
      teamId('C2'),
    ]);
    expect(result.roundOf8).toHaveLength(8);
    expect(result.roundOf8).toContain(teamId('A1')); // 1A = qf1 home
    expect(result.roundOf8).toContain(teamId('B2')); // 2B = qf1 away
    expect(result.roundOf8).toContain(teamId('C1')); // 1C = qf2 home
    expect(result.roundOf8).toContain(teamId('D2')); // 2D = qf2 away
    expect(result.roundOf8).toContain(teamId('B1')); // 1B = qf3 home
    expect(result.roundOf8).toContain(teamId('A2')); // 2A = qf3 away
    expect(result.roundOf8).toContain(teamId('D1')); // 1D = qf4 home
    expect(result.roundOf8).toContain(teamId('C2')); // 2C = qf4 away
  });

  it('derives finalists as the two SF winners', () => {
    const groupOrders = deriveGroupOrders(miniTournament, allDrawScores);
    const qualifiers = selectQualifiers(miniTournament, allDrawScores, groupOrders);

    const picks: KnockoutPick[] = [
      { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
      { bracketMatchKey: bracketMatchKey('qf3'), winner: teamId('B1') },
      { bracketMatchKey: bracketMatchKey('qf4'), winner: teamId('D1') },
      { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('A1') }, // sf1: A1 vs C1 → A1 wins
      { bracketMatchKey: bracketMatchKey('sf2'), winner: teamId('B1') }, // sf2: B1 vs D1 → B1 wins
      { bracketMatchKey: bracketMatchKey('final'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('bronze'), winner: teamId('C1') },
    ];

    const result = buildBracket(miniTournament, groupOrders, qualifiers, picks);

    // Finalists = SF winners = A1, B1
    expect(result.finalists).toHaveLength(2);
    expect(result.finalists).toContain(teamId('A1'));
    expect(result.finalists).toContain(teamId('B1'));
  });

  it('derives bronzePair as the two SF losers', () => {
    const groupOrders = deriveGroupOrders(miniTournament, allDrawScores);
    const qualifiers = selectQualifiers(miniTournament, allDrawScores, groupOrders);

    const picks: KnockoutPick[] = [
      { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
      { bracketMatchKey: bracketMatchKey('qf3'), winner: teamId('B1') },
      { bracketMatchKey: bracketMatchKey('qf4'), winner: teamId('D1') },
      { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('A1') }, // C1 is loser
      { bracketMatchKey: bracketMatchKey('sf2'), winner: teamId('B1') }, // D1 is loser
      { bracketMatchKey: bracketMatchKey('final'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('bronze'), winner: teamId('C1') }, // C1 wins bronze
    ];

    const result = buildBracket(miniTournament, groupOrders, qualifiers, picks);

    // bronzePair = SF losers = C1, D1
    expect(result.bronzePair).toHaveLength(2);
    expect(result.bronzePair).toContain(teamId('C1'));
    expect(result.bronzePair).toContain(teamId('D1'));
  });

  it('derives topFour as [finalWinner, finalLoser, bronzeWinner, bronzeLoser]', () => {
    const groupOrders = deriveGroupOrders(miniTournament, allDrawScores);
    const qualifiers = selectQualifiers(miniTournament, allDrawScores, groupOrders);

    const picks: KnockoutPick[] = [
      { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
      { bracketMatchKey: bracketMatchKey('qf3'), winner: teamId('B1') },
      { bracketMatchKey: bracketMatchKey('qf4'), winner: teamId('D1') },
      { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('A1') }, // loser: C1
      { bracketMatchKey: bracketMatchKey('sf2'), winner: teamId('B1') }, // loser: D1
      { bracketMatchKey: bracketMatchKey('final'), winner: teamId('A1') }, // loser: B1
      { bracketMatchKey: bracketMatchKey('bronze'), winner: teamId('C1') }, // loser: D1
    ];

    const result = buildBracket(miniTournament, groupOrders, qualifiers, picks);

    // topFour = [finalWinner, finalLoser, bronzeWinner, bronzeLoser]
    expect(result.topFour).toHaveLength(4);
    expect(result.topFour[0]).toBe(teamId('A1')); // finalWinner
    expect(result.topFour[1]).toBe(teamId('B1')); // finalLoser (the other finalist)
    expect(result.topFour[2]).toBe(teamId('C1')); // bronzeWinner
    expect(result.topFour[3]).toBe(teamId('D1')); // bronzeLoser (the other of bronzePair)
  });

  it('throws when a knockout pick names a team not in that match', () => {
    const groupOrders = deriveGroupOrders(miniTournament, allDrawScores);
    const qualifiers = selectQualifiers(miniTournament, allDrawScores, groupOrders);

    // qf1 has A1 vs B2; picking B1 (not a participant) should throw
    const picks: KnockoutPick[] = [
      { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('B1') }, // B1 is NOT in qf1
      { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
      { bracketMatchKey: bracketMatchKey('qf3'), winner: teamId('B1') },
      { bracketMatchKey: bracketMatchKey('qf4'), winner: teamId('D1') },
      { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('sf2'), winner: teamId('B1') },
      { bracketMatchKey: bracketMatchKey('final'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('bronze'), winner: teamId('C1') },
    ];

    expect(() => buildBracket(miniTournament, groupOrders, qualifiers, picks)).toThrow();
  });
});

describe('resolveSlot', () => {
  const groupOrders: Record<GroupId, TeamId[]> = {
    [groupId('A')]: [teamId('A1'), teamId('A2'), teamId('A3'), teamId('A4')],
    [groupId('B')]: [teamId('B1'), teamId('B2'), teamId('B3'), teamId('B4')],
  };
  const rankedThirds = [teamId('C3'), teamId('D3')];

  it('resolves "1A" to the group winner and "2B" to the runner-up', () => {
    expect(resolveSlot('1A', groupOrders, rankedThirds)).toBe(teamId('A1'));
    expect(resolveSlot('2B', groupOrders, rankedThirds)).toBe(teamId('B2'));
  });

  it('resolves "3rd[i]" to the i-th ranked third-placed team', () => {
    expect(resolveSlot('3rd[0]', groupOrders, rankedThirds)).toBe(teamId('C3'));
    expect(resolveSlot('3rd[1]', groupOrders, rankedThirds)).toBe(teamId('D3'));
  });

  it('throws on an unrecognised slot reference', () => {
    expect(() => resolveSlot('XY', groupOrders, rankedThirds)).toThrow();
  });

  it('throws when a "3rd[i]" index is out of range', () => {
    expect(() => resolveSlot('3rd[5]', groupOrders, rankedThirds)).toThrow();
  });
});
