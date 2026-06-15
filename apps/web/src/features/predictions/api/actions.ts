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
  poolId as asPoolId,
} from '@cup/engine';
import type {
  ActualResults,
  BracketMatchKey,
  CardInputs,
  MatchId,
  TeamId,
  Tournament,
  PoolId,
  PredictionId,
  UserId,
} from '@cup/engine';
import { rescoreAfterEdit } from './rescore-helper';
import { applyCardImport } from '../application/import-card';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Load pool, tournament, and assert pool/tournament exist. */
async function loadPoolAndTournament(poolId: PoolId) {
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

async function loadPoolTournamentAndActual(poolId: PoolId) {
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
  predictionId: PredictionId,
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
  predictionId: PredictionId,
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
  predictionId: PredictionId,
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
// Internal save-handler framework
// ---------------------------------------------------------------------------

type LoadedPool = NonNullable<Awaited<ReturnType<typeof getPoolById>>>;
type LoadedPrediction = Awaited<ReturnType<typeof getOrCreatePrediction>>;

/** Context passed to every doSave callback. */
type SaveCtx = {
  /** Already-validated tournament definition (non-null guaranteed by loadPoolTournamentAndActual). */
  tournamentDef: Tournament;
  actual: ActualResults;
  prediction: LoadedPrediction;
};

type AuditData = { fieldPath: string; oldValue: unknown; newValue: unknown };

/**
 * Shared scaffold for own-card saves:
 * auth → load → assertCanEditOwnCard → get/create prediction → doSave → rescore → revalidate.
 */
async function executeSelfSave(
  poolId: PoolId,
  getItemHasResult: (pool: LoadedPool, def: Tournament) => Promise<boolean>,
  doSave: (ctx: SaveCtx) => Promise<{ updatedInputs?: CardInputs }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const [actor, { pool, tournament, actual }] = await Promise.all([
      getCurrentActor(),
      loadPoolTournamentAndActual(poolId),
    ]);
    if (!actor) throw new Error('Not signed in');
    const tournamentDef = tournament.definition!;

    const itemHasResult = await getItemHasResult(pool, tournamentDef);
    await assertCanEditOwnCard(db, {
      actor: { userId: actor.userId },
      pool: { id: pool.id, ownerId: pool.ownerId },
      lockTime: tournament.firstKickoff,
      now: new Date(),
      itemHasResult,
    });

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId: actor.userId,
      tournamentId: pool.tournamentId,
    });

    const { updatedInputs } = await doSave({ tournamentDef, actual, prediction });

    await rescoreAfterEdit(
      prediction.id,
      poolId,
      actor.userId,
      tournamentDef,
      actual,
      updatedInputs,
    );
    revalidatePath(`/pools/${poolId}/predict`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

/**
 * Shared scaffold for owner-edit saves:
 * auth → load → assertCanOwnerEdit → get/create prediction → doSave → audit log → rescore → revalidate.
 */
async function executeOwnerSave(
  poolId: PoolId,
  targetUserId: UserId,
  reason: string | undefined,
  doSave: (ctx: SaveCtx) => Promise<{ audit: AuditData; updatedInputs?: CardInputs }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const [actor, { pool, tournament, actual }] = await Promise.all([
      getCurrentActor(),
      loadPoolTournamentAndActual(poolId),
    ]);
    if (!actor) throw new Error('Not signed in');
    const tournamentDef = tournament.definition!;
    const editorUserId = actor.userId;

    assertCanOwnerEdit({ userId: editorUserId }, { id: pool.id, ownerId: pool.ownerId });

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId: targetUserId,
      tournamentId: pool.tournamentId,
    });

    const { audit, updatedInputs } = await doSave({ tournamentDef, actual, prediction });

    await createPredictionEdit(db, {
      predictionId: prediction.id,
      editorUserId,
      fieldPath: audit.fieldPath,
      oldValue: audit.oldValue,
      newValue: audit.newValue,
      ...(reason !== undefined ? { reason } : {}),
      source: 'manual',
    });
    await rescoreAfterEdit(
      prediction.id,
      poolId,
      targetUserId,
      tournamentDef,
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
// Group score
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
  const { poolId: rawPoolId, matchId: mId, home, away } = parsed.data;

  return executeSelfSave(
    asPoolId(rawPoolId),
    (pool) => matchHasResult(db, pool.tournamentId, mId),
    async ({ tournamentDef, actual, prediction }) => {
      const inputs = await getPredictionInputs(db, prediction.id);
      await invalidatePicksAfterGroupScoreChange(
        prediction.id,
        mId,
        home,
        away,
        inputs,
        tournamentDef,
        actualGroupScoresMap(actual),
      );
      await upsertGroupScore(db, prediction.id, mId, home, away);
      const updatedInputs: CardInputs = {
        ...inputs,
        groupScores: [
          ...inputs.groupScores.filter((s) => s.matchId !== mId),
          { matchId: mId as MatchId, home, away },
        ],
      };
      return { updatedInputs };
    },
  );
}

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
  const {
    poolId: rawPoolId,
    targetUserId: rawTargetUserId,
    matchId: mId,
    home,
    away,
    reason,
  } = parsed.data;

  return executeOwnerSave(
    asPoolId(rawPoolId),
    userId(rawTargetUserId),
    reason,
    async ({ tournamentDef, actual, prediction }) => {
      const oldInputs = await getPredictionInputs(db, prediction.id);
      const oldScore = oldInputs.groupScores.find((gs) => gs.matchId === mId);
      await invalidatePicksAfterGroupScoreChange(
        prediction.id,
        mId,
        home,
        away,
        oldInputs,
        tournamentDef,
        actualGroupScoresMap(actual),
      );
      await upsertGroupScore(db, prediction.id, mId, home, away);
      const updatedInputs: CardInputs = {
        ...oldInputs,
        groupScores: [
          ...oldInputs.groupScores.filter((s) => s.matchId !== mId),
          { matchId: mId as MatchId, home, away },
        ],
      };
      return {
        audit: {
          fieldPath: `groupScores.${mId}`,
          oldValue: oldScore ? { home: oldScore.home, away: oldScore.away } : null,
          newValue: { home, away },
        },
        updatedInputs,
      };
    },
  );
}

