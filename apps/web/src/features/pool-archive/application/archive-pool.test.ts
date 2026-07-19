import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import {
  createUser,
  createPool as dbCreatePool,
  upsertTournamentDef,
  getPoolArchiveWithEntries,
  addMember,
  upsertScore,
} from '@cup/db';
import { miniTournament } from '@cup/engine/testing';
import { tournamentId as asTournamentId, points } from '@cup/engine';
import type { PoolId, TournamentId, UserId, ScoreBreakdown } from '@cup/engine';
import { archivePool } from './archive-pool';

type Db = Awaited<ReturnType<typeof makeTestDb>>;

const FUTURE_KICKOFF = new Date('2099-06-11T18:00:00Z');

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

describe('archivePool', () => {
  let db: Db;
  let tournamentId: TournamentId;
  let ownerId: UserId;
  let poolId: PoolId;

  beforeEach(async () => {
    db = await makeTestDb();
    await upsertTournamentDef(db, miniTournament, FUTURE_KICKOFF, new Map());
    tournamentId = asTournamentId(miniTournament.id);
    const owner = await createUser(db, { email: 'owner@x.com', displayName: 'Owner' });
    ownerId = owner.id;
    const pool = await dbCreatePool(db, { tournamentId, ownerId, name: 'Test Pool' });
    poolId = pool.id;
  });

  it('archives a pool with no members yet as zero entries', async () => {
    // Nobody has joined via addMember, so getLeaderboard has nothing to report.
    await archivePool(db, {
      poolId,
      poolName: 'Test Pool',
      tournamentId,
      tournamentName: miniTournament.name,
      archivedBy: ownerId,
      def: miniTournament,
      scoring: miniTournament.scoring,
    });

    const fetched = await getPoolArchiveWithEntries(db, poolId);
    expect(fetched).toBeDefined();
    expect(fetched?.archive.poolName).toBe('Test Pool');
    expect(fetched?.entries).toHaveLength(0);
  });

  it('ranks members by points descending, defaulting a missing score row to 0 and a zeroed breakdown', async () => {
    await addMember(db, poolId, ownerId);
    const member = await createUser(db, { email: 'member@x.com', displayName: 'Alice' });
    await addMember(db, poolId, member.id);

    // Only Alice has a `scores` row; the owner never got one (e.g. never made a prediction).
    await upsertScore(db, {
      poolId,
      userId: member.id,
      pointsTotal: points(90),
      breakdown: fakeBreakdown(10),
    });

    await archivePool(db, {
      poolId,
      poolName: 'Test Pool',
      tournamentId,
      tournamentName: miniTournament.name,
      archivedBy: ownerId,
      def: miniTournament,
      scoring: miniTournament.scoring,
    });

    const fetched = await getPoolArchiveWithEntries(db, poolId);
    expect(fetched?.entries).toHaveLength(2);
    expect(fetched?.entries[0]?.displayName).toBe('Alice'); // 90 pts, ranked first
    expect(fetched?.entries[0]?.rank).toBe(1);
    expect(fetched?.entries[0]?.pointsTotal).toBe(90);
    expect(fetched?.entries[0]?.breakdown.total).toBe(10);
    expect(fetched?.entries[1]?.displayName).toBe('Owner'); // no score row -> 0 pts
    expect(fetched?.entries[1]?.rank).toBe(2);
    expect(fetched?.entries[1]?.pointsTotal).toBe(0);
    expect(fetched?.entries[1]?.breakdown.total).toBe(0);
  });

  it('re-archiving replaces the previous snapshot', async () => {
    await addMember(db, poolId, ownerId);

    await archivePool(db, {
      poolId,
      poolName: 'Test Pool',
      tournamentId,
      tournamentName: miniTournament.name,
      archivedBy: ownerId,
      def: miniTournament,
      scoring: miniTournament.scoring,
    });
    let fetched = await getPoolArchiveWithEntries(db, poolId);
    expect(fetched?.entries[0]?.pointsTotal).toBe(0);

    await upsertScore(db, {
      poolId,
      userId: ownerId,
      pointsTotal: points(5),
      breakdown: fakeBreakdown(5),
    });

    await archivePool(db, {
      poolId,
      poolName: 'Test Pool',
      tournamentId,
      tournamentName: miniTournament.name,
      archivedBy: ownerId,
      def: miniTournament,
      scoring: miniTournament.scoring,
    });
    fetched = await getPoolArchiveWithEntries(db, poolId);
    expect(fetched?.entries).toHaveLength(1);
    expect(fetched?.entries[0]?.pointsTotal).toBe(5);
  });
});
