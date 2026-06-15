import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema/index';
import {
  userId,
  teamId,
  playerId,
  matchId,
  bracketMatchKey,
  SPECIAL_BET_KINDS,
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
  editorName: string;
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

/**
 * Deletes the prediction row for (poolId, userId), cascading to all sub-rows
 * (group scores, knockout picks, finish scores, specials, edits). No-op if no
 * prediction exists.
 */
export async function deletePrediction(
  db: Database,
  poolId: string,
  userId: UserId,
): Promise<void> {
  await db
    .delete(schema.predictions)
    .where(and(eq(schema.predictions.poolId, poolId), eq(schema.predictions.userId, userId)));
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
    .select({
      id: schema.predictionEdits.id,
      predictionId: schema.predictionEdits.predictionId,
      editorUserId: schema.predictionEdits.editorUserId,
      editorDisplayName: schema.users.displayName,
      editorEmail: schema.users.email,
      fieldPath: schema.predictionEdits.fieldPath,
      oldValue: schema.predictionEdits.oldValue,
      newValue: schema.predictionEdits.newValue,
      reason: schema.predictionEdits.reason,
      source: schema.predictionEdits.source,
      editedAt: schema.predictionEdits.editedAt,
    })
    .from(schema.predictionEdits)
    .leftJoin(schema.users, eq(schema.predictionEdits.editorUserId, schema.users.id))
    .where(eq(schema.predictionEdits.predictionId, predictionId))
    .orderBy(schema.predictionEdits.editedAt);

  return rows
    .slice()
    .reverse()
    .map((r) => ({
      id: r.id,
      predictionId: r.predictionId,
      editorUserId: userId(r.editorUserId),
      editorName: r.editorDisplayName || r.editorEmail || r.editorUserId,
      fieldPath: r.fieldPath,
      oldValue: r.oldValue,
      newValue: r.newValue,
      reason: r.reason,
      source: r.source,
      editedAt: r.editedAt,
    }));
}

export type PoolGroupScore = {
  userId: UserId;
  matchId: string;
  home: number;
  away: number;
};

export type PoolSpecialBet = {
  userId: UserId;
  betKey: string;
  value: unknown;
};

/**
 * Returns all special bet predictions for every member of a pool in a single
 * JOIN query. Used to build the per-bet distribution stats in the results view.
 */
export async function getSpecialBetsByPool(
  db: Database,
  poolId: string,
): Promise<PoolSpecialBet[]> {
  const rows = await db
    .select({
      userId: schema.predictions.userId,
      betKey: schema.predictionSpecials.betKey,
      value: schema.predictionSpecials.value,
    })
    .from(schema.predictions)
    .innerJoin(
      schema.predictionSpecials,
      eq(schema.predictionSpecials.predictionId, schema.predictions.id),
    )
    .where(eq(schema.predictions.poolId, poolId));

  return rows.map((r) => ({
    userId: userId(r.userId),
    betKey: r.betKey,
    value: r.value,
  }));
}

/**
 * Returns all group-score predictions for every member of a pool in a single
 * JOIN query. Used to build the per-match points matrix in the results view.
 */
export async function getGroupScoresByPool(
  db: Database,
  poolId: string,
): Promise<PoolGroupScore[]> {
  const rows = await db
    .select({
      userId: schema.predictions.userId,
      matchId: schema.predictionGroupScores.matchId,
      home: schema.predictionGroupScores.homeGoals,
      away: schema.predictionGroupScores.awayGoals,
    })
    .from(schema.predictions)
    .innerJoin(
      schema.predictionGroupScores,
      eq(schema.predictionGroupScores.predictionId, schema.predictions.id),
    )
    .where(eq(schema.predictions.poolId, poolId));

  return rows.map((r) => ({
    userId: userId(r.userId),
    matchId: r.matchId,
    home: r.home,
    away: r.away,
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
 * Deserialization is driven by SPECIAL_BET_KINDS from the engine so adding
 * a new bet key only requires updating the engine registry — not this file.
 */
function buildSpecialBets(rows: Array<typeof schema.predictionSpecials.$inferSelect>): SpecialBets {
  const specials: SpecialBets = {};

  for (const row of rows) {
    const kind = SPECIAL_BET_KINDS[row.betKey];
    if (!kind) continue;
    const v = row.value;
    const key = row.betKey as keyof SpecialBets;
    if (kind === 'player' && typeof v === 'string') {
      (specials as Record<string, unknown>)[key] = playerId(v);
    } else if (kind === 'team' && typeof v === 'string') {
      (specials as Record<string, unknown>)[key] = teamId(v);
    } else if (kind === 'number' && typeof v === 'number') {
      (specials as Record<string, unknown>)[key] = v;
    } else if (kind === 'bool' && typeof v === 'boolean') {
      (specials as Record<string, unknown>)[key] = v;
    }
  }

  return specials;
}
