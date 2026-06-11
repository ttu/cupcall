import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../testing/make-test-db';
import type { Db } from '../client';
import * as schema from '../schema/index';
import {
  createUser,
  createGuestUser,
  getUserById,
  getUserByEmail,
  updateDisplayName,
  upsertPendingEmailLink,
  getPendingEmailLinkByToken,
  deletePendingEmailLink,
  linkEmailToUser,
} from './users';

describe('users repository', () => {
  let db: Db<typeof schema>;

  beforeEach(async () => {
    db = await makeTestDb();
  });

  describe('createUser / getUserById', () => {
    it('round-trips a created user', async () => {
      const created = await createUser(db, { email: 'alice@example.com', displayName: 'Alice' });
      expect(created.email).toBe('alice@example.com');
      expect(created.displayName).toBe('Alice');
      expect(created.id).toBeTypeOf('string');

      const found = await getUserById(db, created.id);
      expect(found).toBeDefined();
      expect(found?.email).toBe('alice@example.com');
      expect(found?.displayName).toBe('Alice');
    });

    it('returns undefined for a missing id', async () => {
      const { userId } = await import('@cup/engine');
      const result = await getUserById(db, userId('no-such-id'));
      expect(result).toBeUndefined();
    });
  });

  describe('getUserByEmail', () => {
    it('finds a user by email', async () => {
      await createUser(db, { email: 'bob@example.com', displayName: 'Bob' });
      const found = await getUserByEmail(db, 'bob@example.com');
      expect(found?.displayName).toBe('Bob');
    });

    it('returns undefined when email does not exist', async () => {
      const result = await getUserByEmail(db, 'nobody@example.com');
      expect(result).toBeUndefined();
    });
  });

  describe('updateDisplayName', () => {
    it('changes the display name and returns the updated row', async () => {
      const created = await createUser(db, { email: 'carol@example.com', displayName: 'Carol' });
      const updated = await updateDisplayName(db, created.id, 'Carol Updated');
      expect(updated?.displayName).toBe('Carol Updated');

      const refetched = await getUserById(db, created.id);
      expect(refetched?.displayName).toBe('Carol Updated');
    });

    it('returns undefined when the user does not exist', async () => {
      const { userId } = await import('@cup/engine');
      const result = await updateDisplayName(db, userId('ghost-id'), 'Ghost');
      expect(result).toBeUndefined();
    });
  });

  describe('upsertPendingEmailLink / getPendingEmailLinkByToken / deletePendingEmailLink', () => {
    it('stores and retrieves a pending link by token', async () => {
      const user = await createGuestUser(db, { displayName: 'Guest' });
      const expiresAt = new Date(Date.now() + 86_400_000);

      await upsertPendingEmailLink(db, {
        userId: user.id,
        email: 'guest@example.com',
        token: 'tok-abc',
        expiresAt,
      });

      const found = await getPendingEmailLinkByToken(db, 'tok-abc');
      expect(found?.userId).toBe(user.id);
      expect(found?.email).toBe('guest@example.com');
    });

    it('replaces an existing pending link on upsert', async () => {
      const user = await createGuestUser(db, { displayName: 'Guest2' });
      const expiresAt = new Date(Date.now() + 86_400_000);

      await upsertPendingEmailLink(db, {
        userId: user.id,
        email: 'first@example.com',
        token: 'tok-first',
        expiresAt,
      });
      await upsertPendingEmailLink(db, {
        userId: user.id,
        email: 'second@example.com',
        token: 'tok-second',
        expiresAt,
      });

      expect(await getPendingEmailLinkByToken(db, 'tok-first')).toBeUndefined();
      const found = await getPendingEmailLinkByToken(db, 'tok-second');
      expect(found?.email).toBe('second@example.com');
    });

    it('returns undefined for an unknown token', async () => {
      expect(await getPendingEmailLinkByToken(db, 'no-such-token')).toBeUndefined();
    });

    it('deletes the pending link', async () => {
      const user = await createGuestUser(db, { displayName: 'Guest3' });
      await upsertPendingEmailLink(db, {
        userId: user.id,
        email: 'del@example.com',
        token: 'tok-del',
        expiresAt: new Date(Date.now() + 86_400_000),
      });

      await deletePendingEmailLink(db, 'tok-del');
      expect(await getPendingEmailLinkByToken(db, 'tok-del')).toBeUndefined();
    });
  });

  describe('linkEmailToUser', () => {
    it('sets email and emailVerified for a guest user', async () => {
      const guest = await createGuestUser(db, { displayName: 'LinkMe' });
      const updated = await linkEmailToUser(db, guest.id, 'linked@example.com');

      expect(updated?.email).toBe('linked@example.com');
      expect(updated?.emailVerified).toBeInstanceOf(Date);
    });

    it('returns undefined and makes no change when user already has an email', async () => {
      const user = await createUser(db, { email: 'already@example.com', displayName: 'Already' });
      const result = await linkEmailToUser(db, user.id, 'other@example.com');

      expect(result).toBeUndefined();
      const refetched = await getUserById(db, user.id);
      expect(refetched?.email).toBe('already@example.com');
    });
  });
});
