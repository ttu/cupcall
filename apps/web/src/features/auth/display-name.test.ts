import { describe, it, expect } from 'vitest';
import { deriveDisplayName } from './display-name';

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

  it('returns a fallback for an empty string', () => {
    const result = deriveDisplayName('');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a fallback when there is no @', () => {
    const result = deriveDisplayName('notanemail');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a fallback when the local part is empty', () => {
    const result = deriveDisplayName('@example.com');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles uppercase by normalising to lowercase', () => {
    expect(deriveDisplayName('Alice@example.com')).toBe('alice');
  });
});
