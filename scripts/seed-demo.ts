/**
 * scripts/seed-demo.ts — seeds the three static demo pools (wc-2026-demo-groups/-knockout/-completed)
 * from the fixtures generate-demo-fixtures.ts generates and the anonymized backup
 * export-demo-pool.ts extracts. Not run automatically — a deliberate `pnpm seed:demo` you run
 * yourself, same trust boundary as any other prod-writing script in this repo. Idempotent: reruns
 * wipe and recreate each demo pool by its fixed view token, rather than duplicating it.
 *
 * Usage: pnpm seed:demo
 */
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import pino from 'pino';
import { createDb } from '@cup/db';
import * as schema from '@cup/db/schema';
import {
  createGuestUser,
  createPool,
  addMember,
  rotateViewToken,
  getPoolByViewToken,
  listMembers,
  deletePool,
  deleteUser,
  getTournamentById,
  getOrCreatePrediction,
  clearPredictionInputs,
  upsertGroupScore,
  upsertKnockoutPick,
  upsertFinishScore,
  upsertSpecialBet,
  createPredictionEdit,
} from '@cup/db';
import type { Db } from '@cup/db';
import { tournamentId as asTournamentId, bracketMatchKey as bmk } from '@cup/engine';
import type {
  Tournament,
  PoolId,
  TournamentId,
  UserId,
  MatchId,
  TeamId,
  BracketMatchKey,
} from '@cup/engine';
import { syncTournament } from './sync';
import { loadLocalEnv } from './load-local-env';
import { demoBackupSchema, type DemoBackup, type DemoBackupMember } from './demo-backup-schema';

const logger = pino({ name: 'seed-demo', level: 'info' });

export type DemoCheckpoint = {
  tournamentId: TournamentId;
  dataDir: string;
  viewToken: string;
  poolName: string;
};

/** If a demo pool already occupies this view token for the expected tournament, delete it and its member accounts. */
async function resetExistingDemoPool(
  db: Db<typeof schema>,
  viewToken: string,
  expectedTournamentId: TournamentId,
): Promise<void> {
  const existing = await getPoolByViewToken(db, viewToken);
  if (!existing) return;
  if (existing.tournamentId !== expectedTournamentId) return;

  const memberUserIds = (await listMembers(db, existing.id)).map((m) => m.userId);
  await deletePool(db, existing.id); // cascades poolMembers/predictions/scores for this pool

  const staleUserIds = new Set([...memberUserIds, existing.ownerId]);
  for (const uid of staleUserIds) {
    await deleteUser(db, uid);
  }
}

async function restoreDemoMember(
  db: Db<typeof schema>,
  poolId: PoolId,
  tournamentId: TournamentId,
  tournament: Tournament,
  hostUserId: UserId,
  member: DemoBackupMember,
  existingUserId?: UserId,
): Promise<void> {
  const matchIds = new Set(tournament.groupMatches.map((m) => m.id));
  const teamIds = new Set(tournament.teams.map((t) => t.id));
  const bracketKeys = new Set([
    ...tournament.bracket.slots.map((s) => s.match),
    ...tournament.bracket.progression.map((p) => p.match),
  ]);

  let guestId: UserId;
  if (existingUserId) {
    guestId = existingUserId;
  } else {
    const guest = await createGuestUser(db, { displayName: member.displayName });
    await addMember(db, poolId, guest.id);
    guestId = guest.id;
  }

  const prediction = await getOrCreatePrediction(db, { poolId, userId: guestId, tournamentId });
  await clearPredictionInputs(db, prediction.id);

  for (const gs of member.prediction.groupScores) {
    if (!matchIds.has(gs.matchId as MatchId)) continue;
    await upsertGroupScore(db, prediction.id, gs.matchId, gs.home, gs.away);
  }
  for (const kp of member.prediction.knockoutPicks) {
    if (!bracketKeys.has(kp.bracketMatchKey as BracketMatchKey)) continue;
    if (!teamIds.has(kp.winner as TeamId)) continue;
    await upsertKnockoutPick(db, prediction.id, bmk(kp.bracketMatchKey), kp.winner);
  }
  if (member.prediction.finishScores.final) {
    await upsertFinishScore(
      db,
      prediction.id,
      'final',
      member.prediction.finishScores.final.home,
      member.prediction.finishScores.final.away,
    );
  }
  if (member.prediction.finishScores.bronze) {
    await upsertFinishScore(
      db,
      prediction.id,
      'bronze',
      member.prediction.finishScores.bronze.home,
      member.prediction.finishScores.bronze.away,
    );
  }
  for (const [betKey, value] of Object.entries(member.prediction.specials)) {
    await upsertSpecialBet(db, prediction.id, betKey, value);
  }

  await createPredictionEdit(db, {
    predictionId: prediction.id,
    editorUserId: hostUserId,
    fieldPath: 'pool.backup.restore',
    oldValue: null,
    newValue: { source: 'demo-seed', originalUserId: member.userId },
    source: 'import',
  });
}

