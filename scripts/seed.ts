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

// ── Group match scores (exact actual results for all 12 groups) ────────────────
// All users predict these exact scores → everyone gets 6 pts per match.
// Group outcomes (and thus standings / bracket seedings) are consistent across all users.

const GROUP_SCORES = [
  // Group A: MEX(1) KOR(2) CZE(3) RSA(4)
  // mA1 MEX vs RSA, mA2 KOR vs CZE, mA3 CZE vs RSA
  // mA4 MEX vs KOR, mA5 CZE vs MEX, mA6 RSA vs KOR
  { matchId: 'mA1', home: 2, away: 0 },
  { matchId: 'mA2', home: 2, away: 1 },
  { matchId: 'mA3', home: 2, away: 0 },
  { matchId: 'mA4', home: 2, away: 1 },
  { matchId: 'mA5', home: 1, away: 2 },
  { matchId: 'mA6', home: 0, away: 2 },
  // Group B: SUI(1) CAN(2) QAT(3) BIH(4)
  { matchId: 'mB1', home: 2, away: 0 },
  { matchId: 'mB2', home: 1, away: 3 },
  { matchId: 'mB3', home: 2, away: 0 },
  { matchId: 'mB4', home: 2, away: 1 },
  { matchId: 'mB5', home: 1, away: 0 },
  { matchId: 'mB6', home: 1, away: 2 },
  // Group C: BRA(1) MAR(2) SCO(3) HAI(4)
  // mC4 BRA 6-1 HAI = 7 total goals (highest match)
  { matchId: 'mC1', home: 3, away: 0 },
  { matchId: 'mC2', home: 0, away: 2 },
  { matchId: 'mC3', home: 1, away: 2 },
  { matchId: 'mC4', home: 6, away: 1 },
  { matchId: 'mC5', home: 1, away: 2 },
  { matchId: 'mC6', home: 2, away: 0 },
  // Group D: USA(1) TUR(2) AUS(3) PAR(4)
  { matchId: 'mD1', home: 2, away: 0 },
  { matchId: 'mD2', home: 1, away: 2 },
  { matchId: 'mD3', home: 2, away: 1 },
  { matchId: 'mD4', home: 2, away: 0 },
  { matchId: 'mD5', home: 0, away: 1 },
  { matchId: 'mD6', home: 1, away: 2 },
  // Group E: GER(1) ECU(2) CIV(3) CUW(4)
  // CUW conceded 9 goals in group (most)
  { matchId: 'mE1', home: 4, away: 0 },
  { matchId: 'mE2', home: 1, away: 2 },
  { matchId: 'mE3', home: 2, away: 0 },
  { matchId: 'mE4', home: 3, away: 0 },
  { matchId: 'mE5', home: 1, away: 2 },
  { matchId: 'mE6', home: 0, away: 2 },
  // Group F: NED(1) SWE(2) JPN(3) TUN(4)
  { matchId: 'mF1', home: 2, away: 1 },
  { matchId: 'mF2', home: 3, away: 0 },
  { matchId: 'mF3', home: 1, away: 0 },
  { matchId: 'mF4', home: 0, away: 2 },
  { matchId: 'mF5', home: 1, away: 2 },
  { matchId: 'mF6', home: 0, away: 2 },
  // Group G: BEL(1) EGY(2) IRN(3) NZL(4)
  { matchId: 'mG1', home: 2, away: 1 },
  { matchId: 'mG2', home: 2, away: 0 },
  { matchId: 'mG3', home: 2, away: 0 },
  { matchId: 'mG4', home: 0, away: 2 },
  { matchId: 'mG5', home: 2, away: 1 },
  { matchId: 'mG6', home: 0, away: 3 },
  // Group H: ESP(1) URU(2) KSA(3) CPV(4)
  { matchId: 'mH1', home: 3, away: 0 },
  { matchId: 'mH2', home: 1, away: 2 },
  { matchId: 'mH3', home: 2, away: 0 },
  { matchId: 'mH4', home: 2, away: 0 },
  { matchId: 'mH5', home: 1, away: 2 },
  { matchId: 'mH6', home: 1, away: 2 },
  // Group I: FRA(1) NOR(2) SEN(3) IRQ(4)
  { matchId: 'mI1', home: 2, away: 0 },
  { matchId: 'mI2', home: 0, away: 3 },
  { matchId: 'mI3', home: 3, away: 0 },
  { matchId: 'mI4', home: 2, away: 0 },
  { matchId: 'mI5', home: 1, away: 2 },
  { matchId: 'mI6', home: 2, away: 0 },
  // Group J: ARG(1) AUT(2) ALG(3) JOR(4)
  { matchId: 'mJ1', home: 3, away: 0 },
  { matchId: 'mJ2', home: 2, away: 0 },
  { matchId: 'mJ3', home: 2, away: 1 },
  { matchId: 'mJ4', home: 1, away: 2 },
  { matchId: 'mJ5', home: 1, away: 2 },
  { matchId: 'mJ6', home: 0, away: 2 },
  // Group K: POR(1) COL(2) COD(3) UZB(4)
  { matchId: 'mK1', home: 3, away: 0 },
  { matchId: 'mK2', home: 0, away: 2 },
  { matchId: 'mK3', home: 2, away: 0 },
  { matchId: 'mK4', home: 2, away: 1 },
  { matchId: 'mK5', home: 1, away: 2 },
  { matchId: 'mK6', home: 2, away: 0 },
  // Group L: ENG(1) CRO(2) GHA(3) PAN(4)
  { matchId: 'mL1', home: 2, away: 0 },
  { matchId: 'mL2', home: 2, away: 1 },
  { matchId: 'mL3', home: 2, away: 0 },
  { matchId: 'mL4', home: 0, away: 2 },
  { matchId: 'mL5', home: 0, away: 3 },
  { matchId: 'mL6', home: 2, away: 0 },
];

