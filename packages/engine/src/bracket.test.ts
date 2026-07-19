import { describe, expect, it } from 'vitest';
import { bracketMatchKey, groupId, teamId, type GroupId, type TeamId } from './brand.js';
import { miniTournament } from './__fixtures__/mini-tournament.js';
import { deriveGroupOrders } from './standings.js';
import { selectQualifiers } from './qualifiers.js';
import { buildBracket, resolveSlot, findInvalidatedPickKeys } from './bracket.js';
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

  it('recovers topFour from the finish-score snapshot when the explicit Final/Bronze pick is missing', () => {
    const groupOrders = deriveGroupOrders(miniTournament, allDrawScores);
    const qualifiers = selectQualifiers(miniTournament, allDrawScores, groupOrders);

    // Same QF/SF picks as the "derives topFour" test above, but NO explicit 'final'/'bronze'
    // picks — reproduces the production bug where the invalidation cascade deleted them.
    const picks: KnockoutPick[] = [
      { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
      { bracketMatchKey: bracketMatchKey('qf3'), winner: teamId('B1') },
      { bracketMatchKey: bracketMatchKey('qf4'), winner: teamId('D1') },
      { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('sf2'), winner: teamId('B1') },
      // no 'final' or 'bronze' pick
    ];

    const result = buildBracket(miniTournament, groupOrders, qualifiers, picks, {
      final: { home: 2, away: 1, homeTeamId: teamId('A1'), awayTeamId: teamId('B1') },
      bronze: { home: 0, away: 3, homeTeamId: teamId('C1'), awayTeamId: teamId('D1') },
    });

    // Same expected result as the explicit-pick test — proves the snapshot fallback recovers
    // the identical topFour without needing the deleted pick.
    expect(result.topFour).toEqual([teamId('A1'), teamId('B1'), teamId('D1'), teamId('C1')]);
  });

  it('does not recover topFour from a tied finish score (needs an explicit tie-break pick)', () => {
    const groupOrders = deriveGroupOrders(miniTournament, allDrawScores);
    const qualifiers = selectQualifiers(miniTournament, allDrawScores, groupOrders);

    const picks: KnockoutPick[] = [
      { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
      { bracketMatchKey: bracketMatchKey('qf3'), winner: teamId('B1') },
      { bracketMatchKey: bracketMatchKey('qf4'), winner: teamId('D1') },
      { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('sf2'), winner: teamId('B1') },
    ];

    const result = buildBracket(miniTournament, groupOrders, qualifiers, picks, {
      final: { home: 1, away: 1, homeTeamId: teamId('A1'), awayTeamId: teamId('B1') },
    });

    expect(result.topFour).toHaveLength(0);
  });

  it('prefers the explicit pick over a disagreeing finish-score snapshot', () => {
    const groupOrders = deriveGroupOrders(miniTournament, allDrawScores);
    const qualifiers = selectQualifiers(miniTournament, allDrawScores, groupOrders);

    // Explicit pick says A1 wins the final; the snapshot (e.g. a stale one) disagrees and says B1.
    // The explicit pick must win — this is also the only way a tied scoreline can register a
    // winner (a penalty-shootout tie-break pick), so explicit-pick precedence must never regress.
    const picks: KnockoutPick[] = [
      { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
      { bracketMatchKey: bracketMatchKey('qf3'), winner: teamId('B1') },
      { bracketMatchKey: bracketMatchKey('qf4'), winner: teamId('D1') },
      { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('sf2'), winner: teamId('B1') },
      { bracketMatchKey: bracketMatchKey('final'), winner: teamId('A1') },
    ];

    const result = buildBracket(miniTournament, groupOrders, qualifiers, picks, {
      final: { home: 1, away: 1, homeTeamId: teamId('B1'), awayTeamId: teamId('A1') },
    });

    expect(result.topFour[0]).toBe(teamId('A1'));
    expect(result.topFour[1]).toBe(teamId('B1'));
  });

  it('derives roundOf4 from QF-winner picks alone, with no SF/Final/Bronze picks at all', () => {
    const groupOrders = deriveGroupOrders(miniTournament, allDrawScores);
    const qualifiers = selectQualifiers(miniTournament, allDrawScores, groupOrders);

    // Only the 4 QF picks are made — no sf1/sf2/final/bronze picks.
    const picks: KnockoutPick[] = [
      { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
      { bracketMatchKey: bracketMatchKey('qf3'), winner: teamId('B1') },
      { bracketMatchKey: bracketMatchKey('qf4'), winner: teamId('D1') },
    ];

    const result = buildBracket(miniTournament, groupOrders, qualifiers, picks);

    // topFour requires an explicit Final/Bronze pick, so it stays empty for this partial card.
    expect(result.topFour).toHaveLength(0);
    // roundOf4 needs only the QF picks — the predicted semifinalists are already fully known.
    expect(result.roundOf4).toHaveLength(4);
    expect(result.roundOf4).toContain(teamId('A1'));
    expect(result.roundOf4).toContain(teamId('C1'));
    expect(result.roundOf4).toContain(teamId('B1'));
    expect(result.roundOf4).toContain(teamId('D1'));
  });

  it('roundOf4 is the same team set regardless of which team is picked to win each SF/Final/Bronze match', () => {
    const groupOrders = deriveGroupOrders(miniTournament, allDrawScores);
    const qualifiers = selectQualifiers(miniTournament, allDrawScores, groupOrders);

    const qfPicks: KnockoutPick[] = [
      { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
      { bracketMatchKey: bracketMatchKey('qf3'), winner: teamId('B1') },
      { bracketMatchKey: bracketMatchKey('qf4'), winner: teamId('D1') },
    ];

    // Same QF picks, but pick the OTHER team to win each SF/Final/Bronze match this time.
    const picksWithOtherSfWinners: KnockoutPick[] = [
      ...qfPicks,
      { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('C1') }, // was A1
      { bracketMatchKey: bracketMatchKey('sf2'), winner: teamId('D1') }, // was B1
      { bracketMatchKey: bracketMatchKey('final'), winner: teamId('D1') },
      { bracketMatchKey: bracketMatchKey('bronze'), winner: teamId('A1') },
    ];

    const withOnlyQf = buildBracket(miniTournament, groupOrders, qualifiers, qfPicks);
    const withOtherSfWinners = buildBracket(
      miniTournament,
      groupOrders,
      qualifiers,
      picksWithOtherSfWinners,
    );

    expect(new Set(withOtherSfWinners.roundOf4)).toEqual(new Set(withOnlyQf.roundOf4));
    expect(new Set(withOnlyQf.roundOf4)).toEqual(
      new Set([teamId('A1'), teamId('C1'), teamId('B1'), teamId('D1')]),
    );
  });

  it('silently drops a knockout pick that names a team not in that match', () => {
    const groupOrders = deriveGroupOrders(miniTournament, allDrawScores);
    const qualifiers = selectQualifiers(miniTournament, allDrawScores, groupOrders);

    // qf1 has A1 vs B2; picking B1 (not a participant) is stale and should be
    // dropped — the rest of the card is scored normally.
    const picks: KnockoutPick[] = [
      { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('B1') }, // stale — dropped
      { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
      { bracketMatchKey: bracketMatchKey('qf3'), winner: teamId('B1') },
      { bracketMatchKey: bracketMatchKey('qf4'), winner: teamId('D1') },
      { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('sf2'), winner: teamId('B1') },
      { bracketMatchKey: bracketMatchKey('final'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('bronze'), winner: teamId('C1') },
    ];

    // Should not throw; stale qf1 pick is treated as absent.
    // sf1/sf2/final picks still propagate normally, so finalists come from those.
    const result = buildBracket(miniTournament, groupOrders, qualifiers, picks);
    expect(result.finalists).toEqual([teamId('A1'), teamId('B1')]);
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

describe('findInvalidatedPickKeys', () => {
  // Baseline: all-draw group orders (seed order)
  const baseOrders: Record<GroupId, TeamId[]> = {
    [groupId('A')]: [teamId('A1'), teamId('A2'), teamId('A3'), teamId('A4')],
    [groupId('B')]: [teamId('B1'), teamId('B2'), teamId('B3'), teamId('B4')],
    [groupId('C')]: [teamId('C1'), teamId('C2'), teamId('C3'), teamId('C4')],
    [groupId('D')]: [teamId('D1'), teamId('D2'), teamId('D3'), teamId('D4')],
  };
  // Qualifiers: top-2 from each group (autoQualifyPerGroup=2, no thirds)
  const baseQualifiers: TeamId[] = [
    teamId('A1'),
    teamId('A2'),
    teamId('B1'),
    teamId('B2'),
    teamId('C1'),
    teamId('C2'),
    teamId('D1'),
    teamId('D2'),
  ];
  // Full set of picks: A1 wins qf1, C1 wins qf2, B1 wins qf3, D1 wins qf4,
  //                    A1 wins sf1, B1 wins sf2, A1 wins final, C1 wins bronze
  const fullPicks: KnockoutPick[] = [
    { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
    { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
    { bracketMatchKey: bracketMatchKey('qf3'), winner: teamId('B1') },
    { bracketMatchKey: bracketMatchKey('qf4'), winner: teamId('D1') },
    { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('A1') },
    { bracketMatchKey: bracketMatchKey('sf2'), winner: teamId('B1') },
    { bracketMatchKey: bracketMatchKey('final'), winner: teamId('A1') },
    { bracketMatchKey: bracketMatchKey('bronze'), winner: teamId('C1') },
  ];

  it('returns empty array when no picks exist', () => {
    const keys = findInvalidatedPickKeys(miniTournament, baseOrders, baseQualifiers, []);
    expect(keys).toHaveLength(0);
  });

  it('returns empty array when group orders unchanged and all picks are valid', () => {
    const keys = findInvalidatedPickKeys(miniTournament, baseOrders, baseQualifiers, fullPicks);
    expect(keys).toHaveLength(0);
  });

  it('does not invalidate bronze when sf picks and bronze pick are all valid', () => {
    // C1 is sf1 loser → valid bronze pick
    const keys = findInvalidatedPickKeys(miniTournament, baseOrders, baseQualifiers, fullPicks);
    expect(keys).not.toContain(bracketMatchKey('bronze'));
  });

  it('invalidates qf pick when picked team is displaced from its slot', () => {
    // A2 now beats A1 → A=[A2,A1,A3,A4]; qf1 slot becomes A2 vs B2; A1 pick invalid
    const swappedOrders: Record<GroupId, TeamId[]> = {
      ...baseOrders,
      [groupId('A')]: [teamId('A2'), teamId('A1'), teamId('A3'), teamId('A4')],
    };
    const swappedQualifiers: TeamId[] = [
      teamId('A2'),
      teamId('A1'),
      teamId('B1'),
      teamId('B2'),
      teamId('C1'),
      teamId('C2'),
      teamId('D1'),
      teamId('D2'),
    ];
    const picks: KnockoutPick[] = [
      { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
    ];

    const keys = findInvalidatedPickKeys(miniTournament, swappedOrders, swappedQualifiers, picks);
    expect(keys).toContain(bracketMatchKey('qf1'));
    expect(keys).toHaveLength(1);
  });

  it('does not invalidate qf pick when picked team stays in slot despite opponent change', () => {
    // B3 becomes runner-up instead of B2 → qf1: A1 vs B3; A1 pick still valid
    const changedBOrders: Record<GroupId, TeamId[]> = {
      ...baseOrders,
      [groupId('B')]: [teamId('B1'), teamId('B3'), teamId('B2'), teamId('B4')],
    };
    const changedQualifiers: TeamId[] = [
      teamId('A1'),
      teamId('A2'),
      teamId('B1'),
      teamId('B3'),
      teamId('C1'),
      teamId('C2'),
      teamId('D1'),
      teamId('D2'),
    ];
    const picks: KnockoutPick[] = [
      { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
    ];

    const keys = findInvalidatedPickKeys(miniTournament, changedBOrders, changedQualifiers, picks);
    expect(keys).toHaveLength(0);
  });

  it('cascades: invalidating a qf pick also invalidates the dependent sf pick', () => {
    // A2 becomes 1st → qf1 now A2 vs B2 → qf1 pick (A1) invalid → sf1 pick (A1) also invalid
    const swappedOrders: Record<GroupId, TeamId[]> = {
      ...baseOrders,
      [groupId('A')]: [teamId('A2'), teamId('A1'), teamId('A3'), teamId('A4')],
    };
    const swappedQualifiers: TeamId[] = [
      teamId('A2'),
      teamId('A1'),
      teamId('B1'),
      teamId('B2'),
      teamId('C1'),
      teamId('C2'),
      teamId('D1'),
      teamId('D2'),
    ];
    const picks: KnockoutPick[] = [
      { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
      { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('A1') },
    ];

    const keys = findInvalidatedPickKeys(miniTournament, swappedOrders, swappedQualifiers, picks);
    expect(keys).toContain(bracketMatchKey('qf1'));
    expect(keys).toContain(bracketMatchKey('sf1'));
    expect(keys).not.toContain(bracketMatchKey('qf2'));
  });

  it('cascades through qf → sf → final → bronze on full pick set', () => {
    const swappedOrders: Record<GroupId, TeamId[]> = {
      ...baseOrders,
      [groupId('A')]: [teamId('A2'), teamId('A1'), teamId('A3'), teamId('A4')],
    };
    const swappedQualifiers: TeamId[] = [
      teamId('A2'),
      teamId('A1'),
      teamId('B1'),
      teamId('B2'),
      teamId('C1'),
      teamId('C2'),
      teamId('D1'),
      teamId('D2'),
    ];

    const keys = findInvalidatedPickKeys(
      miniTournament,
      swappedOrders,
      swappedQualifiers,
      fullPicks,
    );

    expect(keys).toContain(bracketMatchKey('qf1'));
    expect(keys).toContain(bracketMatchKey('sf1'));
    expect(keys).toContain(bracketMatchKey('final'));
    expect(keys).toContain(bracketMatchKey('bronze'));
    expect(keys).not.toContain(bracketMatchKey('qf2'));
    expect(keys).not.toContain(bracketMatchKey('qf3'));
    expect(keys).not.toContain(bracketMatchKey('qf4'));
    expect(keys).not.toContain(bracketMatchKey('sf2'));
  });
});
