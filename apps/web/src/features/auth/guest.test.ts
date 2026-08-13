import { describe, it, expect, vi, beforeEach } from 'vitest';
import { userId } from '@cup/engine';

// Mock only the system boundaries: cookies, Next's redirect, and the DB repo calls.
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/shared/db', () => ({ db: {} }));
vi.mock('@cup/db', () => ({
  createGuestUser: vi.fn(),
  createDbSession: vi.fn(),
}));

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createGuestUser, createDbSession } from '@cup/db';
import { signInAsGuest, signInAsExistingGuest } from './guest';

const mockedRedirect = vi.mocked(redirect);
const mockedCookies = vi.mocked(cookies);
const mockedCreateGuestUser = vi.mocked(createGuestUser);
const mockedCreateDbSession = vi.mocked(createDbSession);

function fakeCookieStore() {
  return { set: vi.fn() };
}

describe('signInAsExistingGuest', () => {
  const uid = userId('user-1');

  beforeEach(() => {
    vi.clearAllMocks();
    mockedCookies.mockResolvedValue(fakeCookieStore() as never);
    mockedCreateDbSession.mockResolvedValue({
      sessionToken: 'session-token',
      userId: uid,
      expires: new Date(),
    });
    mockedRedirect.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
  });

  it('redirects to the requested app-relative path', async () => {
    await expect(signInAsExistingGuest(uid, '/pools/abc')).rejects.toThrow();
    expect(mockedRedirect).toHaveBeenCalledWith('/pools/abc');
  });

  it.each([
    ['an absolute URL', 'https://evil.example/phish'],
    ['a protocol-relative URL', '//evil.example'],
    ['a path with no leading slash', 'evil.example'],
  ])('falls back to a safe default instead of %s', async (_label, unsafeRedirectTo) => {
    await expect(signInAsExistingGuest(uid, unsafeRedirectTo)).rejects.toThrow();
    expect(mockedRedirect).toHaveBeenCalledWith('/pools');
  });
});

describe('signInAsGuest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCookies.mockResolvedValue(fakeCookieStore() as never);
    mockedCreateGuestUser.mockResolvedValue({
      id: userId('new-user'),
      displayName: 'Alice',
      email: null,
      name: null,
      emailVerified: null,
      image: null,
    });
    mockedCreateDbSession.mockResolvedValue({
      sessionToken: 'session-token',
      userId: userId('new-user'),
      expires: new Date(),
    });
    mockedRedirect.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
  });

  it('redirects to the requested app-relative path after creating the guest user', async () => {
    await expect(signInAsGuest('Alice', '/pools')).rejects.toThrow();
    expect(mockedCreateGuestUser).toHaveBeenCalledWith(expect.anything(), { displayName: 'Alice' });
    expect(mockedRedirect).toHaveBeenCalledWith('/pools');
  });

  it('falls back to a safe default instead of an absolute redirect target', async () => {
    await expect(signInAsGuest('Alice', 'https://evil.example')).rejects.toThrow();
    expect(mockedRedirect).toHaveBeenCalledWith('/pools');
  });
});