export async function seedDemoCheckpoint(
  db: Db<typeof schema>,
  checkpoint: DemoCheckpoint,
  backup: DemoBackup,
): Promise<{ poolId: PoolId }> {
  await syncTournament(db, checkpoint.tournamentId, checkpoint.dataDir);
  await resetExistingDemoPool(db, checkpoint.viewToken, checkpoint.tournamentId);

  const [hostMember, ...otherMembers] = backup.members;
  if (!hostMember) {
    throw new Error(`seed-demo: backup for ${checkpoint.tournamentId} has no members`);
  }
  const host = await createGuestUser(db, { displayName: hostMember.displayName });
  const pool = await createPool(db, {
    tournamentId: checkpoint.tournamentId,
    ownerId: host.id,
    name: checkpoint.poolName,
  });
  await rotateViewToken(db, pool.id, checkpoint.viewToken);
  await addMember(db, pool.id, host.id);

  const tournamentRow = await getTournamentById(db, checkpoint.tournamentId);
  if (!tournamentRow?.definition) {
    throw new Error(`seed-demo: tournament definition missing for ${checkpoint.tournamentId}`);
  }

  // Restore the host member's predictions onto the already-created host account.
  await restoreDemoMember(
    db,
    pool.id,
    checkpoint.tournamentId,
    tournamentRow.definition,
    host.id,
    hostMember,
    host.id,
  );
  for (const member of otherMembers) {
    await restoreDemoMember(
      db,
      pool.id,
      checkpoint.tournamentId,
      tournamentRow.definition,
      host.id,
      member,
    );
  }

  // Rescore every restored prediction against this checkpoint's actual results (same
  // sync-again-after-restore pattern scripts/seed-e2e.ts uses).
  await syncTournament(db, checkpoint.tournamentId, checkpoint.dataDir);

  return { poolId: pool.id };
}

// ---- CLI entry point ----

const CHECKPOINTS: { id: string; viewToken: string; poolName: string }[] = [
  { id: 'wc-2026-demo-groups', viewToken: 'demo-groups', poolName: 'WC 2026 Demo — Group stage' },
  {
    id: 'wc-2026-demo-knockout',
    viewToken: 'demo-knockout',
    poolName: 'WC 2026 Demo — Knockout stage',
  },
  {
    id: 'wc-2026-demo-completed',
    viewToken: 'demo-completed',
    poolName: 'WC 2026 Demo — Completed',
  },
];

async function seedAllDemoCheckpoints(db: Db<typeof schema>): Promise<void> {
  const backupPath = join(process.cwd(), 'data', 'demo', 'demo-pool-backup.json');
  const backup = demoBackupSchema.parse(JSON.parse(readFileSync(backupPath, 'utf-8')));

  for (const cp of CHECKPOINTS) {
    const dataDir = join(process.cwd(), 'data', 'tournaments', cp.id);
    logger.info({ tournamentId: cp.id }, 'seeding demo checkpoint');
    const { poolId } = await seedDemoCheckpoint(
      db,
      {
        tournamentId: asTournamentId(cp.id),
        dataDir,
        viewToken: cp.viewToken,
        poolName: cp.poolName,
      },
      backup,
    );
    logger.info({ tournamentId: cp.id, poolId, viewToken: cp.viewToken }, 'demo checkpoint seeded');
  }
}

const isDirectlyExecuted =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('/scripts/seed-demo.ts') ||
    process.argv[1].endsWith('/scripts/seed-demo.js'));

if (isDirectlyExecuted) {
  loadLocalEnv();

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    process.stderr.write('DATABASE_URL is not set. Add it to apps/web/.env.local.\n');
    process.exit(1);
  }

  const db = createDb(databaseUrl, schema);
  seedAllDemoCheckpoints(db)
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      logger.error(err, 'seed-demo failed');
      process.exit(1);
    });
}
