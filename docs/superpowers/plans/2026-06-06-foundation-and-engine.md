# Foundation + Scoring Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the pnpm monorepo + tooling and build the pure, fully-tested scoring/derivation engine (`@cup/engine`) and validation contracts (`@cup/schemas`) — no UI, no database.

**Architecture:** pnpm workspace. `@cup/engine` is a dependency-free, pure-TS domain package (branded types, `deriveCard`, `scoreCard`); `@cup/schemas` adds Zod contracts that parse `tournament.json` / `results.json` / import-export payloads into engine types. Everything is unit-tested (test diamond's thin top); the functional-spec §7.7 worked example is an integration-style test over the whole engine.

**Tech Stack:** TypeScript (strict) · pnpm workspace · Vitest · Zod · ESLint + Prettier · husky + lint-staged · GitHub Actions. Node 20.

**Source of truth:** functional-spec §4 (data formats), §6 (prediction inputs + derivation), §7 (scoring). CLAUDE.md (practices: branded types, pure functions, TDD, separate data from logic).

**Conventions:**

- Conventional Commits (`feat:`, `chore:`, `test:`, `docs:`). Commit after each green step group.
- TDD strictly: write the failing test, watch it fail, implement minimally, watch it pass, refactor, commit.
- All engine functions are **pure** (no IO, clock, or randomness). Data in → data out.

---

## File structure

```
/
├── package.json                      # root: workspace scripts, devDeps, lint-staged
├── pnpm-workspace.yaml
├── tsconfig.base.json                # strict compiler options shared by packages
├── eslint.config.js                  # flat config + import-boundary rule
├── .prettierrc.json
├── vitest.config.ts                  # root test config
├── .husky/{pre-commit,pre-push}
├── .github/workflows/ci.yml
└── packages/
    ├── engine/                       # @cup/engine — pure domain
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── brand.ts              # Brand<> helper + id constructors
    │       ├── types.ts              # Tournament, CardInputs, ActualResults, DerivedCard, ScoreBreakdown
    │       ├── result.ts             # Result<T,E>
    │       ├── standings.ts          # computeStandings, deriveGroupOrders
    │       ├── qualifiers.ts         # selectQualifiers (top-N + best thirds)
    │       ├── bracket.ts            # buildBracket → roundOf8, finalists, bronzePair, topFour
    │       ├── derive.ts             # deriveCard (compose standings→qualifiers→bracket)
    │       ├── scoring/
    │       │   ├── group-matches.ts
    │       │   ├── group-order.ts
    │       │   ├── finish-matches.ts # bronze + final
    │       │   ├── sets-rankings.ts  # round-of-8 + top-4
    │       │   └── specials.ts
    │       ├── score.ts              # scoreCard (compose scoring/*)
    │       ├── index.ts              # PUBLIC interface
    │       └── __fixtures__/mini-tournament.ts
    └── schemas/                      # @cup/schemas — Zod contracts
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── tournament.ts
            ├── results.ts
            ├── card-io.ts            # import/export format (functional-spec §6.6)
            └── index.ts
```

---

## Task 0: Workspace, tooling & CI scaffolding

**Files:** `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `vitest.config.ts`, `.husky/pre-commit`, `.husky/pre-push`, `.github/workflows/ci.yml`, `.gitignore`

- [ ] **Step 1: Init workspace files**

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

`package.json` (root):

```json
{
  "name": "cup-prediction",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc -b",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepare": "husky"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "husky": "^9.0.0",
    "lint-staged": "^15.0.0",
    "prettier": "^3.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yaml,yml}": ["prettier --write"]
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "composite": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`.prettierrc.json`:

```json
{ "singleQuote": true, "semi": true, "printWidth": 100, "trailingComma": "all" }
```

`.gitignore`:

```
node_modules/
dist/
*.tsbuildinfo
coverage/
.env*
```

- [ ] **Step 2: ESLint flat config with slice import-boundary rule**

`eslint.config.js`:

```js
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.tsbuildinfo'] },
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tsparser, parserOptions: { project: true } },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/*/!(index)', '**/features/*/*/**'],
              message: 'Import features only via their index.ts public interface.',
            },
          ],
        },
      ],
    },
  },
];
```

_(The boundary rule matters once `apps/web/features/_` exists; harmless now.)\*

- [ ] **Step 3: Root Vitest config**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['packages/**/src/**/*.test.ts'], environment: 'node' },
});
```

- [ ] **Step 4: Install deps and init husky**

Run:

```bash
pnpm install
pnpm exec husky init
printf '%s\n' 'pnpm exec lint-staged' > .husky/pre-commit
printf '%s\n' 'pnpm typecheck && pnpm test' > .husky/pre-push
```

Expected: `.husky/` created; hooks executable.

- [ ] **Step 5: CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push: { branches: [main] }
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm format:check
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
```

