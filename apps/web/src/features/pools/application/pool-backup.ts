import { z } from 'zod';
import type { Db } from '@cup/db';
import {
  getLeaderboard,
  getPrediction,
  getPredictionInputs,
  getOrCreatePrediction,
  clearPredictionInputs,
  upsertGroupScore,
  upsertKnockoutPick,
  upsertFinishScore,
  upsertSpecialBet,
  addMember,
  getUserById,
  createGuestUser,
  createPredictionEdit,
} from '@cup/db';
import type { UserId, BracketMatchKey, PoolId, TournamentId, PredictionId } from '@cup/engine';
import { userId as toUserId, bracketMatchKey as bmk } from '@cup/engine';
import type { AppSchema } from '@/shared/db';
import { serializePredictionInputs } from '@/features/predictions';

// ---------------------------------------------------------------------------
// Schemas (Zod) — used both for type derivation and for server-action validation
// ---------------------------------------------------------------------------

export const MemberBackupSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  prediction: z.object({
    groupScores: z
      .array(
        z.object({
          matchId: z.string(),
          home: z.number().int().min(0),
          away: z.number().int().min(0),
        }),
      )
      .default([]),
    knockoutPicks: z
      .array(z.object({ bracketMatchKey: z.string(), winner: z.string() }))
      .default([]),
    finishScores: z
      .object({
        final: z.object({ home: z.number(), away: z.number() }).optional(),
        bronze: z.object({ home: z.number(), away: z.number() }).optional(),
      })
      .default({}),
    specials: z.record(z.unknown()).default({}),
  }),
});

export const PoolBackupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  tournamentId: z.string(),
  poolName: z.string(),
  members: z.array(MemberBackupSchema),
});

export type MemberBackup = z.infer<typeof MemberBackupSchema>;
export type PoolBackup = z.infer<typeof PoolBackupSchema>;

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export async function buildPoolExport(
  db: Db<AppSchema>,
  poolId: PoolId,
  poolName: string,
  tournamentId: TournamentId,
): Promise<PoolBackup> {
  const leaderboard = await getLeaderboard(db, poolId);

  const members: MemberBackup[] = await Promise.all(
    leaderboard.map(async (entry) => {
      const prediction = await getPrediction(db, poolId, entry.userId);

      if (!prediction) {
        return {
          userId: entry.userId,
          displayName: entry.displayName,
          prediction: { groupScores: [], knockoutPicks: [], finishScores: {}, specials: {} },
        };
      }

      const inputs = await getPredictionInputs(db, prediction.id);
      return {
        userId: entry.userId,
        displayName: entry.displayName,
        prediction: serializePredictionInputs(inputs),
      };
    }),
  );

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tournamentId,
    poolName,
    members,
  };
}

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

export type RestoredPrediction = {
  predictionId: PredictionId;
  userId: UserId;
};

export type RestoreResult = {
  membersRestored: number;
  restoredPredictions: RestoredPrediction[];
};

export async function restorePoolFromBackup(
  db: Db<AppSchema>,
  poolId: PoolId,
  tournamentId: TournamentId,
  backup: PoolBackup,
  restoredByUserId: UserId,
): Promise<RestoreResult> {
  const restoredPredictions: RestoredPrediction[] = [];

  for (const member of backup.members) {
    const existing = await getUserById(db, toUserId(member.userId));
    const targetUserId = existing
      ? existing.id
      : (await createGuestUser(db, { displayName: member.displayName })).id;

    await addMember(db, poolId, targetUserId);

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId: targetUserId,
      tournamentId,
    });
    await clearPredictionInputs(db, prediction.id);

    const pred = member.prediction;

    for (const gs of pred.groupScores) {
      await upsertGroupScore(db, prediction.id, gs.matchId, gs.home, gs.away);
    }
    for (const kp of pred.knockoutPicks) {
      await upsertKnockoutPick(
        db,
        prediction.id,
        bmk(kp.bracketMatchKey) as BracketMatchKey,
        kp.winner,
      );
    }
    if (pred.finishScores.final) {
      await upsertFinishScore(
        db,
        prediction.id,
        'final',
        pred.finishScores.final.home,
        pred.finishScores.final.away,
      );
    }
    if (pred.finishScores.bronze) {
      await upsertFinishScore(
        db,
        prediction.id,
        'bronze',
        pred.finishScores.bronze.home,
        pred.finishScores.bronze.away,
      );
    }
    for (const [betKey, value] of Object.entries(pred.specials)) {
      await upsertSpecialBet(db, prediction.id, betKey, value);
    }

    await createPredictionEdit(db, {
      predictionId: prediction.id,
      editorUserId: restoredByUserId,
      fieldPath: 'pool.backup.restore',
      oldValue: null,
      newValue: { exportedAt: backup.exportedAt, originalUserId: member.userId },
      source: 'import',
    });

    restoredPredictions.push({ predictionId: prediction.id, userId: targetUserId });
  }

  return { membersRestored: backup.members.length, restoredPredictions };
}
