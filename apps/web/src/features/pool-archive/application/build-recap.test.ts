import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import {
  createUser,
  createPool as dbCreatePool,
  upsertTournamentDef,
  addMember,
  upsertKnockoutPick,
  upsertGroupScore,
  upsertFinishScore,
  upsertKnockoutMatch,
  finalizeMatch,
  upsertTournamentResults,
  getOrCreatePrediction,
} from '@cup/db';
import { miniTournament } from '@cup/engine/testing';
import { tournamentId as asTournamentId, teamId, groupId, matchId } from '@cup/engine';
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

  it("computes overallAccuracyPercent from every member's predictions vs actual results", async () => {
    // owner predicts group match mA1 (A1 vs A2) as 2-1 exact, matching the actual result.
    const prediction = await getOrCreatePrediction(db, { poolId, userId: ownerId, tournamentId });
    await upsertGroupScore(db, prediction.id, 'mA1', 2, 1);

    // Sync an actual result for mA1: exact match with the prediction above.
    await finalizeMatch(db, tournamentId, 'mA1', 2, 1);

    const { recap } = await buildPoolArchiveRecap(db, {
      poolId,
      tournamentId,
      def: miniTournament,
      scoring: miniTournament.scoring,
    });

    // 1 of 1 attempted group-match prediction is correct → 100%.
    expect(recap.overallAccuracyPercent).toBe(100);
  });

  it('does not let a member with no prediction row at all inflate overallAccuracyPercent', async () => {
    // Group A is fully finalized (all 6 round-robin matches), so its actual group order is known:
    // A1 (9pts) > A2 (6pts) > A3 (3pts) > A4 (0pts), with no tiebreak ambiguity.
    const groupAResults = [
      { matchId: matchId('mA1'), home: 3, away: 0 }, // A1 beats A2
      { matchId: matchId('mA2'), home: 3, away: 0 }, // A1 beats A3
      { matchId: matchId('mA3'), home: 3, away: 0 }, // A1 beats A4
      { matchId: matchId('mA4'), home: 3, away: 0 }, // A2 beats A3
      { matchId: matchId('mA5'), home: 3, away: 0 }, // A2 beats A4
      { matchId: matchId('mA6'), home: 3, away: 0 }, // A3 beats A4
    ];
    await upsertTournamentResults(db, tournamentId, {
      matchResults: [...groupAResults, { matchId: matchId('mB1'), home: 1, away: 0 }],
      groupOrder: {
        [groupId('A')]: [teamId('A1'), teamId('A2'), teamId('A3'), teamId('A4')],
      },
      answers: {},
    });

    // Owner (real predictor): no group-A picks at all — those get augmented from the actual
    // results (a legitimate late-joiner-style fill-in), landing a correct 4/4 groupOrder for A.
    // Owner's only real guess, mB1, is wrong (predicts an away win; actual is a home win) — 0/1.
    const prediction = await getOrCreatePrediction(db, { poolId, userId: ownerId, tournamentId });
    await upsertGroupScore(db, prediction.id, 'mB1', 0, 1);

    // Second pool member: added to the pool but never created a prediction row at all.
    const noPredictionMember = await createUser(db, {
      email: 'no-prediction@x.com',
      displayName: 'No Prediction',
    });
    await addMember(db, poolId, noPredictionMember.id);

    const { recap } = await buildPoolArchiveRecap(db, {
      poolId,
      tournamentId,
      def: miniTournament,
      scoring: miniTournament.scoring,
    });

    // Only the owner contributes: 4 groupOrder hits + 0 groupMatches hits, out of 4 + 1
    // attempted = 4/5 = 80%. If the no-prediction member were wrongly run through the
    // augmentation pipeline, their phantom 4/4 groupOrder credit would pull this to 8/9 ≈ 89%.
    expect(recap.overallAccuracyPercent).toBe(80);
  });

  it('overallAccuracyPercent is 0, not NaN, when nobody has predicted anything', async () => {
    const { recap } = await buildPoolArchiveRecap(db, {
      poolId,
      tournamentId,
      def: miniTournament,
      scoring: miniTournament.scoring,
    });

    expect(recap.overallAccuracyPercent).toBe(0);
  });

  it('labels the Start stage null and a Final-match date with the Final round', async () => {
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

    const { recap } = await buildPoolArchiveRecap(db, {
      poolId,
      tournamentId,
      def: miniTournament,
      scoring: miniTournament.scoring,
    });

    expect(recap.stageRoundLabels).toHaveLength(recap.stages.length);
    expect(recap.stageRoundLabels[0]).toBeNull();
    expect(recap.stageRoundLabels[recap.stages.length - 1]).toBe('Final');
  });

  it('freezes groupCompletionStageIndex and all five leader/performer fields into the recap', async () => {
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

    const { recap } = await buildPoolArchiveRecap(db, {
      poolId,
      tournamentId,
      def: miniTournament,
      scoring: miniTournament.scoring,
    });

    expect(typeof recap.groupCompletionStageIndex).toBe('number');
    // Single-member pool: the only member leads every category by definition.
    expect(recap.groupStageLeader?.userId).toBe(ownerId);
    expect(recap.preSpecialsLeader?.userId).toBe(ownerId);
    expect(recap.finalWinner?.userId).toBe(ownerId);
    expect(recap.bestKnockoutPerformer?.userId).toBe(ownerId);
    expect(recap.bestSpecialBetsPerformer?.userId).toBe(ownerId);
  });
});
