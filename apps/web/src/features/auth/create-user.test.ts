import { describe, it, expect } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import { createUser } from '@cup/db';
import { deriveDisplayName } from './display-name';
import { applyDerivedDisplayName } from './create-user';

describe('applyDerivedDisplayName', () => {
  it('updates displayName derived from email after adapter insert', async () => {
    const db = await makeTestDb();
    const email = 'alice@example.com';

    // Simulate what the DrizzleAdapter does: insert with displayName=''
    const user = await createUser(db, { email, displayName: '' });

    await applyDerivedDisplayName(db, { id: user.id, email });

    // Fetch back to verify the UPDATE was applied
    const { getUserById } = await import('@cup/db');
    const updated = await getUserById(db, user.id);
    expect(updated?.displayName).toBe(deriveDisplayName(email));
  });

  it('is a no-op when email is null (no-email guard)', async () => {
    const db = await makeTestDb();
    const user = await createUser(db, { email: 'nomail@example.com', displayName: '' });

    // Should not throw
    await expect(
      applyDerivedDisplayName(db, { id: user.id, email: null }),
    ).resolves.toBeUndefined();

    const { getUserById } = await import('@cup/db');
    const unchanged = await getUserById(db, user.id);
    // displayName stays at what it was before the no-op
    expect(unchanged?.displayName).toBe('');
  });

  it('is a no-op when email is undefined', async () => {
    const db = await makeTestDb();
    const user = await createUser(db, { email: 'other@example.com', displayName: '' });

    await expect(
      applyDerivedDisplayName(db, { id: user.id, email: undefined }),
    ).resolves.toBeUndefined();
  });
});
