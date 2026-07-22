import { describe, expect, it } from 'vitest';
import { initials } from './Avatar';

describe('initials', () => {
  it('takes the first two characters of a single-word name', () => {
    expect(initials('Sofia')).toBe('SO');
  });

  it('takes the first character of each of the first two words', () => {
    expect(initials('Marko V.')).toBe('MV');
    expect(initials('Sofia Lehto')).toBe('SL');
  });

  it('ignores extra words beyond the second', () => {
    expect(initials('Jan de Groot Vries')).toBe('JD');
  });

  it('uppercases lowercase input', () => {
    expect(initials('marko v.')).toBe('MV');
  });
});
