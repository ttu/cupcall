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
} from '@cup/db';
import { miniTournament } from '@cup/engine/testing';
import { bracketMatchKey } from '@cup/engine';
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

import { clearAllPredictions } from './actions';
import { getCurrentActor } from '@/features/auth';

const mockedGetActor = vi.mocked(getCurrentActor);

// firstKickoff far in the future so the card is never locked during tests
const firstKickoff = new Date('2099-06-11T18:00:00Z');
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
