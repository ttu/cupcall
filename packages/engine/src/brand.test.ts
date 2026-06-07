import { describe, it, expect } from 'vitest';
import { teamId, points } from './brand.js';

describe('branded constructors', () => {
  it('wraps and unwraps transparently at runtime', () => {
    expect(teamId('ARG')).toBe('ARG');
    expect(points(5)).toBe(5);
  });
});
