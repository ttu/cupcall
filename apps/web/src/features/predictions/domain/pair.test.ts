import { describe, expect, it } from 'vitest';
import { toPair } from './pair';

describe('toPair', () => {
  it('returns a 2-tuple when the array has exactly 2 elements', () => {
    expect(toPair(['A1', 'B1'])).toEqual(['A1', 'B1']);
  });

  it('returns null when the array has fewer than 2 elements', () => {
    expect(toPair([])).toBeNull();
    expect(toPair(['A1'])).toBeNull();
  });

  it('returns null when the array has more than 2 elements', () => {
    expect(toPair(['A1', 'B1', 'C1'])).toBeNull();
  });
});
