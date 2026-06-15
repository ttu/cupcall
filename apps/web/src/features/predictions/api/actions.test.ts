import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import * as schema from '@cup/db/schema';
import {
  createUser,
  createPool as dbCreatePool,
  upsertTournamentDef,
  getPredictionInputs,
  getOrCreatePrediction,
  addMember,
  upsertGroupScore as dbUpsertGroupScore,
  upsertKnockoutPick as dbUpsertKnockoutPick,
  deleteKnockoutPicks as dbDeleteKnockoutPicks,
  finalizeMatch,
  listEditsForPrediction,
  getPrediction,
} from '@cup/db';
import { miniTournament } from '@cup/engine/testing';
import { bracketMatchKey, teamId, groupId } from '@cup/engine';
import type { UserId } from '@cup/engine';

// Mocks — only system boundaries: auth, Next.js cache, and the DB singleton.
// (The `server-only` guard in @/shared/db would throw in tests without this mock.)
let testDb: Awaited<ReturnType<typeof makeTestDb>>;

vi.mock('@/shared/db', () => ({
  get db() {
    return testDb;
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/features/auth', () => ({ getCurrentActor: vi.fn() }));

import {
  clearAllPredictions,
  saveFinishScore,
  ownerSaveFinishScore,
  ownerSaveGroupScore,
  saveKnockoutPick,
  saveGroupScore,
  importCard,
} from './actions';
import { getCurrentActor } from '@/features/auth';

const mockedGetActor = vi.mocked(getCurrentActor);

// firstKickoff far in the future so the card is never locked during tests
const firstKickoff = new Date('2099-06-11T18:00:00Z');
// firstKickoff in the past so the card is always locked
const pastKickoff = new Date('2000-01-01T00:00:00Z');
const emptyKickoffs = new Map<string, Date | null>();

describe('clearAllPredictions', () => {
  let poolId: string;
  let actorId: UserId;

  beforeAll(async () => {
    testDb = await makeTestDb();
    await upsertTournamentDef(testDb, miniTournament, firstKickoff, emptyKickoffs);
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    const owner = await createUser(testDb, {
      email: `owner-${crypto.randomUUID()}@x.com`,
      displayName: 'Owner',
    });
    const member = await createUser(testDb, {
      email: `member-${crypto.randomUUID()}@x.com`,
      displayName: 'Alice',
    });
    actorId = member.id;

    const pool = await dbCreatePool(testDb, {
      tournamentId: 'mini-2026',
      ownerId: owner.id,
      name: 'Test Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });
    poolId = pool.id;

    // assertCanEditOwnCard checks pool membership
    await addMember(testDb, poolId, actorId);

    mockedGetActor.mockResolvedValue({ userId: actorId });
  });

  it('clears all prediction data and returns ok:true', async () => {
    const pred = await getOrCreatePrediction(testDb, {
      poolId,
      userId: actorId,
      tournamentId: 'mini-2026',
    });
    await testDb
      .insert(schema.predictionGroupScores)
      .values([{ predictionId: pred.id, matchId: 'mA1', homeGoals: 2, awayGoals: 1 }]);
    await testDb
      .insert(schema.predictionKnockoutPicks)
      .values([
        { predictionId: pred.id, bracketMatchKey: bracketMatchKey('qf1'), winnerTeamId: 'A1' },
      ]);
    await testDb
      .insert(schema.predictionFinishScores)
      .values([{ predictionId: pred.id, match: 'final', homeGoals: 1, awayGoals: 0 }]);
    await testDb
      .insert(schema.predictionSpecials)
      .values([{ predictionId: pred.id, betKey: 'penaltyShootoutCount', value: 3 }]);

    const result = await clearAllPredictions({ poolId });

    expect(result).toEqual({ ok: true });
    const inputs = await getPredictionInputs(testDb, pred.id);
    expect(inputs.groupScores).toHaveLength(0);
    expect(inputs.knockoutPicks).toHaveLength(0);
    expect(inputs.finishScores).toEqual({});
    expect(inputs.specials).toEqual({});
  });

  it('returns ok:false when not signed in', async () => {
    mockedGetActor.mockResolvedValue(null);
    const result = await clearAllPredictions({ poolId });
    expect(result).toMatchObject({ ok: false });
  });

  it('returns ok:false for invalid input', async () => {
    const result = await clearAllPredictions({ poolId: 123 });
    expect(result).toMatchObject({ ok: false });
  });
});

// Seed enough state on `predictionId` that deriveCard resolves finalists = [A1, B1]
// and bronzePair = [C1, D1] (group scores 0-0 + home-side QF/SF picks).
async function seedCompleteGroupsAndQfSf(db: typeof testDb, predictionId: string): Promise<void> {
  for (const g of ['A', 'B', 'C', 'D'] as const) {
    const matches = miniTournament.groupMatches.filter((m) => m.group === g);
    for (const m of matches) {
      await dbUpsertGroupScore(db, predictionId, m.id, 0, 0);
    }
  }
  await dbUpsertKnockoutPick(db, predictionId, bracketMatchKey('qf1'), 'A1');
  await dbUpsertKnockoutPick(db, predictionId, bracketMatchKey('qf2'), 'C1');
  await dbUpsertKnockoutPick(db, predictionId, bracketMatchKey('qf3'), 'B1');
  await dbUpsertKnockoutPick(db, predictionId, bracketMatchKey('qf4'), 'D1');
  await dbUpsertKnockoutPick(db, predictionId, bracketMatchKey('sf1'), 'A1');
  await dbUpsertKnockoutPick(db, predictionId, bracketMatchKey('sf2'), 'B1');
}

describe('saveFinishScore — implicit winner derivation', () => {
  let poolId: string;
  let actorId: UserId;
  let predictionId: string;

  beforeAll(async () => {
    if (!testDb) {
      testDb = await makeTestDb();
      await upsertTournamentDef(testDb, miniTournament, firstKickoff, emptyKickoffs);
    }
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    const owner = await createUser(testDb, {
      email: `owner-${crypto.randomUUID()}@x.com`,
      displayName: 'Owner',
    });
    const member = await createUser(testDb, {
      email: `member-${crypto.randomUUID()}@x.com`,
      displayName: 'Alice',
    });
    actorId = member.id;

    const pool = await dbCreatePool(testDb, {
      tournamentId: 'mini-2026',
      ownerId: owner.id,
      name: 'Test Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });
    poolId = pool.id;
    await addMember(testDb, poolId, actorId);

    const pred = await getOrCreatePrediction(testDb, {
      poolId,
      userId: actorId,
      tournamentId: 'mini-2026',
    });
    predictionId = pred.id;
    await seedCompleteGroupsAndQfSf(testDb, predictionId);

    mockedGetActor.mockResolvedValue({ userId: actorId });
  });

  it('upserts a knockoutPicks row for the higher side when final score is non-tied', async () => {
    const result = await saveFinishScore({ poolId, match: 'final', home: 2, away: 1 });
    expect(result).toEqual({ ok: true });

    const inputs = await getPredictionInputs(testDb, predictionId);
    expect(inputs.finishScores.final).toEqual({ home: 2, away: 1 });
    const pick = inputs.knockoutPicks.find((kp) => kp.bracketMatchKey === 'final');
    expect(pick?.winner).toBe('A1'); // finalists = [A1, B1]; higher side = home = A1
  });

  it('upserts a knockoutPicks row for the away side when home loses', async () => {
    const result = await saveFinishScore({ poolId, match: 'final', home: 0, away: 3 });
    expect(result).toEqual({ ok: true });

    const inputs = await getPredictionInputs(testDb, predictionId);
    const pick = inputs.knockoutPicks.find((kp) => kp.bracketMatchKey === 'final');
    expect(pick?.winner).toBe('B1');
  });

  it('also derives the implicit winner for the bronze match', async () => {
    await saveFinishScore({ poolId, match: 'bronze', home: 3, away: 1 });
    const inputs = await getPredictionInputs(testDb, predictionId);
    const pick = inputs.knockoutPicks.find((kp) => kp.bracketMatchKey === 'bronze');
    expect(pick?.winner).toBe('C1'); // bronze pair = [C1, D1] (SF losers)
  });

  it('does NOT overwrite an existing pick when the score is tied', async () => {
    await dbUpsertKnockoutPick(testDb, predictionId, bracketMatchKey('final'), 'B1');

    await saveFinishScore({ poolId, match: 'final', home: 1, away: 1 });

    const inputs = await getPredictionInputs(testDb, predictionId);
    expect(inputs.finishScores.final).toEqual({ home: 1, away: 1 });
    const pick = inputs.knockoutPicks.find((kp) => kp.bracketMatchKey === 'final');
    expect(pick?.winner).toBe('B1');
  });

  it('does not create a pick when finalists are not yet resolved', async () => {
    await dbDeleteKnockoutPicks(testDb, predictionId, [bracketMatchKey('sf1')]);

    await saveFinishScore({ poolId, match: 'final', home: 2, away: 1 });

    const inputs = await getPredictionInputs(testDb, predictionId);
    expect(inputs.finishScores.final).toEqual({ home: 2, away: 1 });
    expect(inputs.knockoutPicks.find((kp) => kp.bracketMatchKey === 'final')).toBeUndefined();
  });
});

describe('ownerSaveFinishScore — implicit winner derivation', () => {
  let poolId: string;
  let ownerId: UserId;
  let memberId: UserId;
  let predictionId: string;

  beforeAll(async () => {
    if (!testDb) {
      testDb = await makeTestDb();
      await upsertTournamentDef(testDb, miniTournament, firstKickoff, emptyKickoffs);
    }
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    const owner = await createUser(testDb, {
      email: `o-${crypto.randomUUID()}@x.com`,
      displayName: 'Owner',
    });
    const member = await createUser(testDb, {
      email: `m-${crypto.randomUUID()}@x.com`,
      displayName: 'Alice',
    });
    ownerId = owner.id;
    memberId = member.id;

    const pool = await dbCreatePool(testDb, {
      tournamentId: 'mini-2026',
      ownerId,
      name: 'Owner Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });
    poolId = pool.id;
    await addMember(testDb, poolId, memberId);

    const pred = await getOrCreatePrediction(testDb, {
      poolId,
      userId: memberId,
      tournamentId: 'mini-2026',
    });
    predictionId = pred.id;
    await seedCompleteGroupsAndQfSf(testDb, predictionId);

    mockedGetActor.mockResolvedValue({ userId: ownerId });
  });

  it('upserts implicit winner pick when owner saves a non-tied final score', async () => {
    const result = await ownerSaveFinishScore({
      poolId,
      targetUserId: memberId,
      match: 'final',
      home: 3,
      away: 1,
    });
    expect(result).toEqual({ ok: true });

    const inputs = await getPredictionInputs(testDb, predictionId);
    const pick = inputs.knockoutPicks.find((kp) => kp.bracketMatchKey === 'final');
    expect(pick?.winner).toBe('A1');
  });

  it('does not overwrite an existing pick on a tied owner-save', async () => {
    await dbUpsertKnockoutPick(testDb, predictionId, bracketMatchKey('final'), 'B1');

    await ownerSaveFinishScore({
      poolId,
      targetUserId: memberId,
      match: 'final',
      home: 2,
      away: 2,
    });

    const inputs = await getPredictionInputs(testDb, predictionId);
    const pick = inputs.knockoutPicks.find((kp) => kp.bracketMatchKey === 'final');
    expect(pick?.winner).toBe('B1');
  });
});

describe('owner editing own card post-lock (creator predict edit)', () => {
  let poolId: string;
  let ownerId: UserId;
  let ownerPredictionId: string;

  beforeAll(async () => {
    if (!testDb) {
      testDb = await makeTestDb();
    }
    // Use a separate tournament ID with a past kickoff so the card is locked
    await upsertTournamentDef(
      testDb,
      { ...miniTournament, id: 'mini-past' },
      pastKickoff,
      emptyKickoffs,
    );
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    const owner = await createUser(testDb, {
      email: `op-${crypto.randomUUID()}@x.com`,
      displayName: 'OwnerPast',
    });
    ownerId = owner.id;

    const pool = await dbCreatePool(testDb, {
      tournamentId: 'mini-past',
      ownerId,
      name: 'Past Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });
    poolId = pool.id;
    await addMember(testDb, poolId, ownerId);

    const pred = await getOrCreatePrediction(testDb, {
      poolId,
      userId: ownerId,
      tournamentId: 'mini-past',
    });
    ownerPredictionId = pred.id;

    mockedGetActor.mockResolvedValue({ userId: ownerId });
  });

  it('allows the owner to save their own group score after lock', async () => {
    const result = await ownerSaveGroupScore({
      poolId,
      targetUserId: ownerId,
      matchId: miniTournament.groupMatches[0]!.id,
      home: 2,
      away: 1,
    });

    expect(result).toEqual({ ok: true });
    const inputs = await getPredictionInputs(testDb, ownerPredictionId);
    expect(inputs.groupScores[0]).toMatchObject({ home: 2, away: 1 });
  });

  it('rejects a regular member trying to save their own card after lock', async () => {
    const member = await createUser(testDb, {
      email: `mem-${crypto.randomUUID()}@x.com`,
      displayName: 'Member',
    });
    await addMember(testDb, poolId, member.id);
    mockedGetActor.mockResolvedValue({ userId: member.id });

    const result = await ownerSaveGroupScore({
      poolId,
      targetUserId: member.id,
      matchId: miniTournament.groupMatches[0]!.id,
      home: 1,
      away: 0,
    });

    expect(result).toMatchObject({ ok: false });
  });

  it('allows the owner to import their own card after lock via importCard with targetUserId', async () => {
    const matchId = miniTournament.groupMatches[0]!.id;
    const result = await importCard({
      poolId,
      targetUserId: ownerId,
      exportData: {
        tournamentId: 'mini-past',
        version: 1,
        groupScores: [{ matchId, home: 3, away: 0 }],
      },
    });

    expect(result).toMatchObject({ ok: true });
    const inputs = await getPredictionInputs(testDb, ownerPredictionId);
    expect(inputs.groupScores[0]).toMatchObject({ home: 3, away: 0 });
  });

  it('audit entry includes the editor display name, not the raw user id', async () => {
    const matchId = miniTournament.groupMatches[0]!.id;
    await ownerSaveGroupScore({
      poolId,
      targetUserId: ownerId,
      matchId,
      home: 3,
      away: 1,
    });

    const prediction = await getPrediction(testDb, poolId, ownerId);
    expect(prediction).not.toBeNull();
    const edits = await listEditsForPrediction(testDb, prediction!.id);
    expect(edits).toHaveLength(1);
    expect(edits[0]!.editorName).toBe('OwnerPast');
    expect(edits[0]!.editorName).not.toMatch(/^usr_/);
  });
});

// ---------------------------------------------------------------------------
// Helpers shared by the post-lock invalidation tests
// ---------------------------------------------------------------------------

/**
 * Seed Group A predictions (all draws) for every match except mA1, which is
 * left unpredicted because it has an actual locked result in the DB.
 * Also seed all Group B matches so qf1 slot `2B` resolves (B1 wins when
 * B1 is a participant; other matches draw).
 */
async function seedGroupsForPostLockTest(
  db: typeof testDb,
  predictionId: string,
  tournamentId: string,
) {
  const mA1 = miniTournament.groupMatches.find(
    (m) => m.group === groupId('A') && m.home === teamId('A1') && m.away === teamId('A2'),
  )!;

  // Group A: predict all matches except mA1 (which has an actual locked result)
  for (const m of miniTournament.groupMatches.filter(
    (m) => m.group === groupId('A') && m.id !== mA1.id,
  )) {
    await dbUpsertGroupScore(db, predictionId, m.id, 0, 0);
  }

  // Group B: B1 wins every match it plays; others draw → B1 first, B2 second
  for (const m of miniTournament.groupMatches.filter((m) => m.group === groupId('B'))) {
    const b1IsHome = m.home === teamId('B1');
    const b1IsAway = m.away === teamId('B1');
    if (b1IsHome) await dbUpsertGroupScore(db, predictionId, m.id, 1, 0);
    else if (b1IsAway) await dbUpsertGroupScore(db, predictionId, m.id, 0, 1);
    else await dbUpsertGroupScore(db, predictionId, m.id, 0, 0);
  }

  // Set actual result for mA1 so getActualGroupMatchScores returns it
  await finalizeMatch(db, tournamentId, mA1.id, 3, 0); // A1 wins 3-0 → A1 first in Group A
}

describe('saveKnockoutPick / saveGroupScore — actual group scores used during post-lock invalidation', () => {
  const lockedTournamentId = 'mini-locked';

  let poolId: string;
  let actorId: UserId;
  let predictionId: string;

  beforeAll(async () => {
    if (!testDb) {
      testDb = await makeTestDb();
    }
    await upsertTournamentDef(
      testDb,
      { ...miniTournament, id: lockedTournamentId },
      pastKickoff,
      emptyKickoffs,
    );
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    const owner = await createUser(testDb, {
      email: `o-lock-${crypto.randomUUID()}@x.com`,
      displayName: 'Owner',
    });
    const member = await createUser(testDb, {
      email: `m-lock-${crypto.randomUUID()}@x.com`,
      displayName: 'LateJoiner',
    });
    actorId = member.id;

    const pool = await dbCreatePool(testDb, {
      tournamentId: lockedTournamentId,
      ownerId: owner.id,
      name: 'Locked Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });
    poolId = pool.id;
    // Member joins after lock (joinedAt = now > pastKickoff) → late joiner
    await addMember(testDb, poolId, actorId);

    const pred = await getOrCreatePrediction(testDb, {
      poolId,
      userId: actorId,
      tournamentId: lockedTournamentId,
    });
    predictionId = pred.id;

    mockedGetActor.mockResolvedValue({ userId: actorId });
  });

  it('saveKnockoutPick: retains a pick that is valid under actual locked group match results', async () => {
    // mA1 (A1 vs A2) has an actual result of 3-0 (A1 wins) — not in user predictions.
    // User predicts mA2–mA6 as draws. With actual mA1, A1 has 5 pts → 1st in Group A.
    // Without actual mA1, A1 would only have 2 pts from draws → not 1st.
    // qf1 slot is `1A` vs `2B` → A1 vs B2. Picking A1 must survive invalidation.
    await seedGroupsForPostLockTest(testDb, predictionId, lockedTournamentId);

    const result = await saveKnockoutPick({
      poolId,
      bracketMatchKey: 'qf1',
      winner: 'A1',
    });

    expect(result).toEqual({ ok: true });
    const inputs = await getPredictionInputs(testDb, predictionId);
    const pick = inputs.knockoutPicks.find((p) => p.bracketMatchKey === bracketMatchKey('qf1'));
    expect(pick?.winner).toBe(teamId('A1'));
  });

  it('saveGroupScore: retains a pick valid under actual group scores when an unrelated group score changes', async () => {
    // Same setup: mA1 actual 3-0, user predicts mA2-mA6 and all Group B.
    // A1 pick for qf1 is pre-seeded. Saving a Group D score must not invalidate it.
    await seedGroupsForPostLockTest(testDb, predictionId, lockedTournamentId);
    await dbUpsertKnockoutPick(testDb, predictionId, bracketMatchKey('qf1'), teamId('A1'));

    const mD1 = miniTournament.groupMatches.find((m) => m.group === groupId('D'))!;
    const result = await saveGroupScore({ poolId, matchId: mD1.id, home: 2, away: 1 });

    expect(result).toEqual({ ok: true });
    const inputs = await getPredictionInputs(testDb, predictionId);
    const pick = inputs.knockoutPicks.find((p) => p.bracketMatchKey === bracketMatchKey('qf1'));
    expect(pick?.winner).toBe(teamId('A1'));
  });
});
