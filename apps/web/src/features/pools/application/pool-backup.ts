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
  isMember,
  createGuestUser,
  createPredictionEdit,
} from '@cup/db';
import type {
  UserId,
  BracketMatchKey,
  MatchId,
  TeamId,
  PoolId,
  Tournament,
  TournamentId,
  PredictionId,
} from '@cup/engine';
import { userId as toUserId, bracketMatchKey as bmk, SPECIAL_BET_KINDS } from '@cup/engine';
import type { BetInputKind } from '@cup/engine';
import type { AppSchema } from '@/shared/db';
import { serializePredictionInputs } from '@/features/predictions';

// ---------------------------------------------------------------------------
// Special bets — a discriminated shape built from the known bet keys, instead of an
// unrestricted z.record(z.unknown()), so a backup file cannot inject arbitrary keys or
// mistyped values into predictionSpecials.
// ---------------------------------------------------------------------------

const BET_KIND_SCHEMA: Record<BetInputKind, z.ZodTypeAny> = {
  player: z.string(),
  team: z.string(),
  number: z.number(),
  bool: z.boolean(),
};

const specialBetsShape = Object.fromEntries(
  Object.entries(SPECIAL_BET_KINDS).map(([key, kind]) => [key, BET_KIND_SCHEMA[kind].optional()]),
);

const SpecialBetsBackupSchema = z.object(specialBetsShape).strict().default({});

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
    specials: SpecialBetsBackupSchema,
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

/**
 * Resolves the userId to restore a backup member under: reuses `member.userId` only if that
 * account is already a member of the target pool; otherwise creates a fresh guest. A backup
 * file must never be able to pull an arbitrary global user id into pool membership just
 * because the id happens to match — anyone not already in this pool is restored as a new
 * guest, even if `member.userId` collides with a real, unrelated account.
 */
async function resolveTargetUserId(
  db: Db<AppSchema>,
  poolId: PoolId,
  member: MemberBackup,
): Promise<UserId> {
  const candidateUserId = toUserId(member.userId);
  if (await isMember(db, poolId, candidateUserId)) return candidateUserId;
  const guest = await createGuestUser(db, { displayName: member.displayName });
  return guest.id;
}

type TournamentValidationSets = {
  matchIds: Set<MatchId>;
  teamIds: Set<TeamId>;
  bracketKeys: Set<BracketMatchKey>;
};

/**
 * Writes one member's group scores, knockout picks, finish scores, and special bets, skipping
 * any group score / knockout pick that doesn't validate against the tournament definition.
 */
async function restoreMemberPrediction(
  db: Db<AppSchema>,
  predictionId: PredictionId,
  pred: MemberBackup['prediction'],
  sets: TournamentValidationSets,
): Promise<void> {
  for (const gs of pred.groupScores) {
    if (!sets.matchIds.has(gs.matchId as MatchId)) continue;
    await upsertGroupScore(db, predictionId, gs.matchId, gs.home, gs.away);
  }
  for (const kp of pred.knockoutPicks) {
    if (!sets.bracketKeys.has(kp.bracketMatchKey as BracketMatchKey)) continue;
    if (!sets.teamIds.has(kp.winner as TeamId)) continue;
    await upsertKnockoutPick(
      db,
      predictionId,
      bmk(kp.bracketMatchKey) as BracketMatchKey,
      kp.winner,
    );
  }
  if (pred.finishScores.final) {
    await upsertFinishScore(
      db,
      predictionId,
      'final',
      pred.finishScores.final.home,
      pred.finishScores.final.away,
    );
  }
  if (pred.finishScores.bronze) {
    await upsertFinishScore(
      db,
      predictionId,
      'bronze',
      pred.finishScores.bronze.home,
      pred.finishScores.bronze.away,
    );
  }
  for (const [betKey, value] of Object.entries(pred.specials)) {
    await upsertSpecialBet(db, predictionId, betKey, value);
  }
}

export async function restorePoolFromBackup(
  db: Db<AppSchema>,
  poolId: PoolId,
  tournamentId: TournamentId,
  tournamentDef: Tournament,
  backup: PoolBackup,
  restoredByUserId: UserId,
): Promise<RestoreResult> {
  const restoredPredictions: RestoredPrediction[] = [];

  // Validate group scores / knockout picks against the tournament definition so a crafted
  // or stale backup can't write scores for matches or teams that don't exist.
  const validationSets: TournamentValidationSets = {
    matchIds: new Set(tournamentDef.groupMatches.map((m) => m.id)),
    teamIds: new Set(tournamentDef.teams.map((t) => t.id)),
    bracketKeys: new Set([
      ...tournamentDef.bracket.slots.map((s) => s.match),
      ...tournamentDef.bracket.progression.map((p) => p.match),
    ]),
  };

  for (const member of backup.members) {
    const targetUserId = await resolveTargetUserId(db, poolId, member);
    await addMember(db, poolId, targetUserId);

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId: targetUserId,
      tournamentId,
    });
    await clearPredictionInputs(db, prediction.id);

    await restoreMemberPrediction(db, prediction.id, member.prediction, validationSets);

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
