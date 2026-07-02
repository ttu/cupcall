/**
 * scripts/seed-current.ts — dev database seeded to mirror the current production state.
 *
 * Reads data/tournaments/wc-2026/results.json (version-controlled, updated by the
 * update-results skill) to determine which match IDs have results, then applies
 * those same match IDs from data/tournaments/test-wc-2026/results.json. The result
 * is a dev database with the same "which matches are done" state as production, but
 * using the predetermined fictional scores from the test tournament.
 *
 * Because wc-2026/results.json is in version control, any developer running this
 * script gets the identical state — a reproducible snapshot of production.
 *
 * Usage:
 *   pnpm seed:current        # requires DATABASE_URL set or apps/web/.env.local
 *   pnpm seed:fresh:current  # reset DB first then seed
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import pino from 'pino';
import { syncTournament } from './sync';
import { createDb } from '@cup/db';
import * as schema from '@cup/db/schema';
import {
  createGuestUser,
  upsertLoginToken,
  deleteLoginTokenByToken,
  createPool,
  addMember,
  getOrCreatePrediction,
  upsertGroupScore,
  upsertKnockoutPick,
  upsertFinishScore,
  upsertSpecialBet,
  upsertTournamentDef,
  upsertTournamentResults,
  upsertKnockoutMatch,
  getTournamentById,
  listPredictionsForTournament,
  getPredictionInputs,
  upsertScore,
} from '@cup/db';
import {
  bracketMatchKey,
  deriveCard,
  scoreCard,
  groupId,
  teamId,
  matchId,
  tournamentId as asTournamentId,
} from '@cup/engine';
import type { ActualResults, UserId, GroupId, TeamId } from '@cup/engine';
import { tournamentSchema } from '@cup/schemas';

const TOURNAMENT_ID = asTournamentId('test-wc-2026');
// The real tournament whose results.json determines which matches have results.
const REAL_TOURNAMENT_ID = 'wc-2026';
const DEV_CURRENT_TOKEN = 'dev-current-login';

const logger = pino({ name: 'seed-current', level: 'info' });

const rawTournamentMetaSchema = z
  .object({
    firstKickoff: z.string().datetime(),
    groupMatches: z
      .array(z.object({ id: z.string(), kickoff: z.string().datetime().optional() }))
      .optional(),
  })
  .passthrough();

const rawResultsSchema = z.object({
  matchResults: z.array(
    z.object({ matchId: z.string(), home: z.number(), away: z.number() }).passthrough(),
  ),
  groupOrder: z.record(z.array(z.string())).optional(),
});

const rawKnockoutResultsSchema = z
  .object({
    knockout: z
      .array(
        z.object({
          round: z.enum(['R32', 'R16', 'QF', 'SF', 'Final', 'bronze']),
          matchId: z.string(),
          home: z.string(),
          away: z.string(),
          homeGoals: z.number().int().nonnegative(),
          awayGoals: z.number().int().nonnegative(),
          winner: z.string(),
          decidedBy: z.enum(['regulation', 'extraTime', 'penalties']).optional(),
          kickoff: z.string().datetime().optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

// ── Per-user group score predictions (all 12 groups, 72 matches) ──────────────
//
// These are the same predictions used in seed.ts, designed to produce interesting
// scoring across accuracy tiers. When applied to partial results, scoring reflects
// only the matches that have results — the rest are pending.
//
// Accuracy tiers (exact / correct-variant / wrong across 72 matches):
//   Alice:   48 / 24 /  0   Bob:    24 / 42 /  6   Charlie: 13 / 51 /  8
//   Diana:    6 / 56 / 10   Eve:     3 / 57 / 12   Frank:    0 / 20 / 52

const GROUP_SCORES_ALICE = [
  { matchId: 'mA1', home: 2, away: 0 },
  { matchId: 'mA2', home: 2, away: 1 },
  { matchId: 'mA3', home: 2, away: 0 },
  { matchId: 'mA4', home: 2, away: 1 },
  { matchId: 'mA5', home: 0, away: 1 },
  { matchId: 'mA6', home: 0, away: 1 },
  { matchId: 'mB1', home: 2, away: 0 },
  { matchId: 'mB2', home: 0, away: 1 },
  { matchId: 'mB3', home: 2, away: 0 },
  { matchId: 'mB4', home: 2, away: 1 },
  { matchId: 'mB5', home: 1, away: 0 },
  { matchId: 'mB6', home: 0, away: 1 },
  { matchId: 'mC1', home: 3, away: 0 },
  { matchId: 'mC2', home: 0, away: 1 },
  { matchId: 'mC3', home: 0, away: 1 },
  { matchId: 'mC4', home: 6, away: 1 },
  { matchId: 'mC5', home: 0, away: 1 },
  { matchId: 'mC6', home: 2, away: 0 },
  { matchId: 'mD1', home: 2, away: 0 },
  { matchId: 'mD2', home: 0, away: 1 },
  { matchId: 'mD3', home: 2, away: 1 },
  { matchId: 'mD4', home: 2, away: 0 },
  { matchId: 'mD5', home: 0, away: 1 },
  { matchId: 'mD6', home: 0, away: 1 },
  { matchId: 'mE1', home: 4, away: 0 },
  { matchId: 'mE2', home: 0, away: 1 },
  { matchId: 'mE3', home: 2, away: 0 },
  { matchId: 'mE4', home: 3, away: 0 },
  { matchId: 'mE5', home: 1, away: 2 },
  { matchId: 'mE6', home: 0, away: 1 },
  { matchId: 'mF1', home: 2, away: 1 },
  { matchId: 'mF2', home: 3, away: 0 },
  { matchId: 'mF3', home: 1, away: 0 },
  { matchId: 'mF4', home: 0, away: 2 },
  { matchId: 'mF5', home: 1, away: 2 },
  { matchId: 'mF6', home: 0, away: 2 },
  { matchId: 'mG1', home: 2, away: 1 },
  { matchId: 'mG2', home: 2, away: 0 },
  { matchId: 'mG3', home: 2, away: 0 },
  { matchId: 'mG4', home: 0, away: 1 },
  { matchId: 'mG5', home: 2, away: 1 },
  { matchId: 'mG6', home: 0, away: 1 },
  { matchId: 'mH1', home: 3, away: 0 },
  { matchId: 'mH2', home: 0, away: 1 },
  { matchId: 'mH3', home: 2, away: 0 },
  { matchId: 'mH4', home: 2, away: 0 },
  { matchId: 'mH5', home: 0, away: 1 },
  { matchId: 'mH6', home: 0, away: 1 },
  { matchId: 'mI1', home: 2, away: 0 },
  { matchId: 'mI2', home: 0, away: 1 },
  { matchId: 'mI3', home: 3, away: 0 },
  { matchId: 'mI4', home: 2, away: 0 },
  { matchId: 'mI5', home: 0, away: 1 },
  { matchId: 'mI6', home: 2, away: 0 },
  { matchId: 'mJ1', home: 3, away: 0 },
  { matchId: 'mJ2', home: 2, away: 0 },
  { matchId: 'mJ3', home: 2, away: 1 },
  { matchId: 'mJ4', home: 0, away: 1 },
  { matchId: 'mJ5', home: 0, away: 1 },
  { matchId: 'mJ6', home: 0, away: 1 },
  { matchId: 'mK1', home: 3, away: 0 },
  { matchId: 'mK2', home: 0, away: 1 },
  { matchId: 'mK3', home: 2, away: 0 },
  { matchId: 'mK4', home: 2, away: 1 },
  { matchId: 'mK5', home: 0, away: 1 },
  { matchId: 'mK6', home: 2, away: 0 },
  { matchId: 'mL1', home: 2, away: 0 },
  { matchId: 'mL2', home: 2, away: 1 },
  { matchId: 'mL3', home: 2, away: 0 },
  { matchId: 'mL4', home: 0, away: 2 },
  { matchId: 'mL5', home: 0, away: 3 },
  { matchId: 'mL6', home: 2, away: 0 },
];

const GROUP_SCORES_BOB = [
  { matchId: 'mA1', home: 2, away: 0 },
  { matchId: 'mA2', home: 1, away: 0 },
  { matchId: 'mA3', home: 1, away: 0 },
  { matchId: 'mA4', home: 0, away: 1 },
  { matchId: 'mA5', home: 0, away: 1 },
  { matchId: 'mA6', home: 0, away: 1 },
  { matchId: 'mB1', home: 2, away: 0 },
  { matchId: 'mB2', home: 0, away: 1 },
  { matchId: 'mB3', home: 2, away: 0 },
  { matchId: 'mB4', home: 1, away: 0 },
  { matchId: 'mB5', home: 0, away: 1 },
  { matchId: 'mB6', home: 0, away: 1 },
  { matchId: 'mC1', home: 2, away: 0 },
  { matchId: 'mC2', home: 0, away: 1 },
  { matchId: 'mC3', home: 0, away: 1 },
  { matchId: 'mC4', home: 6, away: 1 },
  { matchId: 'mC5', home: 0, away: 1 },
  { matchId: 'mC6', home: 2, away: 0 },
  { matchId: 'mD1', home: 2, away: 0 },
  { matchId: 'mD2', home: 0, away: 1 },
  { matchId: 'mD3', home: 2, away: 1 },
  { matchId: 'mD4', home: 2, away: 0 },
  { matchId: 'mD5', home: 0, away: 2 },
  { matchId: 'mD6', home: 0, away: 1 },
  { matchId: 'mE1', home: 4, away: 0 },
  { matchId: 'mE2', home: 0, away: 1 },
  { matchId: 'mE3', home: 2, away: 0 },
  { matchId: 'mE4', home: 3, away: 0 },
  { matchId: 'mE5', home: 1, away: 0 },
  { matchId: 'mE6', home: 0, away: 1 },
  { matchId: 'mF1', home: 1, away: 0 },
  { matchId: 'mF2', home: 3, away: 0 },
  { matchId: 'mF3', home: 1, away: 0 },
  { matchId: 'mF4', home: 0, away: 1 },
  { matchId: 'mF5', home: 0, away: 1 },
  { matchId: 'mF6', home: 0, away: 1 },
  { matchId: 'mG1', home: 1, away: 0 },
  { matchId: 'mG2', home: 2, away: 0 },
  { matchId: 'mG3', home: 2, away: 0 },
  { matchId: 'mG4', home: 0, away: 1 },
  { matchId: 'mG5', home: 1, away: 0 },
  { matchId: 'mG6', home: 0, away: 1 },
  { matchId: 'mH1', home: 1, away: 0 },
  { matchId: 'mH2', home: 0, away: 1 },
  { matchId: 'mH3', home: 2, away: 0 },
  { matchId: 'mH4', home: 2, away: 0 },
  { matchId: 'mH5', home: 0, away: 1 },
  { matchId: 'mH6', home: 0, away: 1 },
  { matchId: 'mI1', home: 2, away: 0 },
  { matchId: 'mI2', home: 0, away: 1 },
  { matchId: 'mI3', home: 3, away: 0 },
  { matchId: 'mI4', home: 2, away: 0 },
  { matchId: 'mI5', home: 1, away: 0 },
  { matchId: 'mI6', home: 2, away: 0 },
  { matchId: 'mJ1', home: 2, away: 0 },
  { matchId: 'mJ2', home: 1, away: 0 },
  { matchId: 'mJ3', home: 1, away: 0 },
  { matchId: 'mJ4', home: 0, away: 1 },
  { matchId: 'mJ5', home: 0, away: 1 },
  { matchId: 'mJ6', home: 0, away: 1 },
  { matchId: 'mK1', home: 3, away: 0 },
  { matchId: 'mK2', home: 0, away: 1 },
  { matchId: 'mK3', home: 2, away: 0 },
  { matchId: 'mK4', home: 1, away: 0 },
  { matchId: 'mK5', home: 1, away: 0 },
  { matchId: 'mK6', home: 2, away: 0 },
  { matchId: 'mL1', home: 0, away: 1 },
  { matchId: 'mL2', home: 1, away: 0 },
  { matchId: 'mL3', home: 1, away: 0 },
  { matchId: 'mL4', home: 0, away: 1 },
  { matchId: 'mL5', home: 0, away: 1 },
  { matchId: 'mL6', home: 1, away: 0 },
];

const GROUP_SCORES_CHARLIE = [
  { matchId: 'mA1', home: 1, away: 0 },
  { matchId: 'mA2', home: 1, away: 0 },
  { matchId: 'mA3', home: 1, away: 0 },
  { matchId: 'mA4', home: 0, away: 1 },
  { matchId: 'mA5', home: 0, away: 1 },
  { matchId: 'mA6', home: 0, away: 1 },
  { matchId: 'mB1', home: 2, away: 0 },
  { matchId: 'mB2', home: 0, away: 1 },
  { matchId: 'mB3', home: 2, away: 0 },
  { matchId: 'mB4', home: 1, away: 0 },
  { matchId: 'mB5', home: 0, away: 1 },
  { matchId: 'mB6', home: 0, away: 1 },
  { matchId: 'mC1', home: 2, away: 0 },
  { matchId: 'mC2', home: 0, away: 1 },
  { matchId: 'mC3', home: 0, away: 1 },
  { matchId: 'mC4', home: 6, away: 1 },
  { matchId: 'mC5', home: 0, away: 1 },
  { matchId: 'mC6', home: 1, away: 0 },
  { matchId: 'mD1', home: 1, away: 0 },
  { matchId: 'mD2', home: 0, away: 1 },
  { matchId: 'mD3', home: 1, away: 0 },
  { matchId: 'mD4', home: 2, away: 0 },
  { matchId: 'mD5', home: 0, away: 2 },
  { matchId: 'mD6', home: 0, away: 1 },
  { matchId: 'mE1', home: 4, away: 0 },
  { matchId: 'mE2', home: 0, away: 1 },
  { matchId: 'mE3', home: 1, away: 0 },
  { matchId: 'mE4', home: 3, away: 0 },
  { matchId: 'mE5', home: 1, away: 0 },
  { matchId: 'mE6', home: 0, away: 1 },
  { matchId: 'mF1', home: 1, away: 0 },
  { matchId: 'mF2', home: 2, away: 0 },
  { matchId: 'mF3', home: 0, away: 1 },
  { matchId: 'mF4', home: 0, away: 1 },
  { matchId: 'mF5', home: 0, away: 1 },
  { matchId: 'mF6', home: 0, away: 1 },
  { matchId: 'mG1', home: 1, away: 0 },
  { matchId: 'mG2', home: 2, away: 0 },
  { matchId: 'mG3', home: 2, away: 0 },
  { matchId: 'mG4', home: 0, away: 1 },
  { matchId: 'mG5', home: 1, away: 0 },
  { matchId: 'mG6', home: 0, away: 1 },
  { matchId: 'mH1', home: 1, away: 0 },
  { matchId: 'mH2', home: 0, away: 1 },
  { matchId: 'mH3', home: 2, away: 0 },
  { matchId: 'mH4', home: 2, away: 0 },
  { matchId: 'mH5', home: 0, away: 1 },
  { matchId: 'mH6', home: 1, away: 0 },
  { matchId: 'mI1', home: 1, away: 0 },
  { matchId: 'mI2', home: 0, away: 1 },
  { matchId: 'mI3', home: 3, away: 0 },
  { matchId: 'mI4', home: 2, away: 0 },
  { matchId: 'mI5', home: 1, away: 0 },
  { matchId: 'mI6', home: 2, away: 0 },
  { matchId: 'mJ1', home: 2, away: 0 },
  { matchId: 'mJ2', home: 1, away: 0 },
  { matchId: 'mJ3', home: 1, away: 0 },
  { matchId: 'mJ4', home: 0, away: 1 },
  { matchId: 'mJ5', home: 0, away: 1 },
  { matchId: 'mJ6', home: 0, away: 1 },
  { matchId: 'mK1', home: 1, away: 0 },
  { matchId: 'mK2', home: 0, away: 1 },
  { matchId: 'mK3', home: 1, away: 0 },
  { matchId: 'mK4', home: 1, away: 0 },
  { matchId: 'mK5', home: 1, away: 0 },
  { matchId: 'mK6', home: 1, away: 0 },
  { matchId: 'mL1', home: 0, away: 1 },
  { matchId: 'mL2', home: 1, away: 0 },
  { matchId: 'mL3', home: 1, away: 0 },
  { matchId: 'mL4', home: 0, away: 1 },
  { matchId: 'mL5', home: 0, away: 1 },
  { matchId: 'mL6', home: 1, away: 0 },
];

const GROUP_SCORES_DIANA = [
  { matchId: 'mA1', home: 1, away: 0 },
  { matchId: 'mA2', home: 1, away: 0 },
  { matchId: 'mA3', home: 1, away: 0 },
  { matchId: 'mA4', home: 0, away: 1 },
  { matchId: 'mA5', home: 0, away: 1 },
  { matchId: 'mA6', home: 0, away: 1 },
  { matchId: 'mB1', home: 1, away: 0 },
  { matchId: 'mB2', home: 0, away: 1 },
  { matchId: 'mB3', home: 1, away: 0 },
  { matchId: 'mB4', home: 1, away: 0 },
  { matchId: 'mB5', home: 0, away: 1 },
  { matchId: 'mB6', home: 0, away: 1 },
  { matchId: 'mC1', home: 0, away: 1 },
  { matchId: 'mC2', home: 0, away: 1 },
  { matchId: 'mC3', home: 0, away: 1 },
  { matchId: 'mC4', home: 6, away: 1 },
  { matchId: 'mC5', home: 0, away: 1 },
  { matchId: 'mC6', home: 1, away: 0 },
  { matchId: 'mD1', home: 1, away: 0 },
  { matchId: 'mD2', home: 0, away: 1 },
  { matchId: 'mD3', home: 1, away: 0 },
  { matchId: 'mD4', home: 1, away: 0 },
  { matchId: 'mD5', home: 1, away: 0 },
  { matchId: 'mD6', home: 0, away: 1 },
  { matchId: 'mE1', home: 2, away: 0 },
  { matchId: 'mE2', home: 0, away: 1 },
  { matchId: 'mE3', home: 1, away: 0 },
  { matchId: 'mE4', home: 3, away: 0 },
  { matchId: 'mE5', home: 1, away: 0 },
  { matchId: 'mE6', home: 0, away: 1 },
  { matchId: 'mF1', home: 1, away: 0 },
  { matchId: 'mF2', home: 3, away: 0 },
  { matchId: 'mF3', home: 0, away: 1 },
  { matchId: 'mF4', home: 0, away: 1 },
  { matchId: 'mF5', home: 0, away: 1 },
  { matchId: 'mF6', home: 0, away: 1 },
  { matchId: 'mG1', home: 1, away: 0 },
  { matchId: 'mG2', home: 1, away: 0 },
  { matchId: 'mG3', home: 1, away: 0 },
  { matchId: 'mG4', home: 0, away: 1 },
  { matchId: 'mG5', home: 1, away: 0 },
  { matchId: 'mG6', home: 0, away: 1 },
  { matchId: 'mH1', home: 1, away: 0 },
  { matchId: 'mH2', home: 0, away: 1 },
  { matchId: 'mH3', home: 2, away: 0 },
  { matchId: 'mH4', home: 2, away: 0 },
  { matchId: 'mH5', home: 0, away: 1 },
  { matchId: 'mH6', home: 1, away: 0 },
  { matchId: 'mI1', home: 1, away: 0 },
  { matchId: 'mI2', home: 0, away: 1 },
  { matchId: 'mI3', home: 1, away: 0 },
  { matchId: 'mI4', home: 1, away: 0 },
  { matchId: 'mI5', home: 1, away: 0 },
  { matchId: 'mI6', home: 2, away: 0 },
  { matchId: 'mJ1', home: 1, away: 0 },
  { matchId: 'mJ2', home: 1, away: 0 },
  { matchId: 'mJ3', home: 1, away: 0 },
  { matchId: 'mJ4', home: 0, away: 1 },
  { matchId: 'mJ5', home: 0, away: 1 },
  { matchId: 'mJ6', home: 0, away: 1 },
  { matchId: 'mK1', home: 1, away: 0 },
  { matchId: 'mK2', home: 0, away: 1 },
  { matchId: 'mK3', home: 1, away: 0 },
  { matchId: 'mK4', home: 1, away: 0 },
  { matchId: 'mK5', home: 1, away: 0 },
  { matchId: 'mK6', home: 1, away: 0 },
  { matchId: 'mL1', home: 0, away: 1 },
  { matchId: 'mL2', home: 1, away: 0 },
  { matchId: 'mL3', home: 1, away: 0 },
  { matchId: 'mL4', home: 0, away: 1 },
  { matchId: 'mL5', home: 0, away: 1 },
  { matchId: 'mL6', home: 1, away: 0 },
];

const GROUP_SCORES_EVE = [
  { matchId: 'mA1', home: 1, away: 0 },
  { matchId: 'mA2', home: 1, away: 0 },
  { matchId: 'mA3', home: 1, away: 0 },
  { matchId: 'mA4', home: 0, away: 1 },
  { matchId: 'mA5', home: 0, away: 1 },
  { matchId: 'mA6', home: 0, away: 1 },
  { matchId: 'mB1', home: 1, away: 0 },
  { matchId: 'mB2', home: 0, away: 1 },
  { matchId: 'mB3', home: 1, away: 0 },
  { matchId: 'mB4', home: 1, away: 0 },
  { matchId: 'mB5', home: 0, away: 1 },
  { matchId: 'mB6', home: 0, away: 1 },
  { matchId: 'mC1', home: 0, away: 1 },
  { matchId: 'mC2', home: 0, away: 1 },
  { matchId: 'mC3', home: 0, away: 1 },
  { matchId: 'mC4', home: 6, away: 1 },
  { matchId: 'mC5', home: 0, away: 1 },
  { matchId: 'mC6', home: 1, away: 0 },
  { matchId: 'mD1', home: 1, away: 0 },
  { matchId: 'mD2', home: 0, away: 1 },
  { matchId: 'mD3', home: 1, away: 0 },
  { matchId: 'mD4', home: 1, away: 0 },
  { matchId: 'mD5', home: 1, away: 0 },
  { matchId: 'mD6', home: 0, away: 1 },
  { matchId: 'mE1', home: 2, away: 0 },
  { matchId: 'mE2', home: 0, away: 1 },
  { matchId: 'mE3', home: 1, away: 0 },
  { matchId: 'mE4', home: 2, away: 0 },
  { matchId: 'mE5', home: 1, away: 0 },
  { matchId: 'mE6', home: 0, away: 1 },
  { matchId: 'mF1', home: 1, away: 0 },
  { matchId: 'mF2', home: 2, away: 0 },
  { matchId: 'mF3', home: 0, away: 1 },
  { matchId: 'mF4', home: 0, away: 1 },
  { matchId: 'mF5', home: 0, away: 1 },
  { matchId: 'mF6', home: 0, away: 1 },
  { matchId: 'mG1', home: 0, away: 1 },
  { matchId: 'mG2', home: 1, away: 0 },
  { matchId: 'mG3', home: 1, away: 0 },
  { matchId: 'mG4', home: 0, away: 1 },
  { matchId: 'mG5', home: 1, away: 0 },
  { matchId: 'mG6', home: 0, away: 1 },
  { matchId: 'mH1', home: 1, away: 0 },
  { matchId: 'mH2', home: 0, away: 1 },
  { matchId: 'mH3', home: 2, away: 0 },
  { matchId: 'mH4', home: 1, away: 0 },
  { matchId: 'mH5', home: 0, away: 1 },
  { matchId: 'mH6', home: 1, away: 0 },
  { matchId: 'mI1', home: 1, away: 0 },
  { matchId: 'mI2', home: 0, away: 1 },
  { matchId: 'mI3', home: 1, away: 0 },
  { matchId: 'mI4', home: 1, away: 0 },
  { matchId: 'mI5', home: 1, away: 0 },
  { matchId: 'mI6', home: 2, away: 0 },
  { matchId: 'mJ1', home: 1, away: 0 },
  { matchId: 'mJ2', home: 1, away: 0 },
  { matchId: 'mJ3', home: 0, away: 1 },
  { matchId: 'mJ4', home: 0, away: 1 },
  { matchId: 'mJ5', home: 0, away: 1 },
  { matchId: 'mJ6', home: 0, away: 1 },
  { matchId: 'mK1', home: 1, away: 0 },
  { matchId: 'mK2', home: 0, away: 1 },
  { matchId: 'mK3', home: 1, away: 0 },
  { matchId: 'mK4', home: 1, away: 0 },
  { matchId: 'mK5', home: 1, away: 0 },
  { matchId: 'mK6', home: 1, away: 0 },
  { matchId: 'mL1', home: 0, away: 1 },
  { matchId: 'mL2', home: 1, away: 0 },
  { matchId: 'mL3', home: 1, away: 0 },
  { matchId: 'mL4', home: 0, away: 1 },
  { matchId: 'mL5', home: 0, away: 1 },
  { matchId: 'mL6', home: 1, away: 0 },
];

const GROUP_SCORES_FRANK = [
  { matchId: 'mA1', home: 0, away: 1 },
  { matchId: 'mA2', home: 0, away: 1 },
  { matchId: 'mA3', home: 0, away: 1 },
  { matchId: 'mA4', home: 0, away: 1 },
  { matchId: 'mA5', home: 2, away: 0 },
  { matchId: 'mA6', home: 1, away: 0 },
  { matchId: 'mB1', home: 0, away: 1 },
  { matchId: 'mB2', home: 2, away: 0 },
  { matchId: 'mB3', home: 1, away: 0 },
  { matchId: 'mB4', home: 0, away: 1 },
  { matchId: 'mB5', home: 0, away: 1 },
  { matchId: 'mB6', home: 2, away: 0 },
  { matchId: 'mC1', home: 0, away: 1 },
  { matchId: 'mC2', home: 1, away: 0 },
  { matchId: 'mC3', home: 2, away: 0 },
  { matchId: 'mC4', home: 1, away: 0 },
  { matchId: 'mC5', home: 2, away: 0 },
  { matchId: 'mC6', home: 1, away: 0 },
  { matchId: 'mD1', home: 0, away: 1 },
  { matchId: 'mD2', home: 2, away: 0 },
  { matchId: 'mD3', home: 0, away: 1 },
  { matchId: 'mD4', home: 1, away: 0 },
  { matchId: 'mD5', home: 2, away: 0 },
  { matchId: 'mD6', home: 2, away: 0 },
  { matchId: 'mE1', home: 1, away: 0 },
  { matchId: 'mE2', home: 2, away: 0 },
  { matchId: 'mE3', home: 0, away: 1 },
  { matchId: 'mE4', home: 1, away: 0 },
  { matchId: 'mE5', home: 2, away: 0 },
  { matchId: 'mE6', home: 1, away: 0 },
  { matchId: 'mF1', home: 1, away: 0 },
  { matchId: 'mF2', home: 2, away: 0 },
  { matchId: 'mF3', home: 2, away: 0 },
  { matchId: 'mF4', home: 1, away: 0 },
  { matchId: 'mF5', home: 0, away: 1 },
  { matchId: 'mF6', home: 1, away: 0 },
  { matchId: 'mG1', home: 0, away: 1 },
  { matchId: 'mG2', home: 0, away: 1 },
  { matchId: 'mG3', home: 0, away: 1 },
  { matchId: 'mG4', home: 2, away: 0 },
  { matchId: 'mG5', home: 0, away: 1 },
  { matchId: 'mG6', home: 2, away: 0 },
  { matchId: 'mH1', home: 0, away: 1 },
  { matchId: 'mH2', home: 2, away: 0 },
  { matchId: 'mH3', home: 1, away: 0 },
  { matchId: 'mH4', home: 1, away: 0 },
  { matchId: 'mH5', home: 2, away: 0 },
  { matchId: 'mH6', home: 2, away: 0 },
  { matchId: 'mI1', home: 0, away: 1 },
  { matchId: 'mI2', home: 2, away: 0 },
  { matchId: 'mI3', home: 0, away: 1 },
  { matchId: 'mI4', home: 0, away: 1 },
  { matchId: 'mI5', home: 2, away: 0 },
  { matchId: 'mI6', home: 1, away: 0 },
  { matchId: 'mJ1', home: 0, away: 1 },
  { matchId: 'mJ2', home: 0, away: 1 },
  { matchId: 'mJ3', home: 0, away: 1 },
  { matchId: 'mJ4', home: 2, away: 0 },
  { matchId: 'mJ5', home: 2, away: 0 },
  { matchId: 'mJ6', home: 0, away: 1 },
  { matchId: 'mK1', home: 0, away: 1 },
  { matchId: 'mK2', home: 0, away: 1 },
  { matchId: 'mK3', home: 1, away: 0 },
  { matchId: 'mK4', home: 0, away: 1 },
  { matchId: 'mK5', home: 0, away: 1 },
  { matchId: 'mK6', home: 1, away: 0 },
  { matchId: 'mL1', home: 0, away: 1 },
  { matchId: 'mL2', home: 0, away: 1 },
  { matchId: 'mL3', home: 1, away: 0 },
  { matchId: 'mL4', home: 2, away: 0 },
  { matchId: 'mL5', home: 2, away: 0 },
  { matchId: 'mL6', home: 1, away: 0 },
];

// ── Knockout bracket picks ────────────────────────────────────────────────────
//
// Predictions are the same as seed.ts. Picks for rounds that already have results
// in wc-2026/results.json will be scored; later rounds remain pending.

const R32_ALL_CORRECT = [
  { bracketMatchKey: 'r32m73', winner: 'KOR' },
  { bracketMatchKey: 'r32m74', winner: 'GER' },
  { bracketMatchKey: 'r32m75', winner: 'NED' },
  { bracketMatchKey: 'r32m76', winner: 'BRA' },
  { bracketMatchKey: 'r32m77', winner: 'FRA' },
  { bracketMatchKey: 'r32m78', winner: 'NOR' },
  { bracketMatchKey: 'r32m79', winner: 'MEX' },
  { bracketMatchKey: 'r32m80', winner: 'ENG' },
  { bracketMatchKey: 'r32m81', winner: 'USA' },
  { bracketMatchKey: 'r32m82', winner: 'BEL' },
  { bracketMatchKey: 'r32m83', winner: 'COL' },
  { bracketMatchKey: 'r32m84', winner: 'ESP' },
  { bracketMatchKey: 'r32m85', winner: 'SUI' },
  { bracketMatchKey: 'r32m86', winner: 'ARG' },
  { bracketMatchKey: 'r32m87', winner: 'POR' },
  { bracketMatchKey: 'r32m88', winner: 'TUR' },
] as const;

const PICKS_ALICE = [
  ...R32_ALL_CORRECT,
  { bracketMatchKey: 'r16m89', winner: 'GER' },
  { bracketMatchKey: 'r16m90', winner: 'NED' },
  { bracketMatchKey: 'r16m91', winner: 'BRA' },
  { bracketMatchKey: 'r16m92', winner: 'ENG' },
  { bracketMatchKey: 'r16m93', winner: 'ESP' },
  { bracketMatchKey: 'r16m94', winner: 'BEL' },
  { bracketMatchKey: 'r16m95', winner: 'ARG' },
  { bracketMatchKey: 'r16m96', winner: 'POR' },
  { bracketMatchKey: 'qf97', winner: 'GER' },
  { bracketMatchKey: 'qf98', winner: 'ESP' },
  { bracketMatchKey: 'qf99', winner: 'BRA' },
  { bracketMatchKey: 'qf100', winner: 'ARG' },
  { bracketMatchKey: 'sf101', winner: 'ESP' },
  { bracketMatchKey: 'sf102', winner: 'ARG' },
  { bracketMatchKey: 'final', winner: 'ARG' },
  { bracketMatchKey: 'bronze', winner: 'GER' },
] as const;

const PICKS_BOB = [
  { bracketMatchKey: 'r32m73', winner: 'MEX' },
  { bracketMatchKey: 'r32m74', winner: 'ECU' },
  { bracketMatchKey: 'r32m75', winner: 'NED' },
  { bracketMatchKey: 'r32m76', winner: 'BRA' },
  { bracketMatchKey: 'r32m77', winner: 'NOR' },
  { bracketMatchKey: 'r32m78', winner: 'GER' },
  { bracketMatchKey: 'r32m79', winner: 'KOR' },
  { bracketMatchKey: 'r32m80', winner: 'CRO' },
  { bracketMatchKey: 'r32m81', winner: 'USA' },
  { bracketMatchKey: 'r32m82', winner: 'BEL' },
  { bracketMatchKey: 'r32m83', winner: 'ENG' },
  { bracketMatchKey: 'r32m84', winner: 'ESP' },
  { bracketMatchKey: 'r32m85', winner: 'CAN' },
  { bracketMatchKey: 'r32m86', winner: 'ARG' },
  { bracketMatchKey: 'r32m87', winner: 'COL' },
  { bracketMatchKey: 'r32m88', winner: 'TUR' },
  { bracketMatchKey: 'r16m89', winner: 'ECU' },
  { bracketMatchKey: 'r16m90', winner: 'NED' },
  { bracketMatchKey: 'r16m91', winner: 'BRA' },
  { bracketMatchKey: 'r16m92', winner: 'KOR' },
  { bracketMatchKey: 'r16m93', winner: 'ESP' },
  { bracketMatchKey: 'r16m94', winner: 'BEL' },
  { bracketMatchKey: 'r16m95', winner: 'ARG' },
  { bracketMatchKey: 'r16m96', winner: 'COL' },
  { bracketMatchKey: 'qf97', winner: 'NED' },
  { bracketMatchKey: 'qf98', winner: 'ESP' },
  { bracketMatchKey: 'qf99', winner: 'BRA' },
  { bracketMatchKey: 'qf100', winner: 'ARG' },
  { bracketMatchKey: 'sf101', winner: 'ESP' },
  { bracketMatchKey: 'sf102', winner: 'ARG' },
  { bracketMatchKey: 'final', winner: 'ARG' },
  { bracketMatchKey: 'bronze', winner: 'BRA' },
] as const;

const PICKS_CHARLIE = [
  { bracketMatchKey: 'r32m73', winner: 'MEX' },
  { bracketMatchKey: 'r32m74', winner: 'ECU' },
  { bracketMatchKey: 'r32m75', winner: 'SWE' },
  { bracketMatchKey: 'r32m76', winner: 'BRA' },
  { bracketMatchKey: 'r32m77', winner: 'NOR' },
  { bracketMatchKey: 'r32m78', winner: 'GER' },
  { bracketMatchKey: 'r32m79', winner: 'KOR' },
  { bracketMatchKey: 'r32m80', winner: 'CRO' },
  { bracketMatchKey: 'r32m81', winner: 'USA' },
  { bracketMatchKey: 'r32m82', winner: 'BEL' },
  { bracketMatchKey: 'r32m83', winner: 'ENG' },
  { bracketMatchKey: 'r32m84', winner: 'URU' },
  { bracketMatchKey: 'r32m85', winner: 'CAN' },
  { bracketMatchKey: 'r32m86', winner: 'ARG' },
  { bracketMatchKey: 'r32m87', winner: 'COL' },
  { bracketMatchKey: 'r32m88', winner: 'TUR' },
  { bracketMatchKey: 'r16m89', winner: 'ECU' },
  { bracketMatchKey: 'r16m90', winner: 'MEX' },
  { bracketMatchKey: 'r16m91', winner: 'BRA' },
  { bracketMatchKey: 'r16m92', winner: 'KOR' },
  { bracketMatchKey: 'r16m93', winner: 'ENG' },
  { bracketMatchKey: 'r16m94', winner: 'BEL' },
  { bracketMatchKey: 'r16m95', winner: 'ARG' },
  { bracketMatchKey: 'r16m96', winner: 'CAN' },
  { bracketMatchKey: 'qf97', winner: 'MEX' },
  { bracketMatchKey: 'qf98', winner: 'ENG' },
  { bracketMatchKey: 'qf99', winner: 'BRA' },
  { bracketMatchKey: 'qf100', winner: 'ARG' },
  { bracketMatchKey: 'sf101', winner: 'MEX' },
  { bracketMatchKey: 'sf102', winner: 'ARG' },
  { bracketMatchKey: 'final', winner: 'ARG' },
  { bracketMatchKey: 'bronze', winner: 'BRA' },
] as const;

const PICKS_DIANA = [
  { bracketMatchKey: 'r32m73', winner: 'MEX' },
  { bracketMatchKey: 'r32m74', winner: 'ECU' },
  { bracketMatchKey: 'r32m75', winner: 'BRA' },
  { bracketMatchKey: 'r32m76', winner: 'MAR' },
  { bracketMatchKey: 'r32m77', winner: 'NOR' },
  { bracketMatchKey: 'r32m78', winner: 'GER' },
  { bracketMatchKey: 'r32m79', winner: 'KOR' },
  { bracketMatchKey: 'r32m80', winner: 'CRO' },
  { bracketMatchKey: 'r32m81', winner: 'TUR' },
  { bracketMatchKey: 'r32m82', winner: 'BEL' },
  { bracketMatchKey: 'r32m83', winner: 'ENG' },
  { bracketMatchKey: 'r32m84', winner: 'URU' },
  { bracketMatchKey: 'r32m85', winner: 'CAN' },
  { bracketMatchKey: 'r32m86', winner: 'ARG' },
  { bracketMatchKey: 'r32m87', winner: 'COL' },
  { bracketMatchKey: 'r32m88', winner: 'USA' },
  { bracketMatchKey: 'r16m89', winner: 'ECU' },
  { bracketMatchKey: 'r16m90', winner: 'BRA' },
  { bracketMatchKey: 'r16m91', winner: 'GER' },
  { bracketMatchKey: 'r16m92', winner: 'KOR' },
  { bracketMatchKey: 'r16m93', winner: 'ENG' },
  { bracketMatchKey: 'r16m94', winner: 'BEL' },
  { bracketMatchKey: 'r16m95', winner: 'ARG' },
  { bracketMatchKey: 'r16m96', winner: 'CAN' },
  { bracketMatchKey: 'qf97', winner: 'BRA' },
  { bracketMatchKey: 'qf98', winner: 'ENG' },
  { bracketMatchKey: 'qf99', winner: 'GER' },
  { bracketMatchKey: 'qf100', winner: 'ARG' },
  { bracketMatchKey: 'sf101', winner: 'BRA' },
  { bracketMatchKey: 'sf102', winner: 'ARG' },
  { bracketMatchKey: 'final', winner: 'ARG' },
  { bracketMatchKey: 'bronze', winner: 'GER' },
] as const;

const PICKS_EVE = [
  { bracketMatchKey: 'r32m73', winner: 'MEX' },
  { bracketMatchKey: 'r32m74', winner: 'ECU' },
  { bracketMatchKey: 'r32m75', winner: 'BRA' },
  { bracketMatchKey: 'r32m76', winner: 'MAR' },
  { bracketMatchKey: 'r32m77', winner: 'NOR' },
  { bracketMatchKey: 'r32m78', winner: 'GER' },
  { bracketMatchKey: 'r32m79', winner: 'KOR' },
  { bracketMatchKey: 'r32m80', winner: 'CRO' },
  { bracketMatchKey: 'r32m81', winner: 'TUR' },
  { bracketMatchKey: 'r32m82', winner: 'EGY' },
  { bracketMatchKey: 'r32m83', winner: 'ENG' },
  { bracketMatchKey: 'r32m84', winner: 'ARG' },
  { bracketMatchKey: 'r32m85', winner: 'CAN' },
  { bracketMatchKey: 'r32m86', winner: 'ESP' },
  { bracketMatchKey: 'r32m87', winner: 'COL' },
  { bracketMatchKey: 'r32m88', winner: 'BEL' },
  { bracketMatchKey: 'r16m89', winner: 'ECU' },
  { bracketMatchKey: 'r16m90', winner: 'MEX' },
  { bracketMatchKey: 'r16m91', winner: 'GER' },
  { bracketMatchKey: 'r16m92', winner: 'KOR' },
  { bracketMatchKey: 'r16m93', winner: 'ARG' },
  { bracketMatchKey: 'r16m94', winner: 'TUR' },
  { bracketMatchKey: 'r16m95', winner: 'BEL' },
  { bracketMatchKey: 'r16m96', winner: 'COL' },
  { bracketMatchKey: 'qf97', winner: 'ECU' },
  { bracketMatchKey: 'qf98', winner: 'ARG' },
  { bracketMatchKey: 'qf99', winner: 'GER' },
  { bracketMatchKey: 'qf100', winner: 'BEL' },
  { bracketMatchKey: 'sf101', winner: 'ARG' },
  { bracketMatchKey: 'sf102', winner: 'GER' },
  { bracketMatchKey: 'final', winner: 'ARG' },
  { bracketMatchKey: 'bronze', winner: 'ECU' },
] as const;

const PICKS_FRANK = [
  { bracketMatchKey: 'r32m73', winner: 'CZE' },
  { bracketMatchKey: 'r32m74', winner: 'CIV' },
  { bracketMatchKey: 'r32m75', winner: 'NED' },
  { bracketMatchKey: 'r32m76', winner: 'SCO' },
  { bracketMatchKey: 'r32m77', winner: 'SEN' },
  { bracketMatchKey: 'r32m78', winner: 'ECU' },
  { bracketMatchKey: 'r32m79', winner: 'RSA' },
  { bracketMatchKey: 'r32m80', winner: 'PAN' },
  { bracketMatchKey: 'r32m81', winner: 'PAR' },
  { bracketMatchKey: 'r32m82', winner: 'NZL' },
  { bracketMatchKey: 'r32m83', winner: 'POR' },
  { bracketMatchKey: 'r32m84', winner: 'ALG' },
  { bracketMatchKey: 'r32m85', winner: 'BIH' },
  { bracketMatchKey: 'r32m86', winner: 'CPV' },
  { bracketMatchKey: 'r32m87', winner: 'COD' },
  { bracketMatchKey: 'r32m88', winner: 'AUS' },
  { bracketMatchKey: 'r16m89', winner: 'CIV' },
  { bracketMatchKey: 'r16m90', winner: 'NED' },
  { bracketMatchKey: 'r16m91', winner: 'ECU' },
  { bracketMatchKey: 'r16m92', winner: 'RSA' },
  { bracketMatchKey: 'r16m93', winner: 'POR' },
  { bracketMatchKey: 'r16m94', winner: 'PAR' },
  { bracketMatchKey: 'r16m95', winner: 'CPV' },
  { bracketMatchKey: 'r16m96', winner: 'BIH' },
  { bracketMatchKey: 'qf97', winner: 'CIV' },
  { bracketMatchKey: 'qf98', winner: 'POR' },
  { bracketMatchKey: 'qf99', winner: 'ECU' },
  { bracketMatchKey: 'qf100', winner: 'CPV' },
  { bracketMatchKey: 'sf101', winner: 'CIV' },
  { bracketMatchKey: 'sf102', winner: 'ECU' },
  { bracketMatchKey: 'final', winner: 'CIV' },
  { bracketMatchKey: 'bronze', winner: 'POR' },
] as const;

type FinishScores = {
  final: { home: number; away: number };
  bronze: { home: number; away: number };
};
type Specials = {
  topScorerPlayer?: string;
  groupTopScoringTeam?: string;
  groupTopConcedingTeam?: string;
  tournamentTopScoringTeam?: string;
  tournamentTopConcedingTeam?: string;
  highestMatchGoals?: number;
  mostYellowCardsTeam?: string;
  firstRedCardPlayer?: string;
  penaltyShootoutCount?: number;
  finalDecidedByPenalties?: boolean;
};

const PROFILES: Record<
  string,
  {
    displayName: string;
    groupScores: ReadonlyArray<{ matchId: string; home: number; away: number }>;
    picks: ReadonlyArray<{ bracketMatchKey: string; winner: string }>;
    finishScores: FinishScores;
    specials: Specials;
  }
> = {
  alice: {
    displayName: 'Alice',
    groupScores: GROUP_SCORES_ALICE,
    picks: PICKS_ALICE,
    finishScores: { final: { home: 1, away: 1 }, bronze: { home: 2, away: 1 } },
    specials: {
      topScorerPlayer: 'arg-messi',
      groupTopScoringTeam: 'BRA',
      groupTopConcedingTeam: 'CUW',
      tournamentTopScoringTeam: 'ARG',
      tournamentTopConcedingTeam: 'CUW',
      highestMatchGoals: 7,
      mostYellowCardsTeam: 'ARG',
      firstRedCardPlayer: 'mex-alvarez',
      penaltyShootoutCount: 1,
      finalDecidedByPenalties: true,
    },
  },
  bob: {
    displayName: 'Bob',
    groupScores: GROUP_SCORES_BOB,
    picks: PICKS_BOB,
    finishScores: { final: { home: 1, away: 2 }, bronze: { home: 1, away: 2 } },
    specials: {
      topScorerPlayer: 'arg-messi',
      groupTopScoringTeam: 'BRA',
      groupTopConcedingTeam: 'CUW',
      tournamentTopScoringTeam: 'BRA',
      tournamentTopConcedingTeam: 'HAI',
      highestMatchGoals: 6,
      mostYellowCardsTeam: 'ARG',
      firstRedCardPlayer: 'bra-neymar',
      penaltyShootoutCount: 2,
      finalDecidedByPenalties: false,
    },
  },
  charlie: {
    displayName: 'Charlie',
    groupScores: GROUP_SCORES_CHARLIE,
    picks: PICKS_CHARLIE,
    finishScores: { final: { home: 0, away: 2 }, bronze: { home: 0, away: 2 } },
    specials: {
      topScorerPlayer: 'arg-messi',
      groupTopScoringTeam: 'BRA',
      groupTopConcedingTeam: 'CUW',
      tournamentTopScoringTeam: 'GER',
      tournamentTopConcedingTeam: 'HAI',
      highestMatchGoals: 7,
      mostYellowCardsTeam: 'GER',
      firstRedCardPlayer: 'ger-havertz',
      penaltyShootoutCount: 0,
      finalDecidedByPenalties: false,
    },
  },
  diana: {
    displayName: 'Diana',
    groupScores: GROUP_SCORES_DIANA,
    picks: PICKS_DIANA,
    finishScores: { final: { home: 1, away: 3 }, bronze: { home: 2, away: 0 } },
    specials: {
      topScorerPlayer: 'arg-messi',
      groupTopScoringTeam: 'BRA',
      groupTopConcedingTeam: 'SCO',
      tournamentTopScoringTeam: 'ARG',
      tournamentTopConcedingTeam: 'PAR',
      highestMatchGoals: 8,
      mostYellowCardsTeam: 'ESP',
      firstRedCardPlayer: 'esp-morata',
      penaltyShootoutCount: 2,
      finalDecidedByPenalties: true,
    },
  },
  eve: {
    displayName: 'Eve',
    groupScores: GROUP_SCORES_EVE,
    picks: PICKS_EVE,
    finishScores: { final: { home: 0, away: 1 }, bronze: { home: 2, away: 0 } },
    specials: {
      topScorerPlayer: 'arg-messi',
      groupTopScoringTeam: 'ARG',
      groupTopConcedingTeam: 'KSA',
      tournamentTopScoringTeam: 'BRA',
      tournamentTopConcedingTeam: 'KSA',
      highestMatchGoals: 5,
      mostYellowCardsTeam: 'COL',
      firstRedCardPlayer: 'nor-haaland',
      penaltyShootoutCount: 0,
      finalDecidedByPenalties: false,
    },
  },
  frank: {
    displayName: 'Frank',
    groupScores: GROUP_SCORES_FRANK,
    picks: PICKS_FRANK,
    finishScores: { final: { home: 1, away: 0 }, bronze: { home: 2, away: 1 } },
    specials: {
      topScorerPlayer: 'nor-haaland',
      groupTopScoringTeam: 'ARG',
      groupTopConcedingTeam: 'HAI',
      tournamentTopScoringTeam: 'NOR',
      tournamentTopConcedingTeam: 'KSA',
      highestMatchGoals: 7,
      mostYellowCardsTeam: 'BRA',
      firstRedCardPlayer: 'ger-musiala',
      penaltyShootoutCount: 3,
      finalDecidedByPenalties: false,
    },
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Returns the set of group match IDs that currently have results in the real wc-2026 tournament. */
function loadRealMatchIds(dataDir: string): Set<string> {
  const raw: unknown = JSON.parse(
    readFileSync(join(dataDir, REAL_TOURNAMENT_ID, 'results.json'), 'utf-8'),
  );
  const parsed = rawResultsSchema.parse(raw);
  return new Set(parsed.matchResults.map((r) => r.matchId));
}

