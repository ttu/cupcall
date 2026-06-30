import { describe, it, expect } from 'vitest';
import { buildGridLines, computeYBounds } from './race-chart-utils';

describe('computeYBounds', () => {
  it('yields yMin=0 when values include 0', () => {
    const { yMin } = computeYBounds([0, 30, 60, 100]);
    expect(yMin).toBe(0);
  });

  it('floors yMin to the nearest step boundary below the minimum value', () => {
    const { yMin } = computeYBounds([95, 100, 110, 125]);
    expect(yMin).toBe(90); // step=10, floor(95/10)*10 = 90
  });

  it('uses yMin equal to the minimum when it is exactly on a step boundary', () => {
    const { yMin } = computeYBounds([90, 100, 110]);
    expect(yMin).toBe(90);
  });

  it('produces a buffered yMax above the maximum value', () => {
    const { yMax } = computeYBounds([0, 100]);
    expect(yMax).toBeGreaterThan(100);
  });

  it('handles an empty array without throwing', () => {
    const { yMin, yMax } = computeYBounds([]);
    expect(yMin).toBe(0);
    expect(yMax).toBeGreaterThan(0);
  });
});

describe('buildGridLines', () => {
  it('starts at 0 and ends at yMax when yMin is 0', () => {
    const lines = buildGridLines(0, 100);
    expect(lines[0]).toBe(0);
    expect(lines[lines.length - 1]).toBe(100);
  });

  it('starts at yMin when yMin is exactly on a step boundary', () => {
    const lines = buildGridLines(90, 130);
    expect(lines[0]).toBe(90);
    expect(lines).toEqual([90, 100, 110, 120, 130]);
  });

  it('rounds a non-boundary yMin up to the next step', () => {
    const lines = buildGridLines(85, 130);
    expect(lines[0]).toBe(90);
  });

  it('uses a step of 5 for small ranges', () => {
    const lines = buildGridLines(0, 10);
    expect(lines).toEqual([0, 5, 10]);
  });

  it('uses a step of 50 for large ranges', () => {
    const lines = buildGridLines(0, 500);
    expect(lines[1]! - lines[0]!).toBe(50);
  });
});
