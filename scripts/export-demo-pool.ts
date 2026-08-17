/**
 * scripts/export-demo-pool.ts — one-time, read-only extraction of the real production pool's
 * predictions, anonymized, into data/demo/demo-pool-backup.json (committed, reused unchanged by
 * seed-demo.ts across all three demo checkpoints).
 *
 * Deliberately reimplements the small amount of logic pool-backup.ts's buildPoolExport /
 * serializePredictionInputs provide, using only @cup/db — see the demo-mode implementation plan's
 * Global Constraints for why scripts/ cannot import
 * apps/web/src/features/pools/application/pool-backup.ts directly.
 *
 * Usage: DATABASE_URL=<production-url> pnpm export:demo-pool
 */
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import pino from 'pino';
import { createDb, getPoolById, getLeaderboard, getPrediction, getPredictionInputs } from '@cup/db';
import * as schema from '@cup/db/schema';
import type { Db } from '@cup/db';
import { poolId as asPoolId } from '@cup/engine';
import type { PoolId, UserId } from '@cup/engine';
import { loadLocalEnv } from './load-local-env';
import { demoBackupSchema, type DemoBackup, type DemoBackupMember } from './demo-backup-schema';

const SOURCE_POOL_ID = asPoolId('f20e59af-63e8-4389-b101-8e5cf84656a1');

const logger = pino({ name: 'export-demo-pool', level: 'info' });

export const DEMO_NICKNAMES = [
  'El Nino',
  'Falcon9',
  'OffsideOllie',
  'TikiTaka',
  'GoalGetter',
  'NetBuster',
  'CornerKick',
  'PitchPanther',
  'ExtraTimeEddie',
  'LastManStanding',
  'VAR Whisperer',
] as const;

/**
 * Replaces each member's real userId/displayName with a synthetic id ("demo-user-N") and a
 * football-themed nickname, assigned in the members array's existing order (leaderboard order —
 * pointsTotal DESC, displayName ASC). Real ids/names never appear in the output.
 */
export function anonymizeMembers(members: DemoBackupMember[]): DemoBackupMember[] {
  if (members.length > DEMO_NICKNAMES.length) {
    throw new Error(
      `anonymizeMembers: ${members.length} members exceeds ${DEMO_NICKNAMES.length} available nicknames`,
    );
  }
  return members.map((m, i) => ({
    ...m,
    userId: `demo-user-${i + 1}`,
    displayName: DEMO_NICKNAMES[i]!,
  }));
}

async function fetchMemberBackup(
  db: Db<typeof schema>,
  poolId: PoolId,
  entry: { userId: UserId; displayName: string },
): Promise<DemoBackupMember> {
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
    prediction: {
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
      specials: inputs.specials as Record<string, string | number | boolean>,
    },
  };
}

export async function buildDemoPoolBackup(
  db: Db<typeof schema>,
  poolId: PoolId,
): Promise<DemoBackup> {
  const pool = await getPoolById(db, poolId);
  if (!pool) throw new Error(`export-demo-pool: pool ${poolId} not found`);

  const leaderboard = await getLeaderboard(db, poolId);
  const rawMembers = await Promise.all(
    leaderboard.map((entry) => fetchMemberBackup(db, poolId, entry)),
  );

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    tournamentId: pool.tournamentId,
    poolName: 'WC 2026 Demo Source',
    members: anonymizeMembers(rawMembers),
  };
}

// ---- CLI entry point ----

const isDirectlyExecuted =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('/scripts/export-demo-pool.ts') ||
    process.argv[1].endsWith('/scripts/export-demo-pool.js'));

if (isDirectlyExecuted) {
  loadLocalEnv();

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    process.stderr.write('DATABASE_URL is not set.\n');
    process.exit(1);
  }

  const db = createDb(databaseUrl, schema);
  buildDemoPoolBackup(db, SOURCE_POOL_ID)
    .then((backup) => {
      const validated = demoBackupSchema.parse(backup);
      const outPath = join(process.cwd(), 'data', 'demo', 'demo-pool-backup.json');
      writeFileSync(outPath, JSON.stringify(validated, null, 2) + '\n');
      logger.info(
        { outPath, members: validated.members.length },
        'wrote anonymized demo pool backup',
      );
      process.exit(0);
    })
    .catch((err: unknown) => {
      logger.error(err, 'export-demo-pool failed');
      process.exit(1);
    });
}
