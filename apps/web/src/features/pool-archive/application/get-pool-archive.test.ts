import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import {
  createUser,
  createPool as dbCreatePool,
  upsertTournamentDef,
  addMember,
  getPoolById,
  upsertPoolArchive,
} from '@cup/db';
import { miniTournament } from '@cup/engine/testing';
import { tournamentId as asTournamentId, points } from '@cup/engine';
import type { PoolId } from '@cup/engine';
import type { PoolArchiveRecap } from '@cup/db';
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
      def: miniTournament,
      scoring: miniTournament.scoring,
    });

    const view = await getPoolArchiveView(db, poolId);
    expect(view).toBeDefined();
    expect(view?.poolName).toBe('Test Pool');
    expect(view?.tournamentName).toBe(miniTournament.name);
    expect(view?.entries).toHaveLength(1);
    expect(view?.entries[0]?.rank).toBe(1);
  });

  it('returns recap and derived leadChanges/biggestRiser when the archive has race history', async () => {
    const tournamentId = asTournamentId(miniTournament.id);
    const owner = await getPoolById(db, poolId);

    const member = await createUser(db, { email: 'member2@x.com', displayName: 'Bob' });
    await addMember(db, poolId, member.id);

    await archivePool(db, {
      poolId,
      poolName: 'Test Pool',
      tournamentId,
      tournamentName: miniTournament.name,
      archivedBy: owner!.ownerId,
      def: miniTournament,
      scoring: miniTournament.scoring,
    });

    const view = await getPoolArchiveView(db, poolId);
    expect(view?.recap).not.toBeNull();
    expect(Array.isArray(view?.leadChanges)).toBe(true);
    // With no predictions made, every member sits at 0 points throughout — no rank ever improves.
    expect(view?.biggestRiser).toBeNull();
  });

  it('returns recap: null, leadChanges: [], biggestRiser: null for a pre-recap-feature archive', async () => {
    // Simulates an archive written before this feature (recap/pointsHistory/stageReasons all null).
    const pool = await getPoolById(db, poolId);

    await upsertPoolArchive(db, {
      poolId,
      poolName: 'Test Pool',
      tournamentId: asTournamentId(miniTournament.id),
      tournamentName: miniTournament.name,
      archivedBy: pool!.ownerId,
      recap: null,
      entries: [
        {
          userId: pool!.ownerId,
          displayName: 'Owner',
          rank: 1,
          pointsTotal: points(0),
          breakdown: {
            groupMatches: points(0),
            groupOrder: points(0),
            bronze: points(0),
            final: points(0),
            roundOf16: points(0),
            roundOf8: points(0),
            topFour: points(0),
            topFourTeams: points(0),
            topFourPosition: points(0),
            specials: points(0),
            total: points(0),
          },
          pointsHistory: null,
          stageReasons: null,
        },
      ],
    });

    const view = await getPoolArchiveView(db, poolId);
    expect(view?.recap).toBeNull();
    expect(view?.leadChanges).toEqual([]);
    expect(view?.biggestRiser).toBeNull();
  });

  it('computes biggestRiser from a legacy recap missing groupCompletionStageIndex, instead of losing it to NaN', async () => {
    // Simulates an archive written under an earlier version of this feature — a real,
    // non-null recap object that predates overallAccuracyPercent/groupCompletionStageIndex/
    // groupStageLeader/knockoutStageLeader. The jsonb column has no schema enforcement, so
    // this shape can and does exist in production. Before the fix,
    // `archive.recap.groupCompletionStageIndex + 1` evaluated to NaN, which made the scan
    // loop in computeBiggestRiser never run — silently losing a real riser event.
    const pool = await getPoolById(db, poolId);
    const member = await createUser(db, { email: 'member3@x.com', displayName: 'Bob' });
    await addMember(db, poolId, member.id);

    const legacyRecap = {
      stages: ['Group', 'Round of 16', 'Final'],
      championPick: null,
      bestSingleMatch: null,
      biggestUpset: null,
      predictionsMade: 0,
      exactScoreRatePercent: 0,
      // groupCompletionStageIndex, overallAccuracyPercent, groupStageLeader,
      // knockoutStageLeader intentionally omitted to reproduce the legacy shape.
    } as PoolArchiveRecap;

    const breakdown = {
      groupMatches: points(0),
      groupOrder: points(0),
      bronze: points(0),
      final: points(0),
      roundOf16: points(0),
      roundOf8: points(0),
      topFour: points(0),
      topFourTeams: points(0),
      topFourPosition: points(0),
      specials: points(0),
      total: points(0),
    };

    await upsertPoolArchive(db, {
      poolId,
      poolName: 'Test Pool',
      tournamentId: asTournamentId(miniTournament.id),
      tournamentName: miniTournament.name,
      archivedBy: pool!.ownerId,
      recap: legacyRecap,
      entries: [
        // Owner leads after the group stage, then Bob overtakes by the Round of 16 —
        // a genuine rank swap that should surface as the biggestRiser.
        {
          userId: pool!.ownerId,
          displayName: 'Owner',
          rank: 2,
          pointsTotal: points(10),
          breakdown,
          pointsHistory: [10, 10, 10],
          stageReasons: [null, null, null],
        },
        {
          userId: member.id,
          displayName: 'Bob',
          rank: 1,
          pointsTotal: points(20),
          breakdown,
          pointsHistory: [0, 20, 20],
          stageReasons: [null, null, null],
        },
      ],
    });

    const view = await getPoolArchiveView(db, poolId);
    expect(view?.recap).toEqual(legacyRecap);
    // Must not throw or silently drop this to null via a NaN-derived scan range.
    expect(view?.biggestRiser).toEqual({
      displayName: 'Bob',
      fromRank: 2,
      toRank: 1,
      stageName: 'Round of 16',
      reason: null,
    });
  });
});