// ── Knockout bracket definitions ───────────────────────────────────────────────
//
// Qualified 3rd-placed teams ranked by (pts, GD, GF, group index):
//   [0]=CZE [1]=SCO [2]=JPN [3]=AUS [4]=CIV [5]=IRN [6]=QAT [7]=KSA
//
// R32 matchups (entry slots):
//   r32m73 KOR  vs CAN    r32m74 GER  vs CZE[0]  r32m75 NED  vs MAR
//   r32m76 BRA  vs SWE    r32m77 FRA  vs SCO[1]  r32m78 ECU  vs NOR
//   r32m79 MEX  vs JPN[2] r32m80 ENG  vs AUS[3]  r32m81 USA  vs CIV[4]
//   r32m82 BEL  vs IRN[5] r32m83 COL  vs CRO     r32m84 ESP  vs AUT
//   r32m85 SUI  vs QAT[6] r32m86 ARG  vs URU     r32m87 POR  vs KSA[7]
//   r32m88 TUR  vs EGY
//
// Actual R32 results: KOR GER NED BRA FRA NOR MEX ENG USA BEL COL ESP SUI ARG POR TUR
//
// R16 matchups (from progression):
//   r16m89 GER  vs FRA    r16m90 KOR  vs NED
//   r16m91 BRA  vs NOR    r16m92 MEX  vs ENG
//   r16m93 COL  vs ESP    r16m94 USA  vs BEL
//   r16m95 ARG  vs TUR    r16m96 SUI  vs POR
//
// Actual R16: GER NED BRA ENG ESP BEL ARG POR
// QF: qf97(GER vs NED)→GER  qf98(ESP vs BEL)→ESP  qf99(BRA vs ENG)→BRA  qf100(ARG vs POR)→ARG
// SF: sf101(GER vs ESP)→ESP  sf102(BRA vs ARG)→ARG
// Final: ESP vs ARG → ARG wins (1-1 AET, penalties)
// Bronze: GER vs BRA → GER wins 2-1

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

// Bob — picks FRA over GER in r16m89, then FRA all the way to final; ~595 pts
// roundOf8 wrong: FRA replaces GER. topFour: [ARG,FRA,ESP,BRA] → 2 correct (ARG,BRA).
const PICKS_BOB = [
  ...R32_ALL_CORRECT,
  { bracketMatchKey: 'r16m89', winner: 'FRA' }, // GER vs FRA → FRA (wrong)
  { bracketMatchKey: 'r16m90', winner: 'NED' },
  { bracketMatchKey: 'r16m91', winner: 'BRA' },
  { bracketMatchKey: 'r16m92', winner: 'ENG' },
  { bracketMatchKey: 'r16m93', winner: 'ESP' },
  { bracketMatchKey: 'r16m94', winner: 'BEL' },
  { bracketMatchKey: 'r16m95', winner: 'ARG' },
  { bracketMatchKey: 'r16m96', winner: 'POR' },
  { bracketMatchKey: 'qf97', winner: 'FRA' }, // FRA vs NED → FRA
  { bracketMatchKey: 'qf98', winner: 'ESP' },
  { bracketMatchKey: 'qf99', winner: 'BRA' },
  { bracketMatchKey: 'qf100', winner: 'ARG' },
  { bracketMatchKey: 'sf101', winner: 'FRA' }, // FRA vs ESP → FRA
  { bracketMatchKey: 'sf102', winner: 'ARG' },
  { bracketMatchKey: 'final', winner: 'ARG' }, // FRA vs ARG → ARG (correct winner!)
  { bracketMatchKey: 'bronze', winner: 'ESP' }, // ESP vs BRA → ESP
] as const;

