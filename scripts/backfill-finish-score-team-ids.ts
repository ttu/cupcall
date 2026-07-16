/**
 * scripts/backfill-finish-score-team-ids.ts — one-time backfill
 *
 * CLI: pnpm backfill-finish-score-team-ids -- <tournamentId>
 *
 * Fills in the home/away team-id snapshot (added by migration 0008) for every existing
 * final/bronze finish-score row that predates it, using each prediction's currently-derived
 * finalist/bronze pair — the same derivation the save-path uses for new rows.
 */
import { join } from 'node:path';
import pino from 'pino';
import { deriveCard, tournamentId as asTournamentId, type TeamId } from '@cup/engine';
import {
  createDb,
  type Db,
  getTournamentById,
  getPredictionInputs,
  getFinishScoresMissingTeamIds,
  setFinishScoreTeamIds,
} from '@cup/db';
import * as schema from '@cup/db/schema';

const logger = pino({ name: 'backfill-finish-score-team-ids' });

export async function backfillFinishScoreTeamIds(
  db: Db<typeof schema>,
  tournamentId: ReturnType<typeof asTournamentId>,
): Promise<{ updated: number; skipped: number }> {
  const tournament = await getTournamentById(db, tournamentId);
  if (!tournament?.definition) {
    throw new Error(`Tournament ${tournamentId} has no definition loaded — run pnpm sync first.`);
  }
  const def = tournament.definition;

  const missing = await getFinishScoresMissingTeamIds(db, tournamentId);
  let updated = 0;
  let skipped = 0;

  for (const { predictionId, match } of missing) {
    const inputs = await getPredictionInputs(db, predictionId);
    const derived = deriveCard(inputs, def);
    const pair = match === 'final' ? derived.finalists : derived.bronzePair;
    if (pair.length < 2) {
      skipped++;
      continue;
    }
    const [homeTeamId, awayTeamId] = pair as [TeamId, TeamId];
    await setFinishScoreTeamIds(db, predictionId, match, homeTeamId, awayTeamId);
    updated++;
  }

  return { updated, skipped };
}

// ---- CLI entry point (runs only when this file is the Node entry, not when imported) ----

const isDirectlyExecuted =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('/scripts/backfill-finish-score-team-ids.ts') ||
    process.argv[1].endsWith('/scripts/backfill-finish-score-team-ids.js'));

if (isDirectlyExecuted) {
  if (!process.env['DATABASE_URL']) {
    const { existsSync, readFileSync: readEnv } = await import('node:fs');
    const envPath = join(process.cwd(), 'apps', 'web', '.env.local');
    if (existsSync(envPath)) {
      for (const line of readEnv(envPath, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (key && !(key in process.env)) process.env[key] = val;
      }
    }
  }

  const args = process.argv.slice(2).filter((a) => a !== '--');
  const tournamentIdArg = args[0];
  if (!tournamentIdArg) {
    process.stderr.write('Usage: pnpm backfill-finish-score-team-ids -- <tournamentId>\n');
    process.exit(1);
  }

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    process.stderr.write(
      'DATABASE_URL is not set. Add it to apps/web/.env.local or export it in your shell.\n',
    );
    process.exit(1);
  }

  const db = createDb(databaseUrl, schema);

  backfillFinishScoreTeamIds(db, asTournamentId(tournamentIdArg))
    .then(({ updated, skipped }) => {
      logger.info({ tournamentIdArg, updated, skipped }, 'backfill complete');
      process.exit(0);
    })
    .catch((err: unknown) => {
      logger.error(err, 'backfill failed');
      process.exit(1);
    });
}
