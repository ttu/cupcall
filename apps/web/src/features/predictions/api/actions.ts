'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/shared/db';
import { getCurrentActor, getActorOrThrow } from '@/features/auth';
import { assertCanEditOwnCard, assertCanOwnerEdit } from '@/shared/authz';
import {
  getPoolById,
  upsertGroupScore,
  upsertKnockoutPick,
  upsertFinishScore,
  upsertSpecialBet,
  createPredictionEdit,
  getPrediction,
  getOrCreatePrediction,
  getPredictionInputs,
  deleteKnockoutPicks,
  getTournamentById,
  clearPredictionInputs,
  matchHasResult,
  betKeyHasAnswer,
  getActualResults,
} from '@cup/db';
import {
  bracketMatchKey as bmk,
  deriveCard,
  deriveGroupOrders,
  selectQualifiers,
  findInvalidatedPickKeys,
  userId,
} from '@cup/engine';
import type {
  ActualResults,
  BracketMatchKey,
  CardInputs,
  MatchId,
  TeamId,
  Tournament,
} from '@cup/engine';
import { rescoreAfterEdit } from './rescore-helper';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Load pool, tournament, and assert pool/tournament exist. */
async function loadPoolAndTournament(poolId: string) {
  const pool = await getPoolById(db, poolId);
  if (!pool) throw new Error(`Pool ${poolId} not found`);

  const tournament = await getTournamentById(db, pool.tournamentId);
  if (!tournament) throw new Error(`Tournament ${pool.tournamentId} not found`);
  if (!tournament.definition)
    throw new Error(
      `Tournament definition not loaded for ${pool.tournamentId}. Run pnpm sync first.`,
    );

  return { pool, tournament };
}

/**
 * Fetch pool + tournament + actual results in two parallel stages.
 * Stage 1: pool (need its tournamentId first)
 * Stage 2: tournament + actual results in parallel (both need tournamentId)
 */
async function loadPoolTournamentAndActual(poolId: string) {
  const pool = await getPoolById(db, poolId);
  if (!pool) throw new Error(`Pool ${poolId} not found`);

  const [tournament, actual] = await Promise.all([
    getTournamentById(db, pool.tournamentId),
    getActualResults(db, pool.tournamentId),
  ]);
  if (!tournament) throw new Error(`Tournament ${pool.tournamentId} not found`);
  if (!tournament.definition)
    throw new Error(
      `Tournament definition not loaded for ${pool.tournamentId}. Run pnpm sync first.`,
    );

  return { pool, tournament, actual };
}

/** Build the group-scores map from pre-loaded actual results (avoids an extra DB query). */
function actualGroupScoresMap(actual: ActualResults): Map<string, { home: number; away: number }> {
  return new Map(
    actual.matchResults.map((r) => [r.matchId as string, { home: r.home, away: r.away }]),
  );
}

async function invalidatePicksAfterKnockoutPickChange(
  predictionId: string,
  updatedInputs: Awaited<ReturnType<typeof getPredictionInputs>>,
  tournamentDef: Tournament,
  actualGroupMatchScores?: Map<string, { home: number; away: number }>,
) {
  const savedMatchIds = new Set(updatedInputs.groupScores.map((gs) => gs.matchId as string));
  const augmentedScores =
    actualGroupMatchScores && actualGroupMatchScores.size > 0
      ? [
          ...updatedInputs.groupScores,
          ...[...actualGroupMatchScores.entries()]
            .filter(([mid]) => !savedMatchIds.has(mid))
            .map(([mid, result]) => ({ matchId: mid, home: result.home, away: result.away })),
        ]
      : updatedInputs.groupScores;

  const groupOrders = deriveGroupOrders(
    tournamentDef,
    augmentedScores as Parameters<typeof deriveGroupOrders>[1],
  );
  const qualifiers = selectQualifiers(
    tournamentDef,
    augmentedScores as Parameters<typeof selectQualifiers>[1],
    groupOrders,
  );
  const invalidKeys = findInvalidatedPickKeys(
    tournamentDef,
    groupOrders,
    qualifiers,
    updatedInputs.knockoutPicks,
  );
  if (invalidKeys.length > 0) {
    await deleteKnockoutPicks(db, predictionId, invalidKeys);
  }
}

