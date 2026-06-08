import { describe, it, expect } from 'vitest';
import { parseEnv } from './env';

const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  AUTH_SECRET: 'a-very-long-secret-that-is-at-least-32-characters-long',
  AUTH_URL: 'http://localhost:3000',
  RESEND_API_KEY: 're_abc123',
};

describe('parseEnv', () => {
  it('parses a valid env object', () => {
    const result = parseEnv(validEnv);
    expect(result.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(result.AUTH_SECRET).toBe(validEnv.AUTH_SECRET);
    expect(result.AUTH_URL).toBe(validEnv.AUTH_URL);
    expect(result.RESEND_API_KEY).toBe(validEnv.RESEND_API_KEY);
  });

  it('throws when DATABASE_URL is missing', () => {
    const raw = { ...validEnv, DATABASE_URL: undefined };
    expect(() => parseEnv(raw)).toThrow(/DATABASE_URL/);
  });

  it('throws when DATABASE_URL is not a url', () => {
    const raw = { ...validEnv, DATABASE_URL: 'not-a-url' };
    expect(() => parseEnv(raw)).toThrow(/DATABASE_URL/);
  });

  it('throws when AUTH_SECRET is missing', () => {
    const raw = { ...validEnv, AUTH_SECRET: undefined };
    expect(() => parseEnv(raw)).toThrow(/AUTH_SECRET/);
  });

  it('throws when AUTH_SECRET is too short', () => {
    const raw = { ...validEnv, AUTH_SECRET: 'short' };
    expect(() => parseEnv(raw)).toThrow(/AUTH_SECRET/);
  });

  it('throws when AUTH_URL is missing', () => {
    const raw = { ...validEnv, AUTH_URL: undefined };
    expect(() => parseEnv(raw)).toThrow(/AUTH_URL/);
  });

  it('throws when AUTH_URL is not a url', () => {
    const raw = { ...validEnv, AUTH_URL: 'not-a-url' };
    expect(() => parseEnv(raw)).toThrow(/AUTH_URL/);
  });

  it('throws when RESEND_API_KEY is missing', () => {
    const raw = { ...validEnv, RESEND_API_KEY: undefined };
    expect(() => parseEnv(raw)).toThrow(/RESEND_API_KEY/);
  });

  it('throws when RESEND_API_KEY is empty string', () => {
    const raw = { ...validEnv, RESEND_API_KEY: '' };
    expect(() => parseEnv(raw)).toThrow(/RESEND_API_KEY/);
  });

  it('throws listing all missing vars when multiple are invalid', () => {
    const raw = { ...validEnv, DATABASE_URL: undefined, AUTH_SECRET: undefined };
    expect(() => parseEnv(raw)).toThrow(/DATABASE_URL/);
    expect(() => parseEnv(raw)).toThrow(/AUTH_SECRET/);
  });
});
