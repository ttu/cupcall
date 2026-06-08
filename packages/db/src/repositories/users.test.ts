import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../testing/make-test-db';
import type { Db } from '../client';
import * as schema from '../schema/index';
import { createUser, getUserById, getUserByEmail, updateDisplayName } from './users';

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
});
