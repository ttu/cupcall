import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import {
  createUser,
  createPool as dbCreatePool,
  upsertTournamentDef,
  getPredictionInputs,
  getOrCreatePrediction,
} from '@cup/db';
import { miniTournament } from '@cup/engine/testing';
import { tournamentId as asTournamentId } from '@cup/engine';
import type { UserId, PoolId } from '@cup/engine';

let testDb: Awaited<ReturnType<typeof makeTestDb>>;

vi.mock('@/shared/db', () => ({
  get db() {
    return testDb;
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/features/auth', () => ({ getCurrentActor: vi.fn(), getActorOrThrow: vi.fn() }));

import { devFillRandomGroupScores } from './dev-actions';
import { getCurrentActor, getActorOrThrow } from '@/features/auth';

const mockedGetActor = vi.mocked(getCurrentActor);
const mockedGetActorOrThrow = vi.mocked(getActorOrThrow);

const firstKickoff = new Date('2099-06-11T18:00:00Z');
const emptyKickoffs = new Map<string, Date | null>();

describe('devFillRandomGroupScores', () => {
  let poolId: PoolId;
  let actorId: UserId;

  beforeAll(async () => {
    testDb = await makeTestDb();
    await upsertTournamentDef(testDb, miniTournament, firstKickoff, emptyKickoffs);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();

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
      tournamentId: asTournamentId('mini-2026'),
      ownerId: owner.id,
      name: 'Test Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });
    poolId = pool.id;

    mockedGetActor.mockResolvedValue({ userId: actorId });
    mockedGetActorOrThrow.mockResolvedValue({ userId: actorId });
  });

  it('returns ok:false with "Dev only" when NODE_ENV is not development', async () => {
    // Default NODE_ENV in vitest is 'test'
    const result = await devFillRandomGroupScores({ poolId });
    expect(result).toEqual({ ok: false, error: 'Dev only' });
  });

  it('fills all 24 group matches with scores in [0, 4] in development mode', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const result = await devFillRandomGroupScores({ poolId });

    expect(result).toEqual({ ok: true });

    // mini-2026 has 4 groups × 6 matches = 24 group matches
    const pred = await getOrCreatePrediction(testDb, {
      poolId,
      userId: actorId,
      tournamentId: asTournamentId('mini-2026'),
    });
    const inputs = await getPredictionInputs(testDb, pred.id);
    expect(inputs.groupScores).toHaveLength(24);
    for (const gs of inputs.groupScores) {
      expect(gs.home).toBeGreaterThanOrEqual(0);
      expect(gs.home).toBeLessThanOrEqual(4);
      expect(gs.away).toBeGreaterThanOrEqual(0);
      expect(gs.away).toBeLessThanOrEqual(4);
    }
  });
});
