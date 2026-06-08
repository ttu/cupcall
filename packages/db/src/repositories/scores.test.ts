import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../testing/make-test-db';
import { testScoring } from '../testing/fixtures';
import type { Db } from '../client';
import { upsertScore, getLeaderboard } from './scores';
import { createUser } from './users';
import { createPool } from './pools';
import { addMember } from './members';
import type { UserId } from '@cup/engine';
import { points } from '@cup/engine';
import * as schema from '../schema/index';
import type { ScoreBreakdown } from '@cup/engine';

function makeBreakdown(total: number): ScoreBreakdown {
  return {
    groupMatches: points(0),
    groupOrder: points(0),
    bronze: points(0),
    final: points(0),
    roundOf8: points(0),
    topFour: points(0),
    specials: points(0),
    total: points(total),
  };
}

describe('scores repository', () => {
  let db: Db<typeof schema>;
  let poolId: string;
  let userId1: UserId;
  let userId2: UserId;
  let userId3: UserId;

  beforeEach(async () => {
    db = await makeTestDb();
    const tId = `wc-${crypto.randomUUID()}`;
    await db.insert(schema.tournaments).values({
      id: tId,
      name: 'Test',
      firstKickoff: new Date(),
      scoringConfig: testScoring,
    });
    const owner = await createUser(db, {
      email: `owner-${crypto.randomUUID()}@x.com`,
      displayName: 'Owner',
    });
    const u1 = await createUser(db, {
      email: `u1-${crypto.randomUUID()}@x.com`,
      displayName: 'Alice',
    });
    const u2 = await createUser(db, {
      email: `u2-${crypto.randomUUID()}@x.com`,
      displayName: 'Bob',
    });
    const u3 = await createUser(db, {
      email: `u3-${crypto.randomUUID()}@x.com`,
      displayName: 'Carol',
    });
    userId1 = u1.id;
    userId2 = u2.id;
    userId3 = u3.id;
    const pool = await createPool(db, {
      tournamentId: tId,
      ownerId: owner.id,
      name: 'Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });
    poolId = pool.id;
  });

  describe('upsertScore', () => {
    it('inserts a new score row', async () => {
      const score = await upsertScore(db, {
        poolId,
        userId: userId1,
        pointsTotal: points(42),
        breakdown: makeBreakdown(42),
      });
      expect(score.pointsTotal).toBe(42);
      expect(score.userId).toBe(userId1);
    });

    it('updates instead of inserting a duplicate', async () => {
      await upsertScore(db, {
        poolId,
        userId: userId1,
        pointsTotal: points(10),
        breakdown: makeBreakdown(10),
      });
      const updated = await upsertScore(db, {
        poolId,
        userId: userId1,
        pointsTotal: points(99),
        breakdown: makeBreakdown(99),
      });
      expect(updated.pointsTotal).toBe(99);

      // Confirm no duplicate row was created
      const rows = await db.select().from(schema.scores);
      expect(rows.filter((r) => r.userId === userId1 && r.poolId === poolId)).toHaveLength(1);
    });
  });

  describe('getLeaderboard', () => {
    it('returns all members even those with no score row (at 0 points)', async () => {
      await addMember(db, poolId, userId1);
      await addMember(db, poolId, userId2);

      // Only userId1 has a score row
      await upsertScore(db, {
        poolId,
        userId: userId1,
        pointsTotal: points(50),
        breakdown: makeBreakdown(50),
      });

      const board = await getLeaderboard(db, poolId);
      expect(board).toHaveLength(2);

      const u2Entry = board.find((e) => e.userId === userId2);
      expect(u2Entry?.pointsTotal).toBe(0);
      expect(u2Entry?.breakdown).toBeNull();
    });

    it('orders by pointsTotal DESC', async () => {
      await addMember(db, poolId, userId1);
      await addMember(db, poolId, userId2);

      await upsertScore(db, {
        poolId,
        userId: userId1,
        pointsTotal: points(30),
        breakdown: makeBreakdown(30),
      });
      await upsertScore(db, {
        poolId,
        userId: userId2,
        pointsTotal: points(70),
        breakdown: makeBreakdown(70),
      });

      const board = await getLeaderboard(db, poolId);
      expect(board[0]?.userId).toBe(userId2); // 70 points first
      expect(board[1]?.userId).toBe(userId1); // 30 points second
    });

    it('applies displayName ASC tiebreak for equal scores', async () => {
      // userId1 = Alice, userId2 = Bob, userId3 = Carol — all with equal scores
      await addMember(db, poolId, userId1);
      await addMember(db, poolId, userId2);
      await addMember(db, poolId, userId3);

      for (const uid of [userId1, userId2, userId3]) {
        await upsertScore(db, {
          poolId,
          userId: uid,
          pointsTotal: points(50),
          breakdown: makeBreakdown(50),
        });
      }

      const board = await getLeaderboard(db, poolId);
      const names = board.map((e) => e.displayName);
      expect(names).toEqual(['Alice', 'Bob', 'Carol']);
    });

    it('handles tiebreak with one member having no score (0 points)', async () => {
      await addMember(db, poolId, userId1); // Alice — 50 pts
      await addMember(db, poolId, userId2); // Bob — no score row (0)
      await addMember(db, poolId, userId3); // Carol — 50 pts

      await upsertScore(db, {
        poolId,
        userId: userId1,
        pointsTotal: points(50),
        breakdown: makeBreakdown(50),
      });
      await upsertScore(db, {
        poolId,
        userId: userId3,
        pointsTotal: points(50),
        breakdown: makeBreakdown(50),
      });

      const board = await getLeaderboard(db, poolId);
      // Alice and Carol tied at 50; alphabetical → Alice first, Carol second
      // Bob at 0 → last
      expect(board[0]?.displayName).toBe('Alice');
      expect(board[1]?.displayName).toBe('Carol');
      expect(board[2]?.displayName).toBe('Bob');
    });

    it('returns empty array when pool has no members', async () => {
      const board = await getLeaderboard(db, poolId);
      expect(board).toHaveLength(0);
    });
  });
});
