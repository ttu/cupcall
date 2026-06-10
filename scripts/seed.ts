/**
 * scripts/seed.ts — populate the dev database with a complete WC 2026 scenario.
 *
 * Creates 6 users (creator + 5 members) in one pool with full predictions.
 * The creator has a hard-coded login token so you can log in at /login/dev-creator-login.
 *
 * Usage:
 *   pnpm db:reset --sync wc-2026   # fresh schema + sync tournament data
 *   pnpm seed                       # create users, pool, predictions; re-scores via sync
 *
 * Or in one step from scratch:
 *   pnpm db:reset && pnpm seed:fresh
 */

import { join } from 'node:path';
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
import { bracketMatchKey } from '@cup/engine';
import type { UserId } from '@cup/engine';
import { syncTournament } from './sync';

const TOURNAMENT_ID = 'test-wc-2026';
const DEV_CREATOR_TOKEN = 'dev-creator-login';

const logger = pino({ name: 'seed', level: 'info' });

// ── Per-user group score predictions (all 12 groups, 72 matches) ──────────────
//
// Accuracy tiers (exact / correct-variant / wrong across 72 matches):
//   Alice:   48 / 24 /  0   Bob:    24 / 42 /  6   Charlie: 13 / 51 /  8
//   Diana:    6 / 56 / 10   Eve:     3 / 57 / 12   Frank:    0 / 20 / 52
//
// Correct-variant: same outcome, different score (3 pts).
// Wrong: wrong outcome (0 pts). Each wrong pick flips 1v2 in a group via a single h2h match.

