import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM_PERCENT,
  MIN_ZOOM_PERCENT,
  canZoomIn,
  canZoomOut,
  computeAutoFitScale,
  stepZoomPercent,
} from './bracket-zoom-utils';

describe('computeAutoFitScale', () => {
  it('returns 1 when content exactly fits the container', () => {
    expect(computeAutoFitScale(1000, 1000)).toBe(1);
  });

  it('returns a fraction less than 1 when content is wider than the container', () => {
    expect(computeAutoFitScale(800, 1600)).toBe(0.5);
  });

  it('returns a fraction greater than 1 when content is narrower than the container', () => {
    expect(computeAutoFitScale(1000, 500)).toBe(1.5);
  });

  it('clamps to 0.5 when the ideal scale is below the minimum', () => {
    expect(computeAutoFitScale(400, 2000)).toBe(0.5);
  });

  it('clamps to 1.5 when the ideal scale is above the maximum', () => {
    expect(computeAutoFitScale(1000, 100)).toBe(1.5);
  });

  it('does not divide by zero or return NaN/Infinity when contentWidth is 0', () => {
    const result = computeAutoFitScale(1000, 0);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBe(1.5);
  });

  it('does not divide by zero or return NaN/Infinity when containerWidth is 0', () => {
    const result = computeAutoFitScale(0, 1000);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBe(0.5);
  });
});

describe('stepZoomPercent', () => {
  it('steps up by 10 when zooming in', () => {
    expect(stepZoomPercent(80, 'in')).toBe(90);
  });

  it('steps down by 10 when zooming out', () => {
    expect(stepZoomPercent(80, 'out')).toBe(70);
  });

  it('clamps at the maximum when zooming in past 150', () => {
    expect(stepZoomPercent(150, 'in')).toBe(150);
    expect(stepZoomPercent(145, 'in')).toBe(150);
  });

  it('clamps at the minimum when zooming out past 50', () => {
    expect(stepZoomPercent(50, 'out')).toBe(50);
    expect(stepZoomPercent(55, 'out')).toBe(50);
  });

  it('snaps a non-multiple-of-10 current value to the nearest step before moving', () => {
    // 83 snaps to 80, then steps from there: in -> 90, out -> 70
    expect(stepZoomPercent(83, 'in')).toBe(90);
    expect(stepZoomPercent(83, 'out')).toBe(70);
  });
});

describe('canZoomOut / canZoomIn', () => {
  it('canZoomOut is true above the minimum and false at/below it', () => {
    expect(canZoomOut(60)).toBe(true);
    expect(canZoomOut(50)).toBe(false);
    expect(canZoomOut(40)).toBe(false);
  });

  it('canZoomIn is true below the maximum and false at/above it', () => {
    expect(canZoomIn(140)).toBe(true);
    expect(canZoomIn(150)).toBe(false);
    expect(canZoomIn(160)).toBe(false);
  });
});

describe('exported constants', () => {
  it('exposes the documented range and step', () => {
    expect(MIN_ZOOM_PERCENT).toBe(50);
    expect(MAX_ZOOM_PERCENT).toBe(150);
  });
});
