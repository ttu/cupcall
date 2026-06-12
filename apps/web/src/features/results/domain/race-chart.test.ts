import { describe, it, expect } from 'vitest';
import type { LeaderboardEntry } from '@cup/db';
import { userId, points } from '@cup/engine';
import { buildRaceChartData } from './race-chart';

const baseEntries: LeaderboardEntry[] = [
  {
    userId: userId('user-1'),
    displayName: 'Alice',
    pointsTotal: points(12),
    completionPercent: 100,
    breakdown: {
      groupMatches: points(6),
      groupOrder: points(0),
      roundOf8: points(6),
      topFour: points(0),
      final: points(0),
      bronze: points(0),
      specials: points(0),
      total: points(12),
    },
  },
  {
    userId: userId('user-2'),
    displayName: 'Bob',
    pointsTotal: points(9),
    completionPercent: 100,
    breakdown: {
      groupMatches: points(4),
      groupOrder: points(0),
      roundOf8: points(5),
      topFour: points(0),
      final: points(0),
      bronze: points(0),
      specials: points(0),
      total: points(9),
    },
  },
];

describe('buildRaceChartData', () => {
  it('marks the matching user as current when a userId is supplied', () => {
    const data = buildRaceChartData(baseEntries, userId('user-1'));
    const alice = data.chartPlayers.find((p) => p.userId === userId('user-1'));
    const bob = data.chartPlayers.find((p) => p.userId === userId('user-2'));
    expect(alice?.isCurrentUser).toBe(true);
    expect(bob?.isCurrentUser).toBe(false);
  });

  it('highlights no player when userId is null', () => {
    const data = buildRaceChartData(baseEntries, null);
    expect(data.chartPlayers.every((p) => !p.isCurrentUser)).toBe(true);
    expect(data.chartPlayers).toHaveLength(2);
  });
});
