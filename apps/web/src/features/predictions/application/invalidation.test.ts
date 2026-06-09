/**
 * Integration test: pick invalidation after group score change.
 * Tests engine.findInvalidatedPickKeys + db.deleteKnockoutPicks working together.
 * Uses a real in-memory PGlite database — no mocks.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import {
  upsertTournamentDef,
  createUser,
  createPool,
  getOrCreatePrediction,
  upsertGroupScore,
  upsertKnockoutPick,
  getPredictionInputs,
  deleteKnockoutPicks,
} from '@cup/db';
import { miniTournament } from '@cup/engine/testing';
import {
  groupId,
  teamId,
  bracketMatchKey,
  findInvalidatedPickKeys,
  selectQualifiers,
  deriveGroupOrders,
} from '@cup/engine';
import type { UserId } from '@cup/engine';

const firstKickoff = new Date('2030-06-11T18:00:00Z');
const emptyKickoffs = new Map<string, Date | null>();

type TestDb = Awaited<ReturnType<typeof makeTestDb>>;

async function setup(db: TestDb) {
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
  const prediction = await getOrCreatePrediction(db, {
    poolId: pool.id,
    userId: user.id as UserId,
    tournamentId: miniTournament.id,
  });
  return { poolId: pool.id, userId: user.id as UserId, predictionId: prediction.id };
}

async function seedAllGroupScores(db: TestDb, predictionId: string) {
  for (const m of miniTournament.groupMatches) {
    await upsertGroupScore(db, predictionId, m.id, 0, 0);
  }
}

async function applyInvalidation(
  db: TestDb,
  predictionId: string,
  matchId: string,
  home: number,
  away: number,
) {
  const inputs = await getPredictionInputs(db, predictionId);
  const updatedScores = [
    ...inputs.groupScores.filter((s) => s.matchId !== matchId),
    { matchId, home, away },
  ];
  const newGroupOrders = deriveGroupOrders(
    miniTournament,
    updatedScores as Parameters<typeof deriveGroupOrders>[1],
  );
  const newQualifiers = selectQualifiers(
    miniTournament,
    updatedScores as Parameters<typeof selectQualifiers>[1],
    newGroupOrders,
  );
  await upsertGroupScore(db, predictionId, matchId, home, away);
  const invalidKeys = findInvalidatedPickKeys(
    miniTournament,
    newGroupOrders,
    newQualifiers,
    inputs.knockoutPicks,
  );
  await deleteKnockoutPicks(db, predictionId, invalidKeys);
}

describe('pick invalidation after group score change', () => {
  let db: TestDb;
  let predictionId: string;

  beforeEach(async () => {
    db = await makeTestDb();
    ({ predictionId } = await setup(db));
  });

  it('deletes qf pick when the picked team is no longer in that slot', async () => {
    await seedAllGroupScores(db, predictionId);
    // User picks A1 for qf1 (slot: 1A vs 2B → A1 vs B2 on all draws)
    await upsertKnockoutPick(db, predictionId, bracketMatchKey('qf1'), teamId('A1'));

    // A2 beats A1 in their head-to-head → A2 becomes group A winner
    const mA1vsA2 = miniTournament.groupMatches.find(
      (m) => m.group === groupId('A') && m.home === teamId('A1') && m.away === teamId('A2'),
    )!;
    await applyInvalidation(db, predictionId, mA1vsA2.id, 0, 1);

    const after = await getPredictionInputs(db, predictionId);
    expect(
      after.knockoutPicks.find((p) => p.bracketMatchKey === bracketMatchKey('qf1')),
    ).toBeUndefined();
  });

  it('cascades: deletes sf pick when its dependent qf pick is invalidated', async () => {
    await seedAllGroupScores(db, predictionId);
    await upsertKnockoutPick(db, predictionId, bracketMatchKey('qf1'), teamId('A1'));
    await upsertKnockoutPick(db, predictionId, bracketMatchKey('qf2'), teamId('C1'));
    await upsertKnockoutPick(db, predictionId, bracketMatchKey('sf1'), teamId('A1'));

    const mA1vsA2 = miniTournament.groupMatches.find(
      (m) => m.group === groupId('A') && m.home === teamId('A1') && m.away === teamId('A2'),
    )!;
    await applyInvalidation(db, predictionId, mA1vsA2.id, 0, 1);

    const after = await getPredictionInputs(db, predictionId);
    expect(
      after.knockoutPicks.find((p) => p.bracketMatchKey === bracketMatchKey('qf1')),
    ).toBeUndefined();
    expect(
      after.knockoutPicks.find((p) => p.bracketMatchKey === bracketMatchKey('sf1')),
    ).toBeUndefined();
    // qf2 pick is unaffected
    expect(
      after.knockoutPicks.find((p) => p.bracketMatchKey === bracketMatchKey('qf2')),
    ).toBeDefined();
  });

  it('does not delete picks when a score change does not affect qualifiers', async () => {
    await seedAllGroupScores(db, predictionId);
    await upsertKnockoutPick(db, predictionId, bracketMatchKey('qf1'), teamId('A1'));

    // Change D3 vs D4 result — different group entirely, A1 stays 1st in group A
    const mD3vsD4 = miniTournament.groupMatches.find(
      (m) => m.group === groupId('D') && m.home === teamId('D3') && m.away === teamId('D4'),
    )!;
    await applyInvalidation(db, predictionId, mD3vsD4.id, 3, 0);

    const after = await getPredictionInputs(db, predictionId);
    expect(
      after.knockoutPicks.find((p) => p.bracketMatchKey === bracketMatchKey('qf1')),
    ).toBeDefined();
  });
});
