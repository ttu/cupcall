import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import { createGuestUser, createUser, getPendingEmailLinkByToken } from '@cup/db';
import type { UserId } from '@cup/engine';

// Mock only the system boundaries: the session (auth), the DB singleton wiring
// (backed for real by pglite via makeTestDb), and env config. Persistence,
// uniqueness, pending-link, and rate-limit behavior all run against a real DB.
let testDb: Awaited<ReturnType<typeof makeTestDb>>;

vi.mock('./session', () => ({ getCurrentActor: vi.fn() }));
vi.mock('@/shared/db', () => ({
  get db() {
    return testDb;
  },
}));
vi.mock('@/shared/env', () => ({
  env: { AUTH_URL: 'https://example.com', RESEND_API_KEY: 'test-key' },
}));

import { requestEmailLinkAction, connectEmailFormAction } from './link-email-actions';
import { getCurrentActor } from './session';
import type { EmailSender } from './email-provider';

const mockedGetActor = vi.mocked(getCurrentActor);

function fakeSender(): EmailSender {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

function form(email: string | null): FormData {
  const f = new FormData();
  if (email !== null) f.set('email', email);
  return f;
}

async function makeGuestActor(): Promise<UserId> {
  const user = await createGuestUser(testDb, { displayName: 'Guest' });
  return user.id;
}

describe('requestEmailLinkAction', () => {
  beforeAll(async () => {
    testDb = await makeTestDb();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when not authenticated', async () => {
    mockedGetActor.mockResolvedValue(null);
    const result = await requestEmailLinkAction(form('a@b.com'), fakeSender());
    expect(result).toEqual({ ok: false, error: 'Not authenticated.' });
  });

  it('returns error when user not found', async () => {
    const { userId } = await import('@cup/engine');
    mockedGetActor.mockResolvedValue({ userId: userId('no-such-user') });
    const result = await requestEmailLinkAction(form('a@b.com'), fakeSender());
    expect(result).toEqual({ ok: false, error: 'User not found.' });
  });

  it('returns error when user already has an email', async () => {
    const user = await createUser(testDb, { email: 'existing@example.com', displayName: 'Bob' });
    mockedGetActor.mockResolvedValue({ userId: user.id });
    const result = await requestEmailLinkAction(form('new@example.com'), fakeSender());
    expect(result).toEqual({ ok: false, error: 'Account already has an email address.' });
  });

  it('returns error for empty email', async () => {
    const uid = await makeGuestActor();
    mockedGetActor.mockResolvedValue({ userId: uid });
    const result = await requestEmailLinkAction(form(''), fakeSender());
    expect(result).toEqual({ ok: false, error: 'Email is required.' });
  });

  it('returns error for invalid email format', async () => {
    const uid = await makeGuestActor();
    mockedGetActor.mockResolvedValue({ userId: uid });
    const result = await requestEmailLinkAction(form('not-an-email'), fakeSender());
    expect(result).toEqual({ ok: false, error: 'Invalid email address.' });
  });

  it('rejects a non-string (File) email value instead of crashing on a cast', async () => {
    const uid = await makeGuestActor();
    mockedGetActor.mockResolvedValue({ userId: uid });
    const f = new FormData();
    f.set('email', new File(['x'], 'email.txt'));

    const result = await requestEmailLinkAction(f, fakeSender());

    expect(result.ok).toBe(false);
  });

  it('returns ok silently when email is already in use (no enumeration) and does not send', async () => {
    await createUser(testDb, { email: 'taken@example.com', displayName: 'Other' });
    const uid = await makeGuestActor();
    mockedGetActor.mockResolvedValue({ userId: uid });

    const sender = fakeSender();
    const result = await requestEmailLinkAction(form('taken@example.com'), sender);

    expect(result).toEqual({ ok: true });
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('persists a pending email link and sends email for a valid request', async () => {
    const uid = await makeGuestActor();
    mockedGetActor.mockResolvedValue({ userId: uid });

    const sender = fakeSender();
    const result = await requestEmailLinkAction(form('new@example.com'), sender);

    expect(result).toEqual({ ok: true });
    expect(sender.send).toHaveBeenCalledOnce();
    const call = vi.mocked(sender.send).mock.calls[0]![0];
    expect(call.to).toBe('new@example.com');
    expect(call.url).toContain('/link-email/');

    const token = call.url.split('/link-email/')[1];
    const pending = await getPendingEmailLinkByToken(testDb, token!);
    expect(pending?.userId).toBe(uid);
    expect(pending?.email).toBe('new@example.com');
  });

  it('normalises email to lowercase', async () => {
    const uid = await makeGuestActor();
    mockedGetActor.mockResolvedValue({ userId: uid });

    const sender = fakeSender();
    await requestEmailLinkAction(form('User@Example.COM'), sender);

    const call = vi.mocked(sender.send).mock.calls[0]![0];
    expect(call.to).toBe('user@example.com');
  });

  it('rate limits repeated requests from the same user', async () => {
    const uid = await makeGuestActor();
    mockedGetActor.mockResolvedValue({ userId: uid });
    const sender = fakeSender();

    let lastResult;
    for (let i = 0; i < 10; i++) {
      lastResult = await requestEmailLinkAction(form(`try-${i}@example.com`), sender);
    }

    expect(lastResult).toEqual({
      ok: false,
      error: 'Too many requests. Please try again later.',
    });
  });
});

describe('connectEmailFormAction', () => {
  beforeAll(async () => {
    testDb = await makeTestDb();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ok on success', async () => {
    const uid = await makeGuestActor();
    mockedGetActor.mockResolvedValue({ userId: uid });

    const result = await connectEmailFormAction(null, form('new@example.com'), fakeSender());

    expect(result).toEqual({ ok: true });
  });

  it('passes through user-input errors from requestEmailLinkAction', async () => {
    const uid = await makeGuestActor();
    mockedGetActor.mockResolvedValue({ userId: uid });

    const result = await connectEmailFormAction(null, form('bad-email'), fakeSender());

    expect(result).toEqual({ ok: false, error: 'Invalid email address.' });
  });

  it('returns a send-failure error when the email sender throws', async () => {
    const uid = await makeGuestActor();
    mockedGetActor.mockResolvedValue({ userId: uid });

    const failingSender: EmailSender = {
      send: vi.fn().mockRejectedValue(new Error('Resend API error')),
    };
    const result = await connectEmailFormAction(null, form('new@example.com'), failingSender);

    expect(result).toEqual({
      ok: false,
      error: 'Sending failed — try again later or use your personal login link to sign in.',
    });
  });
});
