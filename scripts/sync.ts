/**
 * scripts/sync.ts — data-as-code sync pipeline (Plan 3)
 *
 * CLI: pnpm sync -- <tournamentId>
 *
 * Reads data/tournaments/<id>/{tournament.json,results.json}, validates them,
 * upserts the tournament definition and results into the DB, then rescores
 * every card for that tournament.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import pino from 'pino';
import { tournamentSchema, resultsSchema } from '@cup/schemas';
import { deriveCard, scoreCard, deriveGroupOrders } from '@cup/engine';
import type { GroupId, TeamId } from '@cup/engine';
import {
  createDb,
  type Db,
  upsertScore,
  upsertTournamentDef,
  upsertTournamentResults,
  listPredictionsForTournament,
  getPredictionInputs,
} from '@cup/db';
import * as schema from '@cup/db/schema';

const logger = pino({ name: 'sync' });

/**
 * Lightweight schema that extracts the fields `tournamentSchema` intentionally strips:
 * `firstKickoff` (used for lock-time) and per-match `kickoff` times.
 */
const rawTournamentMetaSchema = z
  .object({
    firstKickoff: z.string().datetime(),
    groupMatches: z
      .array(z.object({ id: z.string(), kickoff: z.string().datetime().optional() }))
      .optional(),
  })
  .passthrough();

/**
 * Core sync logic — separated from CLI wiring so integration tests can call it directly
 * with a pre-built database handle (e.g. a pglite test db).
 */
export async function syncTournament(
  db: Db<typeof schema>,
  tournamentId: string,
  dataDir: string,
): Promise<{ scored: number }> {
  // 1. Read files
  const tournamentRaw: unknown = JSON.parse(
    readFileSync(join(dataDir, 'tournament.json'), 'utf-8'),
  );
  const resultsRaw: unknown = JSON.parse(readFileSync(join(dataDir, 'results.json'), 'utf-8'));

  // 2. Validate — the canonical engine types
  const tournament = tournamentSchema.parse(tournamentRaw);
  const actual = resultsSchema.parse(resultsRaw);

  // 3. Extract metadata stripped by tournamentSchema (firstKickoff, per-match kickoffs)
  const rawMeta = rawTournamentMetaSchema.parse(tournamentRaw);
  const firstKickoff = new Date(rawMeta.firstKickoff);
  const matchKickoffs = new Map<string, Date | null>(
    (rawMeta.groupMatches ?? []).map((m) => [
      m.id,
      m.kickoff !== undefined ? new Date(m.kickoff) : null,
    ]),
  );

  // 4. Derive actual group orders from match results; explicit overrides take precedence
  const derivedGroupOrders = deriveGroupOrders(tournament, actual.matchResults);
  const mergedGroupOrder: Record<GroupId, TeamId[]> = {
    ...(derivedGroupOrders as Record<GroupId, TeamId[]>),
    ...actual.groupOrder,
  };
  const mergedActual = { ...actual, groupOrder: mergedGroupOrder };

  logger.info({ tournamentId }, 'upserting tournament definition');
  await upsertTournamentDef(db, tournament, firstKickoff, matchKickoffs);

  logger.info({ tournamentId }, 'upserting tournament results');
  await upsertTournamentResults(db, tournamentId, mergedActual);

  // 5. Rescore all cards
  const predictions = await listPredictionsForTournament(db, tournamentId);
  logger.info({ tournamentId, count: predictions.length }, 'rescoring cards');

  let scored = 0;
  let skipped = 0;
  for (const { predictionId, poolId, userId } of predictions) {
    const inputs = await getPredictionInputs(db, predictionId);
    try {
      const derived = deriveCard(inputs, tournament);
      const breakdown = scoreCard(derived, inputs, mergedActual, tournament.scoring);
      await upsertScore(db, { poolId, userId, pointsTotal: breakdown.total, breakdown });
      scored++;
    } catch (err) {
      // Incomplete prediction (e.g. missing knockout picks) — log and continue.
      logger.warn({ predictionId, err }, 'skipping incomplete prediction during rescore');
      skipped++;
    }
  }
  if (skipped > 0) {
    logger.warn({ tournamentId, skipped }, 'some predictions were skipped due to errors');
  }

  logger.info({ tournamentId, scored }, 'sync complete');
  return { scored };
}

// ---- CLI entry point (runs only when this file is the Node entry, not when imported) ----

// In ESM, `import.meta.url` resolves to file://.../sync.ts and process.argv[1] to the
// executed file path. tsx passes the original TS path, so we compare by filename.
const isDirectlyExecuted =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('/scripts/sync.ts') || process.argv[1].endsWith('/scripts/sync.js'));

if (isDirectlyExecuted) {
  // Auto-load apps/web/.env.local when DATABASE_URL is not already set.
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

  // Skip the pnpm '--' separator so both `pnpm sync -- id` and `pnpm sync id` work.
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const tournamentId = args[0];

  if (!tournamentId) {
    process.stderr.write('Usage: pnpm sync -- <tournamentId>\n');
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
  const dataDir = join(process.cwd(), 'data', 'tournaments', tournamentId);

  syncTournament(db, tournamentId, dataDir).catch((err: unknown) => {
    logger.error(err, 'sync failed');
    process.exit(1);
  });
}
