import { describe, it, expect } from 'vitest';
import { sliceToWindow, visibleZoomOptions } from './race-view-utils';
import type { RaceChartPlayer } from '../domain/types';

function makePlayer(pts: number[]): RaceChartPlayer {
  return { userId: 'u1', displayName: 'Alice', isCurrentUser: false, color: 'red', points: pts };
}

const stages = ['Start', 'Jun 1', 'Jun 2', 'Jun 3', 'Jun 4', 'Jun 5'];
const players = [makePlayer([0, 10, 20, 30, 40, 50])];
const nowIndex = 5;

describe('sliceToWindow', () => {
  it('returns all data unchanged when zoomDays is all', () => {
    const result = sliceToWindow(stages, players, nowIndex, 'all');
    expect(result.stages).toEqual(stages);
    expect(result.players[0]!.points).toEqual([0, 10, 20, 30, 40, 50]);
    expect(result.nowIndex).toBe(5);
  });

  it('slices to the last N event dates', () => {
    const result = sliceToWindow(stages, players, nowIndex, 3);
    expect(result.stages).toEqual(['Jun 3', 'Jun 4', 'Jun 5']);
    expect(result.players[0]!.points).toEqual([30, 40, 50]);
    expect(result.nowIndex).toBe(2);
  });

  it('clamps to stage 0 when N exceeds available stages', () => {
    const result = sliceToWindow(stages, players, nowIndex, 20);
    expect(result.stages).toEqual(stages);
    expect(result.players[0]!.points).toEqual([0, 10, 20, 30, 40, 50]);
    expect(result.nowIndex).toBe(5);
  });

  it('preserves player metadata when slicing', () => {
    const result = sliceToWindow(stages, players, nowIndex, 2);
    expect(result.players[0]!.userId).toBe('u1');
    expect(result.players[0]!.color).toBe('red');
  });

  it('handles multiple players', () => {
    const multi = [makePlayer([0, 10, 20, 30, 40, 50]), makePlayer([0, 5, 15, 25, 35, 45])];
    const result = sliceToWindow(stages, multi, nowIndex, 2);
    expect(result.players[0]!.points).toEqual([40, 50]);
    expect(result.players[1]!.points).toEqual([35, 45]);
  });
});

describe('visibleZoomOptions', () => {
  it('shows all options when there are many match days', () => {
    const opts = visibleZoomOptions(30);
    expect(opts).toContain('all');
    expect(opts).toContain(14);
    expect(opts).toContain(7);
    expect(opts).toContain(5);
  });

  it('hides options whose window equals or exceeds total match days', () => {
    const opts = visibleZoomOptions(6); // 6 event dates
    expect(opts).toContain('all');
    expect(opts).toContain(5);
    expect(opts).not.toContain(7);
    expect(opts).not.toContain(14);
  });

  it('only shows All when match days are very few', () => {
    const opts = visibleZoomOptions(3);
    expect(opts).toEqual(['all']);
  });
});
