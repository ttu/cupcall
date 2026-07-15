import { describe, it, expect } from 'vitest';
import { deriveTopByCategory } from './score-breakdown-utils';
import { userId, points } from '@cup/engine';
import type { ScoreBreakdown } from '@cup/engine';
import type { LeaderboardEntry } from '@cup/db';

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

function mkEntry(id: string, name: string, bd: ScoreBreakdown | null): LeaderboardEntry {
  return {
    userId: userId(id),
    displayName: name,
    pointsTotal: bd?.total ?? points(0),
    breakdown: bd,
    completionPercent: null,
  };
}

describe('deriveTopByCategory', () => {
  it('returns the top 3 for a category sorted descending', () => {
    const leaderboard = [
      mkEntry('u1', 'Alice', mkBreakdown({ groupMatches: 30 })),
      mkEntry('u2', 'Bob', mkBreakdown({ groupMatches: 50 })),
      mkEntry('u3', 'Carol', mkBreakdown({ groupMatches: 40 })),
      mkEntry('u4', 'Dave', mkBreakdown({ groupMatches: 20 })),
    ];
    const result = deriveTopByCategory(leaderboard, undefined);
    expect(result.groupMatches).toEqual([
      { displayName: 'Bob', points: 50, isCurrentUser: false },
      { displayName: 'Carol', points: 40, isCurrentUser: false },
      { displayName: 'Alice', points: 30, isCurrentUser: false },
    ]);
  });

  it('labels the current user as "You" and sets isCurrentUser', () => {
    const leaderboard = [
      mkEntry('u1', 'Alice', mkBreakdown({ groupMatches: 30 })),
      mkEntry('u2', 'Me', mkBreakdown({ groupMatches: 50 })),
    ];
    const result = deriveTopByCategory(leaderboard, userId('u2'));
    expect(result.groupMatches?.[0]).toEqual({
      displayName: 'You',
      points: 50,
      isCurrentUser: true,
    });
    expect(result.groupMatches?.[1]).toEqual({
      displayName: 'Alice',
      points: 30,
      isCurrentUser: false,
    });
  });

  it('excludes entries with 0 points in a category', () => {
    const leaderboard = [
      mkEntry('u1', 'Alice', mkBreakdown({ groupMatches: 0, groupOrder: 10 })),
      mkEntry('u2', 'Bob', mkBreakdown({ groupMatches: 15 })),
    ];
    const result = deriveTopByCategory(leaderboard, undefined);
    expect(result.groupMatches).toHaveLength(1);
    expect(result.groupMatches?.[0]?.displayName).toBe('Bob');
  });

  it('omits a category key entirely when all members scored 0', () => {
    const leaderboard = [mkEntry('u1', 'Alice', mkBreakdown({ groupMatches: 10 }))];
    const result = deriveTopByCategory(leaderboard, undefined);
    expect(result.roundOf16).toBeUndefined();
  });

  it('excludes members with null breakdown', () => {
    const leaderboard = [
      mkEntry('u1', 'Alice', null),
      mkEntry('u2', 'Bob', mkBreakdown({ groupMatches: 20 })),
    ];
    const result = deriveTopByCategory(leaderboard, undefined);
    expect(result.groupMatches).toHaveLength(1);
    expect(result.groupMatches?.[0]?.displayName).toBe('Bob');
  });

  it('computes leaders for topFourTeams and topFourPosition independently', () => {
    const leaderboard = [
      mkEntry('u1', 'Alice', mkBreakdown({ topFourTeams: 20, topFourPosition: 3 })),
      mkEntry('u2', 'Bob', mkBreakdown({ topFourTeams: 15, topFourPosition: 9 })),
    ];
    const result = deriveTopByCategory(leaderboard, undefined);
    expect(result.topFourTeams?.map((l) => l.displayName)).toEqual(['Alice', 'Bob']);
    expect(result.topFourPosition?.map((l) => l.displayName)).toEqual(['Bob', 'Alice']);
  });

  it('slices at 3 even when more members qualify', () => {
    const leaderboard = [
      mkEntry('u1', 'A', mkBreakdown({ specials: 50 })),
      mkEntry('u2', 'B', mkBreakdown({ specials: 40 })),
      mkEntry('u3', 'C', mkBreakdown({ specials: 30 })),
      mkEntry('u4', 'D', mkBreakdown({ specials: 20 })),
      mkEntry('u5', 'E', mkBreakdown({ specials: 10 })),
    ];
    const result = deriveTopByCategory(leaderboard, undefined);
    expect(result.specials).toHaveLength(3);
    expect(result.specials?.map((l) => l.displayName)).toEqual(['A', 'B', 'C']);
  });
});