// ---------------------------------------------------------------------------
// Knockout pick
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
  const { poolId: rawPoolId, bracketMatchKey: key, winner } = parsed.data;

  return executeSelfSave(
    asPoolId(rawPoolId),
    // bracketMatchKey IS the match id in the matches table (e.g. "qf-1", "final")
    (pool) => matchHasResult(db, pool.tournamentId, key),
    async ({ tournamentDef, actual, prediction }) => {
      await upsertKnockoutPick(db, prediction.id, bmk(key) as BracketMatchKey, winner);
      const updatedInputs = await getPredictionInputs(db, prediction.id);
      await invalidatePicksAfterKnockoutPickChange(
        prediction.id,
        updatedInputs,
        tournamentDef,
        actualGroupScoresMap(actual),
      );
      return { updatedInputs };
    },
  );
}

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
    poolId: rawPoolId,
    targetUserId: rawTargetUserId,
    bracketMatchKey: key,
    winner,
    reason,
  } = parsed.data;

  return executeOwnerSave(
    asPoolId(rawPoolId),
    userId(rawTargetUserId),
    reason,
    async ({ tournamentDef, actual, prediction }) => {
      await upsertKnockoutPick(db, prediction.id, bmk(key) as BracketMatchKey, winner);
      const updatedInputs = await getPredictionInputs(db, prediction.id);
      await invalidatePicksAfterKnockoutPickChange(
        prediction.id,
        updatedInputs,
        tournamentDef,
        actualGroupScoresMap(actual),
      );
      return {
        audit: { fieldPath: `knockoutPicks.${key}`, oldValue: null, newValue: winner },
        updatedInputs,
      };
    },
  );
}

