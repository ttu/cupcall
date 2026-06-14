/**
 * Integration tests for getCardView.
 * Uses a real in-memory PGlite database — no mocks.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import {
  upsertTournamentDef,
  createUser,
  createPool,
  upsertGroupScore,
  upsertKnockoutPick,
  upsertFinishScore,
  getOrCreatePrediction,
} from '@cup/db';
import { miniTournament } from '@cup/engine/testing';
import { groupId, teamId, bracketMatchKey } from '@cup/engine';
import type { UserId } from '@cup/engine';
import { getCardView } from './get-card';

const firstKickoff = new Date('2030-06-11T18:00:00Z');
const now = new Date('2025-01-01T00:00:00Z');
const emptyKickoffs = new Map<string, Date | null>();

type TestDb = Awaited<ReturnType<typeof makeTestDb>>;

async function setupDb(db: TestDb) {
  await upsertTournamentDef(db, miniTournament, firstKickoff, emptyKickoffs);
  const owner = await createUser(db, {
    email: `owner-${crypto.randomUUID()}@test.com`,
    displayName: 'Owner',
  });
  const pool = await createPool(db, {
    tournamentId: miniTournament.id,
    ownerId: owner.id,
    name: 'Test Pool',
    inviteTokenHash: `h-${crypto.randomUUID()}`,
  });
  const user = await createUser(db, {
    email: `user-${crypto.randomUUID()}@test.com`,
    displayName: 'Alice',
  });
  return { poolId: pool.id, userId: user.id as UserId };
}

function groupMatchIds(g: string) {
  return miniTournament.groupMatches.filter((m) => m.group === groupId(g)).map((m) => m.id);
}

describe('getCardView — qualifying highlight', () => {
  let db: TestDb;
  let poolId: string;
  let userId: UserId;

  beforeEach(async () => {
    db = await makeTestDb();
    ({ poolId, userId } = await setupDb(db));
  });

  it('marks NO team as qualifying when the group is incomplete', async () => {
    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    // Add only 3 of the 6 group-A matches (group incomplete)
    for (const mid of groupMatchIds('A').slice(0, 3)) {
      await upsertGroupScore(db, prediction.id, mid, 1, 0);
    }

    const card = await getCardView({
      db,
      poolId,
      userId,
      tournamentId: miniTournament.id,
      tournament: miniTournament,
      firstKickoff,
      now,
      createIfMissing: false,
    });

    const groupA = card!.groups.find((g) => g.groupId === groupId('A'))!;
    expect(groupA.complete).toBe(false);
    expect(groupA.derivedOrder.every((e) => e.qualifies === false)).toBe(true);
  });

  it('marks top-2 as qualifying when the group is complete', async () => {
    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    // Predict all 6 group-A matches as draws → seed order, A1 and A2 qualify
    for (const mid of groupMatchIds('A')) {
      await upsertGroupScore(db, prediction.id, mid, 0, 0);
    }

    const card = await getCardView({
      db,
      poolId,
      userId,
      tournamentId: miniTournament.id,
      tournament: miniTournament,
      firstKickoff,
      now,
      createIfMissing: false,
    });

    const groupA = card!.groups.find((g) => g.groupId === groupId('A'))!;
    expect(groupA.complete).toBe(true);
    expect(groupA.derivedOrder[0]!.qualifies).toBe('auto');
    expect(groupA.derivedOrder[1]!.qualifies).toBe('auto');
    expect(groupA.derivedOrder[2]!.qualifies).toBe(false);
    expect(groupA.derivedOrder[3]!.qualifies).toBe(false);
  });
});

describe('getCardView — bracket slot resolution', () => {
  let db: TestDb;
  let poolId: string;
  let userId: UserId;

  beforeEach(async () => {
    db = await makeTestDb();
    ({ poolId, userId } = await setupDb(db));
  });

  it('shows null team for an entry-round slot when its group is incomplete', async () => {
    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    // Complete groups B, C, D — leave group A with only 1 match predicted
    for (const g of ['B', 'C', 'D']) {
      for (const mid of groupMatchIds(g)) {
        await upsertGroupScore(db, prediction.id, mid, 0, 0);
      }
    }
    await upsertGroupScore(db, prediction.id, groupMatchIds('A')[0]!, 1, 0);

    const card = await getCardView({
      db,
      poolId,
      userId,
      tournamentId: miniTournament.id,
      tournament: miniTournament,
      firstKickoff,
      now,
      createIfMissing: false,
    });

    // qf1 = 1A vs 2B: group A incomplete → home (1A) null; group B complete → away (2B) = B2
    const qfRound = card!.bracket.rounds.find((r) => r.label === 'QF')!;
    const qf1 = qfRound.ties.find((t) => t.bracketMatchKey === bracketMatchKey('qf1'))!;
    expect(qf1.homeTeamId).toBeNull();
    expect(qf1.awayTeamId).toBe(teamId('B2'));

    // qf3 = 1B vs 2A: group B complete → home (1B) = B1; group A incomplete → away (2A) null
    const qf3 = qfRound.ties.find((t) => t.bracketMatchKey === bracketMatchKey('qf3'))!;
    expect(qf3.homeTeamId).toBe(teamId('B1'));
    expect(qf3.awayTeamId).toBeNull();
  });

  it('shows real teams in entry-round slots when all groups are complete', async () => {
    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    for (const g of ['A', 'B', 'C', 'D']) {
      for (const mid of groupMatchIds(g)) {
        await upsertGroupScore(db, prediction.id, mid, 0, 0);
      }
    }

    const card = await getCardView({
      db,
      poolId,
      userId,
      tournamentId: miniTournament.id,
      tournament: miniTournament,
      firstKickoff,
      now,
      createIfMissing: false,
    });

    const qfRound = card!.bracket.rounds.find((r) => r.label === 'QF')!;
    const qf1 = qfRound.ties.find((t) => t.bracketMatchKey === bracketMatchKey('qf1'))!;
    expect(qf1.homeTeamId).toBe(teamId('A1'));
    expect(qf1.awayTeamId).toBe(teamId('B2'));
  });
});

// Helper: seed a complete card up to the SFs so the finalists & bronze pair resolve to
//   finalists = [A1, B1], bronzePair = [C1, D1].
// All group scores are 0-0 (declaration-order standings); QF/SF picks send the home side through.
async function seedThroughSf(db: TestDb, predictionId: string): Promise<void> {
  for (const g of ['A', 'B', 'C', 'D']) {
    for (const mid of groupMatchIds(g)) {
      await upsertGroupScore(db, predictionId, mid, 0, 0);
    }
  }
  await upsertKnockoutPick(db, predictionId, bracketMatchKey('qf1'), teamId('A1'));
  await upsertKnockoutPick(db, predictionId, bracketMatchKey('qf2'), teamId('C1'));
  await upsertKnockoutPick(db, predictionId, bracketMatchKey('qf3'), teamId('B1'));
  await upsertKnockoutPick(db, predictionId, bracketMatchKey('qf4'), teamId('D1'));
  await upsertKnockoutPick(db, predictionId, bracketMatchKey('sf1'), teamId('A1'));
  await upsertKnockoutPick(db, predictionId, bracketMatchKey('sf2'), teamId('B1'));
}

describe('getCardView — final/bronze pickedWinnerId', () => {
  let db: TestDb;
  let poolId: string;
  let userId: UserId;

  beforeEach(async () => {
    db = await makeTestDb();
    ({ poolId, userId } = await setupDb(db));
  });

  it('exposes pickedWinnerId for final and bronze from knockoutPicks', async () => {
    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await seedThroughSf(db, prediction.id);
    await upsertKnockoutPick(db, prediction.id, bracketMatchKey('final'), teamId('A1'));
    await upsertKnockoutPick(db, prediction.id, bracketMatchKey('bronze'), teamId('C1'));
    await upsertFinishScore(db, prediction.id, 'final', 1, 1);
    await upsertFinishScore(db, prediction.id, 'bronze', 0, 0);

    const card = await getCardView({
      db,
      poolId,
      userId,
      tournamentId: miniTournament.id,
      tournament: miniTournament,
      firstKickoff,
      now,
      createIfMissing: false,
    });

    expect(card!.bracket.final.pickedWinnerId).toBe(teamId('A1'));
    expect(card!.bracket.bronze.pickedWinnerId).toBe(teamId('C1'));
  });

  it('returns null pickedWinnerId when no knockoutPick is set for final/bronze', async () => {
    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await seedThroughSf(db, prediction.id);
    await upsertFinishScore(db, prediction.id, 'final', 1, 1);

    const card = await getCardView({
      db,
      poolId,
      userId,
      tournamentId: miniTournament.id,
      tournament: miniTournament,
      firstKickoff,
      now,
      createIfMissing: false,
    });

    expect(card!.bracket.final.pickedWinnerId).toBeNull();
    expect(card!.bracket.bronze.pickedWinnerId).toBeNull();
  });
});

describe('getCardView — completion math for tied final/bronze', () => {
  let db: TestDb;
  let poolId: string;

  beforeEach(async () => {
    db = await makeTestDb();
    ({ poolId } = await setupDb(db));
  });

  async function getPercent(seed: (predictionId: string) => Promise<void>): Promise<number> {
    // Fresh user (and therefore fresh prediction) per call so we never leak state.
    const freshUser = await createUser(db, {
      email: `user-${crypto.randomUUID()}@test.com`,
      displayName: 'Fresh',
    });
    const userId = freshUser.id as UserId;
    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    await seedThroughSf(db, prediction.id);
    await seed(prediction.id);

    const card = await getCardView({
      db,
      poolId,
      userId,
      tournamentId: miniTournament.id,
      tournament: miniTournament,
      firstKickoff,
      now,
      createIfMissing: false,
    });
    return card!.completionPercent;
  }

  it('does not count a tied final without a winner pick toward completion', async () => {
    const percentWithTiedNoPick = await getPercent(async (pid) => {
      await upsertFinishScore(db, pid, 'final', 1, 1);
    });
    const percentWithoutFinal = await getPercent(async () => {
      // no final score at all
    });
    expect(percentWithTiedNoPick).toBe(percentWithoutFinal);
  });

  it('counts a tied final with an explicit winner pick the same as a non-tied final', async () => {
    const tiedWithPick = await getPercent(async (pid) => {
      await upsertFinishScore(db, pid, 'final', 1, 1);
      await upsertKnockoutPick(db, pid, bracketMatchKey('final'), teamId('A1'));
    });
    const nonTied = await getPercent(async (pid) => {
      await upsertFinishScore(db, pid, 'final', 2, 1);
    });
    expect(tiedWithPick).toBe(nonTied);
  });

  it('counts a non-tied final as a filled field even without an explicit winner pick', async () => {
    const withFinal = await getPercent(async (pid) => {
      await upsertFinishScore(db, pid, 'final', 2, 1);
    });
    const withoutFinal = await getPercent(async () => {});
    expect(withFinal).toBeGreaterThan(withoutFinal);
  });
});

// ---------------------------------------------------------------------------
// Late joiner — per-item lock state
// ---------------------------------------------------------------------------

describe('getCardView — late joiner per-item lock', () => {
  let db: TestDb;
  let poolId: string;
  let userId: UserId;

  const lockTime = new Date('2026-06-11T18:00:00Z');
  const afterLock = new Date('2026-06-13T00:00:00Z');
  const joinedAfterLock = new Date('2026-06-12T10:00:00Z');
  const joinedBeforeLock = new Date('2026-06-10T10:00:00Z');
  // Within the 4-hour late-joiner prediction window (1h after joining)
  const withinWindow = new Date(joinedAfterLock.getTime() + 60 * 60 * 1000);
  // After the 4-hour window has expired (5h after joining)
  const afterWindow = new Date(joinedAfterLock.getTime() + 5 * 60 * 60 * 1000);

  beforeEach(async () => {
    db = await makeTestDb();
    await upsertTournamentDef(db, miniTournament, lockTime, emptyKickoffs);
    const owner = await createUser(db, {
      email: `owner-${crypto.randomUUID()}@test.com`,
      displayName: 'Owner',
    });
    const pool = await createPool(db, {
      tournamentId: miniTournament.id,
      ownerId: owner.id,
      name: 'Test Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });
    const user = await createUser(db, {
      email: `user-${crypto.randomUUID()}@test.com`,
      displayName: 'Late Alice',
    });
    poolId = pool.id;
    userId = user.id as UserId;
    await getOrCreatePrediction(db, { poolId, userId, tournamentId: miniTournament.id });
  });

  function firstGroupMatchId() {
    return groupMatchIds('A')[0]!;
  }

  it('gives status "partial" for a late joiner within the 4-hour window', async () => {
    const card = await getCardView({
      db,
      poolId,
      userId,
      tournamentId: miniTournament.id,
      tournament: miniTournament,
      firstKickoff: lockTime,
      joinedAt: joinedAfterLock,
      knownResultMatchIds: new Set(),
      answeredBetKeys: new Set(),
      now: withinWindow,
    });
    expect(card?.status).toBe('partial');
  });

  it('gives status "locked" for a late joiner after the 4-hour window expires', async () => {
    const card = await getCardView({
      db,
      poolId,
      userId,
      tournamentId: miniTournament.id,
      tournament: miniTournament,
      firstKickoff: lockTime,
      joinedAt: joinedAfterLock,
      knownResultMatchIds: new Set(),
      answeredBetKeys: new Set(),
      now: afterWindow,
    });
    expect(card?.status).toBe('locked');
  });

  it('gives status "locked" for an early joiner after lock', async () => {
    const card = await getCardView({
      db,
      poolId,
      userId,
      tournamentId: miniTournament.id,
      tournament: miniTournament,
      firstKickoff: lockTime,
      joinedAt: joinedBeforeLock,
      knownResultMatchIds: new Set(),
      answeredBetKeys: new Set(),
      now: afterLock,
    });
    expect(card?.status).toBe('locked');
  });

  it('marks a match as locked when its ID is in knownResultMatchIds (within window)', async () => {
    const matchId = firstGroupMatchId();
    const card = await getCardView({
      db,
      poolId,
      userId,
      tournamentId: miniTournament.id,
      tournament: miniTournament,
      firstKickoff: lockTime,
      joinedAt: joinedAfterLock,
      knownResultMatchIds: new Set([matchId]),
      answeredBetKeys: new Set(),
      now: withinWindow,
    });
    const match = card?.groups.flatMap((g) => g.matches).find((m) => m.matchId === matchId);
    expect(match?.locked).toBe(true);
  });

  it('leaves a match editable when it has no result (within window)', async () => {
    const matchId = firstGroupMatchId();
    const card = await getCardView({
      db,
      poolId,
      userId,
      tournamentId: miniTournament.id,
      tournament: miniTournament,
      firstKickoff: lockTime,
      joinedAt: joinedAfterLock,
      knownResultMatchIds: new Set(), // no results known
      answeredBetKeys: new Set(),
      now: withinWindow,
    });
    const match = card?.groups.flatMap((g) => g.matches).find((m) => m.matchId === matchId);
    expect(match?.locked).toBe(false);
  });

  it('locks all items for a late joiner after the 4-hour window even without known results', async () => {
    const matchId = firstGroupMatchId();
    const card = await getCardView({
      db,
      poolId,
      userId,
      tournamentId: miniTournament.id,
      tournament: miniTournament,
      firstKickoff: lockTime,
      joinedAt: joinedAfterLock,
      knownResultMatchIds: new Set(), // no results — window expiry locks everything
      answeredBetKeys: new Set(),
      now: afterWindow,
    });
    const match = card?.groups.flatMap((g) => g.matches).find((m) => m.matchId === matchId);
    expect(match?.locked).toBe(true);
  });

  it('locks all items for an early joiner regardless of knownResultMatchIds', async () => {
    const matchId = firstGroupMatchId();
    const card = await getCardView({
      db,
      poolId,
      userId,
      tournamentId: miniTournament.id,
      tournament: miniTournament,
      firstKickoff: lockTime,
      joinedAt: joinedBeforeLock,
      knownResultMatchIds: new Set(), // no results — but doesn't matter for early joiner
      answeredBetKeys: new Set(),
      now: afterLock,
    });
    const match = card?.groups.flatMap((g) => g.matches).find((m) => m.matchId === matchId);
    expect(match?.locked).toBe(true);
  });

  it('prefills locked group matches with actual results so groups count as complete', async () => {
    // All group-A matches have known results but no saved predictions.
    // With actualGroupMatchScores, group A should be complete and bracket slots should resolve.
    const groupAMatchIds = groupMatchIds('A');
    const actualGroupMatchScores = new Map(
      groupAMatchIds.map((mid) => [mid, { home: 1, away: 0 }]),
    );

    const card = await getCardView({
      db,
      poolId,
      userId,
      tournamentId: miniTournament.id,
      tournament: miniTournament,
      firstKickoff: lockTime,
      joinedAt: joinedAfterLock,
      knownResultMatchIds: new Set(groupAMatchIds),
      answeredBetKeys: new Set(),
      actualGroupMatchScores,
      now: afterLock,
    });

    const groupA = card!.groups.find((g) => g.groupId === groupId('A'))!;
    expect(groupA.complete).toBe(true);
    // Locked matches should display the actual result
    const firstMatch = groupA.matches.find((m) => m.matchId === groupAMatchIds[0])!;
    expect(firstMatch.predictedHome).toBe(1);
    expect(firstMatch.predictedAway).toBe(0);
    expect(firstMatch.locked).toBe(true);
  });

  it('all items are editable (locked=false) before lock regardless of joinedAt', async () => {
    const matchId = firstGroupMatchId();
    const card = await getCardView({
      db,
      poolId,
      userId,
      tournamentId: miniTournament.id,
      tournament: miniTournament,
      firstKickoff: lockTime,
      joinedAt: joinedAfterLock,
      knownResultMatchIds: new Set([matchId]),
      answeredBetKeys: new Set(),
      now: new Date('2026-06-11T17:00:00Z'), // before lock
    });
    const match = card?.groups.flatMap((g) => g.matches).find((m) => m.matchId === matchId);
    expect(match?.locked).toBe(false);
    expect(card?.status).toBe('editable');
  });
});
