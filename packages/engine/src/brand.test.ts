import { describe, it, expect } from 'vitest';
import { teamId, points, userId } from './brand.js';

describe('branded constructors', () => {
  it('wraps and unwraps transparently at runtime', () => {
    expect(teamId('ARG')).toBe('ARG');
    expect(points(5)).toBe(5);
  });

  it('userId is runtime-transparent', () => {
    expect(userId('u1')).toBe('u1');
  });
});
