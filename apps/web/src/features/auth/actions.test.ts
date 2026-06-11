import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError } from '../../shared/authz';
import { userId } from '@cup/engine';

// Mock only the system boundaries: the session (auth), the DB singleton + repo,
// Next's cache revalidation, and the logger. The validation + authorization logic
// under test runs for real.
vi.mock('./session', () => ({ getCurrentActor: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../shared/db', () => ({ db: {} }));
vi.mock('../../shared/observability/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@cup/db', () => ({ updateDisplayName: vi.fn(), deleteUser: vi.fn() }));
vi.mock('./auth', () => ({ signOut: vi.fn() }));

import { updateDisplayNameAction, deleteAccountAction } from './actions';
import { getCurrentActor } from './session';
import { updateDisplayName, deleteUser } from '@cup/db';
import { signOut } from './auth';

const mockedGetActor = vi.mocked(getCurrentActor);
const mockedUpdate = vi.mocked(updateDisplayName);
const mockedDelete = vi.mocked(deleteUser);
const mockedSignOut = vi.mocked(signOut);

const prev = { error: null, saved: false };

function form(name: string | null): FormData {
  const f = new FormData();
  if (name !== null) f.set('displayName', name);
  return f;
}

describe('deleteAccountAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws ForbiddenError and does not delete when not signed in', async () => {
    mockedGetActor.mockResolvedValue(null);

    await expect(deleteAccountAction()).rejects.toThrowError(ForbiddenError);
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('deletes the user and calls signOut for a signed-in user', async () => {
    const uid = userId('user-1');
    mockedGetActor.mockResolvedValue({ userId: uid });
    mockedDelete.mockResolvedValue(undefined);
    mockedSignOut.mockResolvedValue(undefined as never);

    await deleteAccountAction();

    expect(mockedDelete).toHaveBeenCalledWith(expect.anything(), uid);
    expect(mockedSignOut).toHaveBeenCalledWith({ redirectTo: '/' });
  });

  it('returns an error and does not sign out when deleteUser throws', async () => {
    const uid = userId('user-2');
    mockedGetActor.mockResolvedValue({ userId: uid });
    mockedDelete.mockRejectedValue(new Error('DB error'));

    const result = await deleteAccountAction();

    expect(result).toEqual({ ok: false, error: expect.stringContaining('delete account') });
    expect(mockedSignOut).not.toHaveBeenCalled();
  });
});

describe('updateDisplayNameAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws ForbiddenError and does not write when not signed in', async () => {
    mockedGetActor.mockResolvedValue(null);

    await expect(updateDisplayNameAction(prev, form('Alice'))).rejects.toThrowError(ForbiddenError);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('persists a valid display name for a signed-in user', async () => {
    const uid = userId('user-1');
    mockedGetActor.mockResolvedValue({ userId: uid });
    mockedUpdate.mockResolvedValue({
      id: uid,
      displayName: 'Alice',
      email: null,
      name: null,
      emailVerified: null,
      image: null,
    });

    await updateDisplayNameAction(prev, form('Alice'));

    expect(mockedUpdate).toHaveBeenCalledWith(expect.anything(), uid, 'Alice');
  });

  it('does not write when the name is empty/whitespace (validation drops)', async () => {
    mockedGetActor.mockResolvedValue({ userId: userId('user-1') });

    await updateDisplayNameAction(prev, form('   '));

    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('does not write when the name exceeds the max length', async () => {
    mockedGetActor.mockResolvedValue({ userId: userId('user-1') });

    await updateDisplayNameAction(prev, form('x'.repeat(65)));

    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});
