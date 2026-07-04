# Results Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block commits that contain invalid `results.json` or `tournament.json` by adding a lint-staged validation script that runs at pre-commit time.

**Architecture:** Export the knockout schema from the shared schemas package (removing the inline copy in sync.ts), write a `validate-data.ts` CLI script that parses both JSON files and cross-checks IDs, then wire it into lint-staged so it runs whenever either data file is staged.

**Tech Stack:** TypeScript, Zod (already used in schemas package), tsx (already used for scripts), lint-staged (already configured in package.json).

## Global Constraints

- No `any`, no unsafe casts — TypeScript strict throughout
- Do not add new dependencies — tsx, Zod, and the existing `@cup/*` packages are sufficient
- `@cup/schemas` path alias resolves via `scripts/tsconfig.json` (see existing scripts for the pattern)
- Commit spec file together with implementation — do not commit separately

---

### Task 1: Export `knockoutResultsSchema` from schemas package and remove inline copy from sync.ts

**Files:**

- Modify: `packages/schemas/src/results.ts` — add `knockoutEntrySchema` and `knockoutResultsSchema`, export both
- Modify: `packages/schemas/src/index.ts` — re-export `knockoutResultsSchema`
- Modify: `scripts/sync.ts` — import from `@cup/schemas` instead of defining inline

**Interfaces:**

- Produces: `knockoutResultsSchema` — `z.ZodType` that parses `{ knockout?: KnockoutEntry[] }` (passthrough for extra top-level keys). `KnockoutEntry` shape: `{ round, matchId, home, away, homeGoals, awayGoals, winner, decidedBy?, kickoff? }`.

---

- [ ] **Step 1: Add the knockout schemas to `packages/schemas/src/results.ts`**

Insert after the existing `const decidedBySchema = ...` line (line 25):

```typescript
export const knockoutEntrySchema = z.object({
  round: z.enum(['R32', 'R16', 'QF', 'SF', 'Final', 'bronze']),
  matchId: z.string(),
  home: z.string(),
  away: z.string(),
  homeGoals: z.number().int().nonnegative(),
  awayGoals: z.number().int().nonnegative(),
  winner: z.string(),
  decidedBy: decidedBySchema.optional(),
  kickoff: z.string().datetime().optional(),
});

export const knockoutResultsSchema = z
  .object({ knockout: z.array(knockoutEntrySchema).optional() })
  .passthrough();
```

- [ ] **Step 2: Re-export from `packages/schemas/src/index.ts`**

Change the results line from:

```typescript
export { resultsSchema } from './results.js';
export type { ResultsInput } from './results.js';
```

to:

```typescript
export { resultsSchema, knockoutResultsSchema } from './results.js';
export type { ResultsInput } from './results.js';
```

- [ ] **Step 3: Update `scripts/sync.ts` — add `knockoutResultsSchema` to the import**

Change:

```typescript
import { tournamentSchema, resultsSchema } from '@cup/schemas';
```

to:

```typescript
import { tournamentSchema, resultsSchema, knockoutResultsSchema } from '@cup/schemas';
```

- [ ] **Step 4: Remove the inline `rawKnockoutResultsSchema` definition from `scripts/sync.ts`**

Delete the block at lines 50–68 (the entire `const rawKnockoutResultsSchema = z.object({ ... }).passthrough();`).

- [ ] **Step 5: Update the single usage of the old name in `scripts/sync.ts`**

Find the line:

```typescript
const rawKnockout = rawKnockoutResultsSchema.parse(resultsRaw);
```

Change to:

```typescript
const rawKnockout = knockoutResultsSchema.parse(resultsRaw);
```

- [ ] **Step 6: Typecheck to confirm no regressions**

```bash
pnpm typecheck
```

Expected: exits 0 with no errors.

- [ ] **Step 7: Run sync tests**

```bash
pnpm vitest run scripts/sync.test.ts
```

Expected: all tests pass.

---

### Task 2: Write `scripts/validate-data.ts`

**Files:**

- Create: `scripts/validate-data.ts`

**Interfaces:**

- Consumes: `tournamentSchema`, `resultsSchema`, `knockoutResultsSchema` from `@cup/schemas`
- Consumes: `Tournament`, `ActualResults` types from `@cup/engine`
- Called by lint-staged with staged file path(s) as `process.argv.slice(2)` — e.g. `data/tournaments/wc-2026/results.json`
- Exits 0 on success, 1 on any validation or cross-check failure

---

- [ ] **Step 1: Create `scripts/validate-data.ts`**

