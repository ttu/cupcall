import { describe, expect, it } from 'vitest';
import { buildCategoryBreakdown } from './category-breakdown';
import type { PoolArchiveEntryView } from './types';
import { userId, points } from '@cup/engine';
import type { ScoreBreakdown } from '@cup/engine';

function mkBreakdown(
  partial: Partial<Record<keyof Omit<ScoreBreakdown, 'total'>, number>> = {},
): ScoreBreakdown {
  const g = partial.groupMatches ?? 0;
  const go = partial.groupOrder ?? 0;
  const r16 = partial.roundOf16 ?? 0;
  const r8 = partial.roundOf8 ?? 0;
  const tfTeams = partial.topFourTeams ?? 0;
  const tfPosition = partial.topFourPosition ?? 0;
  const fn = partial.final ?? 0;
  const br = partial.bronze ?? 0;
  const sp = partial.specials ?? 0;
  return {
    groupMatches: points(g),
    groupOrder: points(go),
    roundOf16: points(r16),
    roundOf8: points(r8),
    topFour: points(tfTeams + tfPosition),
    topFourTeams: points(tfTeams),
    topFourPosition: points(tfPosition),
    final: points(fn),
    bronze: points(br),
    specials: points(sp),
    total: points(g + go + r16 + r8 + tfTeams + tfPosition + fn + br + sp),
  };
}

function mkEntry(id: string, name: string, breakdown: ScoreBreakdown): PoolArchiveEntryView {
  return {
    userId: userId(id),
    displayName: name,
    rank: 1,
    pointsTotal: breakdown.total,
    breakdown,
    pointsHistory: null,
    stageReasons: null,
  };
}

describe('buildCategoryBreakdown', () => {
  it('returns one row per scoring category, in a fixed order, with a cell per entry', () => {
    const entries = [
      mkEntry('u1', 'Alice', mkBreakdown({ groupMatches: 10 })),
      mkEntry('u2', 'Bob', mkBreakdown({ groupMatches: 20 })),
    ];
    const rows = buildCategoryBreakdown(entries, null);
    expect(rows.map((r) => r.key)).toEqual([
      'groupMatches',
      'groupOrder',
      'roundOf16',
      'roundOf8',
      'topFourTeams',
      'topFourPosition',
      'final',
      'bronze',
      'specials',
    ]);
    expect(rows.map((r) => r.label)).toEqual([
      'Group Matches',
      'Group Order',
      'Round of 16',
      'QF',
      'SF · Teams',
      'SF · Position',
      'Final',
      'Bronze',
      'Special Bets',
    ]);
    expect(rows[0]?.cells).toHaveLength(2);
  });

  it('marks the single highest scorer in a row as the leader', () => {
    const entries = [
      mkEntry('u1', 'Alice', mkBreakdown({ groupMatches: 10 })),
      mkEntry('u2', 'Bob', mkBreakdown({ groupMatches: 20 })),
    ];
    const rows = buildCategoryBreakdown(entries, null);
    const groupMatches = rows.find((r) => r.key === 'groupMatches')!;
    expect(groupMatches.cells.map((c) => ({ name: c.displayName, isLeader: c.isLeader }))).toEqual([
      { name: 'Alice', isLeader: false },
      { name: 'Bob', isLeader: true },
    ]);
  });

  it('marks every entry tied at the max as a leader', () => {
    const entries = [
      mkEntry('u1', 'Alice', mkBreakdown({ topFourTeams: 15 })),
      mkEntry('u2', 'Bob', mkBreakdown({ topFourTeams: 15 })),
      mkEntry('u3', 'Carol', mkBreakdown({ topFourTeams: 5 })),
    ];
    const rows = buildCategoryBreakdown(entries, null);
    const row = rows.find((r) => r.key === 'topFourTeams')!;
    expect(row.cells.map((c) => c.isLeader)).toEqual([true, true, false]);
  });

  it('marks no one as leader when every entry scored 0 in a category', () => {
    const entries = [
      mkEntry('u1', 'Alice', mkBreakdown({})),
      mkEntry('u2', 'Bob', mkBreakdown({})),
    ];
    const rows = buildCategoryBreakdown(entries, null);
    expect(rows.every((r) => r.cells.every((c) => !c.isLeader))).toBe(true);
  });

  it('renames the viewer to "You" and flags isCurrentUser, leaving others untouched', () => {
    const entries = [
      mkEntry('u1', 'Alice', mkBreakdown({ groupMatches: 10 })),
      mkEntry('u2', 'Bob', mkBreakdown({ groupMatches: 20 })),
    ];
    const rows = buildCategoryBreakdown(entries, userId('u2'));
    const groupMatches = rows.find((r) => r.key === 'groupMatches')!;
    expect(groupMatches.cells).toEqual([
      {
        userId: userId('u1'),
        displayName: 'Alice',
        isCurrentUser: false,
        points: 10,
        isLeader: false,
      },
      {
        userId: userId('u2'),
        displayName: 'You',
        isCurrentUser: true,
        points: 20,
        isLeader: true,
      },
    ]);
  });

  it('treats a null viewerUserId as no current user (no "You" renaming)', () => {
    const entries = [mkEntry('u1', 'Alice', mkBreakdown({ groupMatches: 10 }))];
    const rows = buildCategoryBreakdown(entries, null);
    expect(rows[0]?.cells[0]?.displayName).toBe('Alice');
    expect(rows[0]?.cells[0]?.isCurrentUser).toBe(false);
  });

  it('returns 9 empty-cell rows for an empty pool', () => {
    const rows = buildCategoryBreakdown([], null);
    expect(rows).toHaveLength(9);
    expect(rows.every((r) => r.cells.length === 0)).toBe(true);
  });

  it('handles guest entries with a null userId as any other cell', () => {
    const entries = [
      mkEntry('u1', 'Alice', mkBreakdown({ groupMatches: 10 })),
      { ...mkEntry('u2', 'Guest', mkBreakdown({ groupMatches: 30 })), userId: null },
    ];
    const rows = buildCategoryBreakdown(entries, null);
    const groupMatches = rows.find((r) => r.key === 'groupMatches')!;
    expect(groupMatches.cells[1]).toEqual({
      userId: null,
      displayName: 'Guest',
      isCurrentUser: false,
      points: 30,
      isLeader: true,
    });
  });
});
