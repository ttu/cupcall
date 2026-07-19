import { describe, expect, it } from 'vitest';
import { computeLeadChanges, computeBiggestRiser } from './race-history';
import type { StageHistoryPlayer } from './race-history';

const stages = ['Start', 'Jul 15', 'Jul 17', 'Jul 19'];

describe('computeLeadChanges', () => {
  it('returns one event when the leader never changes', () => {
    const players: StageHistoryPlayer[] = [
      { displayName: 'Alice', points: [0, 30, 40, 50], stageReasons: [null, 'a', 'b', 'c'] },
      { displayName: 'Bob', points: [0, 10, 20, 30], stageReasons: [null, null, null, null] },
    ];
    const events = computeLeadChanges(players, stages);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      stageIndex: 0,
      stageName: 'Start',
      leaderDisplayName: 'Alice',
      reason: null,
      pointsAtStage: 0,
    });
  });

  it('emits an event each time the #1 rank changes hands', () => {
    const players: StageHistoryPlayer[] = [
      { displayName: 'Alice', points: [0, 30, 30, 60], stageReasons: [null, 'A1', null, 'A3'] },
      { displayName: 'Bob', points: [0, 10, 40, 50], stageReasons: [null, null, 'B2', null] },
    ];
    const events = computeLeadChanges(players, stages);
    expect(events.map((e) => e.leaderDisplayName)).toEqual(['Alice', 'Bob', 'Alice']);
    expect(events[1]).toEqual({
      stageIndex: 2,
      stageName: 'Jul 17',
      leaderDisplayName: 'Bob',
      reason: 'B2',
      pointsAtStage: 40,
    });
  });

  it('breaks ties by displayName ascending, matching getLeaderboard convention', () => {
    const players: StageHistoryPlayer[] = [
      { displayName: 'Zed', points: [10], stageReasons: [null] },
      { displayName: 'Amy', points: [10], stageReasons: [null] },
    ];
    const events = computeLeadChanges(players, ['Start']);
    expect(events[0]?.leaderDisplayName).toBe('Amy');
  });

  it('returns an empty array for an empty pool or no stages', () => {
    expect(computeLeadChanges([], stages)).toEqual([]);
    expect(
      computeLeadChanges([{ displayName: 'Alice', points: [0], stageReasons: [null] }], []),
    ).toEqual([]);
  });
});

describe('computeBiggestRiser', () => {
  it('finds the single largest rank-improvement transition', () => {
    const players: StageHistoryPlayer[] = [
      { displayName: 'Alice', points: [0, 50, 55], stageReasons: [null, null, null] },
      { displayName: 'Bob', points: [0, 40, 45], stageReasons: [null, null, null] },
      { displayName: 'Carol', points: [0, 10, 60], stageReasons: [null, null, '5 exact scores'] },
    ];
    // Stage 0->1: Alice(1st) Bob(2nd) Carol(3rd) - no change.
    // Stage 1->2: Carol jumps from 3rd to 1st - biggest riser, +2 ranks.
    const result = computeBiggestRiser(players, ['Start', 'Jul 15', 'Jul 19']);
    expect(result).toEqual({
      displayName: 'Carol',
      fromRank: 3,
      toRank: 1,
      stageName: 'Jul 19',
      reason: '5 exact scores',
    });
  });

  it('returns null when no rank ever improves (fewer than 2 members, or ranks only worsen/hold)', () => {
    expect(
      computeBiggestRiser(
        [{ displayName: 'Alice', points: [0, 10], stageReasons: [null, null] }],
        ['Start', 'Jul 15'],
      ),
    ).toBeNull();
    const noImprovement: StageHistoryPlayer[] = [
      { displayName: 'Alice', points: [10, 20], stageReasons: [null, null] },
      { displayName: 'Bob', points: [0, 5], stageReasons: [null, null] },
    ];
    expect(computeBiggestRiser(noImprovement, ['Start', 'Jul 15'])).toBeNull();
  });
});
