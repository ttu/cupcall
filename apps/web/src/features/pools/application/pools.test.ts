/**
 * Integration tests for the pools application layer.
 *
 * Uses a real in-memory PGlite database. All DB calls hit real in-memory Postgres —
 * no mocks for in-system collaborators.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import {
  createUser,
  createPool as dbCreatePool,
  addMember,
  recordKick,
  isMember,
  isKicked,
  upsertScore,
  tournaments,
} from '@cup/db';
import type { UserId } from '@cup/engine';
import { points } from '@cup/engine';
import { createPool } from './create-pool';
import { joinPool } from './join-pool';
import { getUserPools } from './get-user-pools';
import { getPoolDetail } from './get-pool-detail';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Db = Awaited<ReturnType<typeof makeTestDb>>;

const NOW = new Date('2026-06-01T12:00:00Z');
const SCORING = {
  groupMatch: { exactScore: 6, correctOutcome: 3 },
  groupOrder: { allCorrect: 6, twoCorrect: 3, oneCorrect: 1 },
  groupTopScoringTeam: 10,
  groupTopConcedingTeam: 10,
  roundOf8PerTeam: 3,
  bronze: { exactScore: 5, perTeam: 5 },
  final: { exactScore: 5, perTeam: 5 },
  topFourOrder: {
    allCorrect: 20,
    threeCorrect: 15,
    twoCorrect: 10,
    oneCorrect: 5,
    teamRightWrongPlace: 2,
  },
  tournamentTopScoringTeam: 10,
  tournamentTopConcedingTeam: 10,
  highestMatchGoals: 10,
  mostYellowCardsTeam: 15,
  firstRedCardPlayer: 20,
  penaltyShootoutCount: 10,
  finalDecidedByPenalties: 10,
  finalDecisiveGoalPlayer: 20,
  topScorerPlayer: 15,
};

async function seedTournament(db: Db, id = 'wc-test'): Promise<string> {
  await db.insert(tournaments).values({
    id,
    name: 'Test WC',
    firstKickoff: new Date('2026-06-11T18:00:00Z'),
    scoringConfig: SCORING,
  });
  return id;
}

async function seedUser(db: Db, emailPrefix = 'user'): Promise<UserId> {
  const user = await createUser(db, {
    email: `${emailPrefix}-${crypto.randomUUID()}@test.com`,
    displayName: emailPrefix,
  });
  return user.id;
}

// ---------------------------------------------------------------------------
// createPool
// ---------------------------------------------------------------------------

describe('createPool', () => {
  let db: Db;
  let ownerId: UserId;

  beforeEach(async () => {
    db = await makeTestDb();
    ownerId = await seedUser(db, 'owner');
  });

  it('creates a pool and adds the owner as a member', async () => {
    await seedTournament(db);
    const result = await createPool(db, { ownerId, name: 'My Pool', now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pool.name).toBe('My Pool');
    expect(result.pool.ownerId).toBe(ownerId);
    expect(result.pool.memberCount).toBe(1);
  });

  it('creates a pool for the specified tournamentId', async () => {
    await seedTournament(db, 'wc-test');
    await seedTournament(db, 'mini-test');
    const result = await createPool(db, {
      ownerId,
      name: 'Mini Pool',
      tournamentId: 'mini-test',
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pool.tournamentId).toBe('mini-test');
  });

  it('returns tournament_not_found when the specified tournamentId does not exist', async () => {
    const result = await createPool(db, {
      ownerId,
      name: 'My Pool',
      tournamentId: 'nonexistent',
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('tournament_not_found');
  });

  it('returns no_tournament error when no tournaments exist', async () => {
    const result = await createPool(db, { ownerId, name: 'My Pool', now: NOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('no_tournament');
  });

  it('returns pool_cap_exceeded when owner already has 5 pools', async () => {
    await seedTournament(db);
    // Use a different hour for each creation to avoid rate-limit (3/hour).
    const HOUR_MS = 60 * 60 * 1000;
    for (let i = 0; i < 5; i++) {
      const r = await createPool(db, {
        ownerId,
        name: `Pool ${i}`,
        now: new Date(NOW.getTime() + i * HOUR_MS),
      });
      expect(r.ok).toBe(true);
    }
    const result = await createPool(db, {
      ownerId,
      name: 'Pool 6',
      now: new Date(NOW.getTime() + 5 * HOUR_MS),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('pool_cap_exceeded');
  });

  it('returns rate_limited after exceeding the hourly create limit', async () => {
    await seedTournament(db);
    // RATE_LIMITS.createPool.limit = 3 per hour
    for (let i = 0; i < 3; i++) {
      const r = await createPool(db, { ownerId, name: `Pool ${i}`, now: NOW });
      expect(r.ok).toBe(true);
    }
    const result = await createPool(db, { ownerId, name: 'Pool 4', now: NOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('rate_limited');
  });
});

// ---------------------------------------------------------------------------
// joinPool
// ---------------------------------------------------------------------------

describe('joinPool', () => {
  let db: Db;
  let ownerId: UserId;
  let joinerId: UserId;
  let poolToken: string;
  let poolId: string;

  beforeEach(async () => {
    db = await makeTestDb();
    await seedTournament(db);
    ownerId = await seedUser(db, 'owner');
    joinerId = await seedUser(db, 'joiner');

    const result = await createPool(db, { ownerId, name: 'Test Pool', now: NOW });
    if (!result.ok) throw new Error('createPool failed in beforeEach');
    poolId = result.pool.id;
    // Retrieve the raw token from the detail
    const detail = await getPoolDetail(db, poolId);
    if (!detail) throw new Error('getPoolDetail failed');
    if (!detail.inviteToken) throw new Error('pool has no invite token');
    poolToken = detail.inviteToken;
  });

  it('joins successfully with a valid token', async () => {
    const result = await joinPool(db, { userId: joinerId, token: poolToken, now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.alreadyMember).toBe(false);
    expect(result.poolId).toBe(poolId);
  });

  it('returns alreadyMember=true when already a member (idempotent)', async () => {
    await joinPool(db, { userId: joinerId, token: poolToken, now: NOW });
    const result = await joinPool(db, { userId: joinerId, token: poolToken, now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.alreadyMember).toBe(true);
  });

  it('returns not_found for an unknown token', async () => {
    const result = await joinPool(db, {
      userId: joinerId,
      token: 'completely-wrong-token',
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('not_found');
  });

  it('returns kicked error when user was previously kicked', async () => {
    await recordKick(db, poolId, joinerId);
    const result = await joinPool(db, { userId: joinerId, token: poolToken, now: NOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('kicked');
  });

  it('returns token_expired when token expiry has passed', async () => {
    // Create a separate pool whose token was expired before NOW.
    const expiredToken = 'expired-raw-token-abc123';
    await dbCreatePool(db, {
      tournamentId: 'wc-test',
      ownerId,
      name: 'Expired Pool',
      inviteTokenHash: expiredToken,
      tokenExpiresAt: new Date('2020-01-01'),
    });
    const result = await joinPool(db, { userId: joinerId, token: expiredToken, now: NOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('token_expired');
  });
});

// ---------------------------------------------------------------------------
// getUserPools
// ---------------------------------------------------------------------------

describe('getUserPools', () => {
  let db: Db;
  let ownerId: UserId;

  beforeEach(async () => {
    db = await makeTestDb();
    await seedTournament(db);
    ownerId = await seedUser(db, 'owner');
  });

  it('returns pools for the user with correct memberCount', async () => {
    const r1 = await createPool(db, { ownerId, name: 'Pool A', now: NOW });
    expect(r1.ok).toBe(true);

    const pools = await getUserPools(db, ownerId);
    expect(pools).toHaveLength(1);
    expect(pools[0]?.name).toBe('Pool A');
    expect(pools[0]?.memberCount).toBe(1);
  });

  it('includes myScore when a score exists', async () => {
    const r = await createPool(db, { ownerId, name: 'Scored Pool', now: NOW });
    if (!r.ok) throw new Error('setup failed');

    await upsertScore(db, {
      poolId: r.pool.id,
      userId: ownerId,
      pointsTotal: points(42),
      breakdown: {} as import('@cup/engine').ScoreBreakdown,
    });

    const pools = await getUserPools(db, ownerId);
    expect(pools[0]?.myScore).toBe(42);
  });

  it('returns empty array when user has no pools', async () => {
    const stranger = await seedUser(db, 'stranger');
    const pools = await getUserPools(db, stranger);
    expect(pools).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getPoolDetail — leaderboard ordering
// ---------------------------------------------------------------------------

describe('getPoolDetail', () => {
  let db: Db;

  beforeEach(async () => {
    db = await makeTestDb();
    await seedTournament(db);
  });

  it('returns leaderboard ordered by points desc then name asc', async () => {
    const alice = await createUser(db, { email: 'alice@x.com', displayName: 'Alice' });
    const bob = await createUser(db, { email: 'bob@x.com', displayName: 'Bob' });
    const carol = await createUser(db, { email: 'carol@x.com', displayName: 'Carol' });

    const { ok, pool } = (await createPool(db, {
      ownerId: alice.id,
      name: 'P',
      now: NOW,
    })) as Extract<Awaited<ReturnType<typeof createPool>>, { ok: true }>;
    expect(ok).toBe(true);
    const { id: poolId } = pool;

    await addMember(db, poolId, bob.id);
    await addMember(db, poolId, carol.id);

    await upsertScore(db, {
      poolId,
      userId: alice.id,
      pointsTotal: points(50),
      breakdown: {} as import('@cup/engine').ScoreBreakdown,
    });
    await upsertScore(db, {
      poolId,
      userId: bob.id,
      pointsTotal: points(75),
      breakdown: {} as import('@cup/engine').ScoreBreakdown,
    });
    // Carol has no score row — lands at 0

    const detail = await getPoolDetail(db, poolId);
    expect(detail).toBeDefined();
    const names = detail!.leaderboard.map((e) => e.displayName);
    // Bob (75) > Alice (50) > Carol (0, alpha tie last)
    expect(names[0]).toBe('Bob');
    expect(names[1]).toBe('Alice');
    expect(names[2]).toBe('Carol');
  });
});

// ---------------------------------------------------------------------------
// leavePool — member self-removal
// ---------------------------------------------------------------------------

describe('leavePool (via removeMember / isMember)', () => {
  let db: Db;
  let ownerId: UserId;
  let memberId: UserId;
  let poolId: string;
  let poolToken: string;

  beforeEach(async () => {
    db = await makeTestDb();
    await seedTournament(db);
    ownerId = await seedUser(db, 'owner');
    memberId = await seedUser(db, 'member');

    const result = await createPool(db, { ownerId, name: 'Leave Test Pool', now: NOW });
    if (!result.ok) throw new Error('setup: pool creation failed');
    poolId = result.pool.id;

    const detail = await getPoolDetail(db, poolId);
    if (!detail?.inviteToken) throw new Error('setup: pool has no invite token');
    poolToken = detail.inviteToken;

    await joinPool(db, { userId: memberId, token: poolToken, now: NOW });
  });

  it('removes the member from pool_members after leaving', async () => {
    expect(await isMember(db, poolId, memberId)).toBe(true);

    const { removeMember } = await import('@cup/db');
    await removeMember(db, poolId, memberId);

    expect(await isMember(db, poolId, memberId)).toBe(false);
  });

  it('does NOT write a kick record when a member leaves voluntarily', async () => {
    const { removeMember } = await import('@cup/db');
    await removeMember(db, poolId, memberId);

    expect(await isKicked(db, poolId, memberId)).toBe(false);
  });

  it('allows the member to rejoin via invite after leaving (no kick block)', async () => {
    const { removeMember } = await import('@cup/db');
    await removeMember(db, poolId, memberId);

    const rejoin = await joinPool(db, { userId: memberId, token: poolToken, now: NOW });
    expect(rejoin.ok).toBe(true);
  });

  it('the pool owner remains a member after a non-owner leaves', async () => {
    const { removeMember } = await import('@cup/db');
    await removeMember(db, poolId, memberId);

    expect(await isMember(db, poolId, ownerId)).toBe(true);
  });

  it('deletePrediction removes the leaving member’s prediction and is scoped to their pool/user', async () => {
    const { deletePrediction, getPrediction, getOrCreatePrediction } = await import('@cup/db');

    // joinPool already created a prediction for memberId; create one for ownerId too.
    await getOrCreatePrediction(db, { poolId, userId: ownerId, tournamentId: 'wc-test' });

    expect(await getPrediction(db, poolId, memberId)).toBeDefined();
    expect(await getPrediction(db, poolId, ownerId)).toBeDefined();

    await deletePrediction(db, poolId, memberId);

    expect(await getPrediction(db, poolId, memberId)).toBeUndefined();
    // Owner's prediction must remain untouched.
    expect(await getPrediction(db, poolId, ownerId)).toBeDefined();
  });

  it('deleteScore removes the leaving member’s score row for the pool', async () => {
    const { deleteScore } = await import('@cup/db');

    await upsertScore(db, {
      poolId,
      userId: memberId,
      pointsTotal: points(42),
      breakdown: {} as import('@cup/engine').ScoreBreakdown,
    });

    const detailBefore = await getPoolDetail(db, poolId);
    expect(detailBefore?.leaderboard.find((e) => e.userId === memberId)?.pointsTotal).toBe(42);

    await deleteScore(db, poolId, memberId);

    // After deleting the score, removing the member should make them disappear from the leaderboard.
    const { removeMember } = await import('@cup/db');
    await removeMember(db, poolId, memberId);

    const detailAfter = await getPoolDetail(db, poolId);
    expect(detailAfter?.leaderboard.find((e) => e.userId === memberId)).toBeUndefined();
  });
});
