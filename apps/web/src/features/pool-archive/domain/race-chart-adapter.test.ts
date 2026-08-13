import { describe, expect, it } from 'vitest';
import { points, poolId, tournamentId, userId } from '@cup/engine';
import type { ScoreBreakdown } from '@cup/engine';
import type { PoolArchiveRecap } from '@cup/db';
import { toRaceChartData } from './race-chart-adapter';
import type { PoolArchiveEntryView, PoolArchiveView } from './types';

const zeroBreakdown: ScoreBreakdown = {
  groupMatches: points(0),
  groupOrder: points(0),
  bronze: points(0),
  final: points(0),
  roundOf16: points(0),
  roundOf8: points(0),
  topFour: points(0),
  topFourTeams: points(0),
  topFourPosition: points(0),
  specials: points(0),
  total: points(0),
};

function buildRecap(stages: string[]): PoolArchiveRecap {
  return {
    stages,
    stageRoundLabels: stages.map(() => null),
    championPick: null,
    bestSingleMatch: null,
    biggestUpset: null,
    predictionsMade: 0,
    exactScoreRatePercent: 0,
    overallAccuracyPercent: 0,
    groupCompletionStageIndex: 0,
    groupStageLeader: null,
    preSpecialsLeader: null,
    finalWinner: null,
    bestKnockoutPerformer: null,
    bestSpecialBetsPerformer: null,
  };
}

function buildEntry(overrides: Partial<PoolArchiveEntryView> = {}): PoolArchiveEntryView {
  return {
    userId: userId('u1'),
    displayName: 'Alice',
    rank: 1,
    pointsTotal: points(10),
    breakdown: zeroBreakdown,
    pointsHistory: [points(0), points(10)],
    stageReasons: [null, null],
    ...overrides,
  };
}

function buildView(overrides: Partial<PoolArchiveView> = {}): PoolArchiveView {
  return {
    poolId: poolId('p1'),
    poolName: 'Test Pool',
    tournamentId: tournamentId('t1'),
    tournamentName: 'Test Tournament',
    archivedAt: new Date('2026-07-20T00:00:00Z'),
    entries: [buildEntry()],
    recap: buildRecap(['Start', 'Now']),
    leadChanges: [],
    biggestRiser: null,
    ...overrides,
  };
}

describe('toRaceChartData', () => {
  it('returns null when the archive has no recap', () => {
    expect(toRaceChartData(buildView({ recap: null }), null)).toBeNull();
  });

  it('sets chartNowIndex to stages.length - 1 for a non-empty stage list', () => {
    const view = buildView({ recap: buildRecap(['Start', 'Group Stage', 'Now']) });
    const data = toRaceChartData(view, null);
    expect(data?.chartNowIndex).toBe(2);
  });

  it('sets chartNowIndex to null when the recap has an empty stage list', () => {
    const view = buildView({ recap: buildRecap([]) });
    const data = toRaceChartData(view, null);
    expect(data).not.toBeNull();
    expect(data?.chartNowIndex).toBeNull();
    expect(data?.chartStages).toEqual([]);
  });

  it('marks the viewer entry as the current user and excludes entries without a points history', () => {
    const view = buildView({
      entries: [
        buildEntry({ userId: userId('u1'), displayName: 'Alice' }),
        buildEntry({ userId: userId('u2'), displayName: 'Bob', pointsHistory: null }),
      ],
    });
    const data = toRaceChartData(view, userId('u1'));
    expect(data?.chartPlayers).toHaveLength(1);
    expect(data?.chartPlayers[0]?.isCurrentUser).toBe(true);
  });
});