// ---------------------------------------------------------------------------
// Finish score (final / bronze)
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
  const { poolId: rawPoolId, match, home, away } = parsed.data;

  return executeSelfSave(
    asPoolId(rawPoolId),
    (pool, def) => {
      const matchKey = match === 'final' ? def.bracket.finalMatch : def.bracket.bronzeMatch;
      return matchHasResult(db, pool.tournamentId, matchKey);
    },
    async ({ tournamentDef, prediction }) => {
      await upsertFinishScore(db, prediction.id, match, home, away);
      const implicitWinner = await deriveFinishWinner(
        prediction.id,
        match,
        home,
        away,
        tournamentDef,
      );
      if (implicitWinner !== undefined) {
        const bracketKey =
          match === 'final' ? tournamentDef.bracket.finalMatch : tournamentDef.bracket.bronzeMatch;
        await upsertKnockoutPick(db, prediction.id, bracketKey, implicitWinner);
      }
      return {};
    },
  );
}

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
  const {
    poolId: rawPoolId,
    targetUserId: rawTargetUserId,
    match,
    home,
    away,
    reason,
  } = parsed.data;

  return executeOwnerSave(
    asPoolId(rawPoolId),
    userId(rawTargetUserId),
    reason,
    async ({ tournamentDef, prediction }) => {
      await upsertFinishScore(db, prediction.id, match, home, away);
      const implicitWinner = await deriveFinishWinner(
        prediction.id,
        match,
        home,
        away,
        tournamentDef,
      );
      if (implicitWinner !== undefined) {
        const bracketKey =
          match === 'final' ? tournamentDef.bracket.finalMatch : tournamentDef.bracket.bronzeMatch;
        await upsertKnockoutPick(db, prediction.id, bracketKey, implicitWinner);
      }
      return {
        audit: { fieldPath: `finishScores.${match}`, oldValue: null, newValue: { home, away } },
      };
    },
  );
}

// ---------------------------------------------------------------------------
// Special bet
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
  const { poolId: rawPoolId, betKey, value } = parsed.data;

  return executeSelfSave(
    asPoolId(rawPoolId),
    (pool) => betKeyHasAnswer(db, pool.tournamentId, betKey),
    async ({ prediction }) => {
      await upsertSpecialBet(db, prediction.id, betKey, value);
      return {};
    },
  );
}

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
  const { poolId: rawPoolId, targetUserId: rawTargetUserId, betKey, value, reason } = parsed.data;

  return executeOwnerSave(
    asPoolId(rawPoolId),
    userId(rawTargetUserId),
    reason,
    async ({ prediction }) => {
      const oldInputs = await getPredictionInputs(db, prediction.id);
      const oldValue = (oldInputs.specials as Record<string, unknown>)[betKey] ?? null;
      await upsertSpecialBet(db, prediction.id, betKey, value);
      return {
        audit: { fieldPath: `specials.${betKey}`, oldValue, newValue: value },
      };
    },
  );
}

// ---------------------------------------------------------------------------
// Export / import / clear
// ---------------------------------------------------------------------------

const ExportCardSchema = z.object({ poolId: z.string(), targetUserId: z.string().optional() });

export async function exportCard(
  raw: unknown,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const parsed = ExportCardSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId: rawPoolId9, targetUserId } = parsed.data;
  const poolId = asPoolId(rawPoolId9);

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
  const { poolId: rawPoolId10, targetUserId, exportData } = parsed.data;
  const poolId = asPoolId(rawPoolId10);

  try {
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

    const { imported, skipped } = await applyCardImport({
      db,
      predictionId: prediction.id,
      tournamentDef,
      exportData,
      isOwnerEdit,
      editorUserId: actorId,
    });

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

const ClearAllPredictionsSchema = z.object({ poolId: z.string() });

export async function clearAllPredictions(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ClearAllPredictionsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId: rawPoolId11 } = parsed.data;
  const poolId = asPoolId(rawPoolId11);

  try {
    const [actor, { pool, tournament, actual }] = await Promise.all([
      getCurrentActor(),
      loadPoolTournamentAndActual(poolId),
    ]);
    if (!actor) throw new Error('Not signed in');
    const { userId: actorUserId } = actor;

    await assertCanEditOwnCard(db, {
      actor: { userId: actorUserId },
      pool: { id: pool.id, ownerId: pool.ownerId },
      lockTime: tournament.firstKickoff,
      now: new Date(),
    });

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId: actorUserId,
      tournamentId: pool.tournamentId,
    });

    await clearPredictionInputs(db, prediction.id);
    await rescoreAfterEdit(prediction.id, poolId, actorUserId, tournament.definition!, actual);

    revalidatePath(`/pools/${poolId}/predict`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
