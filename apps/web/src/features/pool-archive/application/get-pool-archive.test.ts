import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import {
  createUser,
  createPool as dbCreatePool,
  upsertTournamentDef,
  addMember,
  getPoolById,
} from '@cup/db';
import { miniTournament } from '@cup/engine/testing';
import { tournamentId as asTournamentId } from '@cup/engine';
import type { PoolId } from '@cup/engine';
import { archivePool } from './archive-pool';
import { getPoolArchiveView } from './get-pool-archive';

type Db = Awaited<ReturnType<typeof makeTestDb>>;

const FUTURE_KICKOFF = new Date('2099-06-11T18:00:00Z');

describe('getPoolArchiveView', () => {
  let db: Db;
  let poolId: PoolId;

  beforeEach(async () => {
    db = await makeTestDb();
    await upsertTournamentDef(db, miniTournament, FUTURE_KICKOFF, new Map());
    const tournamentId = asTournamentId(miniTournament.id);
    const owner = await createUser(db, { email: 'owner@x.com', displayName: 'Owner' });
    const pool = await dbCreatePool(db, { tournamentId, ownerId: owner.id, name: 'Test Pool' });
    poolId = pool.id;
    await addMember(db, poolId, owner.id);
  });

  it('returns undefined for a pool that was never archived', async () => {
    const view = await getPoolArchiveView(db, poolId);
    expect(view).toBeUndefined();
  });

  it('returns the archive view with entries sorted by rank', async () => {
    const tournamentId = asTournamentId(miniTournament.id);
    const pool = await getPoolById(db, poolId);

    await archivePool(db, {
      poolId,
      poolName: 'Test Pool',
      tournamentId,
      tournamentName: miniTournament.name,
      archivedBy: pool!.ownerId,
    });

    const view = await getPoolArchiveView(db, poolId);
    expect(view).toBeDefined();
    expect(view?.poolName).toBe('Test Pool');
    expect(view?.tournamentName).toBe(miniTournament.name);
    expect(view?.entries).toHaveLength(1);
    expect(view?.entries[0]?.rank).toBe(1);
  });
});