/**
 * Derive the implicit winner of a finish match from the predicted scoreline.
 *
 * Returns the TeamId of the higher-scoring side using the resolved finalists / bronze pair,
 * or undefined when:
 *   - the score is tied (caller should leave any existing pick untouched), or
 *   - the finalists / bronze pair are not yet resolved (no SF picks).
 */
async function deriveFinishWinner(
  predictionId: string,
  match: 'final' | 'bronze',
  home: number,
  away: number,
  tournamentDef: Tournament,
): Promise<TeamId | undefined> {
  if (home === away) return undefined;

  const inputs = await getPredictionInputs(db, predictionId);
  const derived = deriveCard(inputs, tournamentDef);
  const pair = match === 'final' ? derived.finalists : derived.bronzePair;
  if (pair.length < 2) return undefined;

  const [homeSide, awaySide] = pair as [TeamId, TeamId];
  return home > away ? homeSide : awaySide;
}

async function invalidatePicksAfterGroupScoreChange(
  predictionId: string,
  matchId: string,
  home: number,
  away: number,
  existingInputs: Awaited<ReturnType<typeof getPredictionInputs>>,
  tournamentDef: Tournament,
  actualGroupMatchScores?: Map<string, { home: number; away: number }>,
) {
  const savedScores = existingInputs.groupScores.filter((s) => s.matchId !== matchId);
  const savedMatchIds = new Set(savedScores.map((gs) => gs.matchId as string));
  savedMatchIds.add(matchId);

  const updatedScores = [
    ...savedScores,
    { matchId, home, away },
    // Overlay actual scores for locked group matches not covered by user predictions
    ...(actualGroupMatchScores
      ? [...actualGroupMatchScores.entries()]
          .filter(([mid]) => !savedMatchIds.has(mid))
          .map(([mid, result]) => ({ matchId: mid, home: result.home, away: result.away }))
      : []),
  ];
  const newGroupOrders = deriveGroupOrders(
    tournamentDef,
    updatedScores as Parameters<typeof deriveGroupOrders>[1],
  );
  const newQualifiers = selectQualifiers(
    tournamentDef,
    updatedScores as Parameters<typeof selectQualifiers>[1],
    newGroupOrders,
  );
  const invalidKeys = findInvalidatedPickKeys(
    tournamentDef,
    newGroupOrders,
    newQualifiers,
    existingInputs.knockoutPicks,
  );
  if (invalidKeys.length > 0) {
    await deleteKnockoutPicks(db, predictionId, invalidKeys);
  }
}

// ---------------------------------------------------------------------------
// Save group score (own card)
// ---------------------------------------------------------------------------

const SaveGroupScoreSchema = z.object({
  poolId: z.string(),
  matchId: z.string(),
  home: z.number().int().min(0).max(99),
  away: z.number().int().min(0).max(99),
});

