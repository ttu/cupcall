import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema/index';
import {
  userId,
  teamId,
  playerId,
  matchId,
  bracketMatchKey,
  type UserId,
  type CardInputs,
  type GroupScore,
  type KnockoutPick,
  type FinishScore,
  type SpecialBets,
  type BracketMatchKey,
} from '@cup/engine';

type Database = Db<typeof schema>;

export type PredictionRow = {
  id: string;
  poolId: string;
  userId: UserId;
  tournamentId: string;
  lockedAt: Date | null;
};

export type EditRow = {
  id: string;
  predictionId: string;
  editorUserId: UserId;
  fieldPath: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  source: 'manual' | 'import';
  editedAt: Date;
};

export type PredictionRef = {
  predictionId: string;
  poolId: string;
  userId: UserId;
};

/**
 * Returns the prediction row for (poolId, userId), or undefined if none exists.
 */
export async function getPrediction(
  db: Database,
  poolId: string,
  uid: UserId,
): Promise<PredictionRow | undefined> {
  const [row] = await db
    .select()
    .from(schema.predictions)
    .where(and(eq(schema.predictions.poolId, poolId), eq(schema.predictions.userId, uid)));
  if (!row) return undefined;
  return { ...row, userId: userId(row.userId) };
}

/**
 * Gets the existing prediction for (poolId, userId), or creates an empty one.
 * Used when a member first visits their predict page for a pool.
 */
export async function getOrCreatePrediction(
  db: Database,
  input: { poolId: string; userId: UserId; tournamentId: string },
): Promise<PredictionRow> {
  const existing = await db
    .select()
    .from(schema.predictions)
    .where(
      and(eq(schema.predictions.poolId, input.poolId), eq(schema.predictions.userId, input.userId)),
    );
  if (existing[0]) return { ...existing[0], userId: userId(existing[0].userId) };

  const [row] = await db
    .insert(schema.predictions)
    .values({
      poolId: input.poolId,
      userId: input.userId,
      tournamentId: input.tournamentId,
    })
    .returning();
  if (!row) throw new Error('getOrCreatePrediction: insert did not return a row');
  return { ...row, userId: userId(row.userId) };
}

/** Upserts a single group-match score prediction. */
export async function upsertGroupScore(
  db: Database,
  predictionId: string,
  mid: string,
  homeGoals: number,
  awayGoals: number,
): Promise<void> {
  await db
    .insert(schema.predictionGroupScores)
    .values({ predictionId, matchId: mid, homeGoals, awayGoals })
    .onConflictDoUpdate({
      target: [schema.predictionGroupScores.predictionId, schema.predictionGroupScores.matchId],
      set: { homeGoals, awayGoals },
    });
}

/** Upserts a knockout winner pick. */
export async function upsertKnockoutPick(
  db: Database,
  predictionId: string,
  key: BracketMatchKey,
  winnerTeamId: string,
): Promise<void> {
  await db
    .insert(schema.predictionKnockoutPicks)
    .values({ predictionId, bracketMatchKey: key, winnerTeamId })
    .onConflictDoUpdate({
      target: [
        schema.predictionKnockoutPicks.predictionId,
        schema.predictionKnockoutPicks.bracketMatchKey,
      ],
      set: { winnerTeamId },
    });
}

/**
 * Deletes knockout picks for the given bracket match keys.
 * Called when group scores change and downstream picks become invalid.
 */
export async function deleteKnockoutPicks(
  db: Database,
  predictionId: string,
  keys: BracketMatchKey[],
): Promise<void> {
  if (keys.length === 0) return;
  await db
    .delete(schema.predictionKnockoutPicks)
    .where(
      and(
        eq(schema.predictionKnockoutPicks.predictionId, predictionId),
        inArray(schema.predictionKnockoutPicks.bracketMatchKey, keys),
      ),
    );
}

/** Removes all prediction sub-rows (group scores, knockout picks, finish scores, specials) for a prediction. */
export async function clearPredictionInputs(db: Database, predictionId: string): Promise<void> {
  await Promise.all([
    db
      .delete(schema.predictionGroupScores)
      .where(eq(schema.predictionGroupScores.predictionId, predictionId)),
    db
      .delete(schema.predictionKnockoutPicks)
      .where(eq(schema.predictionKnockoutPicks.predictionId, predictionId)),
    db
      .delete(schema.predictionFinishScores)
      .where(eq(schema.predictionFinishScores.predictionId, predictionId)),
    db
      .delete(schema.predictionSpecials)
      .where(eq(schema.predictionSpecials.predictionId, predictionId)),
  ]);
}

/** Upserts the predicted exact score for the final or bronze match. */
export async function upsertFinishScore(
  db: Database,
  predictionId: string,
  match: 'final' | 'bronze',
  homeGoals: number,
  awayGoals: number,
): Promise<void> {
  await db
    .insert(schema.predictionFinishScores)
    .values({ predictionId, match, homeGoals, awayGoals })
    .onConflictDoUpdate({
      target: [schema.predictionFinishScores.predictionId, schema.predictionFinishScores.match],
      set: { homeGoals, awayGoals },
    });
}

/** Upserts a single special bet. Value must be JSON-serializable. */
export async function upsertSpecialBet(
  db: Database,
  predictionId: string,
  betKey: string,
  value: unknown,
): Promise<void> {
  await db
    .insert(schema.predictionSpecials)
    .values({ predictionId, betKey, value })
    .onConflictDoUpdate({
      target: [schema.predictionSpecials.predictionId, schema.predictionSpecials.betKey],
      set: { value },
    });
}

