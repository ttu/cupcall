import { describe, expect, it } from 'vitest';
import { computeLeadChanges, computeBiggestRiser } from './race-history';
import type { StageHistoryPlayer } from './race-history';

const stages = ['Start', 'Jul 15', 'Jul 17', 'Jul 19'];
const stageRoundLabels = [null, 'Group Stage', 'Round of 16', 'Final'];

describe('computeLeadChanges', () => {
  it('returns no events when the leader never changes past the Start tie-break', () => {
    const players: StageHistoryPlayer[] = [
      { displayName: 'Alice', points: [0, 30, 40, 50], stageReasons: [null, 'a', 'b', 'c'] },
      { displayName: 'Bob', points: [0, 10, 20, 30], stageReasons: [null, null, null, null] },
    ];
    const events = computeLeadChanges(players, stages);
    expect(events).toEqual([]);
  });

  it('emits an event each time the #1 rank changes hands, skipping the Start baseline', () => {
    const players: StageHistoryPlayer[] = [
      { displayName: 'Alice', points: [0, 30, 30, 60], stageReasons: [null, 'A1', null, 'A3'] },
      { displayName: 'Bob', points: [0, 10, 40, 50], stageReasons: [null, null, 'B2', null] },
    ];
    const events = computeLeadChanges(players, stages, stageRoundLabels);
    expect(events.map((e) => e.leaderDisplayName)).toEqual(['Bob', 'Alice']);
    expect(events[0]).toEqual({
      stageIndex: 2,
      stageName: 'Jul 17',
      stageLabel: 'Round of 16',
      leaderDisplayName: 'Bob',
      reason: 'B2',
      pointsAtStage: 40,
    });
  });

  it('defaults stageLabel to null when no stageRoundLabels are supplied', () => {
    const players: StageHistoryPlayer[] = [
      { displayName: 'Alice', points: [0, 30, 30, 60], stageReasons: [null, 'A1', null, 'A3'] },
      { displayName: 'Bob', points: [0, 10, 40, 50], stageReasons: [null, null, 'B2', null] },
    ];
    const events = computeLeadChanges(players, stages);
    expect(events.every((e) => e.stageLabel === null)).toBe(true);
  });

  it('breaks ties by displayName ascending, matching getLeaderboard convention, without emitting a Start event', () => {
    const players: StageHistoryPlayer[] = [
      { displayName: 'Zed', points: [10], stageReasons: [null] },
      { displayName: 'Amy', points: [10], stageReasons: [null] },
    ];
    const events = computeLeadChanges(players, ['Start']);
    expect(events).toEqual([]);
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
    const result = computeBiggestRiser(players, ['Start', 'Jul 15', 'Jul 19'], 1);
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
        1,
      ),
    ).toBeNull();
    const noImprovement: StageHistoryPlayer[] = [
      { displayName: 'Alice', points: [10, 20], stageReasons: [null, null] },
      { displayName: 'Bob', points: [0, 5], stageReasons: [null, null] },
    ];
    expect(computeBiggestRiser(noImprovement, ['Start', 'Jul 15'], 1)).toBeNull();
  });

  // Shared 3-player fixture: a big rank jump happens entirely within the group stage (index 1→2),
  // and a smaller, genuine rank jump happens in the knockout stage (index 2→3).
  //
  //            Start  Day1  Day2  Day3
  // Alice        0      1   200   200   → rank:  -    3rd   1st   1st   (jumps 3rd→1st in 1→2, group-stage-only)
  // Bob          0    100   100   100   → rank:  -    1st   2nd   3rd
  // Carol        0     50    90   150   → rank:  -    2nd   3rd   2nd   (rises 3rd→2nd in 2→3, knockout-stage)
  const groupCompletionIndex = 2;
  const threePlayerFixture: StageHistoryPlayer[] = [
    { displayName: 'Alice', points: [0, 1, 200, 200], stageReasons: [null, null, null, null] },
    { displayName: 'Bob', points: [0, 100, 100, 100], stageReasons: [null, null, null, null] },
    {
      displayName: 'Carol',
      points: [0, 50, 90, 150],
      stageReasons: [null, null, null, 'exact score'],
    },
  ];
  const fourStages = ['Start', 'Day 1', 'Day 2', 'Day 3'];

  it("with no restriction, picks up Alice's bigger group-stage-only jump (sanity check on the fixture)", () => {
    const result = computeBiggestRiser(threePlayerFixture, fourStages, 1);
    expect(result?.displayName).toBe('Alice');
    expect(result?.fromRank).toBe(3);
    expect(result?.toRank).toBe(1);
  });

  it("restricted to the knockout stage, ignores the bigger group-stage jump and finds Carol's smaller genuine one", () => {
    const result = computeBiggestRiser(threePlayerFixture, fourStages, groupCompletionIndex + 1);
    expect(result?.displayName).toBe('Carol');
    expect(result?.fromRank).toBe(3);
    expect(result?.toRank).toBe(2);
  });
});