export async function saveGroupScore(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = SaveGroupScoreSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId, matchId: mId, home, away } = parsed.data;

  try {
    // Stage 1 (parallel): actor + pool
    const [actor, pool] = await Promise.all([getCurrentActor(), getPoolById(db, poolId)]);
    if (!actor) throw new Error('Not signed in');
    if (!pool) throw new Error(`Pool ${poolId} not found`);
    const { userId } = actor;
    const now = new Date();

    // Stage 2 (parallel): tournament + lock check + actual results
    const [tournament, itemHasResult, actual] = await Promise.all([
      getTournamentById(db, pool.tournamentId),
      matchHasResult(db, pool.tournamentId, mId),
      getActualResults(db, pool.tournamentId),
    ]);
    if (!tournament) throw new Error(`Tournament ${pool.tournamentId} not found`);
    if (!tournament.definition)
      throw new Error(
        `Tournament definition not loaded for ${pool.tournamentId}. Run pnpm sync first.`,
      );

    await assertCanEditOwnCard(db, {
      actor: { userId },
      pool: { id: pool.id, ownerId: pool.ownerId },
      lockTime: tournament.firstKickoff,
      now,
      itemHasResult,
    });

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: pool.tournamentId,
    });

    const inputs = await getPredictionInputs(db, prediction.id);

    await invalidatePicksAfterGroupScoreChange(
      prediction.id,
      mId,
      home,
      away,
      inputs,
      tournament.definition,
      actualGroupScoresMap(actual),
    );
    await upsertGroupScore(db, prediction.id, mId, home, away);

    // Compute updated inputs without an extra DB round-trip
    const updatedInputs: CardInputs = {
      ...inputs,
      groupScores: [
        ...inputs.groupScores.filter((s) => s.matchId !== mId),
        { matchId: mId as MatchId, home, away },
      ],
    };

    await rescoreAfterEdit(
      prediction.id,
      poolId,
      userId,
      tournament.definition,
      actual,
      updatedInputs,
    );

    revalidatePath(`/pools/${poolId}/predict`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Save knockout pick (own card)
// ---------------------------------------------------------------------------

const SaveKnockoutPickSchema = z.object({
  poolId: z.string(),
  bracketMatchKey: z.string(),
  winner: z.string(),
});

export async function saveKnockoutPick(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = SaveKnockoutPickSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId, bracketMatchKey: key, winner } = parsed.data;

  try {
    // Stage 1 (parallel): actor + pool
    const [actor, pool] = await Promise.all([getCurrentActor(), getPoolById(db, poolId)]);
    if (!actor) throw new Error('Not signed in');
    if (!pool) throw new Error(`Pool ${poolId} not found`);
    const { userId } = actor;
    const now = new Date();

    // Stage 2 (parallel): tournament + lock check + actual results
    // bracketMatchKey IS the match id in the matches table (e.g. "qf-1", "final")
    const [tournament, itemHasResult, actual] = await Promise.all([
      getTournamentById(db, pool.tournamentId),
      matchHasResult(db, pool.tournamentId, key),
      getActualResults(db, pool.tournamentId),
    ]);
    if (!tournament) throw new Error(`Tournament ${pool.tournamentId} not found`);
    if (!tournament.definition)
      throw new Error(
        `Tournament definition not loaded for ${pool.tournamentId}. Run pnpm sync first.`,
      );

    await assertCanEditOwnCard(db, {
      actor: { userId },
      pool: { id: pool.id, ownerId: pool.ownerId },
      lockTime: tournament.firstKickoff,
      now,
      itemHasResult,
    });

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: pool.tournamentId,
    });

    await upsertKnockoutPick(db, prediction.id, bmk(key) as BracketMatchKey, winner);
    const updatedInputs = await getPredictionInputs(db, prediction.id);
    await invalidatePicksAfterKnockoutPickChange(
      prediction.id,
      updatedInputs,
      tournament.definition,
      actualGroupScoresMap(actual),
    );

    await rescoreAfterEdit(
      prediction.id,
      poolId,
      userId,
      tournament.definition,
      actual,
      updatedInputs,
    );

    revalidatePath(`/pools/${poolId}/predict`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Save finish score (own card)
// ---------------------------------------------------------------------------

const SaveFinishScoreSchema = z.object({
  poolId: z.string(),
  match: z.enum(['final', 'bronze']),
  home: z.number().int().min(0).max(99),
  away: z.number().int().min(0).max(99),
});

export async function saveFinishScore(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = SaveFinishScoreSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId, match, home, away } = parsed.data;

  try {
    // Stage 1 (parallel): actor + pool + actual results
    const [actor, { pool, tournament, actual }] = await Promise.all([
      getCurrentActor(),
      loadPoolTournamentAndActual(poolId),
    ]);
    if (!actor) throw new Error('Not signed in');
    const { userId } = actor;
    const now = new Date();

    const matchKey =
      match === 'final'
        ? tournament.definition!.bracket.finalMatch
        : tournament.definition!.bracket.bronzeMatch;
    const itemHasResult = await matchHasResult(db, pool.tournamentId, matchKey);
    await assertCanEditOwnCard(db, {
      actor: { userId },
      pool: { id: pool.id, ownerId: pool.ownerId },
      lockTime: tournament.firstKickoff,
      now,
      itemHasResult,
    });

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: pool.tournamentId,
    });

    await upsertFinishScore(db, prediction.id, match, home, away);

    const implicitWinner = await deriveFinishWinner(
      prediction.id,
      match,
      home,
      away,
      tournament.definition!,
    );
    if (implicitWinner !== undefined) {
      const bracketKey =
        match === 'final'
          ? tournament.definition!.bracket.finalMatch
          : tournament.definition!.bracket.bronzeMatch;
      await upsertKnockoutPick(db, prediction.id, bracketKey, implicitWinner);
    }

    await rescoreAfterEdit(prediction.id, poolId, userId, tournament.definition!, actual);

    revalidatePath(`/pools/${poolId}/predict`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Save special bet (own card)
// ---------------------------------------------------------------------------

const SaveSpecialBetSchema = z.object({
  poolId: z.string(),
  betKey: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export async function saveSpecialBet(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = SaveSpecialBetSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId, betKey, value } = parsed.data;

  try {
    // Stage 1 (parallel): actor + pool + actual results
    const [actor, { pool, tournament, actual }] = await Promise.all([
      getCurrentActor(),
      loadPoolTournamentAndActual(poolId),
    ]);
    if (!actor) throw new Error('Not signed in');
    const { userId } = actor;
    const now = new Date();

    const itemHasResult = await betKeyHasAnswer(db, pool.tournamentId, betKey);
    await assertCanEditOwnCard(db, {
      actor: { userId },
      pool: { id: pool.id, ownerId: pool.ownerId },
      lockTime: tournament.firstKickoff,
      now,
      itemHasResult,
    });

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: pool.tournamentId,
    });

    await upsertSpecialBet(db, prediction.id, betKey, value);
    await rescoreAfterEdit(prediction.id, poolId, userId, tournament.definition!, actual);

    revalidatePath(`/pools/${poolId}/predict`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Owner: save group score for a member
// ---------------------------------------------------------------------------

const OwnerSaveGroupScoreSchema = z.object({
  poolId: z.string(),
  targetUserId: z.string(),
  matchId: z.string(),
  home: z.number().int().min(0).max(99),
  away: z.number().int().min(0).max(99),
  reason: z.string().optional(),
});

export async function ownerSaveGroupScore(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = OwnerSaveGroupScoreSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId, targetUserId: rawTargetUserId, matchId: mId, home, away, reason } = parsed.data;
  const targetUserId = userId(rawTargetUserId);

  try {
    // Stage 1 (parallel): editor actor + pool + actual results
    const [actor, { pool, tournament, actual }] = await Promise.all([
      getCurrentActor(),
      loadPoolTournamentAndActual(poolId),
    ]);
    if (!actor) throw new Error('Not signed in');
    const { userId: editorId } = actor;

    assertCanOwnerEdit({ userId: editorId }, { id: pool.id, ownerId: pool.ownerId });

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId: targetUserId,
      tournamentId: pool.tournamentId,
    });

    const oldInputs = await getPredictionInputs(db, prediction.id);
    const oldScore = oldInputs.groupScores.find((gs) => gs.matchId === mId);

    await invalidatePicksAfterGroupScoreChange(
      prediction.id,
      mId,
      home,
      away,
      oldInputs,
      tournament.definition!,
      actualGroupScoresMap(actual),
    );
    await upsertGroupScore(db, prediction.id, mId, home, away);
    await createPredictionEdit(db, {
      predictionId: prediction.id,
      editorUserId: editorId,
      fieldPath: `groupScores.${mId}`,
      oldValue: oldScore ? { home: oldScore.home, away: oldScore.away } : null,
      newValue: { home, away },
      ...(reason !== undefined ? { reason } : {}),
      source: 'manual',
    });

    // Compute updated inputs without an extra DB round-trip
    const updatedInputs: CardInputs = {
      ...oldInputs,
      groupScores: [
        ...oldInputs.groupScores.filter((s) => s.matchId !== mId),
        { matchId: mId as MatchId, home, away },
      ],
    };

    await rescoreAfterEdit(
      prediction.id,
      poolId,
      targetUserId,
      tournament.definition!,
      actual,
      updatedInputs,
    );

    revalidatePath(`/pools/${poolId}/members/${targetUserId}`);
    revalidatePath(`/pools/${poolId}/predict`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Owner: save special bet for a member
// ---------------------------------------------------------------------------

const OwnerSaveSpecialBetSchema = z.object({
  poolId: z.string(),
  targetUserId: z.string(),
  betKey: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
  reason: z.string().optional(),
});

export async function ownerSaveSpecialBet(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = OwnerSaveSpecialBetSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId, targetUserId: rawTargetUserId, betKey, value, reason } = parsed.data;
  const targetUserId = userId(rawTargetUserId);

  try {
    // Stage 1 (parallel): editor actor + pool + actual results
    const [actor, { pool, tournament, actual }] = await Promise.all([
      getCurrentActor(),
      loadPoolTournamentAndActual(poolId),
    ]);
    if (!actor) throw new Error('Not signed in');
    const { userId: editorId } = actor;

    assertCanOwnerEdit({ userId: editorId }, { id: pool.id, ownerId: pool.ownerId });

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId: targetUserId,
      tournamentId: pool.tournamentId,
    });

    const oldInputs = await getPredictionInputs(db, prediction.id);
    const oldValue = (oldInputs.specials as Record<string, unknown>)[betKey] ?? null;

    await upsertSpecialBet(db, prediction.id, betKey, value);
    await createPredictionEdit(db, {
      predictionId: prediction.id,
      editorUserId: editorId,
      fieldPath: `specials.${betKey}`,
      oldValue,
      newValue: value,
      ...(reason !== undefined ? { reason } : {}),
      source: 'manual',
    });
    await rescoreAfterEdit(prediction.id, poolId, targetUserId, tournament.definition!, actual);

    revalidatePath(`/pools/${poolId}/members/${targetUserId}`);
    revalidatePath(`/pools/${poolId}/predict`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Owner: save knockout pick for a member
// ---------------------------------------------------------------------------

const OwnerSaveKnockoutPickSchema = z.object({
  poolId: z.string(),
  targetUserId: z.string(),
  bracketMatchKey: z.string(),
  winner: z.string(),
  reason: z.string().optional(),
});

export async function ownerSaveKnockoutPick(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = OwnerSaveKnockoutPickSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const {
    poolId,
    targetUserId: rawTargetUserId,
    bracketMatchKey: key,
    winner,
    reason,
  } = parsed.data;
  const targetUserId = userId(rawTargetUserId);

  try {
    // Stage 1 (parallel): editor actor + pool + actual results
    const [actor, { pool, tournament, actual }] = await Promise.all([
      getCurrentActor(),
      loadPoolTournamentAndActual(poolId),
    ]);
    if (!actor) throw new Error('Not signed in');
    const { userId: editorId } = actor;

    assertCanOwnerEdit({ userId: editorId }, { id: pool.id, ownerId: pool.ownerId });

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId: targetUserId,
      tournamentId: pool.tournamentId,
    });

    await upsertKnockoutPick(db, prediction.id, bmk(key) as BracketMatchKey, winner);
    const updatedInputs = await getPredictionInputs(db, prediction.id);
    await invalidatePicksAfterKnockoutPickChange(
      prediction.id,
      updatedInputs,
      tournament.definition!,
      actualGroupScoresMap(actual),
    );
    await createPredictionEdit(db, {
      predictionId: prediction.id,
      editorUserId: editorId,
      fieldPath: `knockoutPicks.${key}`,
      oldValue: null,
      newValue: winner,
      ...(reason !== undefined ? { reason } : {}),
      source: 'manual',
    });
    await rescoreAfterEdit(
      prediction.id,
      poolId,
      targetUserId,
      tournament.definition!,
      actual,
      updatedInputs,
    );

    revalidatePath(`/pools/${poolId}/members/${targetUserId}`);
    revalidatePath(`/pools/${poolId}/predict`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Owner: save finish score for a member
// ---------------------------------------------------------------------------

const OwnerSaveFinishScoreSchema = z.object({
  poolId: z.string(),
  targetUserId: z.string(),
  match: z.enum(['final', 'bronze']),
  home: z.number().int().min(0).max(99),
  away: z.number().int().min(0).max(99),
  reason: z.string().optional(),
});

export async function ownerSaveFinishScore(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = OwnerSaveFinishScoreSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId, targetUserId: rawTargetUserId, match, home, away, reason } = parsed.data;
  const targetUserId = userId(rawTargetUserId);

  try {
    // Stage 1 (parallel): editor actor + pool + actual results
    const [actor, { pool, tournament, actual }] = await Promise.all([
      getCurrentActor(),
      loadPoolTournamentAndActual(poolId),
    ]);
    if (!actor) throw new Error('Not signed in');
    const { userId: editorId } = actor;

    assertCanOwnerEdit({ userId: editorId }, { id: pool.id, ownerId: pool.ownerId });

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId: targetUserId,
      tournamentId: pool.tournamentId,
    });

    await upsertFinishScore(db, prediction.id, match, home, away);

    const implicitWinner = await deriveFinishWinner(
      prediction.id,
      match,
      home,
      away,
      tournament.definition!,
    );
    if (implicitWinner !== undefined) {
      const bracketKey =
        match === 'final'
          ? tournament.definition!.bracket.finalMatch
          : tournament.definition!.bracket.bronzeMatch;
      await upsertKnockoutPick(db, prediction.id, bracketKey, implicitWinner);
    }

    await createPredictionEdit(db, {
      predictionId: prediction.id,
      editorUserId: editorId,
      fieldPath: `finishScores.${match}`,
      oldValue: null,
      newValue: { home, away },
      ...(reason !== undefined ? { reason } : {}),
      source: 'manual',
    });
    await rescoreAfterEdit(prediction.id, poolId, targetUserId, tournament.definition!, actual);

    revalidatePath(`/pools/${poolId}/members/${targetUserId}`);
    revalidatePath(`/pools/${poolId}/predict`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Export card
// ---------------------------------------------------------------------------

const ExportCardSchema = z.object({ poolId: z.string(), targetUserId: z.string().optional() });

export async function exportCard(
  raw: unknown,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const parsed = ExportCardSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId, targetUserId } = parsed.data;

  try {
    const { userId: actorId } = await getActorOrThrow();
    const { pool } = await loadPoolAndTournament(poolId);
    const isOwner = actorId === pool.ownerId;
    const effectiveUserId = isOwner && targetUserId ? userId(targetUserId) : actorId;
    const prediction = await getPrediction(db, poolId, effectiveUserId);
    if (!prediction) return { ok: false, error: 'No prediction found for this pool' };

    const inputs = await getPredictionInputs(db, prediction.id);

    const data = {
      tournamentId: pool.tournamentId,
      version: 1 as const,
      groupScores: inputs.groupScores.map((gs) => ({
        matchId: gs.matchId,
        home: gs.home,
        away: gs.away,
      })),
      knockoutPicks: inputs.knockoutPicks.map((kp) => ({
        bracketMatchKey: kp.bracketMatchKey,
        winner: kp.winner,
      })),
      finishScores: {
        ...(inputs.finishScores.final ? { final: inputs.finishScores.final } : {}),
        ...(inputs.finishScores.bronze ? { bronze: inputs.finishScores.bronze } : {}),
      },
      specials: inputs.specials,
    };

    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Import card (member: before lock; owner: any time)
// ---------------------------------------------------------------------------

const ImportCardSchema = z.object({
  poolId: z.string(),
  targetUserId: z.string().optional(),
  exportData: z.object({
    tournamentId: z.string(),
    version: z.literal(1),
    groupScores: z
      .array(
        z.object({
          matchId: z.string(),
          home: z.number().int().min(0),
          away: z.number().int().min(0),
        }),
      )
      .optional(),
    knockoutPicks: z
      .array(z.object({ bracketMatchKey: z.string(), winner: z.string() }))
      .optional(),
    finishScores: z
      .object({
        final: z.object({ home: z.number(), away: z.number() }).optional(),
        bronze: z.object({ home: z.number(), away: z.number() }).optional(),
      })
      .optional(),
    specials: z.record(z.unknown()).optional(),
  }),
});

export async function importCard(
  raw: unknown,
): Promise<{ ok: true; imported: number; skipped: string[] } | { ok: false; error: string }> {
  const parsed = ImportCardSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId, targetUserId, exportData } = parsed.data;

  try {
    // Stage 1 (parallel): actor + pool + actual results
    const [actor, { pool, tournament, actual }] = await Promise.all([
      getCurrentActor(),
      loadPoolTournamentAndActual(poolId),
    ]);
    if (!actor) throw new Error('Not signed in');
    const { userId: actorId } = actor;
    const tournamentDef = tournament.definition!;

    if (exportData.tournamentId !== pool.tournamentId) {
      return {
        ok: false,
        error: `Export is for tournament "${exportData.tournamentId}" but pool is for "${pool.tournamentId}"`,
      };
    }

    const isOwner = actorId === pool.ownerId;
    const effectiveUserId = isOwner && targetUserId ? userId(targetUserId) : actorId;
    const isOwnerEdit = isOwner && !!targetUserId;

    if (isOwnerEdit) {
      assertCanOwnerEdit({ userId: actorId }, { id: pool.id, ownerId: pool.ownerId });
    } else {
      await assertCanEditOwnCard(db, {
        actor: { userId: actorId },
        pool: { id: pool.id, ownerId: pool.ownerId },
        lockTime: tournament.firstKickoff,
        now: new Date(),
      });
    }

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId: effectiveUserId,
      tournamentId: pool.tournamentId,
    });

    const matchIds = new Set(tournamentDef.groupMatches.map((m) => m.id));
    const teamIds = new Set(tournamentDef.teams.map((t) => t.id));
    const playerIds = new Set(tournamentDef.players.map((p) => p.id));
    const bracketKeys = new Set([
      ...tournamentDef.bracket.slots.map((s) => s.match),
      ...tournamentDef.bracket.progression.map((p) => p.match),
    ]);

    let imported = 0;
    const skipped: string[] = [];

    for (const gs of exportData.groupScores ?? []) {
      if (!matchIds.has(gs.matchId as MatchId)) {
        skipped.push(`matchId:${gs.matchId}`);
        continue;
      }
      await upsertGroupScore(db, prediction.id, gs.matchId, gs.home, gs.away);
      if (isOwnerEdit) {
        await createPredictionEdit(db, {
          predictionId: prediction.id,
          editorUserId: actorId,
          fieldPath: `groupScores.${gs.matchId}`,
          oldValue: null,
          newValue: gs,
          source: 'import',
        });
      }
      imported++;
    }

    for (const kp of exportData.knockoutPicks ?? []) {
      if (!bracketKeys.has(kp.bracketMatchKey as BracketMatchKey)) {
        skipped.push(`bracketMatchKey:${kp.bracketMatchKey}`);
        continue;
      }
      if (!teamIds.has(kp.winner as TeamId)) {
        skipped.push(`team:${kp.winner}`);
        continue;
      }
      await upsertKnockoutPick(
        db,
        prediction.id,
        bmk(kp.bracketMatchKey) as BracketMatchKey,
        kp.winner,
      );
      imported++;
    }

    if (exportData.finishScores?.final) {
      await upsertFinishScore(
        db,
        prediction.id,
        'final',
        exportData.finishScores.final.home,
        exportData.finishScores.final.away,
      );
      imported++;
    }
    if (exportData.finishScores?.bronze) {
      await upsertFinishScore(
        db,
        prediction.id,
        'bronze',
        exportData.finishScores.bronze.home,
        exportData.finishScores.bronze.away,
      );
      imported++;
    }

    for (const [betKey, value] of Object.entries(exportData.specials ?? {})) {
      await upsertSpecialBet(db, prediction.id, betKey, value);
      imported++;
    }

    await rescoreAfterEdit(prediction.id, poolId, effectiveUserId, tournamentDef, actual);

    if (isOwnerEdit) {
      revalidatePath(`/pools/${poolId}/members/${targetUserId}`);
      revalidatePath(`/pools/${poolId}/predict`);
    } else {
      revalidatePath(`/pools/${poolId}/predict`);
    }

    return { ok: true, imported, skipped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Clear all predictions (own card)
// ---------------------------------------------------------------------------

const ClearAllPredictionsSchema = z.object({ poolId: z.string() });

export async function clearAllPredictions(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ClearAllPredictionsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId } = parsed.data;

  try {
    // Stage 1 (parallel): actor + pool + actual results
    const [actor, { pool, tournament, actual }] = await Promise.all([
      getCurrentActor(),
      loadPoolTournamentAndActual(poolId),
    ]);
    if (!actor) throw new Error('Not signed in');
    const { userId } = actor;

    await assertCanEditOwnCard(db, {
      actor: { userId },
      pool: { id: pool.id, ownerId: pool.ownerId },
      lockTime: tournament.firstKickoff,
      now: new Date(),
    });

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: pool.tournamentId,
    });

    await clearPredictionInputs(db, prediction.id);
    await rescoreAfterEdit(prediction.id, poolId, userId, tournament.definition!, actual);

    revalidatePath(`/pools/${poolId}/predict`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