```typescript
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { ZodError } from 'zod';
import { tournamentSchema, resultsSchema, knockoutResultsSchema } from '@cup/schemas';
import type { Tournament, ActualResults } from '@cup/engine';

function formatZodError(err: ZodError): string {
  return err.errors.map((e) => `  ${e.path.join('.')} — ${e.message}`).join('\n');
}

function validateDir(dataDir: string): void {
  const tournamentRaw: unknown = JSON.parse(
    readFileSync(join(dataDir, 'tournament.json'), 'utf-8'),
  );
  const tournament: Tournament = tournamentSchema.parse(tournamentRaw);

  const resultsRaw: unknown = JSON.parse(readFileSync(join(dataDir, 'results.json'), 'utf-8'));
  const actual: ActualResults = resultsSchema.parse(resultsRaw);
  const { knockout } = knockoutResultsSchema.parse(resultsRaw);
  const knockoutMatches = knockout ?? [];

  const knownTeamIds = new Set<string>(tournament.teams.map((t) => t.id));
  const knownPlayerIds = new Set<string>(tournament.players.map((p) => p.id));
  const knownSlotMatchIds = new Set<string>(tournament.bracket.slots.map((s) => s.match));

  for (const km of knockoutMatches) {
    if (!knownSlotMatchIds.has(km.matchId)) {
      throw new Error(`knockout[${km.matchId}].matchId "${km.matchId}" not found in bracket slots`);
    }
    for (const [field, id] of [
      ['home', km.home],
      ['away', km.away],
      ['winner', km.winner],
    ] as [string, string][]) {
      if (!knownTeamIds.has(id)) {
        throw new Error(`knockout[${km.matchId}].${field} "${id}" is not a known team`);
      }
    }
  }

  for (const [grp, teamIds] of Object.entries(actual.groupOrder)) {
    for (const tid of teamIds) {
      if (!knownTeamIds.has(tid)) {
        throw new Error(`groupOrder[${grp}] has unknown team "${tid}"`);
      }
    }
  }

  const playerRefs: [string, string | undefined][] = [
    ['answers.firstRedCardPlayer', actual.answers.firstRedCardPlayer],
    ['finalMatch.decisiveGoalPlayer', actual.finalMatch?.decisiveGoalPlayer],
  ];
  for (const [field, pid] of playerRefs) {
    if (pid !== undefined && !knownPlayerIds.has(pid)) {
      throw new Error(`${field} "${pid}" is not a known player`);
    }
  }
  for (const pid of actual.answers.topScorerPlayer ?? []) {
    if (!knownPlayerIds.has(pid)) {
      throw new Error(`answers.topScorerPlayer "${pid}" is not a known player`);
    }
  }
}

const stagedFiles = process.argv.slice(2);
if (stagedFiles.length === 0) {
  console.error('Usage: tsx scripts/validate-data.ts <file> [...]');
  process.exit(1);
}

const dataDirs = [...new Set(stagedFiles.map((f) => dirname(resolve(f))))];
let hasErrors = false;

for (const dataDir of dataDirs) {
  try {
    validateDir(dataDir);
    console.log(`✓ ${dataDir} valid`);
  } catch (err) {
    if (err instanceof ZodError) {
      console.error(`✗ ${dataDir}:\n${formatZodError(err)}`);
    } else {
      console.error(`✗ ${dataDir}: ${err instanceof Error ? err.message : String(err)}`);
    }
    hasErrors = true;
  }
}

if (hasErrors) process.exit(1);
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 3: Verify success path — run against real data**

```bash
TSX_TSCONFIG_PATH=scripts/tsconfig.json tsx scripts/validate-data.ts data/tournaments/wc-2026/results.json
```

Expected output:

```
✓ <absolute-path>/data/tournaments/wc-2026 valid
```

Expected exit code: 0 (`echo $?` → `0`).

- [ ] **Step 4: Verify failure path — test with a bad enum value**

Temporarily change `"decidedBy": "extraTime"` to `"decidedBy": "extra-time"` in `data/tournaments/wc-2026/results.json` for one knockout entry, then run:

```bash
TSX_TSCONFIG_PATH=scripts/tsconfig.json tsx scripts/validate-data.ts data/tournaments/wc-2026/results.json
```

Expected: prints an error mentioning `decidedBy` or `extra-time`, exits 1 (`echo $?` → `1`).

Restore the file after verifying.

- [ ] **Step 5: Verify failure path — test with an unknown team**

Temporarily change `"winner": "ARG"` to `"winner": "XYZ"` in one knockout entry, then run the same command.

Expected: prints `knockout[...].winner "XYZ" is not a known team`, exits 1.

Restore the file.

---

### Task 3: Wire lint-staged and commit everything

**Files:**

- Modify: `package.json` — add lint-staged entry for data files
- Stage for commit: `docs/superpowers/specs/2026-07-04-results-validation-design.md`

---

- [ ] **Step 1: Add the lint-staged entry in `package.json`**

lint-staged uses `parseArgsStringToArgv` + execa (no shell). Environment variables can be set via the Unix `env` utility: `env KEY=VALUE cmd args`. lint-staged splits the string on spaces, making `env` the command and `KEY=VALUE` its first arg — which `env` interprets as a variable to export before running the rest.

In the `"lint-staged"` object, add:

```json
"data/**/{results,tournament}.json": ["env TSX_TSCONFIG_PATH=scripts/tsconfig.json tsx scripts/validate-data.ts"]
```

The full `"lint-staged"` block should look like:

```json
"lint-staged": {
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,yaml,yml}": ["prettier --write"],
  "data/**/{results,tournament}.json": ["env TSX_TSCONFIG_PATH=scripts/tsconfig.json tsx scripts/validate-data.ts"]
}
```

- [ ] **Step 2: Verify the hook fires — stage results.json and run lint-staged manually**

```bash
git add data/tournaments/wc-2026/results.json
npx lint-staged --diff="HEAD"
```

Expected: the validate-data script runs and prints `✓ ... valid`.

- [ ] **Step 3: Commit everything**

```bash
git add \
  packages/schemas/src/results.ts \
  packages/schemas/src/index.ts \
  scripts/sync.ts \
  scripts/validate-data.ts \
  package.json \
  docs/superpowers/specs/2026-07-04-results-validation-design.md
git commit -m "feat(data): validate results.json and tournament.json at pre-commit"
```
