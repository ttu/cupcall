import { describe, it, expect, vi, beforeEach } from 'vitest';
import { userId } from '@cup/engine';

vi.mock('./session', () => ({ getCurrentActor: vi.fn() }));
vi.mock('../../shared/db', () => ({ db: {} }));
vi.mock('../../shared/env', () => ({
  env: { AUTH_URL: 'https://example.com', RESEND_API_KEY: 'test-key' },
}));
vi.mock('@cup/db', () => ({
  getUserById: vi.fn(),
  getUserByEmail: vi.fn(),
  upsertPendingEmailLink: vi.fn(),
}));

import { requestEmailLinkAction, connectEmailFormAction } from './link-email-actions';
import { getCurrentActor } from './session';
import { getUserById, getUserByEmail, upsertPendingEmailLink } from '@cup/db';
import type { EmailSender } from './email-provider';

const mockedGetActor = vi.mocked(getCurrentActor);
const mockedGetUserById = vi.mocked(getUserById);
const mockedGetUserByEmail = vi.mocked(getUserByEmail);
const mockedUpsert = vi.mocked(upsertPendingEmailLink);

const uid = userId('user-1');
const guestUser = {
  id: uid,
  email: null,
  name: null,
  emailVerified: null,
  image: null,
  displayName: 'Guest',
};

function fakeSender(): EmailSender {
  return { send: vi.fn().mockResolvedValue(undefined) };
}

function form(email: string | null): FormData {
  const f = new FormData();
  if (email !== null) f.set('email', email);
  return f;
}

describe('requestEmailLinkAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUpsert.mockResolvedValue({
      userId: uid,
      email: 'test@example.com',
      token: 'tok',
      expiresAt: new Date(),
    });
  });

  it('returns error when not authenticated', async () => {
    mockedGetActor.mockResolvedValue(null);
    const result = await requestEmailLinkAction(form('a@b.com'), fakeSender());
    expect(result).toEqual({ ok: false, error: 'Not authenticated.' });
  });

  it('returns error when user not found', async () => {
    mockedGetActor.mockResolvedValue({ userId: uid });
    mockedGetUserById.mockResolvedValue(undefined);
    const result = await requestEmailLinkAction(form('a@b.com'), fakeSender());
    expect(result).toEqual({ ok: false, error: 'User not found.' });
  });

  it('returns error when user already has an email', async () => {
    mockedGetActor.mockResolvedValue({ userId: uid });
    mockedGetUserById.mockResolvedValue({ ...guestUser, email: 'existing@example.com' });
    const result = await requestEmailLinkAction(form('new@example.com'), fakeSender());
    expect(result).toEqual({ ok: false, error: 'Account already has an email address.' });
  });

  it('returns error for empty email', async () => {
    mockedGetActor.mockResolvedValue({ userId: uid });
    mockedGetUserById.mockResolvedValue(guestUser);
    const result = await requestEmailLinkAction(form(''), fakeSender());
    expect(result).toEqual({ ok: false, error: 'Email is required.' });
  });

  it('returns error for invalid email format', async () => {
    mockedGetActor.mockResolvedValue({ userId: uid });
    mockedGetUserById.mockResolvedValue(guestUser);
    const result = await requestEmailLinkAction(form('not-an-email'), fakeSender());
    expect(result).toEqual({ ok: false, error: 'Invalid email address.' });
  });

  it('returns ok silently when email is already in use (no enumeration)', async () => {
    mockedGetActor.mockResolvedValue({ userId: uid });
    mockedGetUserById.mockResolvedValue(guestUser);
    mockedGetUserByEmail.mockResolvedValue({
      ...guestUser,
      id: userId('other'),
      email: 'taken@example.com',
    });
    const sender = fakeSender();
    const result = await requestEmailLinkAction(form('taken@example.com'), sender);
    expect(result).toEqual({ ok: true });
    expect(mockedUpsert).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('sends email and returns ok for a valid request', async () => {
    mockedGetActor.mockResolvedValue({ userId: uid });
    mockedGetUserById.mockResolvedValue(guestUser);
    mockedGetUserByEmail.mockResolvedValue(undefined);

    const sender = fakeSender();
    const result = await requestEmailLinkAction(form('new@example.com'), sender);

    expect(result).toEqual({ ok: true });
    expect(mockedUpsert).toHaveBeenCalledOnce();
    expect(sender.send).toHaveBeenCalledOnce();
    const call = vi.mocked(sender.send).mock.calls[0]![0];
    expect(call.to).toBe('new@example.com');
    expect(call.url).toContain('/link-email/');
  });

  it('normalises email to lowercase', async () => {
    mockedGetActor.mockResolvedValue({ userId: uid });
    mockedGetUserById.mockResolvedValue(guestUser);
    mockedGetUserByEmail.mockResolvedValue(undefined);

    const sender = fakeSender();
    await requestEmailLinkAction(form('User@Example.COM'), sender);

    const call = vi.mocked(sender.send).mock.calls[0]![0];
    expect(call.to).toBe('user@example.com');
  });
});

describe('connectEmailFormAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUpsert.mockResolvedValue({
      userId: uid,
      email: 'test@example.com',
      token: 'tok',
      expiresAt: new Date(),
    });
  });

  it('returns ok on success', async () => {
    mockedGetActor.mockResolvedValue({ userId: uid });
    mockedGetUserById.mockResolvedValue(guestUser);
    mockedGetUserByEmail.mockResolvedValue(undefined);

    const result = await connectEmailFormAction(null, form('new@example.com'), fakeSender());

    expect(result).toEqual({ ok: true });
  });

  it('passes through user-input errors from requestEmailLinkAction', async () => {
    mockedGetActor.mockResolvedValue({ userId: uid });
    mockedGetUserById.mockResolvedValue(guestUser);

    const result = await connectEmailFormAction(null, form('bad-email'), fakeSender());

    expect(result).toEqual({ ok: false, error: 'Invalid email address.' });
  });

  it('returns a send-failure error when the email sender throws', async () => {
    mockedGetActor.mockResolvedValue({ userId: uid });
    mockedGetUserById.mockResolvedValue(guestUser);
    mockedGetUserByEmail.mockResolvedValue(undefined);

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
