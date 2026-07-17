import { describe, it, expect } from 'vitest';
import { deriveDisplayName } from './display-name';

const FALLBACK_CASES = [
  { label: 'an empty string', input: '' },
  { label: 'no @', input: 'notanemail' },
  { label: 'an empty local part', input: '@example.com' },
];

describe('deriveDisplayName', () => {
  it('returns the local part of a normal email', () => {
    expect(deriveDisplayName('alice@example.com')).toBe('alice');
  });

  it('trims whitespace', () => {
    expect(deriveDisplayName('  alice@example.com  ')).toBe('alice');
  });

  it('handles plus-addressed emails', () => {
    expect(deriveDisplayName('alice+lists@example.com')).toBe('alice+lists');
  });

  it('handles dotted local parts', () => {
    expect(deriveDisplayName('alice.smith@example.com')).toBe('alice.smith');
  });

  it.each(FALLBACK_CASES)('returns a fallback for $label', ({ input }) => {
    const result = deriveDisplayName(input);
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles uppercase by normalising to lowercase', () => {
    expect(deriveDisplayName('Alice@example.com')).toBe('alice');
  });
});