/** Returns knockout match results from the real wc-2026 tournament. */
function loadRealKnockoutMatches(dataDir: string) {
  const raw: unknown = JSON.parse(
    readFileSync(join(dataDir, REAL_TOURNAMENT_ID, 'results.json'), 'utf-8'),
  );
  return rawKnockoutResultsSchema.parse(raw).knockout ?? [];
}

/**
 * Determines which groups are complete (all 6 matches have results).
 * A group letter maps to match IDs mX1–mX6.
 */
function completeGroups(matchIds: Set<string>): Set<string> {
  const groups = 'ABCDEFGHIJKL'.split('');
  return new Set(groups.filter((g) => [1, 2, 3, 4, 5, 6].every((n) => matchIds.has(`m${g}${n}`))));
}

// ── Main seed function ─────────────────────────────────────────────────────────

async function seed(db: ReturnType<typeof createDb<typeof schema>>): Promise<void> {
  const cwd = process.cwd();
  const tournamentDataDir = join(cwd, 'data', 'tournaments', TOURNAMENT_ID);
  const tournamentsDir = join(cwd, 'data', 'tournaments');

  // 1. Determine which matches have results in the current production state
  logger.info({ source: `${REAL_TOURNAMENT_ID}/results.json` }, 'reading real match IDs');
  const realMatchIds = loadRealMatchIds(tournamentsDir);
  const realKnockoutMatches = loadRealKnockoutMatches(tournamentsDir);
  const done = completeGroups(realMatchIds);
  logger.info(
    {
      matchCount: realMatchIds.size,
      knockoutCount: realKnockoutMatches.length,
      completeGroups: [...done].sort().join(''),
    },
    'current state loaded',
  );

  // 2. Parse test tournament definition
  logger.info({ tournamentId: TOURNAMENT_ID }, 'parsing tournament definition');
  const tournamentRaw: unknown = JSON.parse(
    readFileSync(join(tournamentDataDir, 'tournament.json'), 'utf-8'),
  );
  const tournament = tournamentSchema.parse(tournamentRaw);
  const rawMeta = rawTournamentMetaSchema.parse(tournamentRaw);
  const firstKickoff = new Date(rawMeta.firstKickoff);
  const matchKickoffs = new Map<string, Date | null>(
    (rawMeta.groupMatches ?? []).map((m) => [
      m.id,
      m.kickoff !== undefined ? new Date(m.kickoff) : null,
    ]),
  );

  // 3. Read test results and filter to match IDs with real results
  const testResultsRaw: unknown = JSON.parse(
    readFileSync(join(tournamentDataDir, 'results.json'), 'utf-8'),
  );
  const testResultsParsed = rawResultsSchema.parse(testResultsRaw);
  const testGroupOrder: Record<string, string[]> = testResultsParsed.groupOrder ?? {};

  // 4. Build partialActual: filtered results + group orders for complete groups only
  //    Derive roundOf16/roundOf8 answers from R32/R16 winners in the real knockout results.
  const r32Winners = realKnockoutMatches
    .filter((m) => m.round === 'R32')
    .map((m) => teamId(m.winner));
  const r16Winners = realKnockoutMatches
    .filter((m) => m.round === 'R16')
    .map((m) => teamId(m.winner));

  const partialActual: ActualResults = {
    matchResults: testResultsParsed.matchResults
      .filter((r) => realMatchIds.has(r.matchId))
      .map((r) => ({
        matchId: matchId(r.matchId),
        home: r.home,
        away: r.away,
      })),
    groupOrder: Object.fromEntries(
      Object.entries(testGroupOrder)
        .filter(([g]) => done.has(g))
        .map(([g, teams]) => [groupId(g), teams.map(teamId)]),
    ) as Record<GroupId, TeamId[]>,
    answers: {
      ...(r32Winners.length > 0 ? { roundOf16: r32Winners } : {}),
      ...(r16Winners.length > 0 ? { roundOf8: r16Winners } : {}),
    },
  };

  logger.info(
    { matchResultCount: partialActual.matchResults.length },
    'partial actual results built',
  );

  // 5. Upsert tournament definition and partial results
  logger.info({ tournamentId: TOURNAMENT_ID }, 'upserting tournament definition');
  await upsertTournamentDef(db, tournament, firstKickoff, matchKickoffs);

  logger.info({ tournamentId: TOURNAMENT_ID }, 'upserting partial results');
  await upsertTournamentResults(db, TOURNAMENT_ID, partialActual);

  if (realKnockoutMatches.length > 0) {
    logger.info(
      { tournamentId: TOURNAMENT_ID, count: realKnockoutMatches.length },
      'upserting knockout matches',
    );
    for (const km of realKnockoutMatches) {
      await upsertKnockoutMatch(db, {
        id: km.matchId,
        tournamentId: TOURNAMENT_ID,
        stage: km.round,
        homeTeamId: km.home,
        awayTeamId: km.away,
        homeGoals: km.homeGoals,
        awayGoals: km.awayGoals,
        winnerTeamId: km.winner,
        ...(km.decidedBy !== undefined && { decidedBy: km.decidedBy }),
        ...(km.kickoff !== undefined && { kickoff: new Date(km.kickoff) }),
        status: 'final',
      });
    }
  }

  // 6. Create all users
  const userIds: Record<string, UserId> = {};
  for (const [key, profile] of Object.entries(PROFILES)) {
    const user = await createGuestUser(db, { displayName: profile.displayName });
    userIds[key] = user.id;
    logger.info({ key, userId: user.id, displayName: user.displayName }, 'created user');
  }

  // Remove any existing row for this token (different userId from a previous run without DB reset).
  await deleteLoginTokenByToken(db, DEV_CURRENT_TOKEN);
  await upsertLoginToken(db, userIds['alice']!, DEV_CURRENT_TOKEN);
  logger.info({ token: DEV_CURRENT_TOKEN }, 'login token set');

  // 7. Create pool owned by Alice
  const pool = await createPool(db, {
    tournamentId: TOURNAMENT_ID,
    ownerId: userIds['alice']!,
    name: 'Dev Current Pool 2026',
  });
  logger.info({ poolId: pool.id }, 'created pool');

  for (const uid of Object.values(userIds)) {
    await addMember(db, pool.id, uid);
  }
  logger.info({ count: Object.keys(userIds).length }, 'all users joined pool');

  // 8. Create predictions for each user
  for (const [key, profile] of Object.entries(PROFILES)) {
    const uid = userIds[key]!;
    const prediction = await getOrCreatePrediction(db, {
      poolId: pool.id,
      userId: uid,
      tournamentId: TOURNAMENT_ID,
    });
    const predId = prediction.id;

    for (const { matchId: mid, home, away } of profile.groupScores) {
      await upsertGroupScore(db, predId, mid, home, away);
    }

    for (const { bracketMatchKey: bmk, winner } of profile.picks) {
      await upsertKnockoutPick(db, predId, bracketMatchKey(bmk), winner);
    }

    await upsertFinishScore(
      db,
      predId,
      'final',
      profile.finishScores.final.home,
      profile.finishScores.final.away,
    );
    await upsertFinishScore(
      db,
      predId,
      'bronze',
      profile.finishScores.bronze.home,
      profile.finishScores.bronze.away,
    );

    const s = profile.specials;
    if (s.topScorerPlayer) await upsertSpecialBet(db, predId, 'topScorerPlayer', s.topScorerPlayer);
    if (s.groupTopScoringTeam)
      await upsertSpecialBet(db, predId, 'groupTopScoringTeam', s.groupTopScoringTeam);
    if (s.groupTopConcedingTeam)
      await upsertSpecialBet(db, predId, 'groupTopConcedingTeam', s.groupTopConcedingTeam);
    if (s.tournamentTopScoringTeam)
      await upsertSpecialBet(db, predId, 'tournamentTopScoringTeam', s.tournamentTopScoringTeam);
    if (s.tournamentTopConcedingTeam)
      await upsertSpecialBet(
        db,
        predId,
        'tournamentTopConcedingTeam',
        s.tournamentTopConcedingTeam,
      );
    if (s.highestMatchGoals !== undefined)
      await upsertSpecialBet(db, predId, 'highestMatchGoals', s.highestMatchGoals);
    if (s.mostYellowCardsTeam)
      await upsertSpecialBet(db, predId, 'mostYellowCardsTeam', s.mostYellowCardsTeam);
    if (s.firstRedCardPlayer)
      await upsertSpecialBet(db, predId, 'firstRedCardPlayer', s.firstRedCardPlayer);
    if (s.penaltyShootoutCount !== undefined)
      await upsertSpecialBet(db, predId, 'penaltyShootoutCount', s.penaltyShootoutCount);
    if (s.finalDecidedByPenalties !== undefined)
      await upsertSpecialBet(db, predId, 'finalDecidedByPenalties', s.finalDecidedByPenalties);

    logger.info(
      { key, displayName: profile.displayName, predictionId: predId },
      'prediction created',
    );
  }

  // 9. Score all predictions against the partial results
  logger.info('rescoring all predictions against partial results');
  const tournamentRow = await getTournamentById(db, TOURNAMENT_ID);
  const def = tournamentRow?.definition;
  if (!def) throw new Error('Tournament definition not found after upsert');

  const predictions = await listPredictionsForTournament(db, TOURNAMENT_ID);
  let scored = 0;
  let skipped = 0;
  for (const { predictionId, poolId, userId } of predictions) {
    const inputs = await getPredictionInputs(db, predictionId);
    try {
      const derived = deriveCard(inputs, def);
      const breakdown = scoreCard(derived, inputs, partialActual, def.scoring);
      await upsertScore(db, { poolId, userId, pointsTotal: breakdown.total, breakdown });
      scored++;
    } catch {
      skipped++;
    }
  }
  if (skipped > 0) logger.warn({ skipped }, 'some predictions skipped due to errors');
  logger.info({ scored }, 'rescore complete');

  // 10. Also import the real wc-2026 tournament so it's available for browsing.
  logger.info({ tournamentId: REAL_TOURNAMENT_ID }, 'syncing real tournament');
  const realDataDir = join(cwd, 'data', 'tournaments', REAL_TOURNAMENT_ID);
  await syncTournament(db, REAL_TOURNAMENT_ID, realDataDir);

  logger.info(
    {
      loginUrl: `/login/${DEV_CURRENT_TOKEN}`,
      poolId: pool.id,
      users: Object.entries(userIds).map(([k, id]) => ({ name: PROFILES[k]!.displayName, id })),
    },
    'seed-current complete',
  );

  console.log('\n=== Dev Current Seed Complete ===');
  console.log(`Creator login:  http://localhost:3010/login/${DEV_CURRENT_TOKEN}`);
  console.log(`Pool ID:        ${pool.id}`);
  console.log(
    `Match results:  ${partialActual.matchResults.length} group matches (from wc-2026/results.json)`,
  );
  console.log(`Knockout:       ${realKnockoutMatches.length} matches applied`);
  console.log(`Complete groups: ${[...done].sort().join(', ') || 'none'}`);
  console.log('Users:');
  for (const [key, uid] of Object.entries(userIds)) {
    console.log(`  ${PROFILES[key]!.displayName.padEnd(8)} ${uid}`);
  }
}

// ── CLI entry point ────────────────────────────────────────────────────────────

const isDirectlyExecuted =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('/scripts/seed-current.ts') ||
    process.argv[1].endsWith('/scripts/seed-current.js'));

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
      logger.error(err, 'seed-current failed');
      process.exit(1);
    });
}
