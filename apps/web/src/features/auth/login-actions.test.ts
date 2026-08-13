import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./auth', () => ({ signIn: vi.fn() }));
vi.mock('./guest', () => ({ signInAsGuest: vi.fn() }));
vi.mock('./beta-code', () => ({ checkBetaCode: vi.fn(() => null) }));
vi.mock('@cup/db', () => ({
  checkRateLimit: vi.fn(),
  RATE_LIMITS: {
    magicLink: { limit: 5, windowMs: 3_600_000 },
  },
}));
vi.mock('../../shared/db', () => ({ db: {} }));
vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('../../shared/observability/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { emailSignInAction, guestSignInAction, type EmailSignInState } from './login-actions';
import { signIn } from './auth';
import { signInAsGuest } from './guest';
import { checkBetaCode } from './beta-code';
import { checkRateLimit } from '@cup/db';
import { headers } from 'next/headers';
import { logger } from '../../shared/observability/logger';

const mockedSignIn = vi.mocked(signIn);
const mockedSignInAsGuest = vi.mocked(signInAsGuest);
const mockedCheckBetaCode = vi.mocked(checkBetaCode);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);
const mockedHeaders = vi.mocked(headers);
const mockedLoggerWarn = vi.mocked(logger.warn);

const prev: EmailSignInState = { error: null };

// 203.0.113.1 is RFC 5737 documentation range — safe placeholder, never a real host.
function makeHeaderMap(realIp: string | null = '203.0.113.1', forwardedFor: string | null = null) {
  return {
    get: (name: string) => {
      if (name === 'x-real-ip') return realIp;
      if (name === 'x-forwarded-for') return forwardedFor;
      return null;
    },
  } as unknown as Awaited<ReturnType<typeof headers>>;
}

function form(email: string): FormData {
  const f = new FormData();
  f.set('email', email);
  return f;
}

describe('emailSignInAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedHeaders.mockResolvedValue(makeHeaderMap());
  });

  it('returns immediately without rate-limit checks for empty email', async () => {
    const result = await emailSignInAction(prev, form(''));

    expect(mockedCheckRateLimit).not.toHaveBeenCalled();
    expect(mockedSignIn).not.toHaveBeenCalled();
    expect(result.error).toBeNull();
  });

  it('returns an error and does not call signIn when the email rate limit is exceeded', async () => {
    mockedCheckRateLimit.mockImplementation(async (_, { key }) => {
      if (key.startsWith('magic_link:email:')) return { allowed: false, count: 6 };
      return { allowed: true, count: 1 };
    });

    const result = await emailSignInAction(prev, form('test@example.com'));

    expect(result.error).toBeTruthy();
    expect(mockedSignIn).not.toHaveBeenCalled();
  });

  it('returns an error and does not call signIn when the IP rate limit is exceeded', async () => {
    mockedCheckRateLimit.mockImplementation(async (_, { key }) => {
      if (key.startsWith('magic_link:ip:')) return { allowed: false, count: 6 };
      return { allowed: true, count: 1 };
    });

    const result = await emailSignInAction(prev, form('test@example.com'));

    expect(result.error).toBeTruthy();
    expect(mockedSignIn).not.toHaveBeenCalled();
  });

  it('checks both email and IP rate limits when a trusted IP is present', async () => {
    mockedCheckRateLimit.mockResolvedValue({ allowed: true, count: 1 });
    mockedSignIn.mockResolvedValue(undefined as never);

    await emailSignInAction(prev, form('test@example.com'));

    const keys = mockedCheckRateLimit.mock.calls.map(([, { key }]) => key);
    expect(keys.some((k) => k.startsWith('magic_link:email:'))).toBe(true);
    expect(keys.some((k) => k.startsWith('magic_link:ip:'))).toBe(true);
  });

  it('calls signIn when both rate limits pass', async () => {
    mockedCheckRateLimit.mockResolvedValue({ allowed: true, count: 1 });
    mockedSignIn.mockResolvedValue(undefined as never);

    await emailSignInAction(prev, form('test@example.com'));

    expect(mockedSignIn).toHaveBeenCalledWith('resend', {
      email: 'test@example.com',
      redirectTo: '/pools',
    });
  });

  it('skips the IP rate-limit check (no shared "unknown" bucket) when x-real-ip is absent', async () => {
    mockedHeaders.mockResolvedValue(makeHeaderMap(null));
    mockedCheckRateLimit.mockResolvedValue({ allowed: true, count: 1 });
    mockedSignIn.mockResolvedValue(undefined as never);

    await emailSignInAction(prev, form('test@example.com'));

    const keys = mockedCheckRateLimit.mock.calls.map(([, { key }]) => key);
    expect(keys.some((k) => k.startsWith('magic_link:ip:'))).toBe(false);
    expect(keys.some((k) => k.includes('unknown'))).toBe(false);
    expect(mockedSignIn).toHaveBeenCalled();
  });

  it('ignores a client-supplied x-forwarded-for header and trusts only x-real-ip', async () => {
    mockedHeaders.mockResolvedValue(makeHeaderMap('203.0.113.9', '198.51.100.1'));
    mockedCheckRateLimit.mockResolvedValue({ allowed: true, count: 1 });
    mockedSignIn.mockResolvedValue(undefined as never);

    await emailSignInAction(prev, form('test@example.com'));

    const keys = mockedCheckRateLimit.mock.calls.map(([, { key }]) => key);
    expect(keys.some((k) => k === 'magic_link:ip:203.0.113.9')).toBe(true);
    expect(keys.some((k) => k.includes('198.51.100.1'))).toBe(false);
  });

  it('never logs the normalized email or IP in rate-limit warnings', async () => {
    mockedCheckRateLimit.mockImplementation(async (_, { key }) => {
      if (key.startsWith('magic_link:email:')) return { allowed: false, count: 6 };
      return { allowed: true, count: 1 };
    });

    await emailSignInAction(prev, form('secret-user@example.com'));

    expect(mockedLoggerWarn).toHaveBeenCalled();
    for (const [payload] of mockedLoggerWarn.mock.calls) {
      expect(payload).not.toHaveProperty('email');
      expect(payload).not.toHaveProperty('ip');
      expect(JSON.stringify(payload)).not.toContain('secret-user');
    }
  });
});