// Charlie — same R16 as actual, wrong in QF (BEL over ESP, ENG over BRA); ~583 pts
// roundOf8 correct (QF participants same). topFour: [ARG,GER,BEL,ENG] → 1 correct (ARG).
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
  { bracketMatchKey: 'qf98', winner: 'BEL' }, // ESP vs BEL → BEL (wrong)
  { bracketMatchKey: 'qf99', winner: 'ENG' }, // BRA vs ENG → ENG (wrong)
  { bracketMatchKey: 'qf100', winner: 'ARG' },
  { bracketMatchKey: 'sf101', winner: 'GER' }, // GER vs BEL → GER
  { bracketMatchKey: 'sf102', winner: 'ARG' }, // ENG vs ARG → ARG ✓
  { bracketMatchKey: 'final', winner: 'ARG' }, // GER vs ARG → ARG ✓
  { bracketMatchKey: 'bronze', winner: 'BEL' }, // BEL vs ENG → BEL
] as const;

// Diana — picks MEX over ENG in r16m92, MEX goes through QF/SF; ~576 pts
// roundOf8 wrong: MEX replaces ENG. topFour: [ESP,MEX,GER,ARG] → 1 correct (ESP in right place).
const PICKS_DIANA = [
  ...R32_ALL_CORRECT,
  { bracketMatchKey: 'r16m89', winner: 'GER' },
  { bracketMatchKey: 'r16m90', winner: 'NED' },
  { bracketMatchKey: 'r16m91', winner: 'BRA' },
  { bracketMatchKey: 'r16m92', winner: 'MEX' }, // MEX vs ENG → MEX (wrong)
  { bracketMatchKey: 'r16m93', winner: 'ESP' },
  { bracketMatchKey: 'r16m94', winner: 'BEL' },
  { bracketMatchKey: 'r16m95', winner: 'ARG' },
  { bracketMatchKey: 'r16m96', winner: 'POR' },
  { bracketMatchKey: 'qf97', winner: 'GER' },
  { bracketMatchKey: 'qf98', winner: 'ESP' },
  { bracketMatchKey: 'qf99', winner: 'MEX' }, // BRA vs MEX → MEX (wrong)
  { bracketMatchKey: 'qf100', winner: 'ARG' },
  { bracketMatchKey: 'sf101', winner: 'ESP' }, // GER vs ESP → ESP ✓
  { bracketMatchKey: 'sf102', winner: 'MEX' }, // MEX vs ARG → MEX (wrong)
  { bracketMatchKey: 'final', winner: 'ESP' }, // ESP vs MEX → ESP (wrong winner)
  { bracketMatchKey: 'bronze', winner: 'GER' }, // GER vs ARG → GER
] as const;

// Eve — picks NOR over BRA (r16m91) and TUR over ARG (r16m95); ~557 pts
// roundOf8 wrong: NOR replaces BRA, TUR replaces ARG.
// topFour: [ENG,ESP,GER,TUR] → 2 correct positions (ESP at 1, GER at 2).
const PICKS_EVE = [
  ...R32_ALL_CORRECT,
  { bracketMatchKey: 'r16m89', winner: 'GER' },
  { bracketMatchKey: 'r16m90', winner: 'NED' },
  { bracketMatchKey: 'r16m91', winner: 'NOR' }, // BRA vs NOR → NOR (wrong)
  { bracketMatchKey: 'r16m92', winner: 'ENG' },
  { bracketMatchKey: 'r16m93', winner: 'ESP' },
  { bracketMatchKey: 'r16m94', winner: 'BEL' },
  { bracketMatchKey: 'r16m95', winner: 'TUR' }, // ARG vs TUR → TUR (wrong)
  { bracketMatchKey: 'r16m96', winner: 'POR' },
  { bracketMatchKey: 'qf97', winner: 'GER' },
  { bracketMatchKey: 'qf98', winner: 'ESP' }, // ESP vs BEL → ESP ✓
  { bracketMatchKey: 'qf99', winner: 'ENG' }, // NOR vs ENG → ENG
  { bracketMatchKey: 'qf100', winner: 'TUR' }, // TUR vs POR → TUR
  { bracketMatchKey: 'sf101', winner: 'ESP' }, // GER vs ESP → ESP ✓
  { bracketMatchKey: 'sf102', winner: 'ENG' }, // ENG vs TUR → ENG
  { bracketMatchKey: 'final', winner: 'ENG' }, // ESP vs ENG → ENG (wrong)
  { bracketMatchKey: 'bronze', winner: 'GER' }, // GER vs TUR → GER
] as const;

