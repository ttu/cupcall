import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../testing/make-test-db';
import type { Db } from '../client';
import * as schema from '../schema/index';
import {
  listPredictionsForTournament,
  getPredictionInputs,
  clearPredictionInputs,
  getGroupScoresByPool,
  getKnockoutPicksByPool,
} from './predictions';
import { upsertTournamentDef } from './tournament';
import { createUser } from './users';
import { createPool } from './pools';
import { miniTournament } from '@cup/engine/testing';
import type { UserId, PoolId, PredictionId } from '@cup/engine';
import {
  matchId,
  teamId,
  bracketMatchKey,
  playerId,
  tournamentId as asTournamentId,
  predictionId as asPredictionId,
} from '@cup/engine';

const firstKickoff = new Date('2026-06-11T18:00:00Z');
const emptyKickoffs = new Map<string, Date | null>();

async function seedPrediction(
  db: Db<typeof schema>,
  poolId: string,
  userId: string,
  tournamentId: string,
): Promise<PredictionId> {
  const [row] = await db
    .insert(schema.predictions)
    .values({ poolId, userId, tournamentId })
    .returning();
  if (!row) throw new Error('seedPrediction: insert did not return a row');
  return asPredictionId(row.id);
}

describe('predictions repository', () => {
  let db: Db<typeof schema>;
  let userId1: UserId;
  let poolId: PoolId;
  const tournamentId = asTournamentId('mini-2026');

  beforeEach(async () => {
    db = await makeTestDb();

    // Seed tournament
    await upsertTournamentDef(db, miniTournament, firstKickoff, emptyKickoffs);

    // Seed user + pool
    const user = await createUser(db, {
      email: `u-${crypto.randomUUID()}@x.com`,
      displayName: 'Alice',
    });
    userId1 = user.id;

    const owner = await createUser(db, {
      email: `owner-${crypto.randomUUID()}@x.com`,
      displayName: 'Owner',
    });
    const pool = await createPool(db, {
      tournamentId,
      ownerId: owner.id,
      name: 'Test Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });
    poolId = pool.id;
  });

  describe('listPredictionsForTournament', () => {
    it('returns empty array when no predictions exist', async () => {
      const result = await listPredictionsForTournament(db, tournamentId);
      expect(result).toHaveLength(0);
    });

    it('returns predictions for the given tournament', async () => {
      await seedPrediction(db, poolId, userId1, tournamentId);
      const result = await listPredictionsForTournament(db, tournamentId);
      expect(result).toHaveLength(1);
      expect(result[0]?.userId).toBe(userId1);
      expect(result[0]?.poolId).toBe(poolId);
    });

    it('does not return predictions for other tournaments', async () => {
      const otherTournamentId = asTournamentId(`other-${crypto.randomUUID()}`);
      await db.insert(schema.tournaments).values({
        id: otherTournamentId,
        name: 'Other',
        firstKickoff,
        scoringConfig: miniTournament.scoring,
      });
      const otherPool = await createPool(db, {
        tournamentId: otherTournamentId,
        ownerId: userId1,
        name: 'Other Pool',
        inviteTokenHash: `h2-${crypto.randomUUID()}`,
      });
      await seedPrediction(db, otherPool.id, userId1, otherTournamentId);

      const result = await listPredictionsForTournament(db, tournamentId);
      expect(result).toHaveLength(0);
    });
  });

  describe('getPredictionInputs', () => {
    it('returns empty CardInputs for a prediction with no sub-rows', async () => {
      const predId = await seedPrediction(db, poolId, userId1, tournamentId);
      const inputs = await getPredictionInputs(db, predId);
      expect(inputs.groupScores).toHaveLength(0);
      expect(inputs.knockoutPicks).toHaveLength(0);
      expect(inputs.finishScores).toEqual({});
      expect(inputs.specials).toEqual({});
    });

    it('assembles group scores correctly', async () => {
      const predId = await seedPrediction(db, poolId, userId1, tournamentId);
      await db.insert(schema.predictionGroupScores).values([
        { predictionId: predId, matchId: 'mA1', homeGoals: 2, awayGoals: 1 },
        { predictionId: predId, matchId: 'mA2', homeGoals: 0, awayGoals: 0 },
      ]);

      const inputs = await getPredictionInputs(db, predId);
      expect(inputs.groupScores).toHaveLength(2);
      const mA1 = inputs.groupScores.find((s) => s.matchId === matchId('mA1'));
      expect(mA1?.home).toBe(2);
      expect(mA1?.away).toBe(1);
    });

    it('assembles knockout picks correctly', async () => {
      const predId = await seedPrediction(db, poolId, userId1, tournamentId);
      await db
        .insert(schema.predictionKnockoutPicks)
        .values([
          { predictionId: predId, bracketMatchKey: bracketMatchKey('qf1'), winnerTeamId: 'A1' },
        ]);

      const inputs = await getPredictionInputs(db, predId);
      expect(inputs.knockoutPicks).toHaveLength(1);
      expect(inputs.knockoutPicks[0]?.bracketMatchKey).toBe(bracketMatchKey('qf1'));
      expect(inputs.knockoutPicks[0]?.winner).toBe(teamId('A1'));
    });

    it('assembles finish scores for final and bronze', async () => {
      const predId = await seedPrediction(db, poolId, userId1, tournamentId);
      await db.insert(schema.predictionFinishScores).values([
        { predictionId: predId, match: 'final', homeGoals: 1, awayGoals: 0 },
        { predictionId: predId, match: 'bronze', homeGoals: 2, awayGoals: 2 },
      ]);

      const inputs = await getPredictionInputs(db, predId);
      expect(inputs.finishScores.final).toEqual({ home: 1, away: 0 });
      expect(inputs.finishScores.bronze).toEqual({ home: 2, away: 2 });
    });

    it('assembles special bets with branded types', async () => {
      const predId = await seedPrediction(db, poolId, userId1, tournamentId);
      await db.insert(schema.predictionSpecials).values([
        { predictionId: predId, betKey: 'groupTopScoringTeam', value: 'A1' },
        { predictionId: predId, betKey: 'topScorerPlayer', value: 'A1-P' },
        { predictionId: predId, betKey: 'penaltyShootoutCount', value: 3 },
        { predictionId: predId, betKey: 'finalDecidedByPenalties', value: true },
      ]);

      const inputs = await getPredictionInputs(db, predId);
      expect(inputs.specials.groupTopScoringTeam).toBe(teamId('A1'));
      expect(inputs.specials.topScorerPlayer).toBe(playerId('A1-P'));
      expect(inputs.specials.penaltyShootoutCount).toBe(3);
      expect(inputs.specials.finalDecidedByPenalties).toBe(true);
    });
  });

  describe('clearPredictionInputs', () => {
    it('deletes all sub-rows for the given prediction', async () => {
      const predId = await seedPrediction(db, poolId, userId1, tournamentId);

      await db
        .insert(schema.predictionGroupScores)
        .values([{ predictionId: predId, matchId: 'mA1', homeGoals: 2, awayGoals: 1 }]);
      await db
        .insert(schema.predictionKnockoutPicks)
        .values([
          { predictionId: predId, bracketMatchKey: bracketMatchKey('qf1'), winnerTeamId: 'A1' },
        ]);
      await db
        .insert(schema.predictionFinishScores)
        .values([{ predictionId: predId, match: 'final', homeGoals: 1, awayGoals: 0 }]);
      await db
        .insert(schema.predictionSpecials)
        .values([{ predictionId: predId, betKey: 'penaltyShootoutCount', value: 3 }]);

      await clearPredictionInputs(db, predId);

      const inputs = await getPredictionInputs(db, predId);
      expect(inputs.groupScores).toHaveLength(0);
      expect(inputs.knockoutPicks).toHaveLength(0);
      expect(inputs.finishScores).toEqual({});
      expect(inputs.specials).toEqual({});
    });

    it('does not touch rows belonging to other predictions', async () => {
      const pred1 = await seedPrediction(db, poolId, userId1, tournamentId);
      const user2 = await createUser(db, {
        email: `u2-${crypto.randomUUID()}@x.com`,
        displayName: 'Bob',
      });
      const pred2 = await seedPrediction(db, poolId, user2.id, tournamentId);

      await db.insert(schema.predictionGroupScores).values([
        { predictionId: pred1, matchId: 'mA1', homeGoals: 1, awayGoals: 0 },
        { predictionId: pred2, matchId: 'mA1', homeGoals: 2, awayGoals: 2 },
      ]);

      await clearPredictionInputs(db, pred1);

      const inputs1 = await getPredictionInputs(db, pred1);
      const inputs2 = await getPredictionInputs(db, pred2);
      expect(inputs1.groupScores).toHaveLength(0);
      expect(inputs2.groupScores).toHaveLength(1);
    });
  });

  describe('getGroupScoresByPool', () => {
    it('returns empty array when no predictions exist', async () => {
      const result = await getGroupScoresByPool(db, poolId);
      expect(result).toHaveLength(0);
    });

    it('returns all group scores for all members of the pool', async () => {
      const user2 = await createUser(db, {
        email: `u2-${crypto.randomUUID()}@x.com`,
        displayName: 'Bob',
      });
      const pred1 = await seedPrediction(db, poolId, userId1, tournamentId);
      const pred2 = await seedPrediction(db, poolId, user2.id, tournamentId);

      await db.insert(schema.predictionGroupScores).values([
        { predictionId: pred1, matchId: 'mA1', homeGoals: 2, awayGoals: 1 },
        { predictionId: pred1, matchId: 'mA2', homeGoals: 0, awayGoals: 0 },
        { predictionId: pred2, matchId: 'mA1', homeGoals: 3, awayGoals: 0 },
      ]);

      const result = await getGroupScoresByPool(db, poolId);
      expect(result).toHaveLength(3);
      const user1Scores = result.filter((r) => r.userId === userId1);
      expect(user1Scores).toHaveLength(2);
      const u1mA1 = user1Scores.find((r) => r.matchId === 'mA1');
      expect(u1mA1?.home).toBe(2);
      expect(u1mA1?.away).toBe(1);
    });

    it('does not return scores from other pools', async () => {
      const otherOwner = await createUser(db, {
        email: `o2-${crypto.randomUUID()}@x.com`,
        displayName: 'Other Owner',
      });
      const otherPool = await createPool(db, {
        tournamentId,
        ownerId: otherOwner.id,
        name: 'Other Pool',
        inviteTokenHash: `hother-${crypto.randomUUID()}`,
      });
      const predOther = await seedPrediction(db, otherPool.id, otherOwner.id, tournamentId);
      await db
        .insert(schema.predictionGroupScores)
        .values([{ predictionId: predOther, matchId: 'mA1', homeGoals: 1, awayGoals: 1 }]);

      const result = await getGroupScoresByPool(db, poolId);
      expect(result).toHaveLength(0);
    });
  });

  describe('getKnockoutPicksByPool', () => {
    it('returns empty array when no picks exist', async () => {
      const result = await getKnockoutPicksByPool(db, poolId);
      expect(result).toHaveLength(0);
    });

    it('returns knockout picks for pool members only', async () => {
      const user2 = await createUser(db, {
        email: `u2-${crypto.randomUUID()}@x.com`,
        displayName: 'Bob',
      });

      const pred1 = await seedPrediction(
        db,
        poolId as string,
        userId1 as string,
        tournamentId as string,
      );
      const pred2 = await seedPrediction(
        db,
        poolId as string,
        user2.id as string,
        tournamentId as string,
      );

      await db.insert(schema.predictionKnockoutPicks).values([
        { predictionId: pred1, bracketMatchKey: bracketMatchKey('qf1'), winnerTeamId: 'A1' },
        { predictionId: pred2, bracketMatchKey: bracketMatchKey('qf1'), winnerTeamId: 'B1' },
        { predictionId: pred2, bracketMatchKey: bracketMatchKey('sf1'), winnerTeamId: 'A1' },
      ]);

      const result = await getKnockoutPicksByPool(db, poolId);
      expect(result).toHaveLength(3);

      const user1Pick = result.find((r) => r.userId === userId1 && r.bracketMatchKey === 'qf1');
      expect(user1Pick?.winnerTeamId).toBe('A1');

      const user2Picks = result.filter((r) => r.userId === user2.id);
      expect(user2Picks).toHaveLength(2);
    });

    it('does not return picks from a different pool', async () => {
      const owner2 = await createUser(db, {
        email: `owner2-${crypto.randomUUID()}@x.com`,
        displayName: 'Owner2',
      });
      const pool2 = await createPool(db, {
        tournamentId,
        ownerId: owner2.id,
        name: 'Other Pool',
        inviteTokenHash: `h2-${crypto.randomUUID()}`,
      });

      const pred1 = await seedPrediction(
        db,
        poolId as string,
        userId1 as string,
        tournamentId as string,
      );
      const pred2 = await seedPrediction(
        db,
        pool2.id as string,
        owner2.id as string,
        tournamentId as string,
      );

      await db.insert(schema.predictionKnockoutPicks).values([
        { predictionId: pred1, bracketMatchKey: bracketMatchKey('qf1'), winnerTeamId: 'A1' },
        { predictionId: pred2, bracketMatchKey: bracketMatchKey('qf1'), winnerTeamId: 'B1' },
      ]);

      const result = await getKnockoutPicksByPool(db, poolId);
      expect(result).toHaveLength(1);
      expect(result[0]?.winnerTeamId).toBe('A1');
    });
  });
});
