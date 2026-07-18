import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../testing/make-test-db';
import type { Db } from '../client';
import * as schema from '../schema/index';
import { createUser } from './users';
import { createPool } from './pools';
import { upsertTournamentDef } from './tournament';
import { upsertPoolArchive, getPoolArchiveWithEntries } from './pool-archive';
import { miniTournament } from '@cup/engine/testing';
import { tournamentId as asTournamentId, points } from '@cup/engine';
import type { ScoreBreakdown } from '@cup/engine';

const FUTURE_KICKOFF = new Date('2099-06-11T18:00:00Z');
const EMPTY_KICKOFFS = new Map<string, Date | null>();

function fakeBreakdown(total: number): ScoreBreakdown {
  return {
    groupMatches: points(total),
    groupOrder: points(0),
    bronze: points(0),
    final: points(0),
    roundOf16: points(0),
    roundOf8: points(0),
    topFour: points(0),
    topFourTeams: points(0),
    topFourPosition: points(0),
    specials: points(0),
    total: points(total),
  };
}

describe('pool-archive repository', () => {
  let db: Db<typeof schema>;

  beforeEach(async () => {
    db = await makeTestDb();
  });

  it('creates an archive with entries and reads them back sorted by rank', async () => {
    await upsertTournamentDef(db, miniTournament, FUTURE_KICKOFF, EMPTY_KICKOFFS);
    const tournamentId = asTournamentId(miniTournament.id);
    const owner = await createUser(db, { email: 'owner@x.com', displayName: 'Owner' });
    const pool = await createPool(db, { tournamentId, ownerId: owner.id, name: 'Test Pool' });
    const member = await createUser(db, { email: 'member@x.com', displayName: 'Alice' });

    const result = await upsertPoolArchive(db, {
      poolId: pool.id,
      poolName: pool.name,
      tournamentId,
      tournamentName: miniTournament.name,
      archivedBy: owner.id,
      entries: [
        {
          userId: owner.id,
          displayName: 'Owner',
          rank: 1,
          pointsTotal: points(50),
          breakdown: fakeBreakdown(50),
        },
        {
          userId: member.id,
          displayName: 'Alice',
          rank: 2,
          pointsTotal: points(30),
          breakdown: fakeBreakdown(30),
        },
      ],
    });

    expect(result.poolId).toBe(pool.id);
    expect(result.poolName).toBe('Test Pool');

    const fetched = await getPoolArchiveWithEntries(db, pool.id);
    expect(fetched).toBeDefined();
    expect(fetched?.archive.poolName).toBe('Test Pool');
    expect(fetched?.entries.map((e) => e.displayName)).toEqual(['Owner', 'Alice']);
    expect(fetched?.entries[0]?.rank).toBe(1);
    expect(fetched?.entries[0]?.pointsTotal).toBe(50);
    expect(fetched?.entries[0]?.breakdown.total).toBe(50);
  });

  it('returns undefined for a pool with no archive', async () => {
    await upsertTournamentDef(db, miniTournament, FUTURE_KICKOFF, EMPTY_KICKOFFS);
    const tournamentId = asTournamentId(miniTournament.id);
    const owner = await createUser(db, { email: 'o2@x.com', displayName: 'Owner2' });
    const pool = await createPool(db, { tournamentId, ownerId: owner.id, name: 'Empty Pool' });

    const fetched = await getPoolArchiveWithEntries(db, pool.id);
    expect(fetched).toBeUndefined();
  });

  it('replaces entries when archiving the same pool twice', async () => {
    await upsertTournamentDef(db, miniTournament, FUTURE_KICKOFF, EMPTY_KICKOFFS);
    const tournamentId = asTournamentId(miniTournament.id);
    const owner = await createUser(db, { email: 'o3@x.com', displayName: 'Owner3' });
    const pool = await createPool(db, { tournamentId, ownerId: owner.id, name: 'Re-archive Pool' });

    await upsertPoolArchive(db, {
      poolId: pool.id,
      poolName: pool.name,
      tournamentId,
      tournamentName: miniTournament.name,
      archivedBy: owner.id,
      entries: [
        {
          userId: owner.id,
          displayName: 'Owner3',
          rank: 1,
          pointsTotal: points(10),
          breakdown: fakeBreakdown(10),
        },
      ],
    });

    await upsertPoolArchive(db, {
      poolId: pool.id,
      poolName: pool.name,
      tournamentId,
      tournamentName: miniTournament.name,
      archivedBy: owner.id,
      entries: [
        {
          userId: owner.id,
          displayName: 'Owner3',
          rank: 1,
          pointsTotal: points(99),
          breakdown: fakeBreakdown(99),
        },
      ],
    });

    const fetched = await getPoolArchiveWithEntries(db, pool.id);
    expect(fetched?.entries).toHaveLength(1);
    expect(fetched?.entries[0]?.pointsTotal).toBe(99);
  });
});
