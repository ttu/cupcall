import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import { createUser, createPool as dbCreatePool, upsertTournamentDef } from '@cup/db';
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

import { archivePoolAction } from './actions';
import { getActorOrThrow } from '@/features/auth';

const mockedGetActor = vi.mocked(getActorOrThrow);

const FUTURE_KICKOFF = new Date('2099-06-11T18:00:00Z');

describe('archivePoolAction', () => {
  let ownerId: UserId;
  let memberId: UserId;
  let poolId: PoolId;

  beforeAll(async () => {
    testDb = await makeTestDb();
    await upsertTournamentDef(testDb, miniTournament, FUTURE_KICKOFF, new Map());
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const owner = await createUser(testDb, {
      email: `owner-${crypto.randomUUID()}@x.com`,
      displayName: 'Owner',
    });
    const member = await createUser(testDb, {
      email: `member-${crypto.randomUUID()}@x.com`,
      displayName: 'Member',
    });
    ownerId = owner.id;
    memberId = member.id;

    const pool = await dbCreatePool(testDb, {
      tournamentId: asTournamentId(miniTournament.id),
      ownerId,
      name: 'Test Pool',
    });
    poolId = pool.id;
  });

  it('archives the pool when called by the owner', async () => {
    mockedGetActor.mockResolvedValue({ userId: ownerId });

    const result = await archivePoolAction({ poolId });
    expect(result.ok).toBe(true);
  });

  it('rejects a non-owner member', async () => {
    mockedGetActor.mockResolvedValue({ userId: memberId });

    const result = await archivePoolAction({ poolId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/owner/i);
  });

  it('rejects invalid input', async () => {
    mockedGetActor.mockResolvedValue({ userId: ownerId });

    const result = await archivePoolAction({});
    expect(result.ok).toBe(false);
  });
});