/** Appends an audit record for an owner edit. */
export async function createPredictionEdit(
  db: Database,
  input: {
    predictionId: string;
    editorUserId: UserId;
    fieldPath: string;
    oldValue: unknown;
    newValue: unknown;
    reason?: string;
    source: 'manual' | 'import';
  },
): Promise<void> {
  await db.insert(schema.predictionEdits).values({
    predictionId: input.predictionId,
    editorUserId: input.editorUserId,
    fieldPath: input.fieldPath,
    oldValue: input.oldValue ?? null,
    newValue: input.newValue ?? null,
    reason: input.reason ?? null,
    source: input.source,
  });
}

/**
 * Returns edit history for a prediction, most-recent first.
 * Readable by all pool members per functional-spec §8.3.
 */
export async function listEditsForPrediction(
  db: Database,
  predictionId: string,
): Promise<EditRow[]> {
  const rows = await db
    .select()
    .from(schema.predictionEdits)
    .where(eq(schema.predictionEdits.predictionId, predictionId))
    .orderBy(schema.predictionEdits.editedAt);

  return rows
    .slice()
    .reverse()
    .map((r) => ({
      id: r.id,
      predictionId: r.predictionId,
      editorUserId: userId(r.editorUserId),
      fieldPath: r.fieldPath,
      oldValue: r.oldValue,
      newValue: r.newValue,
      reason: r.reason,
      source: r.source,
      editedAt: r.editedAt,
    }));
}

/**
 * Returns all predictions for a tournament across all pools.
 * Used by the sync pipeline to enumerate cards that need rescoring.
 */
export async function listPredictionsForTournament(
  db: Database,
  tournamentId: string,
): Promise<PredictionRef[]> {
  const rows = await db
    .select({
      id: schema.predictions.id,
      poolId: schema.predictions.poolId,
      userId: schema.predictions.userId,
    })
    .from(schema.predictions)
    .where(eq(schema.predictions.tournamentId, tournamentId));

  return rows.map((r) => ({
    predictionId: r.id,
    poolId: r.poolId,
    userId: userId(r.userId),
  }));
}

/**
 * Assembles CardInputs for a given prediction by querying the four sub-tables.
 */
export async function getPredictionInputs(db: Database, predictionId: string): Promise<CardInputs> {
  const [groupScoreRows, knockoutRows, finishRows, specialRows] = await Promise.all([
    db
      .select()
      .from(schema.predictionGroupScores)
      .where(eq(schema.predictionGroupScores.predictionId, predictionId)),
    db
      .select()
      .from(schema.predictionKnockoutPicks)
      .where(eq(schema.predictionKnockoutPicks.predictionId, predictionId)),
    db
      .select()
      .from(schema.predictionFinishScores)
      .where(eq(schema.predictionFinishScores.predictionId, predictionId)),
    db
      .select()
      .from(schema.predictionSpecials)
      .where(eq(schema.predictionSpecials.predictionId, predictionId)),
  ]);

  const groupScores: GroupScore[] = groupScoreRows.map((r) => ({
    matchId: matchId(r.matchId),
    home: r.homeGoals,
    away: r.awayGoals,
  }));

  const knockoutPicks: KnockoutPick[] = knockoutRows.map((r) => ({
    bracketMatchKey: bracketMatchKey(r.bracketMatchKey) as BracketMatchKey,
    winner: teamId(r.winnerTeamId),
  }));

  const finishScores: { final?: FinishScore; bronze?: FinishScore } = {};
  for (const r of finishRows) {
    const score: FinishScore = { home: r.homeGoals, away: r.awayGoals };
    if (r.match === 'final') {
      finishScores.final = score;
    } else {
      finishScores.bronze = score;
    }
  }

  const specials = buildSpecialBets(specialRows);

  return { groupScores, knockoutPicks, finishScores, specials };
}

/**
 * Reconstructs a SpecialBets object from the predictionSpecials rows.
 * Each row's value is a raw JSON scalar/array from the DB; we apply
 * branded constructors where needed.
 */
function buildSpecialBets(rows: Array<typeof schema.predictionSpecials.$inferSelect>): SpecialBets {
  const specials: SpecialBets = {};

  for (const row of rows) {
    const v = row.value;
    switch (row.betKey) {
      case 'topScorerPlayer':
        if (typeof v === 'string') specials.topScorerPlayer = playerId(v);
        break;
      case 'groupTopScoringTeam':
        if (typeof v === 'string') specials.groupTopScoringTeam = teamId(v);
        break;
      case 'groupTopConcedingTeam':
        if (typeof v === 'string') specials.groupTopConcedingTeam = teamId(v);
        break;
      case 'tournamentTopScoringTeam':
        if (typeof v === 'string') specials.tournamentTopScoringTeam = teamId(v);
        break;
      case 'tournamentTopConcedingTeam':
        if (typeof v === 'string') specials.tournamentTopConcedingTeam = teamId(v);
        break;
      case 'highestMatchGoals':
        if (typeof v === 'number') specials.highestMatchGoals = v;
        break;
      case 'mostYellowCardsTeam':
        if (typeof v === 'string') specials.mostYellowCardsTeam = teamId(v);
        break;
      case 'firstRedCardPlayer':
        if (typeof v === 'string') specials.firstRedCardPlayer = playerId(v);
        break;
      case 'penaltyShootoutCount':
        if (typeof v === 'number') specials.penaltyShootoutCount = v;
        break;
      case 'finalDecidedByPenalties':
        if (typeof v === 'boolean') specials.finalDecidedByPenalties = v;
        break;
      case 'finalDecisiveGoalPlayer':
        if (typeof v === 'string') specials.finalDecisiveGoalPlayer = playerId(v);
        break;
    }
  }

  return specials;
}
