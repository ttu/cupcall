/**
 * scripts/seed-ongoing.ts — populate the dev database with a partial WC 2026 scenario.
 *
 * Creates the same 6 users and pool as seed.ts, but only applies results for
 * groups A–F (36/72 group matches). Groups G–L have not started.
 *
 * Usage:
 *   pnpm seed:ongoing        # requires DATABASE_URL set or apps/web/.env.local
 *   pnpm seed:fresh:ongoing  # reset DB first then seed
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
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
  upsertTournamentDef,
  upsertTournamentResults,
  getTournamentById,
  listPredictionsForTournament,
  getPredictionInputs,
  upsertScore,
} from '@cup/db';
import { bracketMatchKey, deriveCard, scoreCard, groupId, teamId, matchId } from '@cup/engine';
import type { ActualResults, UserId } from '@cup/engine';
import { tournamentSchema } from '@cup/schemas';

const TOURNAMENT_ID = 'test-wc-2026';
const DEV_ONGOING_TOKEN = 'dev-ongoing-login';

const logger = pino({ name: 'seed-ongoing', level: 'info' });

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

// ── Per-user group score predictions (groups A–F, 36 matches) ─────────────────
//
// Actual results (home-away, H=home win / A=away win):
//   mA1:2-0H  mA2:2-1H  mA3:2-0H  mA4:2-1H  mA5:1-2A  mA6:0-2A
//   mB1:2-0H  mB2:1-3A  mB3:2-0H  mB4:2-1H  mB5:1-0H  mB6:1-2A
//   mC1:3-0H  mC2:0-2A  mC3:1-2A  mC4:6-1H  mC5:1-2A  mC6:2-0H
//   mD1:2-0H  mD2:1-2A  mD3:2-1H  mD4:2-0H  mD5:0-1A  mD6:1-2A
//   mE1:4-0H  mE2:1-2A  mE3:2-0H  mE4:3-0H  mE5:1-2A  mE6:0-2A
//   mF1:2-1H  mF2:3-0H  mF3:1-0H  mF4:0-2A  mF5:1-2A  mF6:0-2A
//
// Accuracy targets (A–F, 36 matches):
//   Alice:   24 exact / 10 correct-variant / 2 wrong
//   Bob:     14 exact / 13 correct-variant / 9 wrong
//   Charlie:  8 exact / 14 correct-variant / 14 wrong
//   Diana:    4 exact / 12 correct-variant / 20 wrong
//   Eve:      2 exact /  8 correct-variant / 26 wrong
//   Frank:    0 exact /  5 correct-variant / 31 wrong
//
// Correct-outcome variant rules (same outcome, different score, 3 pts):
//   H win 2-0 → predict 1-0;  H win 2-1 → predict 1-0;  H win 3-0 → predict 2-0
//   H win 4-0 → predict 2-0;  H win 6-1 → predict 3-0
//   A win 1-2 → predict 0-1;  A win 0-2 → predict 0-1;  A win 1-3 → predict 0-2
//   A win 0-3 → predict 0-1
//
// Wrong-outcome rules: H win → predict 0-1;  A win → predict 2-0

// Alice — 24 exact, 10 correct-variant, 2 wrong
// Wrong: mB2(2-0), mC2(1-0)
// Correct-variant: mA5(0-1), mA6(0-1), mB6(0-1), mC3(0-1), mC5(0-1), mD2(0-1), mD5(0-1), mD6(0-1), mE2(0-1), mE6(0-1)
// All others: exact
const GROUP_SCORES_ALICE = [
  // Group A
  { matchId: 'mA1', home: 2, away: 0 }, // exact
  { matchId: 'mA2', home: 2, away: 1 }, // exact
  { matchId: 'mA3', home: 2, away: 0 }, // exact
  { matchId: 'mA4', home: 2, away: 1 }, // exact
  { matchId: 'mA5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mA6', home: 0, away: 1 }, // correct-variant (actual 0-2)
  // Group B
  { matchId: 'mB1', home: 2, away: 0 }, // exact
  { matchId: 'mB2', home: 2, away: 0 }, // WRONG (actual 1-3 A win → predict H win 2-0)
  { matchId: 'mB3', home: 2, away: 0 }, // exact
  { matchId: 'mB4', home: 2, away: 1 }, // exact
  { matchId: 'mB5', home: 1, away: 0 }, // exact
  { matchId: 'mB6', home: 0, away: 1 }, // correct-variant (actual 1-2)
  // Group C
  { matchId: 'mC1', home: 3, away: 0 }, // exact
  { matchId: 'mC2', home: 1, away: 0 }, // WRONG (actual 0-2 A win → predict H win 1-0)
  { matchId: 'mC3', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mC4', home: 6, away: 1 }, // exact
  { matchId: 'mC5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mC6', home: 2, away: 0 }, // exact
  // Group D
  { matchId: 'mD1', home: 2, away: 0 }, // exact
  { matchId: 'mD2', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mD3', home: 2, away: 1 }, // exact
  { matchId: 'mD4', home: 2, away: 0 }, // exact
  { matchId: 'mD5', home: 0, away: 1 }, // correct-variant (actual 0-1)
  { matchId: 'mD6', home: 0, away: 1 }, // correct-variant (actual 1-2)
  // Group E
  { matchId: 'mE1', home: 4, away: 0 }, // exact
  { matchId: 'mE2', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mE3', home: 2, away: 0 }, // exact
  { matchId: 'mE4', home: 3, away: 0 }, // exact
  { matchId: 'mE5', home: 1, away: 2 }, // exact
  { matchId: 'mE6', home: 0, away: 1 }, // correct-variant (actual 0-2)
  // Group F
  { matchId: 'mF1', home: 2, away: 1 }, // exact
  { matchId: 'mF2', home: 3, away: 0 }, // exact
  { matchId: 'mF3', home: 1, away: 0 }, // exact
  { matchId: 'mF4', home: 0, away: 2 }, // exact
  { matchId: 'mF5', home: 1, away: 2 }, // exact
  { matchId: 'mF6', home: 0, away: 2 }, // exact
];

// Bob — 14 exact, 13 correct-variant, 9 wrong
// Wrong: mA3(0-1), mA6(1-0), mB2(2-0), mC2(1-0), mC3(2-0), mD2(2-0), mD5(2-0), mE2(2-0), mF4(1-0)
// Correct-variant (13): mA2(1-0), mA5(0-1), mB4(1-0), mB6(0-1), mC3 wrong, mC5(0-1), mD6(0-1), mE5(0-1), mE6(0-1), mF1(1-0), mF5(0-1), mF6(0-1), mC1(2-0)
// Exact (14): mA1, mA4, mB1, mB3, mB5, mC4, mC6, mD1, mD3, mD4, mE1, mE3, mE4, mF2, mF3
const GROUP_SCORES_BOB = [
  // Group A
  { matchId: 'mA1', home: 2, away: 0 }, // exact
  { matchId: 'mA2', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mA3', home: 0, away: 1 }, // WRONG (actual 2-0 H win → predict A win)
  { matchId: 'mA4', home: 2, away: 1 }, // exact
  { matchId: 'mA5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mA6', home: 1, away: 0 }, // WRONG (actual 0-2 A win → predict H win)
  // Group B
  { matchId: 'mB1', home: 2, away: 0 }, // exact
  { matchId: 'mB2', home: 2, away: 0 }, // WRONG (actual 1-3 A win)
  { matchId: 'mB3', home: 2, away: 0 }, // exact
  { matchId: 'mB4', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mB5', home: 1, away: 0 }, // exact
  { matchId: 'mB6', home: 0, away: 1 }, // correct-variant (actual 1-2)
  // Group C
  { matchId: 'mC1', home: 2, away: 0 }, // correct-variant (actual 3-0)
  { matchId: 'mC2', home: 1, away: 0 }, // WRONG (actual 0-2 A win)
  { matchId: 'mC3', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mC4', home: 6, away: 1 }, // exact
  { matchId: 'mC5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mC6', home: 2, away: 0 }, // exact
  // Group D
  { matchId: 'mD1', home: 2, away: 0 }, // exact
  { matchId: 'mD2', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mD3', home: 2, away: 1 }, // exact
  { matchId: 'mD4', home: 2, away: 0 }, // exact
  { matchId: 'mD5', home: 2, away: 0 }, // WRONG (actual 0-1 A win)
  { matchId: 'mD6', home: 0, away: 1 }, // correct-variant (actual 1-2)
  // Group E
  { matchId: 'mE1', home: 4, away: 0 }, // exact
  { matchId: 'mE2', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mE3', home: 2, away: 0 }, // exact
  { matchId: 'mE4', home: 3, away: 0 }, // exact
  { matchId: 'mE5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mE6', home: 0, away: 1 }, // correct-variant (actual 0-2)
  // Group F
  { matchId: 'mF1', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mF2', home: 3, away: 0 }, // exact
  { matchId: 'mF3', home: 1, away: 0 }, // exact
  { matchId: 'mF4', home: 1, away: 0 }, // WRONG (actual 0-2 A win)
  { matchId: 'mF5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mF6', home: 0, away: 1 }, // correct-variant (actual 0-2)
];

// Charlie — 8 exact, 14 correct-variant, 14 wrong
// Wrong: mA2(0-1), mA5(2-0), mB2(2-0), mB6(2-0), mC2(1-0), mC3(2-0), mC5(2-0), mD2(2-0),
//        mD5(2-0), mE2(2-0), mE5(2-0), mF4(1-0), mF5(2-0), mF6(1-0)
// Correct-variant (14): mA1(1-0), mA3(1-0), mA4(1-0), mA6(0-1), mB4(1-0), mB5 exact skip,
//   mC1(2-0), mC6(1-0), mD1(1-0), mD3(1-0), mD6(0-1), mE3(1-0), mE6(0-1), mF3 exact skip
// Exact (8): mB1, mB3, mB5, mC4, mD4, mE1, mE4, mF1, mF2 — need to pick 8
// Let me recount: 14 wrong + 14 correct-variant + 8 exact = 36 ✓
// Exact choices: mB1(2-0), mB3(2-0), mC4(6-1), mD4(2-0), mE1(4-0), mE4(3-0), mF1(2-1), mF2(3-0)
// Correct-variant: mA1(1-0), mA3(1-0), mA4(1-0), mA6(0-1), mB4(1-0), mB5(1-0)→exact actually...
//   mB5 actual=1-0 so predict 1-0 = exact → count as exact; then need another correct-variant
//   Adjust: mB5 = exact → 9 exact candidates; pick 8 exact from: mB1,mB3,mB5,mC4,mD4,mE1,mE4,mF2
//   Correct-variant: mA1,mA3,mA4,mA6,mB4,mC1,mC6,mD1,mD3,mD6,mE3,mE6,mF1→variant(1-0?no,2-1→1-0),mF3
//   Wait mF1 actual=2-1 H, variant=1-0; mF3 actual=1-0 H, exact=1-0; so mF3=exact
//   Recount exact candidates: mB1,mB3,mB5,mC4,mD4,mE1,mE4,mF3 = 8 exact ✓
//   Correct-variant (14): mA1,mA3,mA4,mA6,mB4,mC1,mC6,mD1,mD3,mD6,mE3,mE6,mF1,mF2→variant(2-0? actual 3-0→2-0)
//   mF2 actual=3-0 H, variant=2-0 ✓  Total correct-variant = 14 ✓
const GROUP_SCORES_CHARLIE = [
  // Group A
  { matchId: 'mA1', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mA2', home: 0, away: 1 }, // WRONG (actual 2-1 H win)
  { matchId: 'mA3', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mA4', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mA5', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mA6', home: 0, away: 1 }, // correct-variant (actual 0-2)
  // Group B
  { matchId: 'mB1', home: 2, away: 0 }, // exact
  { matchId: 'mB2', home: 2, away: 0 }, // WRONG (actual 1-3 A win)
  { matchId: 'mB3', home: 2, away: 0 }, // exact
  { matchId: 'mB4', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mB5', home: 1, away: 0 }, // exact
  { matchId: 'mB6', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  // Group C
  { matchId: 'mC1', home: 2, away: 0 }, // correct-variant (actual 3-0)
  { matchId: 'mC2', home: 1, away: 0 }, // WRONG (actual 0-2 A win)
  { matchId: 'mC3', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mC4', home: 6, away: 1 }, // exact
  { matchId: 'mC5', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mC6', home: 1, away: 0 }, // correct-variant (actual 2-0)
  // Group D
  { matchId: 'mD1', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mD2', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mD3', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mD4', home: 2, away: 0 }, // exact
  { matchId: 'mD5', home: 2, away: 0 }, // WRONG (actual 0-1 A win)
  { matchId: 'mD6', home: 0, away: 1 }, // correct-variant (actual 1-2)
  // Group E
  { matchId: 'mE1', home: 4, away: 0 }, // exact
  { matchId: 'mE2', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mE3', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mE4', home: 3, away: 0 }, // exact
  { matchId: 'mE5', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mE6', home: 0, away: 1 }, // correct-variant (actual 0-2)
  // Group F
  { matchId: 'mF1', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mF2', home: 2, away: 0 }, // correct-variant (actual 3-0)
  { matchId: 'mF3', home: 1, away: 0 }, // exact
  { matchId: 'mF4', home: 1, away: 0 }, // WRONG (actual 0-2 A win)
  { matchId: 'mF5', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mF6', home: 1, away: 0 }, // WRONG (actual 0-2 A win)
];

// Diana — 4 exact, 12 correct-variant, 20 wrong
// Wrong: mA1(0-1), mA4(0-1), mA5(2-0), mA6(1-0), mB2(2-0), mB3(0-1), mB5(0-1), mB6(2-0),
//        mC2(1-0), mC3(2-0), mC5(2-0), mD2(2-0), mD3(0-1), mD5(2-0), mD6(2-0),
//        mE2(2-0), mE5(2-0), mE6(1-0), mF4(1-0), mF5(2-0)
// Correct-variant (12): mA2(1-0), mA3(1-0), mB1(1-0), mB4(1-0), mC1(2-0), mC6(1-0),
//   mD1(1-0), mD4(1-0), mE1(2-0), mE3(1-0), mF1(1-0), mF6(0-1)
// Exact (4): mC4(6-1), mE4(3-0), mF2(3-0), mF3(1-0)
const GROUP_SCORES_DIANA = [
  // Group A
  { matchId: 'mA1', home: 0, away: 1 }, // WRONG (actual 2-0 H win)
  { matchId: 'mA2', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mA3', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mA4', home: 0, away: 1 }, // WRONG (actual 2-1 H win)
  { matchId: 'mA5', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mA6', home: 1, away: 0 }, // WRONG (actual 0-2 A win)
  // Group B
  { matchId: 'mB1', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mB2', home: 2, away: 0 }, // WRONG (actual 1-3 A win)
  { matchId: 'mB3', home: 0, away: 1 }, // WRONG (actual 2-0 H win)
  { matchId: 'mB4', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mB5', home: 0, away: 1 }, // WRONG (actual 1-0 H win)
  { matchId: 'mB6', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  // Group C
  { matchId: 'mC1', home: 2, away: 0 }, // correct-variant (actual 3-0)
  { matchId: 'mC2', home: 1, away: 0 }, // WRONG (actual 0-2 A win)
  { matchId: 'mC3', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mC4', home: 6, away: 1 }, // exact
  { matchId: 'mC5', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mC6', home: 1, away: 0 }, // correct-variant (actual 2-0)
  // Group D
  { matchId: 'mD1', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mD2', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mD3', home: 0, away: 1 }, // WRONG (actual 2-1 H win)
  { matchId: 'mD4', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mD5', home: 2, away: 0 }, // WRONG (actual 0-1 A win)
  { matchId: 'mD6', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  // Group E
  { matchId: 'mE1', home: 2, away: 0 }, // correct-variant (actual 4-0)
  { matchId: 'mE2', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mE3', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mE4', home: 3, away: 0 }, // exact
  { matchId: 'mE5', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mE6', home: 1, away: 0 }, // WRONG (actual 0-2 A win)
  // Group F
  { matchId: 'mF1', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mF2', home: 3, away: 0 }, // exact
  { matchId: 'mF3', home: 1, away: 0 }, // exact
  { matchId: 'mF4', home: 1, away: 0 }, // WRONG (actual 0-2 A win)
  { matchId: 'mF5', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mF6', home: 0, away: 1 }, // correct-variant (actual 0-2)
];

// Eve — 2 exact, 8 correct-variant, 26 wrong
// Wrong: mA1(0-1), mA2(0-1), mA3(0-1), mA4(0-1), mA5(2-0), mA6(1-0),
//        mB1(0-1), mB2(2-0), mB4(0-1), mB5(0-1), mB6(2-0),
//        mC1(0-1), mC2(1-0), mC3(2-0), mC5(2-0),
//        mD1(0-1), mD2(2-0), mD3(0-1), mD5(2-0), mD6(2-0),
//        mE2(2-0), mE3(0-1), mE5(2-0), mE6(1-0), mF4(1-0), mF6(1-0)
// Correct-variant (8): mB3(1-0), mC4→exact skip, mC6(1-0), mD4(1-0), mE1(2-0), mE4(2-0), mF1(1-0), mF2(2-0), mF5(0-1)
// Wait mC4 actual=6-1 H, exact=6-1; mE4 actual=3-0 H, variant=2-0
// Need exactly 2 exact: pick mC4(6-1) and mF3(1-0)
// Correct-variant (8): mB3(1-0), mC6(1-0), mD4(1-0), mE1(2-0), mE4(2-0), mF1(1-0), mF2(2-0), mF5(0-1)
// Total: 26 wrong + 8 correct-variant + 2 exact = 36 ✓
const GROUP_SCORES_EVE = [
  // Group A
  { matchId: 'mA1', home: 0, away: 1 }, // WRONG (actual 2-0 H win)
  { matchId: 'mA2', home: 0, away: 1 }, // WRONG (actual 2-1 H win)
  { matchId: 'mA3', home: 0, away: 1 }, // WRONG (actual 2-0 H win)
  { matchId: 'mA4', home: 0, away: 1 }, // WRONG (actual 2-1 H win)
  { matchId: 'mA5', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mA6', home: 1, away: 0 }, // WRONG (actual 0-2 A win)
  // Group B
  { matchId: 'mB1', home: 0, away: 1 }, // WRONG (actual 2-0 H win)
  { matchId: 'mB2', home: 2, away: 0 }, // WRONG (actual 1-3 A win)
  { matchId: 'mB3', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mB4', home: 0, away: 1 }, // WRONG (actual 2-1 H win)
  { matchId: 'mB5', home: 0, away: 1 }, // WRONG (actual 1-0 H win)
  { matchId: 'mB6', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  // Group C
  { matchId: 'mC1', home: 0, away: 1 }, // WRONG (actual 3-0 H win)
  { matchId: 'mC2', home: 1, away: 0 }, // WRONG (actual 0-2 A win)
  { matchId: 'mC3', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mC4', home: 6, away: 1 }, // exact
  { matchId: 'mC5', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mC6', home: 1, away: 0 }, // correct-variant (actual 2-0)
  // Group D
  { matchId: 'mD1', home: 0, away: 1 }, // WRONG (actual 2-0 H win)
  { matchId: 'mD2', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mD3', home: 0, away: 1 }, // WRONG (actual 2-1 H win)
  { matchId: 'mD4', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mD5', home: 2, away: 0 }, // WRONG (actual 0-1 A win)
  { matchId: 'mD6', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  // Group E
  { matchId: 'mE1', home: 2, away: 0 }, // correct-variant (actual 4-0)
  { matchId: 'mE2', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mE3', home: 0, away: 1 }, // WRONG (actual 2-0 H win)
  { matchId: 'mE4', home: 2, away: 0 }, // correct-variant (actual 3-0)
  { matchId: 'mE5', home: 2, away: 0 }, // WRONG (actual 1-2 A win)
  { matchId: 'mE6', home: 1, away: 0 }, // WRONG (actual 0-2 A win)
  // Group F
  { matchId: 'mF1', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mF2', home: 2, away: 0 }, // correct-variant (actual 3-0)
  { matchId: 'mF3', home: 1, away: 0 }, // exact
  { matchId: 'mF4', home: 1, away: 0 }, // WRONG (actual 0-2 A win)
  { matchId: 'mF5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mF6', home: 1, away: 0 }, // WRONG (actual 0-2 A win)
];

// Frank — 0 exact, 5 correct-variant, 31 wrong
// Wrong: all of Eve's 26 wrong + mC4(0-1), mD4(0-1), mE1(0-1), mE4(0-1), mF1(0-1)
// That's 26+5=31 wrong ✓
// Correct-variant (5): mB3(1-0), mC6(1-0), mE1 is wrong so → need other 5 from Eve's correct-variants
//   Eve's correct-variants: mB3, mC6, mD4, mE1, mE4, mF1, mF2, mF5
//   Frank makes wrong: mC4, mD4, mE1, mE4, mF1 (overlap with Eve's correct: mD4,mE1,mE4,mF1 → 4 that Eve had correct, Frank has wrong)
//   Frank's correct-variants are from Eve's 8 correct minus 4 that Frank also gets wrong: mB3, mC6, mF2, mF5
//   That's only 4 — need 5 total. Plus mC4 is wrong for Frank but Eve has exact on mC4.
//   So Frank's correct-variants: mB3(1-0), mC6(1-0), mF2(2-0), mF5(0-1), and one more...
//   mF3 — Eve has exact mF3(1-0), Frank should get wrong or variant. Assign Frank mF3 as correct-variant: same score → that would be exact! mF3 actual=1-0.
//   Use a different one: mA6 — actual 0-2 A win, Frank is wrong (1-0 H win per Eve's pattern).
//   Let's pick mD6: actual 1-2 A win → Frank's 5th correct-variant = 0-1.
//   Frank wrong 31: all Eve's 26 + mC4(0-1) + mD4(0-1) + mE1(0-1) + mE4(0-1) + mF1(0-1) = 31
//   Frank correct-variant 5: mB3(1-0), mC6(1-0), mF2(2-0), mF5(0-1), mD6(0-1)
//   Frank exact 0 ✓ (mF3 → Frank gets wrong: 0-1 since actual=1-0 H win → wrong = 0-1)
//   Updated: wrong 31+1=32? No, need to recount.
//   mF3 actual=1-0 H win. Eve has exact (1-0). Frank must not have exact (0 exact). Frank gets wrong: 0-1.
//   New Frank wrong: Eve's 26 wrong + mC4 + mD4 + mE1 + mE4 + mF1 + mF3 = 32. Too many.
//   Fix: drop one wrong from Eve's list for Frank. Drop mF5 (Eve has it as correct-variant).
//   Frank on mF5: actual=1-2 A win → correct-variant = 0-1. So Frank keeps mF5 correct-variant.
//   Frank wrong: Eve's 26 wrong (which excludes mF5) + mC4 + mD4 + mE1 + mE4 + mF1 = 31 ✓
//   Frank correct-variant 5: mB3(1-0), mC6(1-0), mF2(2-0), mF5(0-1), mD6(0-1) ✓ but mF3?
//   Eve exact: mC4, mF3. Frank wrong on mC4(0-1). Frank wrong on mF3(0-1). That adds mF3 to wrongs.
//   Frank wrong = Eve's 26 + mC4 + mD4 + mE1 + mE4 + mF1 + mF3 = 32. Still off.
//   I need to remove one: Eve is wrong on mF6(1-0), Frank also wrong on mF6. Let me drop mD6 from Frank's correct-variant list and make mD6 wrong for Frank.
//   Frank wrong (32): Eve's 26 + mC4 + mD4 + mE1 + mE4 + mF1 + mF3 = 32. Still 32.
//   Need exactly 31 wrong. Let me reassign: Frank only adds 4 new wrongs on top of Eve's 26: mC4, mD4, mE1, mE4 (drop mF1).
//   Eve's 26 wrongs: mA1,mA2,mA3,mA4,mA5,mA6,mB1,mB2,mB4,mB5,mB6,mC1,mC2,mC3,mC5,mD1,mD2,mD3,mD5,mD6,mE2,mE3,mE5,mE6,mF4,mF6
//   Wait, let me recount Eve's wrongs from her array above: 26 matches
//   Eve correct-variants: mB3,mC6,mD4,mE1,mE4,mF1,mF2,mF5 = 8
//   Eve exact: mC4, mF3 = 2
//   Total: 26+8+2 = 36 ✓
//   Frank wrong = Eve's 26 wrong + mC4(was Eve exact) + mD4(was Eve correct-variant) + mE1(was Eve correct-variant) + mE4(was Eve correct-variant) + mF1(was Eve correct-variant) = 31
//   Frank correct-variant = Eve's correct-variants minus the ones Frank got wrong = {mB3,mC6,mF2,mF5} = 4
//   Frank exact: 0 (mF3 was Eve exact; Frank also needs to get it wrong: 0-1) = 5th wrong added!
//   Frank wrong = Eve's 26 + mC4 + mD4 + mE1 + mE4 + mF1 + mF3 = 32. STILL 32.
//   Resolution: remove mD6 from Eve's wrong list and add it to Frank's wrong list is circular.
//   The spec says "all of Eve's wrong + mC4,mD4,mE1,mE4,mF1" = 26+5 = 31.
//   Eve's wrongs (26) from the spec: mA1,mA2,mA3,mA4,mA5,mA6,mB1,mB2,mB4,mB5,mB6,mC1,mC2,mC3,mC5,mD1,mD2,mD3,mD5,mD6,mE2,mE3,mE5,mE6,mF4,mF6 = 26 ✓
//   Frank's additional wrongs: mC4,mD4,mE1,mE4,mF1 = 5
//   Frank correct-variants: {mB3,mC6,mF2,mF5} from Eve's correct-variants = 4
//   Frank exact: must be 0, so mF3 must be wrong for Frank too.
//   Total Frank wrong: 26+5+1(mF3) = 32. But target=31.
//   Conclusion: mF3 must be a correct-variant for Frank (not exact), making it 5 correct-variants.
//   mF3 actual=1-0 H. Correct-variant for H win 1-0 would be... H win but different score.
//   Smallest H win score: 1-0 is already minimal. The convention table doesn't list 1-0→variant.
//   Since mF3 is 1-0, the only distinct variant would need a higher score like 2-0... but that changes meaning.
//   Alternative: Frank's 5th correct-variant is mD6 (actual 1-2 A win → variant 0-1), and mF3 stays wrong (0-1 for Frank).
//   Then Frank wrong: Eve's 26 + mC4 + mD4 + mE1 + mE4 + mF1 + mF3 = 32. Still 32.
//   The only clean solution: use only 4 of the 5 additional wrongs. Use mC4,mD4,mE1,mE4 (drop mF1).
//   Frank wrong: 26+4 = 30. Need 31. Add mF3 as wrong. Frank wrong = 31 ✓.
//   Frank correct-variants (5): mB3(1-0), mC6(1-0), mF1(1-0), mF2(2-0), mF5(0-1) = 5 ✓
//   Frank exact: 0 ✓
//   Frank wrong additional beyond Eve: mC4(0-1), mD4(0-1), mE1(0-1), mE4(0-1), mF3(0-1) = 5 ✓
const GROUP_SCORES_FRANK = [
  // Group A — all wrong same as Eve
  { matchId: 'mA1', home: 0, away: 1 }, // WRONG
  { matchId: 'mA2', home: 0, away: 1 }, // WRONG
  { matchId: 'mA3', home: 0, away: 1 }, // WRONG
  { matchId: 'mA4', home: 0, away: 1 }, // WRONG
  { matchId: 'mA5', home: 2, away: 0 }, // WRONG
  { matchId: 'mA6', home: 1, away: 0 }, // WRONG
  // Group B
  { matchId: 'mB1', home: 0, away: 1 }, // WRONG (same as Eve)
  { matchId: 'mB2', home: 2, away: 0 }, // WRONG (same as Eve)
  { matchId: 'mB3', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mB4', home: 0, away: 1 }, // WRONG (same as Eve)
  { matchId: 'mB5', home: 0, away: 1 }, // WRONG (same as Eve)
  { matchId: 'mB6', home: 2, away: 0 }, // WRONG (same as Eve)
  // Group C
  { matchId: 'mC1', home: 0, away: 1 }, // WRONG (same as Eve)
  { matchId: 'mC2', home: 1, away: 0 }, // WRONG (same as Eve)
  { matchId: 'mC3', home: 2, away: 0 }, // WRONG (same as Eve)
  { matchId: 'mC4', home: 0, away: 1 }, // WRONG (actual 6-1 H win → Eve had exact)
  { matchId: 'mC5', home: 2, away: 0 }, // WRONG (same as Eve)
  { matchId: 'mC6', home: 1, away: 0 }, // correct-variant (actual 2-0)
  // Group D
  { matchId: 'mD1', home: 0, away: 1 }, // WRONG (same as Eve)
  { matchId: 'mD2', home: 2, away: 0 }, // WRONG (same as Eve)
  { matchId: 'mD3', home: 0, away: 1 }, // WRONG (same as Eve)
  { matchId: 'mD4', home: 0, away: 1 }, // WRONG (actual 2-0 H win → Eve had correct-variant)
  { matchId: 'mD5', home: 2, away: 0 }, // WRONG (same as Eve)
  { matchId: 'mD6', home: 2, away: 0 }, // WRONG (same as Eve)
  // Group E
  { matchId: 'mE1', home: 0, away: 1 }, // WRONG (actual 4-0 H win → Eve had correct-variant)
  { matchId: 'mE2', home: 2, away: 0 }, // WRONG (same as Eve)
  { matchId: 'mE3', home: 0, away: 1 }, // WRONG (same as Eve)
  { matchId: 'mE4', home: 0, away: 1 }, // WRONG (actual 3-0 H win → Eve had correct-variant)
  { matchId: 'mE5', home: 2, away: 0 }, // WRONG (same as Eve)
  { matchId: 'mE6', home: 1, away: 0 }, // WRONG (same as Eve)
  // Group F
  { matchId: 'mF1', home: 1, away: 0 }, // correct-variant (actual 2-1 → Eve had correct-variant)
  { matchId: 'mF2', home: 2, away: 0 }, // correct-variant (actual 3-0 → Eve had correct-variant)
  { matchId: 'mF3', home: 0, away: 1 }, // WRONG (actual 1-0 H win → Eve had exact)
  { matchId: 'mF4', home: 1, away: 0 }, // WRONG (same as Eve)
  { matchId: 'mF5', home: 0, away: 1 }, // correct-variant (actual 1-2 → same as Eve)
  { matchId: 'mF6', home: 1, away: 0 }, // WRONG (same as Eve)
];

// ── Knockout bracket definitions ───────────────────────────────────────────────

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

// Alice — all correct
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

// Bob — picks FRA over GER in r16m89, then FRA all the way to final
const PICKS_BOB = [
  ...R32_ALL_CORRECT,
  { bracketMatchKey: 'r16m89', winner: 'FRA' },
  { bracketMatchKey: 'r16m90', winner: 'NED' },
  { bracketMatchKey: 'r16m91', winner: 'BRA' },
  { bracketMatchKey: 'r16m92', winner: 'ENG' },
  { bracketMatchKey: 'r16m93', winner: 'ESP' },
  { bracketMatchKey: 'r16m94', winner: 'BEL' },
  { bracketMatchKey: 'r16m95', winner: 'ARG' },
  { bracketMatchKey: 'r16m96', winner: 'POR' },
  { bracketMatchKey: 'qf97', winner: 'FRA' },
  { bracketMatchKey: 'qf98', winner: 'ESP' },
  { bracketMatchKey: 'qf99', winner: 'BRA' },
  { bracketMatchKey: 'qf100', winner: 'ARG' },
  { bracketMatchKey: 'sf101', winner: 'FRA' },
  { bracketMatchKey: 'sf102', winner: 'ARG' },
  { bracketMatchKey: 'final', winner: 'ARG' },
  { bracketMatchKey: 'bronze', winner: 'ESP' },
] as const;

// Charlie — same R16 as actual, wrong in QF (BEL over ESP, ENG over BRA)
const PICKS_CHARLIE = [
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
  { bracketMatchKey: 'qf98', winner: 'BEL' },
  { bracketMatchKey: 'qf99', winner: 'ENG' },
  { bracketMatchKey: 'qf100', winner: 'ARG' },
  { bracketMatchKey: 'sf101', winner: 'GER' },
  { bracketMatchKey: 'sf102', winner: 'ARG' },
  { bracketMatchKey: 'final', winner: 'ARG' },
  { bracketMatchKey: 'bronze', winner: 'BEL' },
] as const;

// Diana — picks MEX over ENG in r16m92
const PICKS_DIANA = [
  ...R32_ALL_CORRECT,
  { bracketMatchKey: 'r16m89', winner: 'GER' },
  { bracketMatchKey: 'r16m90', winner: 'NED' },
  { bracketMatchKey: 'r16m91', winner: 'BRA' },
  { bracketMatchKey: 'r16m92', winner: 'MEX' },
  { bracketMatchKey: 'r16m93', winner: 'ESP' },
  { bracketMatchKey: 'r16m94', winner: 'BEL' },
  { bracketMatchKey: 'r16m95', winner: 'ARG' },
  { bracketMatchKey: 'r16m96', winner: 'POR' },
  { bracketMatchKey: 'qf97', winner: 'GER' },
  { bracketMatchKey: 'qf98', winner: 'ESP' },
  { bracketMatchKey: 'qf99', winner: 'MEX' },
  { bracketMatchKey: 'qf100', winner: 'ARG' },
  { bracketMatchKey: 'sf101', winner: 'ESP' },
  { bracketMatchKey: 'sf102', winner: 'MEX' },
  { bracketMatchKey: 'final', winner: 'ESP' },
  { bracketMatchKey: 'bronze', winner: 'GER' },
] as const;

// Eve — picks NOR over BRA (r16m91) and TUR over ARG (r16m95)
const PICKS_EVE = [
  ...R32_ALL_CORRECT,
  { bracketMatchKey: 'r16m89', winner: 'GER' },
  { bracketMatchKey: 'r16m90', winner: 'NED' },
  { bracketMatchKey: 'r16m91', winner: 'NOR' },
  { bracketMatchKey: 'r16m92', winner: 'ENG' },
  { bracketMatchKey: 'r16m93', winner: 'ESP' },
  { bracketMatchKey: 'r16m94', winner: 'BEL' },
  { bracketMatchKey: 'r16m95', winner: 'TUR' },
  { bracketMatchKey: 'r16m96', winner: 'POR' },
  { bracketMatchKey: 'qf97', winner: 'GER' },
  { bracketMatchKey: 'qf98', winner: 'ESP' },
  { bracketMatchKey: 'qf99', winner: 'ENG' },
  { bracketMatchKey: 'qf100', winner: 'TUR' },
  { bracketMatchKey: 'sf101', winner: 'ESP' },
  { bracketMatchKey: 'sf102', winner: 'ENG' },
  { bracketMatchKey: 'final', winner: 'ENG' },
  { bracketMatchKey: 'bronze', winner: 'GER' },
] as const;

// Frank — picks ECU (r32m78), AUT (r32m84), URU (r32m86) in R32
const PICKS_FRANK = [
  { bracketMatchKey: 'r32m73', winner: 'KOR' },
  { bracketMatchKey: 'r32m74', winner: 'GER' },
  { bracketMatchKey: 'r32m75', winner: 'NED' },
  { bracketMatchKey: 'r32m76', winner: 'BRA' },
  { bracketMatchKey: 'r32m77', winner: 'FRA' },
  { bracketMatchKey: 'r32m78', winner: 'ECU' },
  { bracketMatchKey: 'r32m79', winner: 'MEX' },
  { bracketMatchKey: 'r32m80', winner: 'ENG' },
  { bracketMatchKey: 'r32m81', winner: 'USA' },
  { bracketMatchKey: 'r32m82', winner: 'BEL' },
  { bracketMatchKey: 'r32m83', winner: 'COL' },
  { bracketMatchKey: 'r32m84', winner: 'AUT' },
  { bracketMatchKey: 'r32m85', winner: 'SUI' },
  { bracketMatchKey: 'r32m86', winner: 'URU' },
  { bracketMatchKey: 'r32m87', winner: 'POR' },
  { bracketMatchKey: 'r32m88', winner: 'TUR' },
  { bracketMatchKey: 'r16m89', winner: 'GER' },
  { bracketMatchKey: 'r16m90', winner: 'NED' },
  { bracketMatchKey: 'r16m91', winner: 'BRA' },
  { bracketMatchKey: 'r16m92', winner: 'ENG' },
  { bracketMatchKey: 'r16m93', winner: 'COL' },
  { bracketMatchKey: 'r16m94', winner: 'BEL' },
  { bracketMatchKey: 'r16m95', winner: 'URU' },
  { bracketMatchKey: 'r16m96', winner: 'POR' },
  { bracketMatchKey: 'qf97', winner: 'GER' },
  { bracketMatchKey: 'qf98', winner: 'BEL' },
  { bracketMatchKey: 'qf99', winner: 'ENG' },
  { bracketMatchKey: 'qf100', winner: 'URU' },
  { bracketMatchKey: 'sf101', winner: 'GER' },
  { bracketMatchKey: 'sf102', winner: 'ENG' },
  { bracketMatchKey: 'final', winner: 'GER' },
  { bracketMatchKey: 'bronze', winner: 'BEL' },
] as const;

// ── Per-user prediction profiles ───────────────────────────────────────────────

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
    finishScores: {
      final: { home: 1, away: 1 },
      bronze: { home: 2, away: 1 },
    },
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
    finishScores: {
      final: { home: 2, away: 1 },
      bronze: { home: 2, away: 1 },
    },
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
    finishScores: {
      final: { home: 1, away: 0 },
      bronze: { home: 2, away: 1 },
    },
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
    finishScores: {
      final: { home: 2, away: 1 },
      bronze: { home: 2, away: 0 },
    },
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
    finishScores: {
      final: { home: 2, away: 1 },
      bronze: { home: 2, away: 0 },
    },
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
    finishScores: {
      final: { home: 1, away: 0 },
      bronze: { home: 2, away: 1 },
    },
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

// ── Partial actual results (groups A–F only) ──────────────────────────────────

const GROUP_A_F_MATCH_IDS = [
  'mA1',
  'mA2',
  'mA3',
  'mA4',
  'mA5',
  'mA6',
  'mB1',
  'mB2',
  'mB3',
  'mB4',
  'mB5',
  'mB6',
  'mC1',
  'mC2',
  'mC3',
  'mC4',
  'mC5',
  'mC6',
  'mD1',
  'mD2',
  'mD3',
  'mD4',
  'mD5',
  'mD6',
  'mE1',
  'mE2',
  'mE3',
  'mE4',
  'mE5',
  'mE6',
  'mF1',
  'mF2',
  'mF3',
  'mF4',
  'mF5',
  'mF6',
];

// Actual results for groups A–F (used for scoring)
const ACTUAL_GROUP_A_F = [
  { matchId: 'mA1', home: 2, away: 0 },
  { matchId: 'mA2', home: 2, away: 1 },
  { matchId: 'mA3', home: 2, away: 0 },
  { matchId: 'mA4', home: 2, away: 1 },
  { matchId: 'mA5', home: 1, away: 2 },
  { matchId: 'mA6', home: 0, away: 2 },
  { matchId: 'mB1', home: 2, away: 0 },
  { matchId: 'mB2', home: 1, away: 3 },
  { matchId: 'mB3', home: 2, away: 0 },
  { matchId: 'mB4', home: 2, away: 1 },
  { matchId: 'mB5', home: 1, away: 0 },
  { matchId: 'mB6', home: 1, away: 2 },
  { matchId: 'mC1', home: 3, away: 0 },
  { matchId: 'mC2', home: 0, away: 2 },
  { matchId: 'mC3', home: 1, away: 2 },
  { matchId: 'mC4', home: 6, away: 1 },
  { matchId: 'mC5', home: 1, away: 2 },
  { matchId: 'mC6', home: 2, away: 0 },
  { matchId: 'mD1', home: 2, away: 0 },
  { matchId: 'mD2', home: 1, away: 2 },
  { matchId: 'mD3', home: 2, away: 1 },
  { matchId: 'mD4', home: 2, away: 0 },
  { matchId: 'mD5', home: 0, away: 1 },
  { matchId: 'mD6', home: 1, away: 2 },
  { matchId: 'mE1', home: 4, away: 0 },
  { matchId: 'mE2', home: 1, away: 2 },
  { matchId: 'mE3', home: 2, away: 0 },
  { matchId: 'mE4', home: 3, away: 0 },
  { matchId: 'mE5', home: 1, away: 2 },
  { matchId: 'mE6', home: 0, away: 2 },
  { matchId: 'mF1', home: 2, away: 1 },
  { matchId: 'mF2', home: 3, away: 0 },
  { matchId: 'mF3', home: 1, away: 0 },
  { matchId: 'mF4', home: 0, away: 2 },
  { matchId: 'mF5', home: 1, away: 2 },
  { matchId: 'mF6', home: 0, away: 2 },
];

const partialActual: ActualResults = {
  matchResults: ACTUAL_GROUP_A_F.filter((s) => GROUP_A_F_MATCH_IDS.includes(s.matchId)).map(
    (r) => ({
      matchId: matchId(r.matchId),
      home: r.home,
      away: r.away,
    }),
  ),
  groupOrder: {
    [groupId('A')]: ['MEX', 'KOR', 'CZE', 'RSA'].map(teamId),
    [groupId('B')]: ['SUI', 'CAN', 'QAT', 'BIH'].map(teamId),
    [groupId('C')]: ['BRA', 'MAR', 'SCO', 'HAI'].map(teamId),
    [groupId('D')]: ['USA', 'TUR', 'AUS', 'PAR'].map(teamId),
    [groupId('E')]: ['GER', 'ECU', 'CIV', 'CUW'].map(teamId),
    [groupId('F')]: ['NED', 'SWE', 'JPN', 'TUN'].map(teamId),
  },
  answers: {
    highestMatchGoals: 7,
  },
};

// ── Main seed function ─────────────────────────────────────────────────────────

async function seed(db: ReturnType<typeof createDb<typeof schema>>): Promise<void> {
  const cwd = process.cwd();
  const dataDir = join(cwd, 'data', 'tournaments', TOURNAMENT_ID);

  // 1. Parse tournament definition
  logger.info({ tournamentId: TOURNAMENT_ID }, 'parsing tournament definition');
  const tournamentRaw: unknown = JSON.parse(
    readFileSync(join(dataDir, 'tournament.json'), 'utf-8'),
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

  // 2. Upsert tournament definition
  logger.info({ tournamentId: TOURNAMENT_ID }, 'upserting tournament definition');
  await upsertTournamentDef(db, tournament, firstKickoff, matchKickoffs);

  // 3. Upsert partial results (groups A–F only)
  logger.info({ tournamentId: TOURNAMENT_ID }, 'upserting partial results (groups A–F)');
  await upsertTournamentResults(db, TOURNAMENT_ID, partialActual);

  // 4. Create all users
  const userIds: Record<string, UserId> = {};
  for (const [key, profile] of Object.entries(PROFILES)) {
    const user = await createGuestUser(db, { displayName: profile.displayName });
    userIds[key] = user.id;
    logger.info({ key, userId: user.id, displayName: user.displayName }, 'created user');
  }

  // Alice gets the dev-ongoing login token
  await upsertLoginToken(db, userIds['alice']!, DEV_ONGOING_TOKEN);
  logger.info({ token: DEV_ONGOING_TOKEN }, 'ongoing login token set');

  // 5. Create a pool owned by Alice
  const pool = await createPool(db, {
    tournamentId: TOURNAMENT_ID,
    ownerId: userIds['alice']!,
    name: 'Dev Ongoing Pool 2026',
  });
  logger.info({ poolId: pool.id }, 'created pool');

  // 6. Add all users to the pool
  for (const uid of Object.values(userIds)) {
    await addMember(db, pool.id, uid);
  }
  logger.info({ count: Object.keys(userIds).length }, 'all users joined pool');

  // 7. Create full predictions for each user
  for (const [key, profile] of Object.entries(PROFILES)) {
    const uid = userIds[key]!;
    const prediction = await getOrCreatePrediction(db, {
      poolId: pool.id,
      userId: uid,
      tournamentId: TOURNAMENT_ID,
    });
    const predId = prediction.id;

    // Group scores — per-user arrays with varied accuracy
    for (const { matchId: mid, home, away } of profile.groupScores) {
      await upsertGroupScore(db, predId, mid, home, away);
    }

    // Knockout picks
    for (const { bracketMatchKey: bmk, winner } of profile.picks) {
      await upsertKnockoutPick(db, predId, bracketMatchKey(bmk), winner);
    }

    // Finish scores
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

    // Special bets
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

  // 8. Rescore all predictions against the partial results
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
      // Incomplete prediction — skip gracefully
      skipped++;
    }
  }
  if (skipped > 0) {
    logger.warn({ skipped }, 'some predictions were skipped due to errors');
  }
  logger.info({ scored }, 'rescore complete');

  logger.info(
    {
      loginUrl: `/login/${DEV_ONGOING_TOKEN}`,
      poolId: pool.id,
      users: Object.entries(userIds).map(([k, id]) => ({ name: PROFILES[k]!.displayName, id })),
    },
    'seed-ongoing complete',
  );

  console.log('\n=== Dev Ongoing Seed Complete ===');
  console.log(`Creator login:  http://localhost:3010/login/${DEV_ONGOING_TOKEN}`);
  console.log(`Pool ID:        ${pool.id}`);
  console.log('State:          Groups A–F done (36/72 group matches), groups G–L not started');
  console.log('Users:');
  for (const [key, uid] of Object.entries(userIds)) {
    console.log(`  ${PROFILES[key]!.displayName.padEnd(8)} ${uid}`);
  }
}

// ── CLI entry point ────────────────────────────────────────────────────────────

const isDirectlyExecuted =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('/scripts/seed-ongoing.ts') ||
    process.argv[1].endsWith('/scripts/seed-ongoing.js'));

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
      logger.error(err, 'seed-ongoing failed');
      process.exit(1);
    });
}