// Frank — picks ECU (r32m78), AUT (r32m84), URU (r32m86) in R32, then diverges; ~534 pts
// roundOf8 wrong: COL replaces ESP, URU replaces ARG.
// topFour: [GER,ENG,BEL,URU] → 0 correct positions, only GER in actual (consolation).
const PICKS_FRANK = [
  { bracketMatchKey: 'r32m73', winner: 'KOR' },
  { bracketMatchKey: 'r32m74', winner: 'GER' },
  { bracketMatchKey: 'r32m75', winner: 'NED' },
  { bracketMatchKey: 'r32m76', winner: 'BRA' },
  { bracketMatchKey: 'r32m77', winner: 'FRA' },
  { bracketMatchKey: 'r32m78', winner: 'ECU' }, // ECU vs NOR → ECU (wrong)
  { bracketMatchKey: 'r32m79', winner: 'MEX' },
  { bracketMatchKey: 'r32m80', winner: 'ENG' },
  { bracketMatchKey: 'r32m81', winner: 'USA' },
  { bracketMatchKey: 'r32m82', winner: 'BEL' },
  { bracketMatchKey: 'r32m83', winner: 'COL' },
  { bracketMatchKey: 'r32m84', winner: 'AUT' }, // ESP vs AUT → AUT (wrong)
  { bracketMatchKey: 'r32m85', winner: 'SUI' },
  { bracketMatchKey: 'r32m86', winner: 'URU' }, // ARG vs URU → URU (wrong)
  { bracketMatchKey: 'r32m87', winner: 'POR' },
  { bracketMatchKey: 'r32m88', winner: 'TUR' },
  { bracketMatchKey: 'r16m89', winner: 'GER' },
  { bracketMatchKey: 'r16m90', winner: 'NED' },
  { bracketMatchKey: 'r16m91', winner: 'BRA' }, // BRA vs ECU → BRA ✓
  { bracketMatchKey: 'r16m92', winner: 'ENG' },
  { bracketMatchKey: 'r16m93', winner: 'COL' }, // COL vs AUT → COL
  { bracketMatchKey: 'r16m94', winner: 'BEL' },
  { bracketMatchKey: 'r16m95', winner: 'URU' }, // URU vs TUR → URU
  { bracketMatchKey: 'r16m96', winner: 'POR' },
  { bracketMatchKey: 'qf97', winner: 'GER' },
  { bracketMatchKey: 'qf98', winner: 'BEL' }, // COL vs BEL → BEL
  { bracketMatchKey: 'qf99', winner: 'ENG' }, // BRA vs ENG → ENG (wrong)
  { bracketMatchKey: 'qf100', winner: 'URU' }, // URU vs POR → URU
  { bracketMatchKey: 'sf101', winner: 'GER' }, // GER vs BEL → GER
  { bracketMatchKey: 'sf102', winner: 'ENG' }, // ENG vs URU → ENG
  { bracketMatchKey: 'final', winner: 'GER' }, // GER vs ENG → GER
  { bracketMatchKey: 'bronze', winner: 'BEL' }, // BEL vs URU → BEL
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
    picks: ReadonlyArray<{ bracketMatchKey: string; winner: string }>;
    finishScores: FinishScores;
    specials: Specials;
  }
> = {
  alice: {
    displayName: 'Alice',
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
    picks: PICKS_BOB,
    finishScores: {
      final: { home: 2, away: 1 }, // FRA vs ARG predicted, ARG wins 2-1
      bronze: { home: 2, away: 1 }, // ESP vs BRA predicted (wrong teams)
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
    picks: PICKS_CHARLIE,
    finishScores: {
      final: { home: 1, away: 0 }, // GER vs ARG predicted, ARG wins 1-0
      bronze: { home: 2, away: 1 }, // BEL vs ENG predicted (wrong teams)
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
    picks: PICKS_DIANA,
    finishScores: {
      final: { home: 2, away: 1 }, // ESP vs MEX predicted, ESP wins 2-1
      bronze: { home: 2, away: 0 }, // GER vs ARG predicted, GER wins 2-0
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
    picks: PICKS_EVE,
    finishScores: {
      final: { home: 2, away: 1 }, // ESP vs ENG predicted, ENG wins 2-1
      bronze: { home: 2, away: 0 }, // GER vs TUR predicted, GER wins 2-0 (actual 2-1 → not exact)
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
    picks: PICKS_FRANK,
    finishScores: {
      final: { home: 1, away: 0 }, // GER vs ENG predicted, GER wins 1-0
      bronze: { home: 2, away: 1 }, // BEL vs URU predicted (wrong teams)
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

    // Group scores (same for all users — exact actual results)
    for (const { matchId, home, away } of GROUP_SCORES) {
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
  console.log('  1. Alice  ~698 pts');
  console.log('  2. Bob    ~595 pts');
  console.log('  3. Charlie~583 pts');
  console.log('  4. Diana  ~576 pts');
  console.log('  5. Eve    ~557 pts');
  console.log('  6. Frank  ~534 pts');
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
