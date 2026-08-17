/**
 * scripts/demo-backup-schema.ts — shape shared by export-demo-pool.ts (writer) and
 * seed-demo.ts (reader) for data/demo/demo-pool-backup.json. Mirrors
 * apps/web/src/features/pools/application/pool-backup.ts's PoolBackupSchema shape, but defined
 * standalone here since scripts/ must not import from apps/web/src (see plan's Global
 * Constraints — that file transitively pulls in next-auth bindings unsafe to import from a bare
 * tsx process).
 */
import { z } from 'zod';

const specialValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const demoBackupMemberSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  prediction: z.object({
    groupScores: z.array(
      z.object({
        matchId: z.string(),
        home: z.number().int().min(0),
        away: z.number().int().min(0),
      }),
    ),
    knockoutPicks: z.array(z.object({ bracketMatchKey: z.string(), winner: z.string() })),
    finishScores: z.object({
      final: z.object({ home: z.number().int().min(0), away: z.number().int().min(0) }).optional(),
      bronze: z.object({ home: z.number().int().min(0), away: z.number().int().min(0) }).optional(),
    }),
    specials: z.record(z.string(), specialValueSchema),
  }),
});

export const demoBackupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  tournamentId: z.string(),
  poolName: z.string(),
  members: z.array(demoBackupMemberSchema).min(1),
});

export type DemoBackupMember = z.infer<typeof demoBackupMemberSchema>;
export type DemoBackup = z.infer<typeof demoBackupSchema>;