describe('guestSignInAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCheckBetaCode.mockReturnValue(null);
  });

  function form(fields: Record<string, string>): FormData {
    const f = new FormData();
    for (const [key, value] of Object.entries(fields)) f.set(key, value);
    return f;
  }

  it('rejects a non-string (File) name value instead of crashing on a cast', async () => {
    const f = new FormData();
    f.set('name', new File(['x'], 'name.txt'));
    f.set('betaCode', 'code');

    const result = await guestSignInAction({ error: null }, f);

    expect(result.error).toBeTruthy();
    expect(mockedSignInAsGuest).not.toHaveBeenCalled();
  });

  it('rejects a non-string (File) betaCode value instead of crashing on a cast', async () => {
    const f = new FormData();
    f.set('name', 'Alice');
    f.set('betaCode', new File(['x'], 'code.txt'));

    const result = await guestSignInAction({ error: null }, f);

    expect(result.error).toBeTruthy();
    expect(mockedSignInAsGuest).not.toHaveBeenCalled();
  });

  it('returns the beta-code error when checkBetaCode rejects the code', async () => {
    mockedCheckBetaCode.mockReturnValue('Invalid beta code.');

    const result = await guestSignInAction({ error: null }, form({ name: 'Alice', betaCode: 'x' }));

    expect(result).toEqual({ error: 'Invalid beta code.' });
    expect(mockedSignInAsGuest).not.toHaveBeenCalled();
  });

  it('returns a validation error when the name is too short', async () => {
    const result = await guestSignInAction({ error: null }, form({ name: 'A', betaCode: '' }));

    expect(result.error).toBeTruthy();
    expect(mockedSignInAsGuest).not.toHaveBeenCalled();
  });

  it('signs in as guest with the trimmed name when validation passes', async () => {
    mockedSignInAsGuest.mockResolvedValue(undefined as never);

    await guestSignInAction({ error: null }, form({ name: '  Alice  ', betaCode: '' }));

    expect(mockedSignInAsGuest).toHaveBeenCalledWith('Alice', '/pools');
  });
});