// Alice — all outcomes correct; 48 exact scores
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
  { matchId: 'mB2', home: 0, away: 1 }, // correct-variant (actual 1-3 A win)
  { matchId: 'mB3', home: 2, away: 0 }, // exact
  { matchId: 'mB4', home: 2, away: 1 }, // exact
  { matchId: 'mB5', home: 1, away: 0 }, // exact
  { matchId: 'mB6', home: 0, away: 1 }, // correct-variant (actual 1-2)
  // Group C
  { matchId: 'mC1', home: 3, away: 0 }, // exact
  { matchId: 'mC2', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
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
  // Group G
  { matchId: 'mG1', home: 2, away: 1 }, // exact
  { matchId: 'mG2', home: 2, away: 0 }, // exact
  { matchId: 'mG3', home: 2, away: 0 }, // exact
  { matchId: 'mG4', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  { matchId: 'mG5', home: 2, away: 1 }, // exact
  { matchId: 'mG6', home: 0, away: 1 }, // correct-variant (actual 0-3)
  // Group H
  { matchId: 'mH1', home: 3, away: 0 }, // exact
  { matchId: 'mH2', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mH3', home: 2, away: 0 }, // exact
  { matchId: 'mH4', home: 2, away: 0 }, // exact
  { matchId: 'mH5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mH6', home: 0, away: 1 }, // correct-variant (actual 1-2)
  // Group I
  { matchId: 'mI1', home: 2, away: 0 }, // exact
  { matchId: 'mI2', home: 0, away: 1 }, // correct-variant (actual 0-3 A win)
  { matchId: 'mI3', home: 3, away: 0 }, // exact
  { matchId: 'mI4', home: 2, away: 0 }, // exact
  { matchId: 'mI5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mI6', home: 2, away: 0 }, // exact
  // Group J
  { matchId: 'mJ1', home: 3, away: 0 }, // exact
  { matchId: 'mJ2', home: 2, away: 0 }, // exact
  { matchId: 'mJ3', home: 2, away: 1 }, // exact
  { matchId: 'mJ4', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mJ5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mJ6', home: 0, away: 1 }, // correct-variant (actual 0-2)
  // Group K
  { matchId: 'mK1', home: 3, away: 0 }, // exact
  { matchId: 'mK2', home: 0, away: 1 }, // correct-variant (actual 0-2)
  { matchId: 'mK3', home: 2, away: 0 }, // exact
  { matchId: 'mK4', home: 2, away: 1 }, // exact
  { matchId: 'mK5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mK6', home: 2, away: 0 }, // exact
  // Group L
  { matchId: 'mL1', home: 2, away: 0 }, // exact
  { matchId: 'mL2', home: 2, away: 1 }, // exact
  { matchId: 'mL3', home: 2, away: 0 }, // exact
  { matchId: 'mL4', home: 0, away: 2 }, // exact
  { matchId: 'mL5', home: 0, away: 3 }, // exact
  { matchId: 'mL6', home: 2, away: 0 }, // exact
];

// Bob — 24 exact, 42 correct-variant, 6 wrong (flips 1v2 in A, B, E, I, K, L)
const GROUP_SCORES_BOB = [
  // Group A
  { matchId: 'mA1', home: 2, away: 0 }, // exact
  { matchId: 'mA2', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mA3', home: 1, away: 0 }, // correct-variant (actual 2-0 H win)
  { matchId: 'mA4', home: 0, away: 1 }, // WRONG (KOR beats MEX → predicted 1A=KOR, 2A=MEX)
  { matchId: 'mA5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mA6', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  // Group B
  { matchId: 'mB1', home: 2, away: 0 }, // exact
  { matchId: 'mB2', home: 0, away: 1 }, // correct-variant (actual 1-3 A win)
  { matchId: 'mB3', home: 2, away: 0 }, // exact
  { matchId: 'mB4', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mB5', home: 0, away: 1 }, // WRONG (CAN beats SUI → predicted 1B=CAN, 2B=SUI)
  { matchId: 'mB6', home: 0, away: 1 }, // correct-variant (actual 1-2)
  // Group C
  { matchId: 'mC1', home: 2, away: 0 }, // correct-variant (actual 3-0)
  { matchId: 'mC2', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  { matchId: 'mC3', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mC4', home: 6, away: 1 }, // exact
  { matchId: 'mC5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mC6', home: 2, away: 0 }, // exact
  // Group D
  { matchId: 'mD1', home: 2, away: 0 }, // exact
  { matchId: 'mD2', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mD3', home: 2, away: 1 }, // exact
  { matchId: 'mD4', home: 2, away: 0 }, // exact
  { matchId: 'mD5', home: 0, away: 2 }, // correct-variant (actual 0-1 A win)
  { matchId: 'mD6', home: 0, away: 1 }, // correct-variant (actual 1-2)
  // Group E
  { matchId: 'mE1', home: 4, away: 0 }, // exact
  { matchId: 'mE2', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mE3', home: 2, away: 0 }, // exact
  { matchId: 'mE4', home: 3, away: 0 }, // exact
  { matchId: 'mE5', home: 1, away: 0 }, // WRONG (ECU beats GER → predicted 1E=ECU)
  { matchId: 'mE6', home: 0, away: 1 }, // correct-variant (actual 0-2)
  // Group F
  { matchId: 'mF1', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mF2', home: 3, away: 0 }, // exact
  { matchId: 'mF3', home: 1, away: 0 }, // exact
  { matchId: 'mF4', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  { matchId: 'mF5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mF6', home: 0, away: 1 }, // correct-variant (actual 0-2)
  // Group G
  { matchId: 'mG1', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mG2', home: 2, away: 0 }, // exact
  { matchId: 'mG3', home: 2, away: 0 }, // exact
  { matchId: 'mG4', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  { matchId: 'mG5', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mG6', home: 0, away: 1 }, // correct-variant (actual 0-3)
  // Group H
  { matchId: 'mH1', home: 1, away: 0 }, // correct-variant (actual 3-0 H win)
  { matchId: 'mH2', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mH3', home: 2, away: 0 }, // exact
  { matchId: 'mH4', home: 2, away: 0 }, // exact
  { matchId: 'mH5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mH6', home: 0, away: 1 }, // correct-variant (actual 1-2)
  // Group I
  { matchId: 'mI1', home: 2, away: 0 }, // exact
  { matchId: 'mI2', home: 0, away: 1 }, // correct-variant (actual 0-3 A win)
  { matchId: 'mI3', home: 3, away: 0 }, // exact
  { matchId: 'mI4', home: 2, away: 0 }, // exact
  { matchId: 'mI5', home: 1, away: 0 }, // WRONG (NOR beats FRA → predicted 1I=NOR)
  { matchId: 'mI6', home: 2, away: 0 }, // exact
  // Group J
  { matchId: 'mJ1', home: 2, away: 0 }, // correct-variant (actual 3-0)
  { matchId: 'mJ2', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mJ3', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mJ4', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mJ5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mJ6', home: 0, away: 1 }, // correct-variant (actual 0-2)
  // Group K
  { matchId: 'mK1', home: 3, away: 0 }, // exact
  { matchId: 'mK2', home: 0, away: 1 }, // correct-variant (actual 0-2)
  { matchId: 'mK3', home: 2, away: 0 }, // exact
  { matchId: 'mK4', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mK5', home: 1, away: 0 }, // WRONG (COL beats POR → predicted 1K=COL)
  { matchId: 'mK6', home: 2, away: 0 }, // exact
  // Group L
  { matchId: 'mL1', home: 0, away: 1 }, // WRONG (CRO beats ENG → predicted 1L=CRO)
  { matchId: 'mL2', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mL3', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mL4', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  { matchId: 'mL5', home: 0, away: 1 }, // correct-variant (actual 0-3)
  { matchId: 'mL6', home: 1, away: 0 }, // correct-variant (actual 2-0)
];

// Charlie — 13 exact, 51 correct-variant, 8 wrong (flips 1v2 in A, B, E, F, H, I, K, L)
const GROUP_SCORES_CHARLIE = [
  // Group A
  { matchId: 'mA1', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mA2', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mA3', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mA4', home: 0, away: 1 }, // WRONG (KOR beats MEX → predicted 1A=KOR)
  { matchId: 'mA5', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mA6', home: 0, away: 1 }, // correct-variant (actual 0-2)
  // Group B
  { matchId: 'mB1', home: 2, away: 0 }, // exact
  { matchId: 'mB2', home: 0, away: 1 }, // correct-variant (actual 1-3 A win)
  { matchId: 'mB3', home: 2, away: 0 }, // exact
  { matchId: 'mB4', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mB5', home: 0, away: 1 }, // WRONG (CAN beats SUI → predicted 1B=CAN)
  { matchId: 'mB6', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  // Group C
  { matchId: 'mC1', home: 2, away: 0 }, // correct-variant (actual 3-0)
  { matchId: 'mC2', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  { matchId: 'mC3', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mC4', home: 6, away: 1 }, // exact
  { matchId: 'mC5', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mC6', home: 1, away: 0 }, // correct-variant (actual 2-0)
  // Group D
  { matchId: 'mD1', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mD2', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mD3', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mD4', home: 2, away: 0 }, // exact
  { matchId: 'mD5', home: 0, away: 2 }, // correct-variant (actual 0-1 A win)
  { matchId: 'mD6', home: 0, away: 1 }, // correct-variant (actual 1-2)
  // Group E
  { matchId: 'mE1', home: 4, away: 0 }, // exact
  { matchId: 'mE2', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mE3', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mE4', home: 3, away: 0 }, // exact
  { matchId: 'mE5', home: 1, away: 0 }, // WRONG (ECU beats GER → predicted 1E=ECU)
  { matchId: 'mE6', home: 0, away: 1 }, // correct-variant (actual 0-2)
  // Group F
  { matchId: 'mF1', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mF2', home: 2, away: 0 }, // correct-variant (actual 3-0)
  { matchId: 'mF3', home: 0, away: 1 }, // WRONG (SWE beats NED → predicted 1F=SWE)
  { matchId: 'mF4', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  { matchId: 'mF5', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mF6', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  // Group G
  { matchId: 'mG1', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mG2', home: 2, away: 0 }, // exact
  { matchId: 'mG3', home: 2, away: 0 }, // exact
  { matchId: 'mG4', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  { matchId: 'mG5', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mG6', home: 0, away: 1 }, // correct-variant (actual 0-3)
  // Group H
  { matchId: 'mH1', home: 1, away: 0 }, // correct-variant (actual 3-0 H win)
  { matchId: 'mH2', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mH3', home: 2, away: 0 }, // exact
  { matchId: 'mH4', home: 2, away: 0 }, // exact
  { matchId: 'mH5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mH6', home: 1, away: 0 }, // WRONG (URU beats ESP → predicted 1H=URU)
  // Group I
  { matchId: 'mI1', home: 1, away: 0 }, // correct-variant (actual 2-0 H win)
  { matchId: 'mI2', home: 0, away: 1 }, // correct-variant (actual 0-3 A win)
  { matchId: 'mI3', home: 3, away: 0 }, // exact
  { matchId: 'mI4', home: 2, away: 0 }, // exact
  { matchId: 'mI5', home: 1, away: 0 }, // WRONG (NOR beats FRA → predicted 1I=NOR)
  { matchId: 'mI6', home: 2, away: 0 }, // exact
  // Group J
  { matchId: 'mJ1', home: 2, away: 0 }, // correct-variant (actual 3-0)
  { matchId: 'mJ2', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mJ3', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mJ4', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mJ5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mJ6', home: 0, away: 1 }, // correct-variant (actual 0-2)
  // Group K
  { matchId: 'mK1', home: 1, away: 0 }, // correct-variant (actual 3-0 H win)
  { matchId: 'mK2', home: 0, away: 1 }, // correct-variant (actual 0-2)
  { matchId: 'mK3', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mK4', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mK5', home: 1, away: 0 }, // WRONG (COL beats POR → predicted 1K=COL)
  { matchId: 'mK6', home: 1, away: 0 }, // correct-variant (actual 2-0)
  // Group L
  { matchId: 'mL1', home: 0, away: 1 }, // WRONG (CRO beats ENG → predicted 1L=CRO)
  { matchId: 'mL2', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mL3', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mL4', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  { matchId: 'mL5', home: 0, away: 1 }, // correct-variant (actual 0-3 A win)
  { matchId: 'mL6', home: 1, away: 0 }, // correct-variant (actual 2-0)
];

// Diana — 6 exact, 56 correct-variant, 10 wrong (flips 1v2 in A, B, C, D, E, F, H, I, K, L)
const GROUP_SCORES_DIANA = [
  // Group A
  { matchId: 'mA1', home: 1, away: 0 }, // correct-variant (actual 2-0 H win)
  { matchId: 'mA2', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mA3', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mA4', home: 0, away: 1 }, // WRONG (KOR beats MEX → predicted 1A=KOR)
  { matchId: 'mA5', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mA6', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  // Group B
  { matchId: 'mB1', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mB2', home: 0, away: 1 }, // correct-variant (actual 1-3 A win)
  { matchId: 'mB3', home: 1, away: 0 }, // correct-variant (actual 2-0 H win)
  { matchId: 'mB4', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mB5', home: 0, away: 1 }, // WRONG (CAN beats SUI → predicted 1B=CAN)
  { matchId: 'mB6', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  // Group C
  { matchId: 'mC1', home: 0, away: 1 }, // WRONG (MAR beats BRA → predicted 1C=MAR)
  { matchId: 'mC2', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  { matchId: 'mC3', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mC4', home: 6, away: 1 }, // exact
  { matchId: 'mC5', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mC6', home: 1, away: 0 }, // correct-variant (actual 2-0)
  // Group D
  { matchId: 'mD1', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mD2', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mD3', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mD4', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mD5', home: 1, away: 0 }, // WRONG (TUR beats USA → predicted 1D=TUR)
  { matchId: 'mD6', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  // Group E
  { matchId: 'mE1', home: 2, away: 0 }, // correct-variant (actual 4-0)
  { matchId: 'mE2', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mE3', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mE4', home: 3, away: 0 }, // exact
  { matchId: 'mE5', home: 1, away: 0 }, // WRONG (ECU beats GER → predicted 1E=ECU)
  { matchId: 'mE6', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  // Group F
  { matchId: 'mF1', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mF2', home: 3, away: 0 }, // exact
  { matchId: 'mF3', home: 0, away: 1 }, // WRONG (SWE beats NED → predicted 1F=SWE)
  { matchId: 'mF4', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  { matchId: 'mF5', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mF6', home: 0, away: 1 }, // correct-variant (actual 0-2)
  // Group G
  { matchId: 'mG1', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mG2', home: 1, away: 0 }, // correct-variant (actual 2-0 H win)
  { matchId: 'mG3', home: 1, away: 0 }, // correct-variant (actual 2-0 H win)
  { matchId: 'mG4', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  { matchId: 'mG5', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mG6', home: 0, away: 1 }, // correct-variant (actual 0-3)
  // Group H
  { matchId: 'mH1', home: 1, away: 0 }, // correct-variant (actual 3-0 H win)
  { matchId: 'mH2', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mH3', home: 2, away: 0 }, // exact
  { matchId: 'mH4', home: 2, away: 0 }, // exact
  { matchId: 'mH5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mH6', home: 1, away: 0 }, // WRONG (URU beats ESP → predicted 1H=URU)
  // Group I
  { matchId: 'mI1', home: 1, away: 0 }, // correct-variant (actual 2-0 H win)
  { matchId: 'mI2', home: 0, away: 1 }, // correct-variant (actual 0-3 A win)
  { matchId: 'mI3', home: 1, away: 0 }, // correct-variant (actual 3-0 H win)
  { matchId: 'mI4', home: 1, away: 0 }, // correct-variant (actual 2-0 H win)
  { matchId: 'mI5', home: 1, away: 0 }, // WRONG (NOR beats FRA → predicted 1I=NOR)
  { matchId: 'mI6', home: 2, away: 0 }, // exact
  // Group J
  { matchId: 'mJ1', home: 1, away: 0 }, // correct-variant (actual 3-0 H win)
  { matchId: 'mJ2', home: 1, away: 0 }, // correct-variant (actual 2-0 H win)
  { matchId: 'mJ3', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mJ4', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mJ5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mJ6', home: 0, away: 1 }, // correct-variant (actual 0-2)
  // Group K
  { matchId: 'mK1', home: 1, away: 0 }, // correct-variant (actual 3-0 H win)
  { matchId: 'mK2', home: 0, away: 1 }, // correct-variant (actual 0-2)
  { matchId: 'mK3', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mK4', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mK5', home: 1, away: 0 }, // WRONG (COL beats POR → predicted 1K=COL)
  { matchId: 'mK6', home: 1, away: 0 }, // correct-variant (actual 2-0)
  // Group L
  { matchId: 'mL1', home: 0, away: 1 }, // WRONG (CRO beats ENG → predicted 1L=CRO)
  { matchId: 'mL2', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mL3', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mL4', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  { matchId: 'mL5', home: 0, away: 1 }, // correct-variant (actual 0-3 A win)
  { matchId: 'mL6', home: 1, away: 0 }, // correct-variant (actual 2-0)
];

// Eve — 3 exact, 57 correct-variant, 12 wrong (flips 1v2 in all 12 groups)
const GROUP_SCORES_EVE = [
  // Group A
  { matchId: 'mA1', home: 1, away: 0 }, // correct-variant (actual 2-0 H win)
  { matchId: 'mA2', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mA3', home: 1, away: 0 }, // correct-variant (actual 2-0 H win)
  { matchId: 'mA4', home: 0, away: 1 }, // WRONG (KOR beats MEX → predicted 1A=KOR)
  { matchId: 'mA5', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mA6', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  // Group B
  { matchId: 'mB1', home: 1, away: 0 }, // correct-variant (actual 2-0 H win)
  { matchId: 'mB2', home: 0, away: 1 }, // correct-variant (actual 1-3 A win)
  { matchId: 'mB3', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mB4', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mB5', home: 0, away: 1 }, // WRONG (CAN beats SUI → predicted 1B=CAN)
  { matchId: 'mB6', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  // Group C
  { matchId: 'mC1', home: 0, away: 1 }, // WRONG (MAR beats BRA → predicted 1C=MAR)
  { matchId: 'mC2', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  { matchId: 'mC3', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mC4', home: 6, away: 1 }, // exact
  { matchId: 'mC5', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mC6', home: 1, away: 0 }, // correct-variant (actual 2-0)
  // Group D
  { matchId: 'mD1', home: 1, away: 0 }, // correct-variant (actual 2-0 H win)
  { matchId: 'mD2', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mD3', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mD4', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mD5', home: 1, away: 0 }, // WRONG (TUR beats USA → predicted 1D=TUR)
  { matchId: 'mD6', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  // Group E
  { matchId: 'mE1', home: 2, away: 0 }, // correct-variant (actual 4-0)
  { matchId: 'mE2', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mE3', home: 1, away: 0 }, // correct-variant (actual 2-0 H win)
  { matchId: 'mE4', home: 2, away: 0 }, // correct-variant (actual 3-0)
  { matchId: 'mE5', home: 1, away: 0 }, // WRONG (ECU beats GER → predicted 1E=ECU)
  { matchId: 'mE6', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  // Group F
  { matchId: 'mF1', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mF2', home: 2, away: 0 }, // correct-variant (actual 3-0)
  { matchId: 'mF3', home: 0, away: 1 }, // WRONG (SWE beats NED → predicted 1F=SWE)
  { matchId: 'mF4', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  { matchId: 'mF5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mF6', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  // Group G
  { matchId: 'mG1', home: 0, away: 1 }, // WRONG (EGY beats BEL → predicted 1G=EGY)
  { matchId: 'mG2', home: 1, away: 0 }, // correct-variant (actual 2-0 H win)
  { matchId: 'mG3', home: 1, away: 0 }, // correct-variant (actual 2-0 H win)
  { matchId: 'mG4', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  { matchId: 'mG5', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mG6', home: 0, away: 1 }, // correct-variant (actual 0-3 A win)
  // Group H
  { matchId: 'mH1', home: 1, away: 0 }, // correct-variant (actual 3-0 H win)
  { matchId: 'mH2', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mH3', home: 2, away: 0 }, // exact
  { matchId: 'mH4', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mH5', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mH6', home: 1, away: 0 }, // WRONG (URU beats ESP → predicted 1H=URU)
  // Group I
  { matchId: 'mI1', home: 1, away: 0 }, // correct-variant (actual 2-0 H win)
  { matchId: 'mI2', home: 0, away: 1 }, // correct-variant (actual 0-3 A win)
  { matchId: 'mI3', home: 1, away: 0 }, // correct-variant (actual 3-0 H win)
  { matchId: 'mI4', home: 1, away: 0 }, // correct-variant (actual 2-0 H win)
  { matchId: 'mI5', home: 1, away: 0 }, // WRONG (NOR beats FRA → predicted 1I=NOR)
  { matchId: 'mI6', home: 2, away: 0 }, // exact
  // Group J
  { matchId: 'mJ1', home: 1, away: 0 }, // correct-variant (actual 3-0 H win)
  { matchId: 'mJ2', home: 1, away: 0 }, // correct-variant (actual 2-0 H win)
  { matchId: 'mJ3', home: 0, away: 1 }, // WRONG (AUT beats ARG → predicted 1J=AUT)
  { matchId: 'mJ4', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mJ5', home: 0, away: 1 }, // correct-variant (actual 1-2 A win)
  { matchId: 'mJ6', home: 0, away: 1 }, // correct-variant (actual 0-2)
  // Group K
  { matchId: 'mK1', home: 1, away: 0 }, // correct-variant (actual 3-0 H win)
  { matchId: 'mK2', home: 0, away: 1 }, // correct-variant (actual 0-2)
  { matchId: 'mK3', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mK4', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mK5', home: 1, away: 0 }, // WRONG (COL beats POR → predicted 1K=COL)
  { matchId: 'mK6', home: 1, away: 0 }, // correct-variant (actual 2-0)
  // Group L
  { matchId: 'mL1', home: 0, away: 1 }, // WRONG (CRO beats ENG → predicted 1L=CRO)
  { matchId: 'mL2', home: 1, away: 0 }, // correct-variant (actual 2-1 H win)
  { matchId: 'mL3', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mL4', home: 0, away: 1 }, // correct-variant (actual 0-2 A win)
  { matchId: 'mL5', home: 0, away: 1 }, // correct-variant (actual 0-3 A win)
  { matchId: 'mL6', home: 1, away: 0 }, // correct-variant (actual 2-0)
];

// Frank — 0 exact, 20 correct-variant, 52 wrong (all non-qualifying teams predicted)
const GROUP_SCORES_FRANK = [
  // Group A — all wrong (same as Eve)
  { matchId: 'mA1', home: 0, away: 1 }, // WRONG
  { matchId: 'mA2', home: 0, away: 1 }, // WRONG
  { matchId: 'mA3', home: 0, away: 1 }, // WRONG
  { matchId: 'mA4', home: 0, away: 1 }, // WRONG
  { matchId: 'mA5', home: 2, away: 0 }, // WRONG
  { matchId: 'mA6', home: 1, away: 0 }, // WRONG
  // Group B
  { matchId: 'mB1', home: 0, away: 1 }, // WRONG
  { matchId: 'mB2', home: 2, away: 0 }, // WRONG
  { matchId: 'mB3', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mB4', home: 0, away: 1 }, // WRONG
  { matchId: 'mB5', home: 0, away: 1 }, // WRONG
  { matchId: 'mB6', home: 2, away: 0 }, // WRONG
  // Group C
  { matchId: 'mC1', home: 0, away: 1 }, // WRONG
  { matchId: 'mC2', home: 1, away: 0 }, // WRONG
  { matchId: 'mC3', home: 2, away: 0 }, // WRONG
  { matchId: 'mC4', home: 1, away: 0 }, // correct-variant (actual 6-1 H win → Eve had exact)
  { matchId: 'mC5', home: 2, away: 0 }, // WRONG
  { matchId: 'mC6', home: 1, away: 0 }, // correct-variant (actual 2-0)
  // Group D
  { matchId: 'mD1', home: 0, away: 1 }, // WRONG
  { matchId: 'mD2', home: 2, away: 0 }, // WRONG
  { matchId: 'mD3', home: 0, away: 1 }, // WRONG
  { matchId: 'mD4', home: 1, away: 0 }, // correct-variant (actual 2-0 H win → Eve had correct-variant)
  { matchId: 'mD5', home: 2, away: 0 }, // WRONG
  { matchId: 'mD6', home: 2, away: 0 }, // WRONG
  // Group E
  { matchId: 'mE1', home: 1, away: 0 }, // correct-variant (actual 4-0 H win → Eve had correct-variant)
  { matchId: 'mE2', home: 2, away: 0 }, // WRONG
  { matchId: 'mE3', home: 0, away: 1 }, // WRONG
  { matchId: 'mE4', home: 1, away: 0 }, // correct-variant (actual 3-0 H win → Eve had correct-variant)
  { matchId: 'mE5', home: 2, away: 0 }, // WRONG
  { matchId: 'mE6', home: 1, away: 0 }, // WRONG
  // Group F
  { matchId: 'mF1', home: 1, away: 0 }, // correct-variant (actual 2-1)
  { matchId: 'mF2', home: 2, away: 0 }, // correct-variant (actual 3-0)
  { matchId: 'mF3', home: 2, away: 0 }, // correct-variant (actual 1-0 H win → Eve had exact)
  { matchId: 'mF4', home: 1, away: 0 }, // WRONG
  { matchId: 'mF5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mF6', home: 1, away: 0 }, // WRONG
  // Group G — all wrong
  { matchId: 'mG1', home: 0, away: 1 }, // WRONG
  { matchId: 'mG2', home: 0, away: 1 }, // WRONG
  { matchId: 'mG3', home: 0, away: 1 }, // WRONG
  { matchId: 'mG4', home: 2, away: 0 }, // WRONG
  { matchId: 'mG5', home: 0, away: 1 }, // WRONG
  { matchId: 'mG6', home: 2, away: 0 }, // WRONG
  // Group H
  { matchId: 'mH1', home: 0, away: 1 }, // WRONG
  { matchId: 'mH2', home: 2, away: 0 }, // WRONG
  { matchId: 'mH3', home: 1, away: 0 }, // correct-variant (actual 2-0 H win → Eve had exact)
  { matchId: 'mH4', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mH5', home: 2, away: 0 }, // WRONG
  { matchId: 'mH6', home: 2, away: 0 }, // WRONG
  // Group I
  { matchId: 'mI1', home: 0, away: 1 }, // WRONG
  { matchId: 'mI2', home: 2, away: 0 }, // WRONG
  { matchId: 'mI3', home: 0, away: 1 }, // WRONG
  { matchId: 'mI4', home: 0, away: 1 }, // WRONG
  { matchId: 'mI5', home: 2, away: 0 }, // WRONG
  { matchId: 'mI6', home: 1, away: 0 }, // correct-variant (actual 2-0 H win → Eve had exact)
  // Group J
  { matchId: 'mJ1', home: 0, away: 1 }, // WRONG
  { matchId: 'mJ2', home: 0, away: 1 }, // WRONG
  { matchId: 'mJ3', home: 0, away: 1 }, // WRONG
  { matchId: 'mJ4', home: 2, away: 0 }, // WRONG
  { matchId: 'mJ5', home: 2, away: 0 }, // WRONG
  { matchId: 'mJ6', home: 0, away: 1 }, // correct-variant (actual 0-2 A win → Eve had correct-variant)
  // Group K
  { matchId: 'mK1', home: 0, away: 1 }, // WRONG
  { matchId: 'mK2', home: 0, away: 1 }, // correct-variant (actual 0-2 A win → Eve had correct-variant)
  { matchId: 'mK3', home: 1, away: 0 }, // correct-variant (actual 2-0)
  { matchId: 'mK4', home: 0, away: 1 }, // WRONG
  { matchId: 'mK5', home: 0, away: 1 }, // correct-variant (actual 1-2)
  { matchId: 'mK6', home: 1, away: 0 }, // correct-variant (actual 2-0)
  // Group L
  { matchId: 'mL1', home: 0, away: 1 }, // WRONG
  { matchId: 'mL2', home: 0, away: 1 }, // WRONG
  { matchId: 'mL3', home: 1, away: 0 }, // correct-variant (actual 2-0 H win → Eve had correct-variant)
  { matchId: 'mL4', home: 2, away: 0 }, // WRONG
  { matchId: 'mL5', home: 2, away: 0 }, // WRONG
  { matchId: 'mL6', home: 1, away: 0 }, // correct-variant (actual 2-0)
];

// ── Knockout bracket definitions ───────────────────────────────────────────────
//
// Actual tournament (Alice has no wrong group picks — her predicted world = actual):
//   3rd-place qualifiers: [0]=CZE [1]=SCO [2]=JPN [3]=AUS [4]=CIV [5]=IRN [6]=QAT [7]=KSA
//   R32:  r32m73 KOR vs CAN   r32m74 GER vs CZE   r32m75 NED vs MAR
//         r32m76 BRA vs SWE   r32m77 FRA vs SCO   r32m78 ECU vs NOR (→NOR)
//         r32m79 MEX vs JPN   r32m80 ENG vs AUS   r32m81 USA vs CIV
//         r32m82 BEL vs IRN   r32m83 COL vs CRO   r32m84 ESP vs AUT
//         r32m85 SUI vs QAT   r32m86 ARG vs URU   r32m87 POR vs KSA
//         r32m88 TUR vs EGY
//   R32 winners: KOR GER NED BRA FRA NOR MEX ENG USA BEL COL ESP SUI ARG POR TUR
//   R16:  r16m89 GER vs FRA   r16m90 KOR vs NED   r16m91 BRA vs NOR   r16m92 MEX vs ENG
//         r16m93 COL vs ESP   r16m94 USA vs BEL   r16m95 ARG vs TUR   r16m96 SUI vs POR
//   R16 winners: GER NED BRA ENG ESP BEL ARG POR
//   QF:  qf97 GER vs NED→GER   qf98 ESP vs BEL→ESP   qf99 BRA vs ENG→BRA   qf100 ARG vs POR→ARG
//   SF:  sf101 GER vs ESP→ESP   sf102 BRA vs ARG→ARG
//   Final: ESP vs ARG → ARG wins (1-1 AET, penalties)   Bronze: GER vs BRA → GER 2-1
//
// Bob/Charlie/Diana/Eve flip 1st↔2nd within groups via wrong h2h picks. Their bracket
// picks are internally consistent with each user's own predicted world, so the engine
// validates them — but the teams often differ from actual winners → 0 pts.
// Frank has a fully chaotic predicted world (all non-qualifying teams).

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

// Creator (Alice) — all correct; ~698 pts
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

// Bob — 6 group flips (A,B,E,I,K,L); bracket consistent with predicted world; ARG wins final ✓
const PICKS_BOB = [
  { bracketMatchKey: 'r32m73', winner: 'MEX' }, // MEX vs SUI → MEX (0pts, actual KOR)
  { bracketMatchKey: 'r32m74', winner: 'ECU' }, // ECU vs CZE → ECU (0pts, actual GER)
  { bracketMatchKey: 'r32m75', winner: 'NED' }, // NED vs MAR → NED ✓actual
  { bracketMatchKey: 'r32m76', winner: 'BRA' }, // BRA vs SWE → BRA ✓actual
  { bracketMatchKey: 'r32m77', winner: 'NOR' }, // NOR vs SCO → NOR (0pts, actual FRA)
  { bracketMatchKey: 'r32m78', winner: 'GER' }, // GER vs FRA → GER (0pts, actual NOR)
  { bracketMatchKey: 'r32m79', winner: 'KOR' }, // KOR vs JPN → KOR (0pts, actual MEX)
  { bracketMatchKey: 'r32m80', winner: 'CRO' }, // CRO vs AUS → CRO (0pts, actual ENG)
  { bracketMatchKey: 'r32m81', winner: 'USA' }, // USA vs CIV → USA ✓actual
  { bracketMatchKey: 'r32m82', winner: 'BEL' }, // BEL vs IRN → BEL ✓actual
  { bracketMatchKey: 'r32m83', winner: 'ENG' }, // POR vs ENG → ENG (0pts, actual COL)
  { bracketMatchKey: 'r32m84', winner: 'ESP' }, // ESP vs AUT → ESP ✓actual
  { bracketMatchKey: 'r32m85', winner: 'CAN' }, // CAN vs QAT → CAN (0pts, actual SUI)
  { bracketMatchKey: 'r32m86', winner: 'ARG' }, // ARG vs URU → ARG ✓actual
  { bracketMatchKey: 'r32m87', winner: 'COL' }, // COL vs KSA → COL (0pts, actual POR)
  { bracketMatchKey: 'r32m88', winner: 'TUR' }, // TUR vs EGY → TUR ✓actual
  { bracketMatchKey: 'r16m89', winner: 'ECU' }, // ECU vs NOR → ECU (0pts)
  { bracketMatchKey: 'r16m90', winner: 'NED' }, // MEX vs NED → NED ✓actual
  { bracketMatchKey: 'r16m91', winner: 'BRA' }, // BRA vs GER → BRA ✓actual
  { bracketMatchKey: 'r16m92', winner: 'KOR' }, // KOR vs CRO → KOR (0pts)
  { bracketMatchKey: 'r16m93', winner: 'ESP' }, // ENG vs ESP → ESP ✓actual
  { bracketMatchKey: 'r16m94', winner: 'BEL' }, // USA vs BEL → BEL ✓actual
  { bracketMatchKey: 'r16m95', winner: 'ARG' }, // ARG vs TUR → ARG ✓actual
  { bracketMatchKey: 'r16m96', winner: 'COL' }, // CAN vs COL → COL (0pts)
  { bracketMatchKey: 'qf97', winner: 'NED' }, // ECU vs NED → NED (0pts, actual GER)
  { bracketMatchKey: 'qf98', winner: 'ESP' }, // ESP vs BEL → ESP ✓actual
  { bracketMatchKey: 'qf99', winner: 'BRA' }, // BRA vs KOR → BRA ✓actual
  { bracketMatchKey: 'qf100', winner: 'ARG' }, // ARG vs COL → ARG ✓actual
  { bracketMatchKey: 'sf101', winner: 'ESP' }, // NED vs ESP → ESP ✓actual
  { bracketMatchKey: 'sf102', winner: 'ARG' }, // BRA vs ARG → ARG ✓actual
  { bracketMatchKey: 'final', winner: 'ARG' }, // ESP vs ARG → ARG ✓actual
  { bracketMatchKey: 'bronze', winner: 'BRA' }, // NED vs BRA → BRA (0pts, actual GER)
] as const;

// Charlie — 8 group flips (A,B,E,F,H,I,K,L); ARG wins final ✓
const PICKS_CHARLIE = [
  { bracketMatchKey: 'r32m73', winner: 'MEX' }, // MEX vs SUI → MEX (0pts, actual KOR)
  { bracketMatchKey: 'r32m74', winner: 'ECU' }, // ECU vs CZE → ECU (0pts, actual GER)
  { bracketMatchKey: 'r32m75', winner: 'SWE' }, // SWE vs MAR → SWE (0pts, actual NED)
  { bracketMatchKey: 'r32m76', winner: 'BRA' }, // BRA vs NED → BRA ✓actual
  { bracketMatchKey: 'r32m77', winner: 'NOR' }, // NOR vs SCO → NOR (0pts, actual FRA)
  { bracketMatchKey: 'r32m78', winner: 'GER' }, // GER vs FRA → GER (0pts, actual NOR)
  { bracketMatchKey: 'r32m79', winner: 'KOR' }, // KOR vs JPN → KOR (0pts, actual MEX)
  { bracketMatchKey: 'r32m80', winner: 'CRO' }, // CRO vs AUS → CRO (0pts, actual ENG)
  { bracketMatchKey: 'r32m81', winner: 'USA' }, // USA vs CIV → USA ✓actual
  { bracketMatchKey: 'r32m82', winner: 'BEL' }, // BEL vs IRN → BEL ✓actual
  { bracketMatchKey: 'r32m83', winner: 'ENG' }, // POR vs ENG → ENG (0pts, actual COL)
  { bracketMatchKey: 'r32m84', winner: 'URU' }, // URU vs AUT → URU (0pts, actual ESP)
  { bracketMatchKey: 'r32m85', winner: 'CAN' }, // CAN vs QAT → CAN (0pts, actual SUI)
  { bracketMatchKey: 'r32m86', winner: 'ARG' }, // ARG vs ESP → ARG ✓actual
  { bracketMatchKey: 'r32m87', winner: 'COL' }, // COL vs KSA → COL (0pts, actual POR)
  { bracketMatchKey: 'r32m88', winner: 'TUR' }, // TUR vs EGY → TUR ✓actual
  { bracketMatchKey: 'r16m89', winner: 'ECU' }, // ECU vs NOR → ECU (0pts)
  { bracketMatchKey: 'r16m90', winner: 'MEX' }, // MEX vs SWE → MEX (0pts)
  { bracketMatchKey: 'r16m91', winner: 'BRA' }, // BRA vs GER → BRA ✓actual
  { bracketMatchKey: 'r16m92', winner: 'KOR' }, // KOR vs CRO → KOR (0pts)
  { bracketMatchKey: 'r16m93', winner: 'ENG' }, // ENG vs URU → ENG (0pts)
  { bracketMatchKey: 'r16m94', winner: 'BEL' }, // USA vs BEL → BEL ✓actual
  { bracketMatchKey: 'r16m95', winner: 'ARG' }, // ARG vs TUR → ARG ✓actual
  { bracketMatchKey: 'r16m96', winner: 'CAN' }, // CAN vs COL → CAN (0pts)
  { bracketMatchKey: 'qf97', winner: 'MEX' }, // ECU vs MEX → MEX (0pts)
  { bracketMatchKey: 'qf98', winner: 'ENG' }, // ENG vs BEL → ENG (0pts, actual ESP)
  { bracketMatchKey: 'qf99', winner: 'BRA' }, // BRA vs KOR → BRA ✓actual
  { bracketMatchKey: 'qf100', winner: 'ARG' }, // ARG vs CAN → ARG ✓actual
  { bracketMatchKey: 'sf101', winner: 'MEX' }, // MEX vs ENG → MEX (0pts)
  { bracketMatchKey: 'sf102', winner: 'ARG' }, // BRA vs ARG → ARG ✓actual
  { bracketMatchKey: 'final', winner: 'ARG' }, // MEX vs ARG → ARG ✓actual
  { bracketMatchKey: 'bronze', winner: 'BRA' }, // ENG vs BRA → BRA (0pts, actual GER)
] as const;

// Diana — 10 group flips (A,B,C,D,E,F,H,I,K,L); ARG wins final ✓; GER wins bronze ✓
const PICKS_DIANA = [
  { bracketMatchKey: 'r32m73', winner: 'MEX' }, // MEX vs SUI → MEX (0pts, actual KOR)
  { bracketMatchKey: 'r32m74', winner: 'ECU' }, // ECU vs CZE → ECU (0pts, actual GER)
  { bracketMatchKey: 'r32m75', winner: 'BRA' }, // SWE vs BRA → BRA (0pts, actual NED)
  { bracketMatchKey: 'r32m76', winner: 'MAR' }, // MAR vs NED → MAR (0pts, actual BRA)
  { bracketMatchKey: 'r32m77', winner: 'NOR' }, // NOR vs SCO → NOR (0pts, actual FRA)
  { bracketMatchKey: 'r32m78', winner: 'GER' }, // GER vs FRA → GER (0pts, actual NOR)
  { bracketMatchKey: 'r32m79', winner: 'KOR' }, // KOR vs JPN → KOR (0pts, actual MEX)
  { bracketMatchKey: 'r32m80', winner: 'CRO' }, // CRO vs AUS → CRO (0pts, actual ENG)
  { bracketMatchKey: 'r32m81', winner: 'TUR' }, // TUR vs CIV → TUR (0pts, actual USA)
  { bracketMatchKey: 'r32m82', winner: 'BEL' }, // BEL vs IRN → BEL ✓actual
  { bracketMatchKey: 'r32m83', winner: 'ENG' }, // POR vs ENG → ENG (0pts, actual COL)
  { bracketMatchKey: 'r32m84', winner: 'URU' }, // URU vs AUT → URU (0pts, actual ESP)
  { bracketMatchKey: 'r32m85', winner: 'CAN' }, // CAN vs QAT → CAN (0pts, actual SUI)
  { bracketMatchKey: 'r32m86', winner: 'ARG' }, // ARG vs ESP → ARG ✓actual
  { bracketMatchKey: 'r32m87', winner: 'COL' }, // COL vs KSA → COL (0pts, actual POR)
  { bracketMatchKey: 'r32m88', winner: 'USA' }, // USA vs EGY → USA (0pts, actual TUR)
  { bracketMatchKey: 'r16m89', winner: 'ECU' }, // ECU vs NOR → ECU (0pts)
  { bracketMatchKey: 'r16m90', winner: 'BRA' }, // MEX vs BRA → BRA (0pts)
  { bracketMatchKey: 'r16m91', winner: 'GER' }, // MAR vs GER → GER (0pts, actual BRA)
  { bracketMatchKey: 'r16m92', winner: 'KOR' }, // KOR vs CRO → KOR (0pts)
  { bracketMatchKey: 'r16m93', winner: 'ENG' }, // ENG vs URU → ENG (0pts)
  { bracketMatchKey: 'r16m94', winner: 'BEL' }, // TUR vs BEL → BEL ✓actual
  { bracketMatchKey: 'r16m95', winner: 'ARG' }, // ARG vs USA → ARG ✓actual
  { bracketMatchKey: 'r16m96', winner: 'CAN' }, // CAN vs COL → CAN (0pts)
  { bracketMatchKey: 'qf97', winner: 'BRA' }, // ECU vs BRA → BRA (0pts)
  { bracketMatchKey: 'qf98', winner: 'ENG' }, // ENG vs BEL → ENG (0pts, actual ESP)
  { bracketMatchKey: 'qf99', winner: 'GER' }, // GER vs KOR → GER ✓actual
  { bracketMatchKey: 'qf100', winner: 'ARG' }, // ARG vs CAN → ARG ✓actual
  { bracketMatchKey: 'sf101', winner: 'BRA' }, // BRA vs ENG → BRA (0pts)
  { bracketMatchKey: 'sf102', winner: 'ARG' }, // GER vs ARG → ARG ✓actual
  { bracketMatchKey: 'final', winner: 'ARG' }, // BRA vs ARG → ARG ✓actual
  { bracketMatchKey: 'bronze', winner: 'GER' }, // ENG vs GER → GER ✓actual
] as const;

// Eve — all 12 group flips; only ARG wins final is correct (1 bracket point)
const PICKS_EVE = [
  { bracketMatchKey: 'r32m73', winner: 'MEX' }, // MEX vs SUI → MEX (0pts, actual KOR)
  { bracketMatchKey: 'r32m74', winner: 'ECU' }, // ECU vs CZE → ECU (0pts, actual GER)
  { bracketMatchKey: 'r32m75', winner: 'BRA' }, // SWE vs BRA → BRA (0pts, actual NED)
  { bracketMatchKey: 'r32m76', winner: 'MAR' }, // MAR vs NED → MAR (0pts, actual BRA)
  { bracketMatchKey: 'r32m77', winner: 'NOR' }, // NOR vs SCO → NOR (0pts, actual FRA)
  { bracketMatchKey: 'r32m78', winner: 'GER' }, // GER vs FRA → GER (0pts, actual NOR)
  { bracketMatchKey: 'r32m79', winner: 'KOR' }, // KOR vs JPN → KOR (0pts, actual MEX)
  { bracketMatchKey: 'r32m80', winner: 'CRO' }, // CRO vs AUS → CRO (0pts, actual ENG)
  { bracketMatchKey: 'r32m81', winner: 'TUR' }, // TUR vs CIV → TUR (0pts, actual USA)
  { bracketMatchKey: 'r32m82', winner: 'EGY' }, // EGY vs IRN → EGY (0pts, actual BEL)
  { bracketMatchKey: 'r32m83', winner: 'ENG' }, // POR vs ENG → ENG (0pts, actual COL)
  { bracketMatchKey: 'r32m84', winner: 'ARG' }, // URU vs ARG → ARG (0pts, actual ESP)
  { bracketMatchKey: 'r32m85', winner: 'CAN' }, // CAN vs QAT → CAN (0pts, actual SUI)
  { bracketMatchKey: 'r32m86', winner: 'ESP' }, // AUT vs ESP → ESP (0pts, actual ARG)
  { bracketMatchKey: 'r32m87', winner: 'COL' }, // COL vs KSA → COL (0pts, actual POR)
  { bracketMatchKey: 'r32m88', winner: 'BEL' }, // USA vs BEL → BEL (0pts, actual TUR)
  { bracketMatchKey: 'r16m89', winner: 'ECU' }, // ECU vs NOR → ECU (0pts)
  { bracketMatchKey: 'r16m90', winner: 'MEX' }, // MEX vs BRA → MEX (0pts)
  { bracketMatchKey: 'r16m91', winner: 'GER' }, // MAR vs GER → GER (0pts)
  { bracketMatchKey: 'r16m92', winner: 'KOR' }, // KOR vs CRO → KOR (0pts)
  { bracketMatchKey: 'r16m93', winner: 'ARG' }, // ENG vs ARG → ARG (0pts)
  { bracketMatchKey: 'r16m94', winner: 'TUR' }, // TUR vs EGY → TUR (0pts)
  { bracketMatchKey: 'r16m95', winner: 'BEL' }, // ESP vs BEL → BEL (0pts)
  { bracketMatchKey: 'r16m96', winner: 'COL' }, // CAN vs COL → COL (0pts)
  { bracketMatchKey: 'qf97', winner: 'ECU' }, // ECU vs MEX → ECU (0pts)
  { bracketMatchKey: 'qf98', winner: 'ARG' }, // ARG vs TUR → ARG (0pts)
  { bracketMatchKey: 'qf99', winner: 'GER' }, // GER vs KOR → GER ✓actual
  { bracketMatchKey: 'qf100', winner: 'BEL' }, // BEL vs COL → BEL (0pts)
  { bracketMatchKey: 'sf101', winner: 'ARG' }, // ECU vs ARG → ARG (0pts)
  { bracketMatchKey: 'sf102', winner: 'GER' }, // GER vs BEL → GER (0pts)
  { bracketMatchKey: 'final', winner: 'ARG' }, // ARG vs GER → ARG ✓actual (only correct pick!)
  { bracketMatchKey: 'bronze', winner: 'ECU' }, // ECU vs BEL → ECU (0pts)
] as const;

// Frank — fully chaotic predicted world (all non-qualifying teams); NED picks ✓ via r32m75=NED vs MAR
const PICKS_FRANK = [
  { bracketMatchKey: 'r32m73', winner: 'CZE' }, // CZE vs QAT → CZE (0pts, actual KOR)
  { bracketMatchKey: 'r32m74', winner: 'CIV' }, // CIV vs TUR → CIV (0pts, actual GER)
  { bracketMatchKey: 'r32m75', winner: 'NED' }, // NED vs MAR → NED ✓actual
  { bracketMatchKey: 'r32m76', winner: 'SCO' }, // SCO vs SWE → SCO (0pts, actual BRA)
  { bracketMatchKey: 'r32m77', winner: 'SEN' }, // SEN vs TUN → SEN (0pts, actual FRA)
  { bracketMatchKey: 'r32m78', winner: 'ECU' }, // ECU vs IRQ → ECU (0pts, actual NOR)
  { bracketMatchKey: 'r32m79', winner: 'RSA' }, // RSA vs KSA → RSA (0pts, actual MEX)
  { bracketMatchKey: 'r32m80', winner: 'PAN' }, // PAN vs NOR → PAN (0pts, actual ENG)
  { bracketMatchKey: 'r32m81', winner: 'PAR' }, // PAR vs KOR → PAR (0pts, actual USA)
  { bracketMatchKey: 'r32m82', winner: 'NZL' }, // NZL vs CAN → NZL (0pts, actual BEL)
  { bracketMatchKey: 'r32m83', winner: 'POR' }, // POR vs CRO → POR (0pts, actual COL)
  { bracketMatchKey: 'r32m84', winner: 'ALG' }, // CPV vs ALG → ALG (0pts, actual ESP)
  { bracketMatchKey: 'r32m85', winner: 'BIH' }, // BIH vs HAI → BIH (0pts, actual SUI)
  { bracketMatchKey: 'r32m86', winner: 'URU' }, // JOR vs URU → URU (0pts, actual ARG)
  { bracketMatchKey: 'r32m87', winner: 'COD' }, // COD vs CUW → COD (0pts, actual POR)
  { bracketMatchKey: 'r32m88', winner: 'AUS' }, // AUS vs IRN → AUS (0pts, actual TUR)
  { bracketMatchKey: 'r16m89', winner: 'CIV' }, // CIV vs SEN → CIV (0pts)
  { bracketMatchKey: 'r16m90', winner: 'NED' }, // CZE vs NED → NED ✓actual
  { bracketMatchKey: 'r16m91', winner: 'ECU' }, // SCO vs ECU → ECU (0pts)
  { bracketMatchKey: 'r16m92', winner: 'RSA' }, // RSA vs PAN → RSA (0pts)
  { bracketMatchKey: 'r16m93', winner: 'POR' }, // POR vs ALG → POR (0pts)
  { bracketMatchKey: 'r16m94', winner: 'PAR' }, // PAR vs NZL → PAR (0pts)
  { bracketMatchKey: 'r16m95', winner: 'URU' }, // URU vs AUS → URU (0pts)
  { bracketMatchKey: 'r16m96', winner: 'BIH' }, // BIH vs COD → BIH (0pts)
  { bracketMatchKey: 'qf97', winner: 'CIV' }, // CIV vs NED → CIV (0pts)
  { bracketMatchKey: 'qf98', winner: 'POR' }, // POR vs PAR → POR (0pts)
  { bracketMatchKey: 'qf99', winner: 'ECU' }, // ECU vs RSA → ECU (0pts)
  { bracketMatchKey: 'qf100', winner: 'URU' }, // URU vs BIH → URU (0pts)
  { bracketMatchKey: 'sf101', winner: 'CIV' }, // CIV vs POR → CIV (0pts)
  { bracketMatchKey: 'sf102', winner: 'ECU' }, // ECU vs URU → ECU (0pts)
  { bracketMatchKey: 'final', winner: 'CIV' }, // CIV vs ECU → CIV (0pts, actual ARG)
  { bracketMatchKey: 'bronze', winner: 'POR' }, // POR vs URU → POR (0pts, actual GER)
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

// Actual: final ESP 1-1 ARG (pens, ARG wins), bronze GER 2-1 BRA
// Actual specials: messi, BRA, CUW, ARG, CUW, 7, ARG, mex-alvarez, 1, true

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
      final: { home: 1, away: 1 }, // exact: 1-1 ✓
      bronze: { home: 2, away: 1 }, // exact: 2-1 ✓
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
      final: { home: 2, away: 1 }, // ESP vs ARG predicted → ARG wins, outcome correct ✓ (not exact)
      bronze: { home: 2, away: 1 }, // NED vs BRA predicted (wrong teams)
    },
    specials: {
      topScorerPlayer: 'arg-messi',
      groupTopScoringTeam: 'BRA',
      groupTopConcedingTeam: 'CUW',
      tournamentTopScoringTeam: 'BRA', // wrong (ARG)
      tournamentTopConcedingTeam: 'HAI', // wrong (CUW)
      highestMatchGoals: 6, // wrong (7)
      mostYellowCardsTeam: 'ARG',
      firstRedCardPlayer: 'bra-neymar', // wrong (mex-alvarez)
      penaltyShootoutCount: 2, // wrong (1)
      finalDecidedByPenalties: false, // wrong (true)
    },
  },
  charlie: {
    displayName: 'Charlie',
    groupScores: GROUP_SCORES_CHARLIE,
    picks: PICKS_CHARLIE,
    finishScores: {
      final: { home: 1, away: 0 }, // MEX vs ARG predicted → ARG wins, outcome correct ✓ (not exact)
      bronze: { home: 2, away: 1 }, // ENG vs BRA predicted (wrong teams)
    },
    specials: {
      topScorerPlayer: 'arg-messi',
      groupTopScoringTeam: 'BRA',
      groupTopConcedingTeam: 'CUW',
      tournamentTopScoringTeam: 'GER', // wrong (ARG)
      tournamentTopConcedingTeam: 'HAI', // wrong (CUW)
      highestMatchGoals: 7,
      mostYellowCardsTeam: 'GER', // wrong (ARG)
      firstRedCardPlayer: 'ger-havertz', // wrong (mex-alvarez)
      penaltyShootoutCount: 0, // wrong (1)
      finalDecidedByPenalties: false, // wrong (true)
    },
  },
  diana: {
    displayName: 'Diana',
    groupScores: GROUP_SCORES_DIANA,
    picks: PICKS_DIANA,
    finishScores: {
      final: { home: 2, away: 1 }, // BRA vs ARG predicted → ARG wins, outcome correct ✓ (not exact)
      bronze: { home: 2, away: 0 }, // ENG vs GER predicted → GER wins, outcome correct ✓ (not exact)
    },
    specials: {
      topScorerPlayer: 'arg-messi',
      groupTopScoringTeam: 'BRA',
      groupTopConcedingTeam: 'SCO', // wrong (CUW)
      tournamentTopScoringTeam: 'ARG',
      tournamentTopConcedingTeam: 'PAR', // wrong (CUW)
      highestMatchGoals: 8, // wrong (7)
      mostYellowCardsTeam: 'ESP', // wrong (ARG)
      firstRedCardPlayer: 'esp-morata', // wrong (mex-alvarez)
      penaltyShootoutCount: 2, // wrong (1)
      finalDecidedByPenalties: true,
    },
  },
  eve: {
    displayName: 'Eve',
    groupScores: GROUP_SCORES_EVE,
    picks: PICKS_EVE,
    finishScores: {
      final: { home: 2, away: 1 }, // ARG vs GER predicted → ARG wins, outcome correct ✓ (not exact)
      bronze: { home: 2, away: 0 }, // ECU vs BEL predicted (wrong teams)
    },
    specials: {
      topScorerPlayer: 'arg-messi',
      groupTopScoringTeam: 'ARG', // wrong (BRA)
      groupTopConcedingTeam: 'KSA', // wrong (CUW)
      tournamentTopScoringTeam: 'BRA', // wrong (ARG)
      tournamentTopConcedingTeam: 'KSA', // wrong (CUW)
      highestMatchGoals: 5, // wrong (7)
      mostYellowCardsTeam: 'COL', // wrong (ARG)
      firstRedCardPlayer: 'nor-haaland', // wrong (mex-alvarez)
      penaltyShootoutCount: 0, // wrong (1)
      finalDecidedByPenalties: false, // wrong (true)
    },
  },
  frank: {
    displayName: 'Frank',
    groupScores: GROUP_SCORES_FRANK,
    picks: PICKS_FRANK,
    finishScores: {
      final: { home: 1, away: 0 }, // CIV vs ECU predicted (wrong teams)
      bronze: { home: 2, away: 1 }, // POR vs URU predicted (wrong teams)
    },
    specials: {
      topScorerPlayer: 'nor-haaland', // wrong (arg-messi)
      groupTopScoringTeam: 'ARG', // wrong (BRA)
      groupTopConcedingTeam: 'HAI', // wrong (CUW)
      tournamentTopScoringTeam: 'NOR', // wrong (ARG)
      tournamentTopConcedingTeam: 'KSA', // wrong (CUW)
      highestMatchGoals: 7,
      mostYellowCardsTeam: 'BRA', // wrong (ARG)
      firstRedCardPlayer: 'ger-musiala', // wrong (mex-alvarez)
      penaltyShootoutCount: 3, // wrong (1)
      finalDecidedByPenalties: false, // wrong (true)
    },
  },
};

// ── Main seed function ─────────────────────────────────────────────────────────

async function seed(db: ReturnType<typeof createDb<typeof schema>>): Promise<void> {
  const cwd = process.cwd();
  const dataDir = join(cwd, 'data', 'tournaments', TOURNAMENT_ID);

  logger.info({ tournamentId: TOURNAMENT_ID }, 'syncing tournament data');
  await syncTournament(db, TOURNAMENT_ID, dataDir);

  // Create all users
  const userIds: Record<string, UserId> = {};
  for (const [key, profile] of Object.entries(PROFILES)) {
    const user = await createGuestUser(db, { displayName: profile.displayName });
    userIds[key] = user.id;
    logger.info({ key, userId: user.id, displayName: user.displayName }, 'created user');
  }

  // Creator gets a hard-coded login token
  await upsertLoginToken(db, userIds['alice']!, DEV_CREATOR_TOKEN);
  logger.info({ token: DEV_CREATOR_TOKEN }, 'creator login token set');

  // Create a pool owned by the creator
  const pool = await createPool(db, {
    tournamentId: TOURNAMENT_ID,
    ownerId: userIds['alice']!,
    name: 'Dev Pool 2026',
  });
  logger.info({ poolId: pool.id }, 'created pool');

  // Add all users to the pool
  for (const uid of Object.values(userIds)) {
    await addMember(db, pool.id, uid);
  }
  logger.info({ count: Object.keys(userIds).length }, 'all users joined pool');

  // Create full predictions for each user
  for (const [key, profile] of Object.entries(PROFILES)) {
    const uid = userIds[key]!;
    const prediction = await getOrCreatePrediction(db, {
      poolId: pool.id,
      userId: uid,
      tournamentId: TOURNAMENT_ID,
    });
    const predId = prediction.id;

    // Group scores (per-user predictions)
    for (const { matchId, home, away } of profile.groupScores) {
      await upsertGroupScore(db, predId, matchId, home, away);
    }

    // Knockout picks
    for (const { bracketMatchKey: bmk, winner } of profile.picks) {
      await upsertKnockoutPick(db, predId, bracketMatchKey(bmk), winner);
    }

    // Finish scores (predicted exact goals for final and bronze)
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

  // Re-sync to score all predictions against the completed results
  logger.info('rescoring all predictions');
  await syncTournament(db, TOURNAMENT_ID, dataDir);

  logger.info(
    {
      loginUrl: `/login/${DEV_CREATOR_TOKEN}`,
      poolId: pool.id,
      users: Object.entries(userIds).map(([k, id]) => ({ name: PROFILES[k]!.displayName, id })),
    },
    'seed complete',
  );

  console.log('\n=== Dev Seed Complete ===');
  console.log(`Creator login:  http://localhost:3000/login/${DEV_CREATOR_TOKEN}`);
  console.log(`Pool ID:        ${pool.id}`);
  console.log('Users:');
  for (const [key, uid] of Object.entries(userIds)) {
    console.log(`  ${PROFILES[key]!.displayName.padEnd(8)} ${uid}`);
  }
  console.log('\nExpected leaderboard (approx):');
  console.log('  1. Alice   — near-perfect group scores, all bracket picks correct');
  console.log('  2. Bob     — 1 wrong R32 pick (SCO); final winner correct (ARG)');
  console.log('  3. Charlie — 2 wrong R32 picks (SCO, QAT); SCO wins final (wrong)');
  console.log('  4. Diana   — 3 wrong R32 picks (SCO, AUS, IRN); SCO wins final (wrong)');
  console.log('  5. Eve     — 4 wrong R32 picks (SCO, ECU, AUS, EGY); ECU wins final (wrong)');
  console.log('  6. Frank   — 3 wrong R32 picks (ECU, AUT, URU); worst group predictions');
}

// ── CLI entry point ────────────────────────────────────────────────────────────

const isDirectlyExecuted =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('/scripts/seed.ts') || process.argv[1].endsWith('/scripts/seed.js'));

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
      logger.error(err, 'seed failed');
      process.exit(1);
    });
}
