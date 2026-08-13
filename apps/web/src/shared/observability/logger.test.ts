import { describe, it, expect } from 'vitest';
import { safeEmailDomain } from './logger';

describe('safeEmailDomain', () => {
  it('returns the domain portion of a simple email', () => {
    expect(safeEmailDomain('alice@example.com')).toBe('@example.com');
  });

  it('uses the last @ separator when a quoted local-part contains one', () => {
    expect(safeEmailDomain('"a@b"@example.com')).toBe('@example.com');
  });

  it('returns unknown-domain when there is no @', () => {
    expect(safeEmailDomain('not-an-email')).toBe('[unknown-domain]');
  });

  it('returns unknown-domain when @ is the first character', () => {
    expect(safeEmailDomain('@example.com')).toBe('[unknown-domain]');
  });
});