- [ ] **Step 6: Verify tooling runs (no packages yet → tests pass with 0 files is fine after Task 1)**

Run: `pnpm format:check && pnpm lint`
Expected: PASS (no errors).

- [ ] **Step 7: Commit**

```bash
git checkout -b feat/foundation-engine
git add -A
git commit -m "chore: scaffold pnpm workspace, tooling, husky and CI"
```

---

## Task 1: `@cup/engine` package + branded types + Result

**Files:** Create `packages/engine/package.json`, `packages/engine/tsconfig.json`, `packages/engine/src/brand.ts`, `packages/engine/src/result.ts`, `packages/engine/src/brand.test.ts`

- [ ] **Step 1: Package manifest + tsconfig**

`packages/engine/package.json`:

```json
{
  "name": "@cup/engine",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc -b" }
}
```

`packages/engine/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

- [ ] **Step 2: Write failing test for branded id constructors**

`packages/engine/src/brand.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { teamId, points } from './brand.js';

describe('branded constructors', () => {
  it('wraps and unwraps transparently at runtime', () => {
    expect(teamId('ARG')).toBe('ARG');
    expect(points(5)).toBe(5);
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

Run: `pnpm vitest run packages/engine/src/brand.test.ts`
Expected: FAIL — cannot find `./brand.js`.

- [ ] **Step 4: Implement brand helper + constructors**

`packages/engine/src/brand.ts`:

```ts
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type TeamId = Brand<string, 'TeamId'>;
export type PlayerId = Brand<string, 'PlayerId'>;
export type GroupId = Brand<string, 'GroupId'>;
export type MatchId = Brand<string, 'MatchId'>;
export type BracketMatchKey = Brand<string, 'BracketMatchKey'>;
export type Points = Brand<number, 'Points'>;

export const teamId = (s: string): TeamId => s as TeamId;
export const playerId = (s: string): PlayerId => s as PlayerId;
export const groupId = (s: string): GroupId => s as GroupId;
export const matchId = (s: string): MatchId => s as MatchId;
export const bracketMatchKey = (s: string): BracketMatchKey => s as BracketMatchKey;
export const points = (n: number): Points => n as Points;
```

- [ ] **Step 5: Result type (no test needed — type-only)**

`packages/engine/src/result.ts`:

```ts
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

- [ ] **Step 6: Run test, verify PASS; add engine to root install**

Run: `pnpm install && pnpm vitest run packages/engine/src/brand.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(engine): add branded domain types and Result"
```

---

## Task 2: Domain types (`types.ts`)

**Files:** Create `packages/engine/src/types.ts` (type-only; verified by later tasks compiling).

- [ ] **Step 1: Define the data shapes** (separate data from logic — these are plain records)

`packages/engine/src/types.ts`:

```ts
import type { TeamId, PlayerId, GroupId, MatchId, BracketMatchKey } from './brand.js';

export type TiebreakKey = 'points' | 'goalDifference' | 'goalsFor' | 'seedOrder';

export interface Team {
  id: TeamId;
  name: string;
}
export interface Player {
  id: PlayerId;
  name: string;
  team: TeamId;
}
export interface Group {
  id: GroupId;
  teams: TeamId[];
} // index order == seedOrder
export interface GroupMatchDef {
  id: MatchId;
  group: GroupId;
  home: TeamId;
  away: TeamId;
}

/** Slot reference tokens used by the bracket template: "1A", "2B", "3rd[0]". */
export type SlotRef = string;
export interface BracketSlot {
  match: BracketMatchKey;
  home: SlotRef;
  away: SlotRef;
}
export interface Progression {
  match: BracketMatchKey;
  from: BracketMatchKey[];
}
export interface BracketDef {
  rounds: string[];
  entryRound: string;
  /** matches that constitute the "Round of 8" (quarter-finals). */
  roundOf8Matches: BracketMatchKey[];
  slots: BracketSlot[];
  progression: Progression[];
  semiFinals: BracketMatchKey[]; // [sf-1, sf-2]
  finalMatch: BracketMatchKey;
  bronzeMatch: BracketMatchKey;
}

export interface Scoring {
  groupMatch: { exactScore: number; correctOutcome: number };
  groupOrder: { allCorrect: number; twoCorrect: number; oneCorrect: number };
  groupTopScoringTeam: number;
  groupTopConcedingTeam: number;
  roundOf8PerTeam: number;
  bronze: { exactScore: number; perTeam: number };
  final: { exactScore: number; perTeam: number };
  topFourOrder: {
    allCorrect: number;
    threeCorrect: number;
    twoCorrect: number;
    oneCorrect: number;
    teamRightWrongPlace: number;
  };
  tournamentTopScoringTeam: number;
  tournamentTopConcedingTeam: number;
  highestMatchGoals: number;
  mostYellowCardsTeam: number;
  firstRedCardPlayer: number;
  penaltyShootoutCount: number;
  finalDecidedByPenalties: number;
  finalDecisiveGoalPlayer: number;
  topScorerPlayer: number;
}

export interface Tournament {
  id: string;
  name: string;
  teams: Team[];
  players: Player[];
  groups: Group[];
  groupMatches: GroupMatchDef[];
  qualification: { autoQualifyPerGroup: number; bestThirdPlaced: number };
  standingsTiebreak: TiebreakKey[];
  bracket: BracketDef;
  scoring: Scoring;
}

// ---- Player inputs (functional-spec §6) ----
export interface GroupScore {
  matchId: MatchId;
  home: number;
  away: number;
}
export interface KnockoutPick {
  bracketMatchKey: BracketMatchKey;
  winner: TeamId;
}
export interface FinishScore {
  home: number;
  away: number;
}
export interface SpecialBets {
  topScorerPlayer?: PlayerId;
  groupTopScoringTeam?: TeamId;
  groupTopConcedingTeam?: TeamId;
  tournamentTopScoringTeam?: TeamId;
  tournamentTopConcedingTeam?: TeamId;
  highestMatchGoals?: number;
  mostYellowCardsTeam?: TeamId;
  firstRedCardPlayer?: PlayerId;
  penaltyShootoutCount?: number;
  finalDecidedByPenalties?: boolean;
  finalDecisiveGoalPlayer?: PlayerId;
}
export interface CardInputs {
  groupScores: GroupScore[];
  knockoutPicks: KnockoutPick[];
  finishScores: { final?: FinishScore; bronze?: FinishScore };
  specials: SpecialBets;
}

// ---- Derived (output of deriveCard) ----
export interface DerivedCard {
  groupOrders: Record<string, TeamId[]>; // groupId -> [1st..4th]
  qualifiers: TeamId[];
  roundOf8: TeamId[];
  finalists: TeamId[];
  bronzePair: TeamId[];
  topFour: TeamId[]; // [champion, runnerUp, third, fourth]
}

// ---- Actual results (functional-spec §4.2) ----
export interface ActualMatchResult {
  matchId: MatchId;
  home: number;
  away: number;
}
export interface ActualFinishMatch {
  home: TeamId;
  away: TeamId;
  homeGoals: number;
  awayGoals: number;
}
export interface ActualResults {
  matchResults: ActualMatchResult[];
  groupOrder: Record<string, TeamId[]>;
  bronzeMatch?: ActualFinishMatch;
  finalMatch?: ActualFinishMatch & {
    decidedBy?: 'regulation' | 'extraTime' | 'penalties';
    decisiveGoalPlayer?: PlayerId;
  };
  answers: {
    roundOf8?: TeamId[];
    topFourOrder?: TeamId[];
    groupTopScoringTeam?: TeamId;
    groupTopConcedingTeam?: TeamId;
    tournamentTopScoringTeam?: TeamId;
    tournamentTopConcedingTeam?: TeamId;
    highestMatchGoals?: number;
    mostYellowCardsTeam?: TeamId;
    firstRedCardPlayer?: PlayerId;
    penaltyShootoutCount?: number;
    topScorerPlayer?: PlayerId;
  };
}

// ---- Score output ----
export interface ScoreBreakdown {
  groupMatches: number;
  groupOrder: number;
  bronze: number;
  final: number;
  roundOf8: number;
  topFour: number;
  specials: number;
  total: number;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -C packages/engine typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(engine): add domain, input, derived and result types"
```

---

## Task 3: Mini-tournament fixture

**Files:** Create `packages/engine/src/__fixtures__/mini-tournament.ts`

A deterministic fixture: **4 groups (A–D) of 4**, top 2 advance → **8 qualifiers** → QF (round of 8) → SF → final + bronze. No best-thirds (keeps early tests simple; thirds covered in Task 5 with an override).

- [ ] **Step 1: Build the fixture** (teams `A1..D4`; bracket QF pairs 1st vs 2nd cross-group)

`packages/engine/src/__fixtures__/mini-tournament.ts`:

```ts
import type { Tournament } from '../types.js';
import { teamId, groupId, matchId, bracketMatchKey, playerId } from '../brand.js';

// helper builders omitted for brevity in the plan: construct 4 groups of 4,
// 6 round-robin matches per group (24 group matches), and a bracket:
//   QF: qf1..qf4 fed by slots 1A/2B, 1C/2D, 1B/2A, 1D/2C
//   SF: sf1 (qf1,qf2), sf2 (qf3,qf4); final (sf1,sf2); bronze (sf1,sf2 losers)
// Scoring block = the functional-spec §4.1 defaults.
export const miniTournament: Tournament = {
  /* fully specified literal */
} as Tournament;
export const miniScoring = miniTournament.scoring;
```

> **Implementer note:** write the literal in full (all 24 group matches + bracket). Use the
> functional-spec §4.1 `scoring` defaults verbatim. Keep team seed order = array order.

- [ ] **Step 2: Sanity test the fixture shape**

`packages/engine/src/__fixtures__/mini-tournament.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { miniTournament } from './mini-tournament.js';

it('has 4 groups of 4 and 24 group matches', () => {
  expect(miniTournament.groups).toHaveLength(4);
  expect(miniTournament.groups.every((g) => g.teams.length === 4)).toBe(true);
  expect(miniTournament.groupMatches).toHaveLength(24);
});
```

- [ ] **Step 3: Run → PASS; commit**

Run: `pnpm vitest run packages/engine/src/__fixtures__`

```bash
git add -A && git commit -m "test(engine): add mini-tournament fixture"
```

---

## Task 4: Standings & group-order derivation (`standings.ts`)

Implements functional-spec §6.2 / §7.2 tiebreak: points → goalDifference → goalsFor → seedOrder.

**Files:** Create `packages/engine/src/standings.ts`, `packages/engine/src/standings.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { computeStandings } from './standings.js';
import { miniTournament } from './__fixtures__/mini-tournament.js';
import { groupId, teamId } from './brand.js';

describe('computeStandings (group A)', () => {
  const groupAMatches = miniTournament.groupMatches.filter((m) => m.group === groupId('A'));

  it('orders by points, then GD, then GF, then seedOrder', () => {
    // scores chosen so final order is A1 > A2 > A3 > A4 (see fixture comment)
    const scores = /* GroupScore[] making A1 win all, A4 lose all */ [];
    const order = computeStandings(miniTournament, groupId('A'), scores);
    expect(order).toEqual([teamId('A1'), teamId('A2'), teamId('A3'), teamId('A4')]);
  });

  it('falls back to seedOrder when points/GD/GF all tie', () => {
    const allDraws = groupAMatches.map((m) => ({ matchId: m.id, home: 0, away: 0 }));
    const order = computeStandings(miniTournament, groupId('A'), allDraws);
    expect(order).toEqual([teamId('A1'), teamId('A2'), teamId('A3'), teamId('A4')]); // seed order
  });
});
```

- [ ] **Step 2: Run → FAIL** (`computeStandings` not defined).

- [ ] **Step 3: Implement**

```ts
import type { GroupId, TeamId } from './brand.js';
import type { Tournament, GroupScore, TiebreakKey } from './types.js';

interface Row {
  team: TeamId;
  seed: number;
  points: number;
  gf: number;
  ga: number;
}

export function computeStandings(t: Tournament, group: GroupId, scores: GroupScore[]): TeamId[] {
  const grp = t.groups.find((g) => g.id === group);
  if (!grp) throw new Error(`Unknown group ${group}`);
  const rows = new Map<TeamId, Row>(
    grp.teams.map((team, i) => [team, { team, seed: i, points: 0, gf: 0, ga: 0 }]),
  );
  const byId = new Map(scores.map((s) => [s.matchId, s]));

  for (const m of t.groupMatches.filter((gm) => gm.group === group)) {
    const s = byId.get(m.id);
    if (!s) continue; // unpredicted -> contributes nothing (functional-spec §6.5)
    const home = rows.get(m.home)!;
    const away = rows.get(m.away)!;
    home.gf += s.home;
    home.ga += s.away;
    away.gf += s.away;
    away.ga += s.home;
    if (s.home > s.away) home.points += 3;
    else if (s.home < s.away) away.points += 3;
    else {
      home.points += 1;
      away.points += 1;
    }
  }

  const cmp = (a: Row, b: Row): number => {
    for (const key of t.standingsTiebreak)
      byKey: {
        const d = metric(key, b) - metric(key, a);
        if (d !== 0) return d;
      }
    return 0;
  };
  return [...rows.values()].sort(cmp).map((r) => r.team);
}

function metric(key: TiebreakKey, r: Row): number {
  switch (key) {
    case 'points':
      return r.points;
    case 'goalDifference':
      return r.gf - r.ga;
    case 'goalsFor':
      return r.gf;
    case 'seedOrder':
      return -r.seed; // lower seed index = better
  }
}
```

> Refactor note: replace the `byKey:` label sketch with a clean loop returning on first non-zero.

- [ ] **Step 4: `deriveGroupOrders` for all groups**

```ts
export function deriveGroupOrders(t: Tournament, scores: GroupScore[]): Record<string, TeamId[]> {
  const out: Record<string, TeamId[]> = {};
  for (const g of t.groups) out[g.id] = computeStandings(t, g.id, scores);
  return out;
}
```

Add a test asserting `deriveGroupOrders` returns one ordered array per group.

- [ ] **Step 5: Run → PASS; commit**

```bash
git add -A && git commit -m "feat(engine): derive group standings via configurable tiebreak"
```

---

## Task 5: Qualifier selection (`qualifiers.ts`)

Top-N per group + best-M third-placed across groups, ranked by the same tiebreak (functional-spec §6.2).

**Files:** Create `packages/engine/src/qualifiers.ts`, `packages/engine/src/qualifiers.test.ts`

- [ ] **Step 1: Failing test** — 4 groups, `autoQualifyPerGroup: 2`, `bestThirdPlaced: 0` → exactly 8 qualifiers (the eight 1st/2nd). Add a second fixture variant with `bestThirdPlaced: 2` to assert thirds ranked by points/GD/GF across groups.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**

```ts
import type { TeamId } from './brand.js';
import type { Tournament, GroupScore } from './types.js';
import { computeStandings } from './standings.js';

export function selectQualifiers(
  t: Tournament,
  scores: GroupScore[],
  groupOrders: Record<string, TeamId[]>,
): TeamId[] {
  const auto: TeamId[] = [];
  const thirds: TeamId[] = [];
  for (const g of t.groups) {
    const order = groupOrders[g.id]!;
    auto.push(...order.slice(0, t.qualification.autoQualifyPerGroup));
    const third = order[t.qualification.autoQualifyPerGroup];
    if (third) thirds.push(third);
  }
  // rank thirds across groups by recomputing their standing metrics (reuse computeStandings rows is overkill;
  // compute simple metrics from scores). Implementer: extract a shared `teamMetrics` helper from standings.ts.
  const rankedThirds = rankThirdsAcrossGroups(t, scores, thirds);
  return [...auto, ...rankedThirds.slice(0, t.qualification.bestThirdPlaced)];
}
```

> Extract a shared `teamMetrics(t, scores)` helper (points/GD/GF per team) used by both
> `computeStandings` and `rankThirdsAcrossGroups` — DRY. Cross-group ties fall through to a stable
> deterministic order (group letter then seed) since head-to-head doesn't apply (functional-spec §6.2).

- [ ] **Step 4: Run → PASS; commit**

```bash
git add -A && git commit -m "feat(engine): select qualifiers (top-N + best thirds)"
```

---

## Task 6: Bracket build & propagation (`bracket.ts`)

From qualifiers + knockout winner picks, fill slots and propagate winners → `roundOf8`, `finalists`, `bronzePair`, `topFour` (functional-spec §6.3).

**Files:** Create `packages/engine/src/bracket.ts`, `packages/engine/src/bracket.test.ts`

- [ ] **Step 1: Failing tests** (using miniTournament + a full set of winner picks):
  - `roundOf8` equals the 8 teams placed into the QF slots.
  - given picks, `finalists` are the two winners feeding the final.
  - `bronzePair` are the two SF losers.
  - `topFour` = [final winner, final loser, bronze winner, bronze loser].

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — resolve `SlotRef` tokens (`"1A"`, `"2B"`, `"3rd[i]"`) against group orders + ranked thirds; walk `progression` applying `KnockoutPick`s; compute the four outputs. Throw a typed error if a pick references a team not present in that match (caller drops/re-derives per §6.3). Keep functions pure.

```ts
export interface BracketResult {
  roundOf8: TeamId[];
  finalists: TeamId[];
  bronzePair: TeamId[];
  topFour: TeamId[];
}
export function buildBracket(
  t: Tournament,
  groupOrders: Record<string, TeamId[]>,
  qualifiers: TeamId[],
  picks: KnockoutPick[],
): BracketResult {
  /* resolve slots → propagate picks → derive outputs */
}
```

> Implementer: parse `SlotRef` with a small pure resolver: `1A`→`groupOrders['A'][0]`,
> `2B`→`groupOrders['B'][1]`, `3rd[i]`→`rankedThirds[i]`. Winner of a match = the `KnockoutPick` whose
> `bracketMatchKey` matches; loser = the other participant. Bronze winner from the bronze pick.

- [ ] **Step 4: Run → PASS; commit**

```bash
git add -A && git commit -m "feat(engine): build bracket and derive round-of-8, finalists, top-4"
```

---

## Task 7: `deriveCard` (compose 4–6) (`derive.ts`)

**Files:** Create `packages/engine/src/derive.ts`, `packages/engine/src/derive.test.ts`

- [ ] **Step 1: Failing test** — `deriveCard(inputs, miniTournament)` returns a `DerivedCard` whose `groupOrders`, `qualifiers`, `roundOf8`, `finalists`, `bronzePair`, `topFour` match expectations for a known input.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**

```ts
export function deriveCard(input: CardInputs, t: Tournament): DerivedCard {
  const groupOrders = deriveGroupOrders(t, input.groupScores);
  const qualifiers = selectQualifiers(t, input.groupScores, groupOrders);
  const { roundOf8, finalists, bronzePair, topFour } = buildBracket(
    t,
    groupOrders,
    qualifiers,
    input.knockoutPicks,
  );
  return { groupOrders, qualifiers, roundOf8, finalists, bronzePair, topFour };
}
```

- [ ] **Step 4: Run → PASS; commit**

```bash
git add -A && git commit -m "feat(engine): compose deriveCard"
```

---

## Task 8: Scoring — group matches (`scoring/group-matches.ts`)

functional-spec §7.1: exact = 6, else correct outcome = 3, else 0 (not stacked).

**Files:** Create `packages/engine/src/scoring/group-matches.ts` + test.

- [ ] **Step 1: Failing tests**

```ts
// exact -> 6; correct outcome only -> 3; wrong -> 0; unpredicted match -> 0
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** pure function `scoreGroupMatches(inputs, actual, scoring): number` comparing predicted vs actual outcome/score per match.
- [ ] **Step 4: PASS; commit** `feat(engine): score group matches`.

---

## Task 9: Scoring — group order (`scoring/group-order.ts`)

functional-spec §7.2: per group count exact-position matches → 4:6, 2:3, 1:1, else 0 (3 impossible).

- [ ] **Step 1: Failing tests** (4 correct→6; 2 correct→3; 1→1; 0→0). Compares derived order vs `actual.groupOrder`.
- [ ] **Step 2: FAIL.** **Step 3: Implement.** **Step 4: PASS; commit** `feat(engine): score group order`.

---

## Task 10: Scoring — bronze & final (`scoring/finish-matches.ts`)

functional-spec §7.3: per correct team in the match 5 (0/5/10) + exact score 5; bronze and final independent (max 15 each).

- [ ] **Step 1: Failing tests** — both teams + exact → 15; one team, wrong score → 5; both teams + wrong score → 10; no teams → 0. Teams compared as a set (side-agnostic) against `actual.bronzeMatch`/`finalMatch`; exact score compares the predicted `finishScores` to actual goals **side-agnostically** (home/away mapped to the predicted pairing).
- [ ] **Step 2: FAIL.** **Step 3: Implement** `scoreBronze` + `scoreFinal`. **Step 4: PASS; commit** `feat(engine): score bronze and final`.

---

## Task 11: Scoring — round-of-8 & top-4 (`scoring/sets-rankings.ts`)

functional-spec §7.4: R8 = 3 per derived team in actual set (max 24). Top-4 = `max(positionTier, 2 × teamsInActualTopFour)`; tier 4:20,3:15,2:10,1:5.

- [ ] **Step 1: Failing tests**

```ts
// R8: 6 of 8 correct -> 18
// Top-4 [ARG,FRA,NED,POR] vs actual [ARG,NED,FRA,BRA]:
//   tier = 1 correct = 5; teamsInTop4 = ARG,FRA,NED = 3 -> 6; max -> 6
// Top-4 all correct -> 20 (tier beats 4*2=8)
```

- [ ] **Step 2: FAIL.** **Step 3: Implement** `scoreRoundOf8` + `scoreTopFour` (the `max` rule explicitly). **Step 4: PASS; commit** `feat(engine): score round-of-8 and top-4 (non-additive)`.

---

## Task 12: Scoring — special bets (`scoring/specials.ts`)

functional-spec §7.5 + the two final-derived answers. Each correct answer scores its configured points; missing answer/prediction → 0.

- [ ] **Step 1: Failing tests** — each special independently (team/player/number equality); `finalDecidedByPenalties` read from `actual.finalMatch.decidedBy === 'penalties'`; `finalDecisiveGoalPlayer` from `actual.finalMatch.decisiveGoalPlayer`.
- [ ] **Step 2: FAIL.** **Step 3: Implement** `scoreSpecials`. **Step 4: PASS; commit** `feat(engine): score special bets`.

---

## Task 13: `scoreCard` + functional-spec §7.7 worked example (`score.ts`, `index.ts`)

**Files:** Create `packages/engine/src/score.ts`, `packages/engine/src/index.ts`, `packages/engine/src/score.test.ts`

- [ ] **Step 1: Failing test — the §7.7 worked example end-to-end**

```ts
import { describe, it, expect } from 'vitest';
import { deriveCard, scoreCard } from './index.js';
// Build inputs + actual that reproduce functional-spec §7.7 lines, assert per-category + total.
it('reproduces the functional-spec §7.7 worked example', () => {
  const derived = deriveCard(inputs, tournament);
  const breakdown = scoreCard(derived, inputs, actual, tournament.scoring);
  expect(breakdown.final).toBe(15);
  expect(breakdown.topFour).toBe(6);
  // ...group match 3 + 6, group order 3, round-of-8 18, specials (top scorer 15 + penalties 10)
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `scoreCard` (compose) + public barrel**

```ts
// score.ts
export function scoreCard(
  derived: DerivedCard,
  inputs: CardInputs,
  actual: ActualResults,
  scoring: Scoring,
): ScoreBreakdown {
  const groupMatches = scoreGroupMatches(inputs, actual, scoring);
  const groupOrder = scoreGroupOrder(derived, actual, scoring);
  const bronze = scoreBronze(inputs, derived, actual, scoring);
  const final = scoreFinal(inputs, derived, actual, scoring);
  const roundOf8 = scoreRoundOf8(derived, actual, scoring);
  const topFour = scoreTopFour(derived, actual, scoring);
  const specials = scoreSpecials(inputs, actual, scoring);
  const total = groupMatches + groupOrder + bronze + final + roundOf8 + topFour + specials;
  return { groupMatches, groupOrder, bronze, final, roundOf8, topFour, specials, total };
}
```

`index.ts` re-exports: `deriveCard`, `scoreCard`, all public types, and id constructors.

- [ ] **Step 4: Run full engine suite → PASS**

Run: `pnpm vitest run packages/engine`
Expected: PASS (all tasks green).

- [ ] **Step 5: Determinism property test**

Add `score.property.test.ts`: deriving + scoring the same inputs twice yields deep-equal output (functional-spec §13).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(engine): compose scoreCard and verify §7.7 worked example"
```

---

## Task 14: `@cup/schemas` — Zod contracts

Parse/validate `tournament.json`, `results.json`, and the card import/export format into engine types (functional-spec §4, §6.6). Mock nothing — these are pure validators.

**Files:** Create `packages/schemas/package.json`, `tsconfig.json`, `src/tournament.ts`, `src/results.ts`, `src/card-io.ts`, `src/index.ts` + tests.

- [ ] **Step 1: Package manifest** depending on `@cup/engine` (`workspace:*`) and `zod`.

```json
{
  "name": "@cup/schemas",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "dependencies": { "@cup/engine": "workspace:*", "zod": "^3.23.0" }
}
```

Run `pnpm install`.

- [ ] **Step 2: Failing test — valid tournament parses, invalid is rejected**

```ts
import { tournamentSchema } from './tournament.js';
it('accepts the mini tournament and rejects a bad scoring block', () => {
  expect(() => tournamentSchema.parse(validJson)).not.toThrow();
  expect(() => tournamentSchema.parse({ ...validJson, scoring: {} })).toThrow();
});
```

- [ ] **Step 3: FAIL.**

- [ ] **Step 4: Implement Zod schemas** mirroring `types.ts`; `.transform` ids via brand constructors so `z.infer` matches engine types. `card-io.ts` validates `tournamentId`, `version`, and references; reports unknown fields (partial import allowed → `.partial()` on inputs).

- [ ] **Step 5: Cross-reference validation test** — import payload whose `tournamentId` mismatches or references an unknown team id fails with a clear message.

- [ ] **Step 6: Run → PASS; commit**

```bash
git add -A && git commit -m "feat(schemas): zod contracts for tournament, results and card import/export"
```

---

## Task 15: Wire quality gates & finish

- [ ] **Step 1:** Run the full local gate (mirrors CI / pre-push):

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
```

Expected: all PASS.

- [ ] **Step 2:** Update docs — add `docs/features/scoring-engine.md` (short design doc per CLAUDE.md: engine API, determinism guarantee, where used). Note in `technical-spec.md §5` that the engine is implemented.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "docs: add scoring-engine design doc"
```

- [ ] **Step 4:** Open PR `feat/foundation-engine` → `main`; ensure CI is green.

---

## Definition of Done (this plan)

- [ ] pnpm workspace builds; `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check` all green locally and in CI.
- [ ] `@cup/engine` is pure (no IO/clock/random), strict-typed with branded domain types.
- [ ] `deriveCard` + `scoreCard` implemented and covered by tests, including the §7.7 worked example and a determinism property test.
- [ ] `@cup/schemas` validates all three JSON shapes with clear errors.
- [ ] Scoring-engine design doc added; technical-spec note updated.
- [ ] Pre-commit/pre-push hooks active; PR open and CI green.

```

```
