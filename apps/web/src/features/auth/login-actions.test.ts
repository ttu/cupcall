import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./auth', () => ({ signIn: vi.fn() }));
vi.mock('./guest', () => ({ signInAsGuest: vi.fn() }));
vi.mock('./beta-code', () => ({ checkBetaCode: vi.fn() }));
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

import { emailSignInAction, type EmailSignInState } from './login-actions';
import { signIn } from './auth';
import { checkRateLimit } from '@cup/db';
import { headers } from 'next/headers';

const mockedSignIn = vi.mocked(signIn);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);
const mockedHeaders = vi.mocked(headers);

const prev: EmailSignInState = { error: null };

// 203.0.113.1 is RFC 5737 documentation range — safe placeholder, never a real host.
function makeHeaderMap(ip: string | null = '203.0.113.1') {
  return { get: (name: string) => (name === 'x-forwarded-for' ? ip : null) } as unknown as Awaited<
    ReturnType<typeof headers>
  >;
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

  it('checks both email and IP rate limits on every request', async () => {
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

  it('uses unknown as IP key when x-forwarded-for header is absent', async () => {
    mockedHeaders.mockResolvedValue(makeHeaderMap(null));
    mockedCheckRateLimit.mockResolvedValue({ allowed: true, count: 1 });
    mockedSignIn.mockResolvedValue(undefined as never);

    await emailSignInAction(prev, form('test@example.com'));

    const keys = mockedCheckRateLimit.mock.calls.map(([, { key }]) => key);
    expect(keys.some((k) => k.includes('unknown'))).toBe(true);
  });
});
