/**
 * scripts/seed-e2e.ts — seeds the two static e2e fixtures (e2e-open, e2e-seeded) plus a
 * 10-member pool with varied predictions under e2e-seeded, for Playwright's global-setup.
 *
 * Usage: pnpm seed:e2e
 */
import { join } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import pino from 'pino';
import { createDb } from '@cup/db';
import * as schema from '@cup/db/schema';
import {
  createGuestUser,
  upsertLoginToken,
  createPool,
  addMember,
  getOrCreatePrediction,
  upsertGroupScore,
  upsertKnockoutPick,
  upsertFinishScore,
  upsertSpecialBet,
} from '@cup/db';
import { tournamentId as asTournamentId } from '@cup/engine';
import type { Tournament } from '@cup/engine';
import { tournamentSchema } from '@cup/schemas';
import { syncTournament } from './sync';
import {
  mulberry32,
  generateGroupScores,
  generateBracketPicks,
  generateFinishScore,
  generateSpecials,
} from './e2e-seed/prediction-variety';

const OPEN_TOURNAMENT_ID = asTournamentId('e2e-open');
const SEEDED_TOURNAMENT_ID = asTournamentId('e2e-seeded');
// Literal values also hardcoded in apps/web/e2e/leaderboard.spec.ts, results.spec.ts, and
// late-joiner.spec.ts (Tasks 9-11) — not exported/imported across the scripts/apps boundary to
// avoid pulling @cup/db's createDb into the Playwright test process.
const SEEDED_OWNER_TOKEN = 'e2e-seeded-owner';
const SEEDED_LATE_JOINER_TOKEN = 'e2e-seeded-late-joiner';

const logger = pino({ name: 'seed-e2e', level: 'info' });

// Before e2e-seeded's firstKickoff (2000-01-01) — these members are NOT late joiners, so once
// the tournament is (permanently) in the past their card status is 'locked', not 'partial'.
const ON_TIME_JOINED_AT = new Date('1999-06-01T00:00:00Z');

const ON_TIME_DISPLAY_NAMES = ['Amara', 'Bilal', 'Chloe', 'Dmitri', 'Elena', 'Farid', 'Greta'];

async function seed(db: ReturnType<typeof createDb<typeof schema>>): Promise<void> {
  const cwd = process.cwd();
  const openDir = join(cwd, 'data', 'tournaments', 'e2e-open');
  const seededDir = join(cwd, 'data', 'tournaments', 'e2e-seeded');

  logger.info('syncing e2e-open (never locks — backs the fill-in-predictions specs)');
  await syncTournament(db, OPEN_TOURNAMENT_ID, openDir);

  logger.info('syncing e2e-seeded (permanently locked, resolved through champion)');
  await syncTournament(db, SEEDED_TOURNAMENT_ID, seededDir);

  const tournamentRaw: unknown = JSON.parse(
    readFileSync(join(seededDir, 'tournament.json'), 'utf-8'),
  );
  const tournament: Tournament = tournamentSchema.parse(tournamentRaw);

  // Owner doubles as the leaderboard/results viewer (canViewCards = true as pool owner).
  const owner = await createGuestUser(db, { displayName: 'Pool Owner' });
  await upsertLoginToken(db, owner.id, SEEDED_OWNER_TOKEN);

  const pool = await createPool(db, {
    tournamentId: SEEDED_TOURNAMENT_ID,
    ownerId: owner.id,
    name: 'E2E Seeded Pool',
  });
  await addMember(db, pool.id, owner.id, ON_TIME_JOINED_AT);

  const onTimeUserIds = [owner.id];
  for (const displayName of ON_TIME_DISPLAY_NAMES) {
    const user = await createGuestUser(db, { displayName });
    await addMember(db, pool.id, user.id, ON_TIME_JOINED_AT);
    onTimeUserIds.push(user.id);
  }

  for (const [index, userId] of onTimeUserIds.entries()) {
    const rng = mulberry32(index + 1);
    const prediction = await getOrCreatePrediction(db, {
      poolId: pool.id,
      userId,
      tournamentId: SEEDED_TOURNAMENT_ID,
    });

    const groupScores = generateGroupScores(rng, tournament.groupMatches);
    for (const { matchId, home, away } of groupScores) {
      await upsertGroupScore(db, prediction.id, matchId, home, away);
    }

    const picks = generateBracketPicks(rng, tournament, groupScores);
    for (const p of picks) {
      await upsertKnockoutPick(db, prediction.id, p.bracketMatchKey, p.winner);
    }

    const finalPick = picks.find((p) => p.bracketMatchKey === tournament.bracket.finalMatch)!;
    const bronzePick = picks.find((p) => p.bracketMatchKey === tournament.bracket.bronzeMatch)!;
    const finalScore = generateFinishScore(rng, finalPick);
    const bronzeScore = generateFinishScore(rng, bronzePick);
    await upsertFinishScore(db, prediction.id, 'final', finalScore.home, finalScore.away);
    await upsertFinishScore(db, prediction.id, 'bronze', bronzeScore.home, bronzeScore.away);

    const specials = generateSpecials(rng, tournament);
    for (const [key, value] of Object.entries(specials)) {
      await upsertSpecialBet(db, prediction.id, key, value);
    }
  }
  logger.info({ count: onTimeUserIds.length }, 'on-time members seeded with full predictions');

  // Late joiners: joinedAt is "now" (moments before Playwright runs), well within the 4-hour
  // late-joiner window (LATE_JOINER_WINDOW_MS in apps/web/src/shared/authz/policy.ts) — so their
  // card status is 'partial' when the specs check it. No predictions are seeded for them: since
  // e2e-seeded is fully resolved except firstRedCardPlayer, everything else would be locked
  // anyway — firstRedCardPlayer is the one item they can genuinely still fill in.
  const lateJoinedAt = new Date();
  const lateJoiner1 = await createGuestUser(db, { displayName: 'Nadia (late)' });
  await upsertLoginToken(db, lateJoiner1.id, SEEDED_LATE_JOINER_TOKEN);
  await addMember(db, pool.id, lateJoiner1.id, lateJoinedAt);

  const lateJoiner2 = await createGuestUser(db, { displayName: 'Oskar (late)' });
  await addMember(db, pool.id, lateJoiner2.id, lateJoinedAt);
  logger.info('2 late joiners added (partial-prediction status)');

  logger.info('rescoring all predictions against e2e-seeded results');
  await syncTournament(db, SEEDED_TOURNAMENT_ID, seededDir);

  const manifestPath = join(cwd, 'apps', 'web', 'e2e', '.e2e-fixture-ids.json');
  writeFileSync(manifestPath, JSON.stringify({ seededPoolId: pool.id }, null, 2) + '\n');
  logger.info({ manifestPath, poolId: pool.id }, 'wrote e2e fixture-id manifest');
}

// ---- CLI entry point (mirrors scripts/seed.ts and scripts/sync.ts) ----

const isDirectlyExecuted =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('/scripts/seed-e2e.ts') ||
    process.argv[1].endsWith('/scripts/seed-e2e.js'));

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

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    process.stderr.write('DATABASE_URL is not set. Add it to apps/web/.env.local.\n');
    process.exit(1);
  }

  const db = createDb(databaseUrl, schema);
  seed(db)
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      logger.error(err, 'seed-e2e failed');
      process.exit(1);
    });
}
