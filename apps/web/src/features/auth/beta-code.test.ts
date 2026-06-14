import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkBetaCode } from './beta-code';

describe('checkBetaCode', () => {
  afterEach(() => {
    delete process.env.BETA_CODE;
  });

  describe('when BETA_CODE is not configured', () => {
    it('passes for null', () => expect(checkBetaCode(null)).toBeNull());
    it('passes for empty string', () => expect(checkBetaCode('')).toBeNull());
    it('passes for any string', () => expect(checkBetaCode('anything')).toBeNull());
  });

  describe('when BETA_CODE is configured', () => {
    beforeEach(() => {
      process.env.BETA_CODE = 'SECRET123';
    });

    it('passes when code matches exactly', () => {
      expect(checkBetaCode('SECRET123')).toBeNull();
    });

    it('trims whitespace from the provided code before comparing', () => {
      expect(checkBetaCode('  SECRET123  ')).toBeNull();
    });

    it('returns error for a wrong code', () => {
      expect(checkBetaCode('wrong')).toBe('Invalid beta code.');
    });

    it('returns error for null', () => {
      expect(checkBetaCode(null)).toBe('Invalid beta code.');
    });

    it('returns error for empty string', () => {
      expect(checkBetaCode('')).toBe('Invalid beta code.');
    });

    it('is case-sensitive', () => {
      expect(checkBetaCode('secret123')).toBe('Invalid beta code.');
    });
  });
});
