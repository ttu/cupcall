'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/shared/db';
import { getCurrentActor } from '@/features/auth';
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
  deleteKnockoutPicks,
  getTournamentById,
} from '@cup/db';
import { bracketMatchKey as bmk } from '@cup/engine';
import type { BracketMatchKey, MatchId, TeamId } from '@cup/engine';
import { rescoreCard } from '../application/rescore';
import { loadActualResults } from '../application/load-actual-results';

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

async function getActorOrThrow() {
  const actor = await getCurrentActor();
  if (!actor) throw new Error('Not signed in');
  return actor;
}

async function rescoreAfterEdit(
  predictionId: string,
  poolId: string,
  userId: string,
  tournamentDef: import('@cup/engine').Tournament,
) {
  const actual = await loadActualResults(db, tournamentDef.id);
  await rescoreCard({
    db,
    predictionId,
    poolId,
    userId,
    tournament: tournamentDef,
    actual,
  });
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
    const { userId } = await getActorOrThrow();
    const { pool, tournament } = await loadPoolAndTournament(poolId);

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

    await upsertGroupScore(db, prediction.id, mId, home, away);
    await rescoreAfterEdit(prediction.id, poolId, userId, tournament.definition!);

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
    const { userId } = await getActorOrThrow();
    const { pool, tournament } = await loadPoolAndTournament(poolId);

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

    await upsertKnockoutPick(db, prediction.id, bmk(key) as BracketMatchKey, winner);
    await rescoreAfterEdit(prediction.id, poolId, userId, tournament.definition!);

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
    const { userId } = await getActorOrThrow();
    const { pool, tournament } = await loadPoolAndTournament(poolId);

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

    await upsertFinishScore(db, prediction.id, match, home, away);
    await rescoreAfterEdit(prediction.id, poolId, userId, tournament.definition!);

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
    const { userId } = await getActorOrThrow();
    const { pool, tournament } = await loadPoolAndTournament(poolId);

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

    await upsertSpecialBet(db, prediction.id, betKey, value);
    await rescoreAfterEdit(prediction.id, poolId, userId, tournament.definition!);

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
  const { poolId, targetUserId, matchId: mId, home, away, reason } = parsed.data;

  try {
    const { userId: editorId } = await getActorOrThrow();
    const { pool, tournament } = await loadPoolAndTournament(poolId);

    assertCanOwnerEdit({ userId: editorId }, { id: pool.id, ownerId: pool.ownerId });

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId: targetUserId as import('@cup/engine').UserId,
      tournamentId: pool.tournamentId,
    });

    // Capture old value for audit
    const { getPredictionInputs } = await import('@cup/db');
    const oldInputs = await getPredictionInputs(db, prediction.id);
    const oldScore = oldInputs.groupScores.find((gs) => gs.matchId === mId);

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
    await rescoreAfterEdit(prediction.id, poolId, targetUserId, tournament.definition!);

    revalidatePath(`/pools/${poolId}/members/${targetUserId}`);
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
  const { poolId, targetUserId, betKey, value, reason } = parsed.data;

  try {
    const { userId: editorId } = await getActorOrThrow();
    const { pool, tournament } = await loadPoolAndTournament(poolId);

    assertCanOwnerEdit({ userId: editorId }, { id: pool.id, ownerId: pool.ownerId });

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId: targetUserId as import('@cup/engine').UserId,
      tournamentId: pool.tournamentId,
    });

    const { getPredictionInputs } = await import('@cup/db');
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
    await rescoreAfterEdit(prediction.id, poolId, targetUserId, tournament.definition!);

    revalidatePath(`/pools/${poolId}/members/${targetUserId}`);
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
  const { poolId, targetUserId, bracketMatchKey: key, winner, reason } = parsed.data;

  try {
    const { userId: editorId } = await getActorOrThrow();
    const { pool, tournament } = await loadPoolAndTournament(poolId);

    assertCanOwnerEdit({ userId: editorId }, { id: pool.id, ownerId: pool.ownerId });

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId: targetUserId as import('@cup/engine').UserId,
      tournamentId: pool.tournamentId,
    });

    await upsertKnockoutPick(db, prediction.id, bmk(key) as BracketMatchKey, winner);
    await createPredictionEdit(db, {
      predictionId: prediction.id,
      editorUserId: editorId,
      fieldPath: `knockoutPicks.${key}`,
      oldValue: null,
      newValue: winner,
      ...(reason !== undefined ? { reason } : {}),
      source: 'manual',
    });
    await rescoreAfterEdit(prediction.id, poolId, targetUserId, tournament.definition!);

    revalidatePath(`/pools/${poolId}/members/${targetUserId}`);
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
  const { poolId, targetUserId, match, home, away, reason } = parsed.data;

  try {
    const { userId: editorId } = await getActorOrThrow();
    const { pool, tournament } = await loadPoolAndTournament(poolId);

    assertCanOwnerEdit({ userId: editorId }, { id: pool.id, ownerId: pool.ownerId });

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId: targetUserId as import('@cup/engine').UserId,
      tournamentId: pool.tournamentId,
    });

    await upsertFinishScore(db, prediction.id, match, home, away);
    await createPredictionEdit(db, {
      predictionId: prediction.id,
      editorUserId: editorId,
      fieldPath: `finishScores.${match}`,
      oldValue: null,
      newValue: { home, away },
      ...(reason !== undefined ? { reason } : {}),
      source: 'manual',
    });
    await rescoreAfterEdit(prediction.id, poolId, targetUserId, tournament.definition!);

    revalidatePath(`/pools/${poolId}/members/${targetUserId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Export card
// ---------------------------------------------------------------------------

const ExportCardSchema = z.object({ poolId: z.string() });

export async function exportCard(
  raw: unknown,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const parsed = ExportCardSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId } = parsed.data;

  try {
    const { userId } = await getActorOrThrow();
    const { pool } = await loadPoolAndTournament(poolId);
    const prediction = await getPrediction(db, poolId, userId);
    if (!prediction) return { ok: false, error: 'No prediction found for this pool' };

    const { getPredictionInputs } = await import('@cup/db');
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
    const { userId: actorId } = await getActorOrThrow();
    const { pool, tournament } = await loadPoolAndTournament(poolId);
    const tournamentDef = tournament.definition!;

    if (exportData.tournamentId !== pool.tournamentId) {
      return {
        ok: false,
        error: `Export is for tournament "${exportData.tournamentId}" but pool is for "${pool.tournamentId}"`,
      };
    }

    const isOwner = actorId === pool.ownerId;
    const effectiveUserId =
      isOwner && targetUserId ? (targetUserId as import('@cup/engine').UserId) : actorId;
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

    await rescoreAfterEdit(prediction.id, poolId, effectiveUserId, tournamentDef);

    const revalidateTarget = isOwnerEdit
      ? `/pools/${poolId}/members/${targetUserId}`
      : `/pools/${poolId}/predict`;
    revalidatePath(revalidateTarget);

    return { ok: true, imported, skipped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
