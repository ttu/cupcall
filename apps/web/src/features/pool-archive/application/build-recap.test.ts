import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import {
  createUser,
  createPool as dbCreatePool,
  upsertTournamentDef,
  addMember,
  upsertKnockoutPick,
  upsertFinishScore,
  upsertKnockoutMatch,
  getOrCreatePrediction,
} from '@cup/db';
import { miniTournament } from '@cup/engine/testing';
import { tournamentId as asTournamentId } from '@cup/engine';
import type { PoolId, TournamentId, UserId } from '@cup/engine';
import { buildPoolArchiveRecap } from './build-recap';

type Db = Awaited<ReturnType<typeof makeTestDb>>;

const FUTURE_KICKOFF = new Date('2099-06-11T18:00:00Z');

describe('buildPoolArchiveRecap', () => {
  let db: Db;
  let poolId: PoolId;
  let tournamentId: TournamentId;
  let ownerId: UserId;

  beforeEach(async () => {
    db = await makeTestDb();
    await upsertTournamentDef(db, miniTournament, FUTURE_KICKOFF, new Map());
    tournamentId = asTournamentId(miniTournament.id);
    const owner = await createUser(db, { email: 'owner@x.com', displayName: 'Owner' });
    ownerId = owner.id;
    const pool = await dbCreatePool(db, { tournamentId, ownerId, name: 'Test Pool' });
    poolId = pool.id;
    await addMember(db, poolId, ownerId);
  });

  it('returns a recap with stages and null highlights when nobody has predicted anything', async () => {
    const { recap, entryExtras } = await buildPoolArchiveRecap(db, {
      poolId,
      tournamentId,
      def: miniTournament,
      scoring: miniTournament.scoring,
    });

    expect(recap.championPick).toBeNull();
    expect(recap.bestSingleMatch).toBeNull();
    expect(recap.biggestUpset).toBeNull();
    expect(recap.predictionsMade).toBe(0);
    expect(recap.exactScoreRatePercent).toBe(0);
    expect(Array.isArray(recap.stages)).toBe(true);
    // The owner has no predictions, but is still a pool member — getLeaderboard/buildRaceChartData
    // still produces a (flat, zero) points history entry for them.
    expect(entryExtras.get(ownerId)?.pointsHistory.every((p) => p === 0)).toBe(true);
  });

  it('populates championPick once a final-winner pick exists', async () => {
    const prediction = await getOrCreatePrediction(db, { poolId, userId: ownerId, tournamentId });
    await upsertKnockoutPick(db, prediction.id, miniTournament.bracket.finalMatch, 'A1');

    const { recap } = await buildPoolArchiveRecap(db, {
      poolId,
      tournamentId,
      def: miniTournament,
      scoring: miniTournament.scoring,
    });

    expect(recap.championPick).toEqual({ teamId: 'A1', teamName: 'Team A1', count: 1, total: 1 });
  });

  it('derives championPick from a finish score when no explicit final pick exists', async () => {
    // Most players never fill in an explicit bracket pick for the final match — they only
    // submit a predicted scoreline. That must still count towards the champion pick highlight.
    const prediction = await getOrCreatePrediction(db, { poolId, userId: ownerId, tournamentId });
    await upsertFinishScore(db, prediction.id, 'final', 2, 1, 'A1', 'B1');

    const { recap } = await buildPoolArchiveRecap(db, {
      poolId,
      tournamentId,
      def: miniTournament,
      scoring: miniTournament.scoring,
    });

    expect(recap.championPick).toEqual({ teamId: 'A1', teamName: 'Team A1', count: 1, total: 1 });
  });

  it('credits a correct champion pick derived from a finish score in the stage-reason narrative', async () => {
    const finalKickoff = new Date('2026-07-19T18:00:00Z');
    await upsertKnockoutMatch(db, {
      id: miniTournament.bracket.finalMatch,
      tournamentId,
      stage: 'Final',
      homeTeamId: 'A1',
      awayTeamId: 'B1',
      homeGoals: 2,
      awayGoals: 1,
      kickoff: finalKickoff,
      status: 'final',
    });
    const prediction = await getOrCreatePrediction(db, { poolId, userId: ownerId, tournamentId });
    await upsertFinishScore(db, prediction.id, 'final', 2, 1, 'A1', 'B1');

    const { entryExtras } = await buildPoolArchiveRecap(db, {
      poolId,
      tournamentId,
      def: miniTournament,
      scoring: miniTournament.scoring,
    });

    expect(entryExtras.get(ownerId)?.stageReasons).toContain('Champion pick correct');
  });
});
