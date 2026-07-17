/**
 * Integration tests for pool backup export and restore.
 *
 * Uses a real in-memory PGlite database. No mocks for in-system collaborators.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import {
  createUser,
  createPool as dbCreatePool,
  addMember,
  upsertTournamentDef,
  getOrCreatePrediction,
  upsertGroupScore,
  upsertKnockoutPick,
  upsertSpecialBet,
  getPredictionInputs,
  getLeaderboard,
  isMember,
} from '@cup/db';
import { miniTournament } from '@cup/engine/testing';
import { bracketMatchKey, tournamentId as asTournamentId } from '@cup/engine';
import type { UserId, TournamentId, PoolId } from '@cup/engine';
import { buildPoolExport, restorePoolFromBackup } from './pool-backup';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Db = Awaited<ReturnType<typeof makeTestDb>>;

const FUTURE_KICKOFF = new Date('2099-06-11T18:00:00Z');
const EMPTY_KICKOFFS = new Map<string, Date | null>();

async function seedTournament(db: Db): Promise<TournamentId> {
  await upsertTournamentDef(db, miniTournament, FUTURE_KICKOFF, EMPTY_KICKOFFS);
  return asTournamentId(miniTournament.id);
}

async function seedUser(db: Db, name: string): Promise<UserId> {
  const user = await createUser(db, {
    email: `${name}-${crypto.randomUUID()}@test.com`,
    displayName: name,
  });
  return user.id;
}

// ---------------------------------------------------------------------------
// buildPoolExport
// ---------------------------------------------------------------------------

describe('buildPoolExport', () => {
  let db: Db;
  let tournamentId: TournamentId;
  let poolId: PoolId;
  let ownerId: UserId;
  let memberId: UserId;

  beforeEach(async () => {
    db = await makeTestDb();
    tournamentId = await seedTournament(db);
    ownerId = await seedUser(db, 'Owner');
    memberId = await seedUser(db, 'Alice');

    const pool = await dbCreatePool(db, {
      tournamentId,
      ownerId,
      name: 'Test Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });
    poolId = pool.id;
    await addMember(db, poolId, ownerId);
    await addMember(db, poolId, memberId);
  });

  it('returns correct metadata', async () => {
    const backup = await buildPoolExport(db, poolId, 'Test Pool', tournamentId);
    expect(backup.version).toBe(1);
    expect(backup.tournamentId).toBe(tournamentId);
    expect(backup.poolName).toBe('Test Pool');
    expect(typeof backup.exportedAt).toBe('string');
  });

  it('includes all pool members', async () => {
    const backup = await buildPoolExport(db, poolId, 'Test Pool', tournamentId);
    const memberIds = backup.members.map((m) => m.userId).sort((a, b) => a.localeCompare(b));
    expect(memberIds).toEqual([ownerId, memberId].sort((a, b) => a.localeCompare(b)));
  });

  it('includes member display names', async () => {
    const backup = await buildPoolExport(db, poolId, 'Test Pool', tournamentId);
    const names = backup.members.map((m) => m.displayName).sort((a, b) => a.localeCompare(b));
    expect(names).toContain('Owner');
    expect(names).toContain('Alice');
  });

  it('exports empty prediction arrays when member has no predictions', async () => {
    const backup = await buildPoolExport(db, poolId, 'Test Pool', tournamentId);
    const member = backup.members.find((m) => m.userId === memberId);
    expect(member?.prediction.groupScores).toEqual([]);
    expect(member?.prediction.knockoutPicks).toEqual([]);
    expect(member?.prediction.finishScores).toEqual({});
    expect(member?.prediction.specials).toEqual({});
  });

  it('exports group scores when member has predictions', async () => {
    const firstMatch = miniTournament.groupMatches[0]!;
    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId: memberId,
      tournamentId,
    });
    await upsertGroupScore(db, prediction.id, firstMatch.id, 2, 1);

    const backup = await buildPoolExport(db, poolId, 'Test Pool', tournamentId);
    const member = backup.members.find((m) => m.userId === memberId);
    expect(member?.prediction.groupScores).toHaveLength(1);
    expect(member?.prediction.groupScores[0]).toMatchObject({
      matchId: firstMatch.id,
      home: 2,
      away: 1,
    });
  });

  it('exports knockout picks', async () => {
    const slotKey = miniTournament.bracket.slots[0]!.match;
    const teamId = miniTournament.teams[0]!.id;
    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId: memberId,
      tournamentId,
    });
    await upsertKnockoutPick(db, prediction.id, bracketMatchKey(slotKey), teamId);

    const backup = await buildPoolExport(db, poolId, 'Test Pool', tournamentId);
    const member = backup.members.find((m) => m.userId === memberId);
    expect(member?.prediction.knockoutPicks).toHaveLength(1);
    expect(member?.prediction.knockoutPicks[0]).toMatchObject({
      bracketMatchKey: slotKey,
      winner: teamId,
    });
  });

  it('exports special bets', async () => {
    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId: memberId,
      tournamentId,
    });
    await upsertSpecialBet(db, prediction.id, 'penaltyShootoutCount', 3);

    const backup = await buildPoolExport(db, poolId, 'Test Pool', tournamentId);
    const member = backup.members.find((m) => m.userId === memberId);
    expect(member?.prediction.specials.penaltyShootoutCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// restorePoolFromBackup
// ---------------------------------------------------------------------------

describe('restorePoolFromBackup', () => {
  let db: Db;
  let tournamentId: TournamentId;
  let targetPoolId: PoolId;
  let targetOwnerId: UserId;

  beforeEach(async () => {
    db = await makeTestDb();
    tournamentId = await seedTournament(db);
    targetOwnerId = await seedUser(db, 'RestoreOwner');

    const pool = await dbCreatePool(db, {
      tournamentId,
      ownerId: targetOwnerId,
      name: 'Restored Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });
    targetPoolId = pool.id;
    await addMember(db, targetPoolId, targetOwnerId);
  });

  it('adds members from the backup to the target pool', async () => {
    const userId1 = await seedUser(db, 'Bob');
    const backup = {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      tournamentId,
      poolName: 'Old Pool',
      members: [
        {
          userId: userId1,
          displayName: 'Bob',
          prediction: { groupScores: [], knockoutPicks: [], finishScores: {}, specials: {} },
        },
      ],
    };

    const result = await restorePoolFromBackup(
      db,
      targetPoolId,
      tournamentId,
      backup,
      targetOwnerId,
    );
    expect(result.membersRestored).toBe(1);
    expect(await isMember(db, targetPoolId, userId1)).toBe(true);
  });

  it('creates a guest user when backup userId does not exist in the DB', async () => {
    const backup = {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      tournamentId,
      poolName: 'Old Pool',
      members: [
        {
          userId: 'usr_nonexistent_abc123',
          displayName: 'Ghost User',
          prediction: { groupScores: [], knockoutPicks: [], finishScores: {}, specials: {} },
        },
      ],
    };

    const result = await restorePoolFromBackup(
      db,
      targetPoolId,
      tournamentId,
      backup,
      targetOwnerId,
    );
    expect(result.membersRestored).toBe(1);
    // A new member should have been added (guest with the given displayName)
    const leaderboard = await getLeaderboard(db, targetPoolId);
    const guest = leaderboard.find((e) => e.displayName === 'Ghost User');
    expect(guest).toBeDefined();
  });

  it('restores group score predictions', async () => {
    const existingUser = await seedUser(db, 'Carol');
    const firstMatch = miniTournament.groupMatches[0]!;

    const backup = {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      tournamentId,
      poolName: 'Old Pool',
      members: [
        {
          userId: existingUser,
          displayName: 'Carol',
          prediction: {
            groupScores: [{ matchId: firstMatch.id, home: 3, away: 0 }],
            knockoutPicks: [],
            finishScores: {},
            specials: {},
          },
        },
      ],
    };

    await restorePoolFromBackup(db, targetPoolId, tournamentId, backup, targetOwnerId);

    const leaderboard = await getLeaderboard(db, targetPoolId);
    const carol = leaderboard.find((e) => e.userId === existingUser);
    expect(carol).toBeDefined();

    // Fetch prediction inputs to verify they were written
    const pred = await getOrCreatePrediction(db, {
      poolId: targetPoolId,
      userId: existingUser,
      tournamentId,
    });
    const inputs = await getPredictionInputs(db, pred.id);
    expect(inputs.groupScores).toHaveLength(1);
    expect(inputs.groupScores[0]).toMatchObject({ matchId: firstMatch.id, home: 3, away: 0 });
  });

  it('clears existing predictions before restoring', async () => {
    const existingUser = await seedUser(db, 'Dave');
    await addMember(db, targetPoolId, existingUser);

    // Set up existing prediction
    const pred = await getOrCreatePrediction(db, {
      poolId: targetPoolId,
      userId: existingUser,
      tournamentId,
    });
    const oldMatch = miniTournament.groupMatches[0]!;
    await upsertGroupScore(db, pred.id, oldMatch.id, 5, 5);

    // Now restore with different data
    const newMatch = miniTournament.groupMatches[1] ?? miniTournament.groupMatches[0]!;
    const backup = {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      tournamentId,
      poolName: 'Old Pool',
      members: [
        {
          userId: existingUser,
          displayName: 'Dave',
          prediction: {
            groupScores: [{ matchId: newMatch.id, home: 1, away: 1 }],
            knockoutPicks: [],
            finishScores: {},
            specials: {},
          },
        },
      ],
    };

    await restorePoolFromBackup(db, targetPoolId, tournamentId, backup, targetOwnerId);

    const inputs = await getPredictionInputs(db, pred.id);
    // Old score (5-5) is gone; only the restored score remains
    const oldScore = inputs.groupScores.find((gs) => gs.matchId === oldMatch.id && gs.home === 5);
    expect(oldScore).toBeUndefined();
    expect(inputs.groupScores.find((gs) => gs.matchId === newMatch.id)).toMatchObject({
      home: 1,
      away: 1,
    });
  });

  it('returns the correct prediction IDs for rescoring', async () => {
    const user1 = await seedUser(db, 'Eva');
    const user2 = await seedUser(db, 'Frank');

    const backup = {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      tournamentId,
      poolName: 'Old Pool',
      members: [
        {
          userId: user1,
          displayName: 'Eva',
          prediction: { groupScores: [], knockoutPicks: [], finishScores: {}, specials: {} },
        },
        {
          userId: user2,
          displayName: 'Frank',
          prediction: { groupScores: [], knockoutPicks: [], finishScores: {}, specials: {} },
        },
      ],
    };

    const result = await restorePoolFromBackup(
      db,
      targetPoolId,
      tournamentId,
      backup,
      targetOwnerId,
    );
    expect(result.restoredPredictions).toHaveLength(2);
    const userIds = result.restoredPredictions
      .map((r) => r.userId)
      .sort((a, b) => a.localeCompare(b));
    expect(userIds).toEqual([user1, user2].sort((a, b) => a.localeCompare(b)));
  });

  it('is idempotent: re-importing the same backup restores the same data', async () => {
    const existingUser = await seedUser(db, 'Grace');
    const firstMatch = miniTournament.groupMatches[0]!;

    const backup = {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      tournamentId,
      poolName: 'Old Pool',
      members: [
        {
          userId: existingUser,
          displayName: 'Grace',
          prediction: {
            groupScores: [{ matchId: firstMatch.id, home: 2, away: 0 }],
            knockoutPicks: [],
            finishScores: {},
            specials: {},
          },
        },
      ],
    };

    await restorePoolFromBackup(db, targetPoolId, tournamentId, backup, targetOwnerId);
    await restorePoolFromBackup(db, targetPoolId, tournamentId, backup, targetOwnerId);

    const pred = await getOrCreatePrediction(db, {
      poolId: targetPoolId,
      userId: existingUser,
      tournamentId,
    });
    const inputs = await getPredictionInputs(db, pred.id);
    expect(inputs.groupScores).toHaveLength(1);
    expect(inputs.groupScores[0]).toMatchObject({ matchId: firstMatch.id, home: 2, away: 0 });
  });
});

// ---------------------------------------------------------------------------
// Round-trip: export → import
// ---------------------------------------------------------------------------

describe('buildPoolExport + restorePoolFromBackup (round-trip)', () => {
  let db: Db;
  let tournamentId: TournamentId;

  beforeEach(async () => {
    db = await makeTestDb();
    tournamentId = await seedTournament(db);
  });

  it('round-trips prediction data faithfully', async () => {
    // Set up source pool with one member and predictions
    const ownerId = await seedUser(db, 'Owner');
    const memberId = await seedUser(db, 'Member');

    const sourcePool = await dbCreatePool(db, {
      tournamentId,
      ownerId,
      name: 'Source Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });
    await addMember(db, sourcePool.id, ownerId);
    await addMember(db, sourcePool.id, memberId);

    const firstMatch = miniTournament.groupMatches[0]!;
    const pred = await getOrCreatePrediction(db, {
      poolId: sourcePool.id,
      userId: memberId,
      tournamentId,
    });
    await upsertGroupScore(db, pred.id, firstMatch.id, 3, 1);
    await upsertSpecialBet(db, pred.id, 'penaltyShootoutCount', 2);

    // Export
    const backup = await buildPoolExport(db, sourcePool.id, 'Source Pool', tournamentId);

    // Set up target pool
    const targetOwnerId = await seedUser(db, 'TargetOwner');
    const targetPool = await dbCreatePool(db, {
      tournamentId,
      ownerId: targetOwnerId,
      name: 'Target Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });
    await addMember(db, targetPool.id, targetOwnerId);

    // Restore
    await restorePoolFromBackup(db, targetPool.id, tournamentId, backup, targetOwnerId);

    // Verify member's prediction is in the target pool
    const restoredPred = await getOrCreatePrediction(db, {
      poolId: targetPool.id,
      userId: memberId,
      tournamentId,
    });
    const inputs = await getPredictionInputs(db, restoredPred.id);

    expect(inputs.groupScores).toHaveLength(1);
    expect(inputs.groupScores[0]).toMatchObject({ matchId: firstMatch.id, home: 3, away: 1 });
    expect(inputs.specials.penaltyShootoutCount).toBe(2);
  });
});
