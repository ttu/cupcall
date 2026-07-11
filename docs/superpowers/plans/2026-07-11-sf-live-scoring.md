# Live SF (Semifinalist) Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Score the "SF" bet live, per confirmed semifinalist, as QF results land — instead of waiting for the entire tournament (Final + Bronze) to finish.

**Architecture:** Redefine `scoreTopFour` from "match the exact final 1st–4th order" to "count how many of the player's 4 derived teams are confirmed semifinalists" — order-agnostic, using the existing tier point table (5/10/15/20). Add `answers.roundOf4`, auto-derived in `sync.ts` from QF match winners (same pattern as `roundOf16`/`roundOf8`). Drop the now-dead position/consolation duality (`teamRightWrongPlace`, `answers.topFourOrder`).

**Tech Stack:** TypeScript strict, Zod schemas, Drizzle/Postgres (pglite for tests), Vitest, Next.js/React.

**Design doc:** `docs/superpowers/specs/2026-07-11-sf-live-scoring-design.md` (already written; commit together with this implementation per repo convention — see Global Constraints).

## Global Constraints

- TDD: write/update the failing test before the implementation for every behavioral change (CLAUDE.md).
- TypeScript strict — no `any`, no unsafe casts; branded types (`TeamId`, `Points`, etc.) stay branded.
- **Do NOT commit after each task.** This repo requires _one commit per feature_ (CLAUDE.md: "Each feature is landed as a single, self-contained commit that includes implementation, tests, and docs"). Every task below ends with a **Verify** step (run the relevant tests), not a commit. Only the final task (Task 13) creates the single commit, which also includes the already-written design spec file.
- Run `pnpm --filter <pkg> test <file>` (or the workspace's equivalent) after each task to confirm before moving on.
- Keep changes minimal and scoped — do not rename unrelated fields, do not refactor code you don't need to touch.

---

### Task 1: Engine types — replace `topFourOrder`/`teamRightWrongPlace` with `roundOf4`

**Files:**

- Modify: `packages/engine/src/types.ts`
- Modify: `packages/engine/src/__fixtures__/mini-tournament.ts`
- Modify: `packages/db/src/testing/fixtures.ts`

**Interfaces:**

- Produces: `Scoring['topFourOrder']` no longer has `teamRightWrongPlace`. `ActualResults['answers']` has `roundOf4?: TeamId[]` instead of `topFourOrder?: TeamId[]`. All downstream tasks depend on this shape.

- [ ] **Step 1: Edit `packages/engine/src/types.ts`**

In the `Scoring` interface, remove `teamRightWrongPlace` from `topFourOrder`:

```ts
topFourOrder: {
  allCorrect: number;
  threeCorrect: number;
  twoCorrect: number;
  oneCorrect: number;
}
```

In `ActualResults['answers']`, replace the `topFourOrder` line with `roundOf4`:

```ts
  answers: {
    roundOf16?: TeamId[];
    roundOf8?: TeamId[];
    /** Teams confirmed to have won their QF match (i.e. reached the SF). Grows incrementally as
     * QF matches complete — auto-derived in scripts/sync.ts, never manually entered. */
    roundOf4?: TeamId[];
    /** One or more teams when there is a tie for the top spot. */
    groupTopScoringTeam?: TeamId[];
    ...
```

(Keep every other field in `answers` unchanged — only the `topFourOrder` line is replaced.)

- [ ] **Step 2: Edit `packages/engine/src/__fixtures__/mini-tournament.ts`**

Remove the `teamRightWrongPlace: 2,` line from `miniScoring.topFourOrder`:

```ts
  topFourOrder: {
    allCorrect: 20,
    threeCorrect: 15,
    twoCorrect: 10,
    oneCorrect: 5,
  },
```

- [ ] **Step 3: Edit `packages/db/src/testing/fixtures.ts`**

Remove the same `teamRightWrongPlace: 2,` line (around line 21) from its `topFourOrder` scoring block.

- [ ] **Step 4: Verify it compiles (expect errors — downstream files not yet updated)**

Run: `pnpm --filter @cup/engine typecheck`
Expected: FAILS — `sets-rankings.ts` and `remaining-max.ts` still reference `teamRightWrongPlace`/`topFourOrder`. That's expected; those are fixed in Tasks 2–3.

---

### Task 2: Engine scoring — rewrite `scoreTopFour`

**Files:**

- Modify: `packages/engine/src/scoring/sets-rankings.ts`
- Modify: `packages/engine/src/scoring/sets-rankings.test.ts`

**Interfaces:**

- Consumes: `Scoring`, `ActualResults`, `DerivedCard` from Task 1.
- Produces: `scoreTopFour(derived, actual, scoring): Points` — same signature, new semantics (order-agnostic set membership against `actual.answers.roundOf4`, tier lookup unchanged).

- [ ] **Step 1: Replace the `scoreTopFour` describe block in the test file**

In `packages/engine/src/scoring/sets-rankings.test.ts`, replace the `makeActual` helper (it currently takes `topFourOrder`) with one that takes `roundOf4`:

```ts
function makeActual(opts: {
  roundOf16?: TeamId[];
  roundOf8?: TeamId[];
  roundOf4?: TeamId[];
}): ActualResults {
  return {
    matchResults: [],
    groupOrder: {},
    answers: {
      ...(opts.roundOf16 !== undefined ? { roundOf16: opts.roundOf16 } : {}),
      ...(opts.roundOf8 !== undefined ? { roundOf8: opts.roundOf8 } : {}),
      ...(opts.roundOf4 !== undefined ? { roundOf4: opts.roundOf4 } : {}),
    },
  };
}
```

Replace the entire `describe('scoreTopFour', ...)` block (currently lines 196–249) with:

```ts
describe('scoreTopFour', () => {
  it('absent actual roundOf4 → 0', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const actual = makeActual({});
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(0);
  });

  it('1 of 4 predicted teams confirmed in roundOf4 → tier 5', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const actual = makeActual({ roundOf4: [ARG, BRA, teamId('X1'), teamId('X2')] });
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(5);
  });

  it('2 of 4 predicted teams confirmed → tier 10', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const actual = makeActual({ roundOf4: [ARG, FRA, teamId('X1'), teamId('X2')] });
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(10);
  });

  it('3 of 4 predicted teams confirmed → tier 15', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const actual = makeActual({ roundOf4: [ARG, FRA, NED, teamId('X1')] });
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(15);
  });

  it('all 4 predicted teams confirmed → tier 20', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const actual = makeActual({ roundOf4: [ARG, FRA, NED, POR] });
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(20);
  });

  it('order is irrelevant — set membership only', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const actual = makeActual({ roundOf4: [POR, NED, FRA, ARG] });
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(20);
  });

  it('completely wrong prediction → 0', () => {
    const derived = makeDerived([], [A1, A2, A3, A4]);
    const actual = makeActual({ roundOf4: [B1, B2, B3, B4] });
    expect(scoreTopFour(derived, actual, miniScoring)).toBe(0);
  });

  it('score never decreases as roundOf4 grows incrementally', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const afterOneQf = scoreTopFour(derived, makeActual({ roundOf4: [ARG] }), miniScoring);
    const afterTwoQf = scoreTopFour(derived, makeActual({ roundOf4: [ARG, FRA] }), miniScoring);
    expect(afterTwoQf).toBeGreaterThanOrEqual(afterOneQf);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cup/engine test sets-rankings -- -t scoreTopFour`
Expected: FAIL — `scoreTopFour` still reads `actual.answers.topFourOrder` and does position/consolation math, which no longer type-checks against the new `ActualResults` shape from Task 1 (the property doesn't exist) and doesn't match the new test expectations.

- [ ] **Step 3: Rewrite `scoreTopFour` in `packages/engine/src/scoring/sets-rankings.ts`**

Replace the entire function (it currently spans from `export function scoreTopFour` to its closing brace, roughly lines 62–88) with:

```ts
export function scoreTopFour(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  if (actual.answers.roundOf4 === undefined) {
    return points(0);
  }

  const actualSet = new Set(actual.answers.roundOf4);
  const correctCount = derived.topFour.filter((team) => actualSet.has(team)).length;

  return points(topFourTierPoints(correctCount, scoring));
}
```

Keep the existing `topFourTierPoints` helper function (lines 47–60) unchanged — it's still the correct tier lookup, just now called with a "confirmed semifinalists" count instead of a "positions correct" count.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @cup/engine test sets-rankings`
Expected: PASS — all `scoreRoundOf16`/`scoreRoundOf8`/`scoreTopFour` tests green.

- [ ] **Step 5: Verify the whole engine package still typechecks**

Run: `pnpm --filter @cup/engine typecheck`
Expected: FAILS only in `remaining-max.ts` (fixed in Task 3) — no errors in `sets-rankings.ts` or its test.

---

### Task 3: Engine remaining-max — gate `topFourMax` on QF completion

**Files:**

- Modify: `packages/engine/src/scoring/remaining-max.ts`
- Modify: `packages/engine/src/scoring/remaining-max.test.ts`

**Interfaces:**

- Consumes: `Scoring`, `Tournament['bracket']` from Task 1.
- Produces: `computeRemainingMaxPoints(...).topFour` — same signature, now zeroes once every QF match is final (was: once both Final and Bronze are final).

- [ ] **Step 1: Update the doc comment and gate in `remaining-max.ts`**

Replace the doc comment bullet (currently lines 23–24):

```ts
 *  - topFour:      resolves only once both final and bronze have been played
 *                  (the four top-4 slots come from those matches).
```

with:

```ts
 *  - topFour:      resolves once every QF match has been played (the four
 *                  semifinalists are then fully known).
```

Replace the gate (currently lines 70–72):

```ts
// Top four: resolves once final + bronze are both played (positions 1-4 are
// determined by those results).
const topFourMax = bronzePlayed && finalPlayed ? 0 : scoring.topFourOrder.allCorrect;
```

with:

```ts
// Top four (semifinalists): resolves once every QF match is played — at that point the
// four actual semifinalists are fully known, independent of Final/Bronze results.
const qfComplete = bracket.roundOf8Matches.every(isFinal);
const topFourMax = qfComplete ? 0 : scoring.topFourOrder.allCorrect;
```

- [ ] **Step 2: Update `remaining-max.test.ts` — "finish matches" describe block**

Replace the two `topFour`-related tests (currently lines 211–223, "top-four upside stays open while either finish match is pending" and "top-four upside zeroes only when both finish matches are played") with:

```ts
it('top-four upside is unaffected by bronze/final alone (needs QF, not finish matches)', () => {
  expect(computeRemainingMaxPoints(miniTournament, progress([BRONZE_KEY])).topFour).toBe(
    MAX_TOP_FOUR,
  );
  expect(computeRemainingMaxPoints(miniTournament, progress([FINAL_KEY])).topFour).toBe(
    MAX_TOP_FOUR,
  );
  expect(computeRemainingMaxPoints(miniTournament, progress([BRONZE_KEY, FINAL_KEY])).topFour).toBe(
    MAX_TOP_FOUR,
  );
});

it('top-four upside zeroes once every QF match is played', () => {
  const result = computeRemainingMaxPoints(miniTournament, progress(QF_KEYS));
  expect(result.topFour).toBe(0);
});
```

- [ ] **Step 3: Update `remaining-max.test.ts` — "stage transitions" describe block**

Replace the four tests "after QF" / "after SF" / "after bronze only" / "after final only" (currently lines 306–342) with:

```ts
it('after QF: top-four resolves; bronze, final, and specials remain', () => {
  const result = computeRemainingMaxPoints(
    miniTournament,
    progress([...ALL_GROUP_MATCH_IDS, ...QF_KEYS]),
  );
  expect(result.topFour).toBe(0);
  expect(result.total).toBe(MAX_BRONZE + MAX_FINAL + MAX_SPECIALS);
});

it('after SF: top-four already resolved (QF complete), bronze + final + specials open', () => {
  const result = computeRemainingMaxPoints(
    miniTournament,
    progress([...ALL_GROUP_MATCH_IDS, ...QF_KEYS, ...SF_KEYS]),
  );
  expect(result.topFour).toBe(0);
  expect(result.total).toBe(MAX_BRONZE + MAX_FINAL + MAX_SPECIALS);
});

it('after bronze only: bronze locked, top-four already resolved, final + specials open', () => {
  const result = computeRemainingMaxPoints(
    miniTournament,
    progress([...ALL_GROUP_MATCH_IDS, ...QF_KEYS, ...SF_KEYS, BRONZE_KEY]),
  );
  expect(result.bronze).toBe(0);
  expect(result.final).toBe(MAX_FINAL);
  expect(result.topFour).toBe(0);
  expect(result.specials).toBe(MAX_SPECIALS);
});

it('after final only (bronze still pending): final locked, top-four already resolved, bronze + specials open', () => {
  const result = computeRemainingMaxPoints(
    miniTournament,
    progress([...ALL_GROUP_MATCH_IDS, ...QF_KEYS, ...SF_KEYS, FINAL_KEY]),
  );
  expect(result.final).toBe(0);
  expect(result.bronze).toBe(MAX_BRONZE);
  expect(result.topFour).toBe(0);
  expect(result.specials).toBe(MAX_SPECIALS);
});
```

(The "opening day" and "end of group stage" tests, and the "upside monotonically decreases" test, are unaffected by this change — leave them as-is.)

- [ ] **Step 4: Update `remaining-max.test.ts` — "scoring config sensitivity" describe block**

In the "zero scoring config produces zero total" test (currently around line 394–426), remove the `teamRightWrongPlace: 0,` line from the inline `topFourOrder` object:

```ts
        topFourOrder: {
          allCorrect: 0,
          threeCorrect: 0,
          twoCorrect: 0,
          oneCorrect: 0,
        },
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @cup/engine test remaining-max`
Expected: PASS — all tests green.

- [ ] **Step 6: Verify the whole engine package typechecks and all its tests pass**

Run: `pnpm --filter @cup/engine typecheck && pnpm --filter @cup/engine test`
Expected: FAILS only in `score.test.ts` (fixed in Task 4) — no errors elsewhere in the package.

---

### Task 4: Engine — update the §7.7 worked example in `score.test.ts`

**Files:**

- Modify: `packages/engine/src/score.test.ts`

**Interfaces:**

- Consumes: `scoreCard`, `ActualResults` from Tasks 1–2.

- [ ] **Step 1: Update the comment block and `actual77` fixture**

Replace the summary comment (currently lines 107–116):

```ts
// ---- §7.7 worked example setup ----
//
// groupMatches:   correct-outcome-only(3) + exact(6)       = 9
// groupOrder:     2 positions correct                       = 3
// roundOf8:       6-of-8 correct × 3                       = 18
// topFour:        all 4 predicted semifinalists confirmed (tier 20) = 20
// final:          both teams + exact 3–2                    = 15
// bronze:         none                                      = 0
// specials:       topScorerPlayer(15) + penalties(10)       = 25
// total:                                                    = 90
```

In the `actual77` fixture, replace the `topFourOrder` line (currently line 198):

```ts
  answers: {
    roundOf8: ACTUAL_R8,
    roundOf4: [ARG, FRA, NED, POR], // all 4 of the player's predicted semifinalists confirmed → tier 20
    topScorerPlayer: [FRA9],
  },
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cup/engine test score -- -t "worked example"`
Expected: FAIL — `breakdown.topFour` is now `20` (from the new `scoreTopFour`) but the test still asserts the old values.

- [ ] **Step 3: Update the test assertions**

In `describe('scoreCard — §7.7 worked example', ...)` (currently lines 203–216), update:

```ts
describe('scoreCard — §7.7 worked example', () => {
  it('produces the correct ScoreBreakdown with total 90', () => {
    const breakdown = scoreCard(derived77, inputs77, actual77, miniScoring);

    expect(breakdown.groupMatches).toBe(9); // 3 + 6
    expect(breakdown.groupOrder).toBe(3); // 2 correct (twoCorrect)
    expect(breakdown.roundOf8).toBe(18); // 6 × 3
    expect(breakdown.topFour).toBe(20); // all 4 predicted semifinalists confirmed
    expect(breakdown.final).toBe(15); // 10 teams + 5 exact
    expect(breakdown.bronze).toBe(0); // no bronzeMatch in actual
    expect(breakdown.specials).toBe(25); // 15 + 10
    expect(breakdown.total).toBe(90);
  });
});
```

- [ ] **Step 4: Run the full engine test suite and typecheck**

Run: `pnpm --filter @cup/engine test && pnpm --filter @cup/engine typecheck`
Expected: PASS — entire `@cup/engine` package green with no type errors.

---

### Task 5: Schemas — mirror the type changes

**Files:**

- Modify: `packages/schemas/src/results.ts`
- Modify: `packages/schemas/src/tournament.ts`
- Modify: `packages/schemas/src/results.test.ts`
- Modify: `packages/schemas/src/tournament.test.ts`
- Modify: `packages/schemas/src/card-io.test.ts`

**Interfaces:**

- Consumes: `ActualResults`, `Scoring` (Task 1) — the schemas package has a compile-time drift guard against these engine types, so it will not compile until this task's schema shapes match exactly.

- [ ] **Step 1: Edit `packages/schemas/src/results.ts`**

In `answersSchema`, replace the `topFourOrder` line:

```ts
const answersSchema = z.object({
  roundOf16: z.array(teamIdSchema).optional(),
  roundOf8: z.array(teamIdSchema).optional(),
  roundOf4: z.array(teamIdSchema).optional(),
  groupTopScoringTeam: singleOrArrayTeam.optional(),
  ...
```

In the `rawResultsSchema` → `ActualResults` transform inside `resultsSchema`, replace the `topFourOrder` spread (currently the `...(v.answers.topFourOrder !== undefined && { topFourOrder: v.answers.topFourOrder }),` line):

```ts
        ...(v.answers.roundOf4 !== undefined && { roundOf4: v.answers.roundOf4 }),
```

In the `ResultsInput` type at the bottom of the file, replace the `topFourOrder?: string[];` line with `roundOf4?: string[];`.

- [ ] **Step 2: Edit `packages/schemas/src/tournament.ts`**

In `scoringSchema`, remove `teamRightWrongPlace: z.number(),` from the `topFourOrder` object:

```ts
  topFourOrder: z.object({
    allCorrect: z.number(),
    threeCorrect: z.number(),
    twoCorrect: z.number(),
    oneCorrect: z.number(),
  }),
```

- [ ] **Step 3: Update `packages/schemas/src/results.test.ts`**

Line 23 is the only reference to `topFourOrder` in this file (no separate assertion reads it back). In `validResultsJson.answers`, replace:

```ts
    topFourOrder: ['ARG', 'FRA', 'NED', 'POR'],
```

with:

```ts
    roundOf4: ['ARG', 'FRA', 'NED', 'POR'],
```

- [ ] **Step 4: Update `packages/schemas/src/tournament.test.ts`**

Line 22 is the only reference to `teamRightWrongPlace` in this file. Remove that line from the scoring fixture. Leave `expect(result.scoring.topFourOrder.allCorrect).toBe(20);` (line 91) unchanged — that assertion targets a different field, still present.

- [ ] **Step 5: Update `packages/schemas/src/card-io.test.ts`**

Remove the `teamRightWrongPlace: 2,` line from the scoring fixture (around line 24).

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter @cup/schemas test && pnpm --filter @cup/schemas typecheck`
Expected: PASS.

---

### Task 6: DB repositories — read/write `roundOf4`

**Files:**

- Modify: `packages/db/src/repositories/actual-results.ts`
- Modify: `packages/db/src/repositories/tournament.ts`

**Interfaces:**

- Consumes: `ActualResults['answers']['roundOf4']` (Task 1).
- Produces: `getActualResults(db, tournamentId)` includes `roundOf4` when present; `upsertTournamentResults(db, tournamentId, actual)` persists it under bet key `'roundOf4'`.

- [ ] **Step 1: Edit `packages/db/src/repositories/actual-results.ts`**

Replace the `topFourOrder` read (currently `const topFourOrder = getTeamIds('topFourOrder');`, around line 125):

```ts
const roundOf4 = getTeamIds('roundOf4');
```

Replace the corresponding spread in the returned object's `answers` (currently `...(topFourOrder !== undefined ? { topFourOrder } : {}),`):

```ts
      ...(roundOf4 !== undefined ? { roundOf4 } : {}),
```

- [ ] **Step 2: Edit `packages/db/src/repositories/tournament.ts`**

Replace the `topFourOrder` write block (currently lines 301–303):

```ts
if (answers.roundOf4 !== undefined) {
  answerEntries.push({ tournamentId, betKey: 'roundOf4', value: answers.roundOf4 });
}
```

- [ ] **Step 3: Run the db package tests**

Run: `pnpm --filter @cup/db test`
Expected: PASS — no existing db-package test references `topFourOrder` directly (confirmed by search), so nothing else to change here.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @cup/db typecheck`
Expected: PASS.

---

### Task 7: sync.ts — auto-derive `roundOf4` from QF winners

**Files:**

- Modify: `scripts/sync.ts`
- Modify: `scripts/sync.test.ts`

**Interfaces:**

- Consumes: `knockoutMatches` (parsed via `knockoutResultsSchema`, already in `sync.ts`), `upsertTournamentResults` (Task 6).
- Produces: after `syncTournament(db, tournamentId, dataDir)` runs, `actualAnswers` contains a `roundOf4` row once at least one QF match result exists in `results.json`.

- [ ] **Step 1: Write the failing integration test**

In `scripts/sync.test.ts`, add a new test after the existing `'derives roundOf16 from R32 winners and immediately scores predictions'` test (i.e. just before the closing `});` of the `describe('syncTournament integration', ...)` block):

```ts
it('derives roundOf4 from QF winners', async () => {
  // Regression: adding a QF result to results.json should immediately populate
  // answers.roundOf4 (the confirmed semifinalists), mirroring how roundOf16/roundOf8
  // are already derived from R32/R16 winners. Without this, the SF scoring category
  // never gets a live signal and stays at 0 until the entire tournament finishes.

  const scratch = mkdtempSync(join(tmpdir(), 'sync-qf-'));
  try {
    cpSync(testWc2026Dir, scratch, { recursive: true });

    const resultsPath = join(scratch, 'results.json');
    const results = fixtureResultsSchema.parse(JSON.parse(readFileSync(resultsPath, 'utf-8')));
    (results as Record<string, unknown>).knockout = [
      {
        round: 'QF',
        matchId: 'qf97',
        home: 'FRA',
        away: 'MAR',
        homeGoals: 2,
        awayGoals: 0,
        winner: 'FRA',
        decidedBy: 'regulation',
        kickoff: '2026-07-09T20:00:00Z',
      },
    ];
    writeFileSync(resultsPath, JSON.stringify(results, null, 2));

    await syncTournament(db, 'test-wc-2026', scratch);

    const answers = await db.select().from(schema.actualAnswers);
    const roundOf4Answer = answers.find((a) => a.betKey === 'roundOf4');
    expect(roundOf4Answer).toBeDefined();
    expect(roundOf4Answer?.value).toEqual(['FRA']);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test scripts/sync.test.ts -- -t "derives roundOf4"`
Expected: FAIL — no `roundOf4` row is ever written by `sync.ts` today.

- [ ] **Step 3: Add the derivation in `scripts/sync.ts`**

In `syncTournament`, right after the existing `r16Winners` derivation (currently):

```ts
const r32Winners = knockoutMatches.filter((m) => m.round === 'R32').map((m) => teamId(m.winner));
const r16Winners = knockoutMatches.filter((m) => m.round === 'R16').map((m) => teamId(m.winner));
```

add:

```ts
const qfWinners = knockoutMatches.filter((m) => m.round === 'QF').map((m) => teamId(m.winner));
```

Update the comment above these lines (currently "R32 winners qualify for R16 → they are the actual roundOf16 participants. / R16 winners qualify for QF → they are the actual roundOf8 participants.") to add a third line:

```ts
// 4b. Parse knockout match results and derive roundOf16/roundOf8/roundOf4 answers.
// R32 winners qualify for R16 → they are the actual roundOf16 participants.
// R16 winners qualify for QF  → they are the actual roundOf8  participants.
// QF winners qualify for SF   → they are the actual roundOf4  participants (semifinalists).
// Explicit answers in results.json take precedence over derived values.
```

Update the `mergedActual` construction (currently):

```ts
const mergedActual: ActualResults = {
  ...actual,
  groupOrder: mergedGroupOrder,
  answers: {
    ...(r32Winners.length > 0 ? { roundOf16: r32Winners } : {}),
    ...(r16Winners.length > 0 ? { roundOf8: r16Winners } : {}),
    ...actual.answers, // explicit answers in results.json override derived values
  },
};
```

to:

```ts
const mergedActual: ActualResults = {
  ...actual,
  groupOrder: mergedGroupOrder,
  answers: {
    ...(r32Winners.length > 0 ? { roundOf16: r32Winners } : {}),
    ...(r16Winners.length > 0 ? { roundOf8: r16Winners } : {}),
    ...(qfWinners.length > 0 ? { roundOf4: qfWinners } : {}),
    ...actual.answers, // explicit answers in results.json override derived values
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test scripts/sync.test.ts -- -t "derives roundOf4"`
Expected: PASS.

- [ ] **Step 5: Run the full sync test suite**

Run: `pnpm test scripts/sync.test.ts`
Expected: PASS — including the existing `roundOf16` regression test and all other sync tests.

---

### Task 8: apps/web — `get-results-view.ts` resolved-gate uses `roundOf4`

**Files:**

- Modify: `apps/web/src/features/results/application/get-results-view.ts`
- Modify: `apps/web/src/features/results/application/get-results-view.test.ts`

**Interfaces:**

- Consumes: `ActualResults['answers']['roundOf4']` (Task 1), `Tournament['bracket']['roundOf8Matches']`.
- Produces: `buildKnockoutRoundBreakdown(...)` — same signature; the `canStillGet.topFour`/`missed` calc now correctly drops to 0 once `roundOf4` is fully populated (mirrors the old `topFourOrder`-based gate), while the `earned` figure (already read from `bd?.topFour`) is live automatically once Tasks 2 and 7 land.

- [ ] **Step 1: Update the two integration tests that inject `topFourOrder` directly**

In `apps/web/src/features/results/application/get-results-view.test.ts`, there are two places (around lines 2276 and 2416) with:

```ts
        answers: {
          topFourOrder: [teamId('A1'), teamId('B1'), teamId('C1'), teamId('D1')],
        },
```

Replace **both** occurrences with:

```ts
        answers: {
          roundOf4: [teamId('A1'), teamId('B1'), teamId('C1'), teamId('D1')],
        },
```

(These are the two tests `'canStillGet drops to 0 for topFour/bronze/final when actualResults resolves them'` and `'drops canStillGet to 0 and computes missed when actualResults resolves categories'`. Their expected values are unchanged — miniTournament's `roundOf8Matches` has exactly 4 QF keys, matching this 4-team array, so the "fully resolved" gate added in Step 3 below still triggers.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test get-results-view -- -t "canStillGet drops to 0"`
Expected: FAIL — `buildKnockoutRoundBreakdown` still checks `actualResults.answers.topFourOrder`, which no longer exists on the type (and is never set by these tests anymore), so `canStillGet.topFour` stays at the full ceiling instead of dropping to 0.

- [ ] **Step 3: Update `buildKnockoutRoundBreakdown` in `get-results-view.ts`**

Replace the `canStillGet.topFour` line (currently inside the `canStillGet` object literal):

```ts
    topFour:
      actualResults.answers.topFourOrder !== undefined ? 0 : sfMaxPossible - (bd?.topFour ?? 0),
```

with:

```ts
    topFour: roundOf4FullyKnown ? 0 : sfMaxPossible - (bd?.topFour ?? 0),
```

Add the `roundOf4FullyKnown` constant just above the `canStillGet` object literal (near where `sfRemaining`/`sfMaxPossible` are computed):

```ts
// Once every QF match's winner is known, roundOf4 has as many entries as there are QF
// matches — at that point topFour is fully resolved and no further upside remains, even in
// contexts (e.g. tests, or a sync run that never wrote individual match rows) where the
// bracket-health `sfHealth` ceiling wouldn't otherwise reflect that.
const roundOf4FullyKnown =
  (actualResults.answers.roundOf4?.length ?? 0) >= def.bracket.roundOf8Matches.length;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test get-results-view -- -t "canStillGet drops to 0"`
Expected: PASS.

- [ ] **Step 5: Run the full `get-results-view` test suite**

Run: `pnpm --filter web test get-results-view`
Expected: PASS — including `'reduces SF canStillGet and shows missed when a QF pick is busted'` and `'returns all rows with earned=0...'`, which exercise the bracket-health path (`roundOf4FullyKnown` stays `false` there since no `answers.roundOf4` is set in those tests) and are unaffected by this change.

---

### Task 9: apps/web — `build-race-view.ts` avoid double-counting banked `topFour`

**Files:**

- Modify: `apps/web/src/features/results/application/build-race-view.ts`
- Modify: `apps/web/src/features/results/application/build-race-view-canstillget.test.ts`

**Interfaces:**

- Consumes: `MatchRow`, `PoolKnockoutPick`, `ActualResults` (Task 1), `topFourTierMax` (existing local helper in this file).
- Produces: `buildPerUserKnockoutCanStillGet(...)` — same signature; its `topFour` contribution now subtracts each user's already-confirmed-correct picks so it doesn't double-count against `leaderboard.pointsTotal` (which, from Task 2 onward, already includes live `topFour` points).

- [ ] **Step 1: Update the test that now double-counted**

In `apps/web/src/features/results/application/build-race-view-canstillget.test.ts`, the test `'differentiates two players: one with a viable pick, one with a busted pick'` (currently lines 249–265) currently expects:

```ts
expect(result.get('u1')).toBe(20 + 15 + 15); // 50
expect(result.get('u2')).toBe(15 + 15 + 15); // 45
```

Replace the whole test with:

```ts
it('differentiates two players: one with a viable pick, one with a busted pick', () => {
  const matches = makeQfMatchRows({ qf1Status: 'final', qf1Home: 2, qf1Away: 0 });
  const picks = [
    makePick('u1', 'qf1', 'A1'), // A1 won → u1 has a CONFIRMED-correct pick, already banked
    makePick('u2', 'qf1', 'B2'), // B2 lost → u2 is busted
  ];
  const result = buildPerUserKnockoutCanStillGet(
    picks,
    matches,
    miniTournament,
    emptyActualResults,
  );
  // u1: qf1 final, pick=A1 won → nonBustedQf=4, confirmedQf=1 (already banked via scoreTopFour)
  //   → ceiling=topFour(4)=20, banked=topFour(1)=5 → remaining upside=20-5=15
  // u2: qf1 final, pick=B2 lost → nonBustedQf=3, confirmedQf=0 → ceiling=15, banked=0 → 15
  // Both surface the same *remaining* upside — u1's already-confirmed 5 points show up in
  // their banked pointsTotal instead, not here (avoids double-counting).
  expect(result.get('u1')).toBe(15 + 15 + 15); // 45
  expect(result.get('u2')).toBe(15 + 15 + 15); // 45
});
```

- [ ] **Step 2: Update the "resolved" test to use `roundOf4`**

The test `'gives 0 topFour when topFourOrder is already resolved'` (currently lines 129–143) uses:

```ts
const resolvedActual: ActualResults = {
  ...emptyActualResults,
  answers: { topFourOrder: ['A1', 'C1', 'B1', 'D1'] as TeamId[] },
};
```

Rename the test and update the field:

```ts
it('gives 0 topFour when roundOf4 is already fully known', () => {
  const picks = [makePick('u1', 'qf1', 'A1'), makePick('u1', 'qf2', 'C1')];
  const resolvedActual: ActualResults = {
    ...emptyActualResults,
    answers: { roundOf4: ['A1', 'C1', 'B1', 'D1'] as TeamId[] },
  };
  const result = buildPerUserKnockoutCanStillGet(
    picks,
    makeQfMatchRows(),
    miniTournament,
    resolvedActual,
  );
  // No topFour (resolved), no SF picks → Final=15, Bronze=15 (no-picks not counted as busted)
  expect(result.get('u1')).toBe(0 + 15 + 15); // 30
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter web test build-race-view-canstillget`
Expected: FAIL — `buildPerUserKnockoutCanStillGet` still reads `actualResults.answers.topFourOrder` (doesn't exist on the type anymore) and still adds the full ceiling regardless of already-confirmed picks.

- [ ] **Step 4: Update `buildPerUserKnockoutCanStillGet` in `build-race-view.ts`**

Add a new helper function `isConfirmedCorrect` right after the existing `isNotBusted` function (inside the `for (const userId of ...)` loop body, same scope as `isViable`/`isNotBusted`):

```ts
// Returns true only when `matchKey`'s match is final AND the user's pick was the winner —
// i.e. this pick's points are already banked in the user's leaderboard total.
function isConfirmedCorrect(matchKey: string): boolean {
  const pickedId = picks.get(matchKey) ?? null;
  if (!pickedId) return false;
  const m = matchByKey.get(matchKey) ?? null;
  return m?.status === 'final' && resolveKnockoutWinner(m) === pickedId;
}
```

Replace the `topFourResolved` flag (currently near the top of the function body):

```ts
const finalPlayed = actualResults.finalMatch !== undefined;
const bronzePlayed = actualResults.bronzeMatch !== undefined;
const topFourResolved = actualResults.answers.topFourOrder !== undefined;
```

with:

```ts
const finalPlayed = actualResults.finalMatch !== undefined;
const bronzePlayed = actualResults.bronzeMatch !== undefined;
const topFourResolved = (actualResults.answers.roundOf4?.length ?? 0) >= qfKeys.size;
```

Replace the `TopFour` block (currently):

```ts
// TopFour: count non-busted QF picks (no-pick = not busted, consistent with
// buildKnockoutRoundBreakdown which uses totalPicks − bustedPicks).
if (!topFourResolved) {
  let nonBustedQf = qfKeys.size;
  for (const key of qfKeys) {
    const pickedId = picks.get(key) ?? null;
    if (!pickedId) continue;
    if (!isNotBusted(key)) nonBustedQf--;
  }
  canStillGet += topFourTierMax(nonBustedQf, scoring.topFourOrder);
}
```

with:

```ts
// TopFour: ceiling = tier for non-busted QF picks (no-pick = not busted, consistent with
// buildKnockoutRoundBreakdown which uses totalPicks − bustedPicks). Subtract the tier for
// already-confirmed-correct picks so this doesn't double-count points already banked in
// the user's leaderboard total via scoreTopFour.
if (!topFourResolved) {
  let nonBustedQf = qfKeys.size;
  let confirmedQf = 0;
  for (const key of qfKeys) {
    const pickedId = picks.get(key) ?? null;
    if (!pickedId) continue;
    if (!isNotBusted(key)) {
      nonBustedQf--;
    } else if (isConfirmedCorrect(key)) {
      confirmedQf++;
    }
  }
  const ceiling = topFourTierMax(nonBustedQf, scoring.topFourOrder);
  const banked = topFourTierMax(confirmedQf, scoring.topFourOrder);
  canStillGet += Math.max(0, ceiling - banked);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter web test build-race-view-canstillget`
Expected: PASS — all tests green, including the 9 other pre-existing tests in this file that don't involve a confirmed-correct pick (verified during planning to be unaffected: their `confirmedQf` is always 0 since none has both a pick and a `status: 'final'` match it won).

- [ ] **Step 6: Run the broader build-race-view test suite**

Run: `pnpm --filter web test build-race-view`
Expected: PASS.

---

### Task 10: apps/web — delete dead code, fix dev-tools checkpoint seeder

**Files:**

- Delete: `apps/web/src/features/results/application/compute-can-still-get.ts`
- Modify: `apps/web/src/features/dev-tools/api/dev-actions.ts`

**Interfaces:**

- Consumes: `ActualResults['answers']['roundOf4']` (Task 1).

- [ ] **Step 1: Delete the dead file**

`apps/web/src/features/results/application/compute-can-still-get.ts` exports `computeCanStillGet`, which is not imported anywhere in the codebase (verified via repo-wide search — only a comment in `get-results-view.ts` references it by name, explaining why it was superseded). It still reads `actualResults.answers.topFourOrder`, which no longer exists, so it would fail to typecheck. Delete the file.

Run: `rm apps/web/src/features/results/application/compute-can-still-get.ts`

- [ ] **Step 2: Update the dev-tools checkpoint seeder**

In `apps/web/src/features/dev-tools/api/dev-actions.ts`, the `'qf-done'` checkpoint (currently):

```ts
if (checkpoint === 'qf-done') {
  return {
    ...baseGroupsDone,
    answers: {
      ...baseGroupsDone.answers,
      roundOf16: r16Teams,
      roundOf8: ['GER', 'NED', 'ESP', 'BEL', 'BRA', 'ENG', 'ARG', 'POR'].map(teamId),
    },
  };
}
```

becomes:

```ts
if (checkpoint === 'qf-done') {
  return {
    ...baseGroupsDone,
    answers: {
      ...baseGroupsDone.answers,
      roundOf16: r16Teams,
      roundOf8: ['GER', 'NED', 'ESP', 'BEL', 'BRA', 'ENG', 'ARG', 'POR'].map(teamId),
      roundOf4: ['ARG', 'ESP', 'GER', 'BRA'].map(teamId),
    },
  };
}
```

In the `'finals-done'` checkpoint (the final `return` block), replace the `topFourOrder` line:

```ts
      roundOf16: r16Teams,
      roundOf8: ['GER', 'NED', 'ESP', 'BEL', 'BRA', 'ENG', 'ARG', 'POR'].map(teamId),
      roundOf4: ['ARG', 'ESP', 'GER', 'BRA'].map(teamId),
```

- [ ] **Step 3: Typecheck the web app**

Run: `pnpm --filter web typecheck`
Expected: PASS — no references to the deleted file or `topFourOrder` remain.

---

### Task 11: apps/web — UI copy for the new rule

**Files:**

- Modify: `apps/web/src/features/results/ui/ScoreBreakdownCard.tsx`
- Modify: `apps/web/src/features/pools/ui/ScoringGuide.tsx`

**Interfaces:**

- Consumes: `Scoring['topFourOrder']` (Task 1, no `teamRightWrongPlace`).

- [ ] **Step 1: Update `ScoreBreakdownCard.tsx`**

Replace the `SF` row's `hint` function (currently in the `ROWS` array):

```ts
  {
    label: 'SF',
    key: 'topFour',
    hint: (s) =>
      `4 correct semifinalists +${s.topFourOrder.allCorrect} · 3 +${s.topFourOrder.threeCorrect} · 2 +${s.topFourOrder.twoCorrect} · 1 +${s.topFourOrder.oneCorrect}`,
  },
```

- [ ] **Step 2: Update `ScoringGuide.tsx`**

Remove the now-unused `Divider` helper function entirely (it's only used by the section being replaced below):

```ts
function Divider({ label }: { label: string }): ReactElement {
  return (
    <div className="px-4 py-1.5 bg-surface-2">
      <span className="text-xs font-medium text-ink-muted uppercase tracking-wide">{label}</span>
    </div>
  );
}
```

Replace the "Top Four Ranking" section:

```tsx
{
  /* Top Four Ranking */
}
<SectionCard title="Final Four Ranking">
  <Row label="Score is the higher of position tier or team consolation." />
  <Divider label="Position tier" />
  <Row label="All 4 positions correct" pts={scoring.topFourOrder.allCorrect} indent />
  <Row label="3 positions correct" pts={scoring.topFourOrder.threeCorrect} indent />
  <Row label="2 positions correct" pts={scoring.topFourOrder.twoCorrect} indent />
  <Row label="1 position correct" pts={scoring.topFourOrder.oneCorrect} indent />
  <Divider label="Team consolation (if tier is lower)" />
  <Row
    label="Per predicted team anywhere in the actual top 4"
    pts={scoring.topFourOrder.teamRightWrongPlace}
    indent
  />
</SectionCard>;
```

with:

```tsx
{
  /* Semifinalists */
}
<SectionCard title="Semifinalists">
  <Row label="Predict the 4 teams that reach the semifinal — resolves as each QF match completes." />
  <Row label="All 4 correct" pts={scoring.topFourOrder.allCorrect} indent />
  <Row label="3 correct" pts={scoring.topFourOrder.threeCorrect} indent />
  <Row label="2 correct" pts={scoring.topFourOrder.twoCorrect} indent />
  <Row label="1 correct" pts={scoring.topFourOrder.oneCorrect} indent />
</SectionCard>;
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: PASS — no unused-symbol warnings for `Divider`, no type errors for the removed `teamRightWrongPlace` reference.

---

### Task 12: Data files, fixture cleanups, and docs

**Files:**

- Modify: `data/tournaments/mini-2026/tournament.json`
- Modify: `data/tournaments/test-wc-2026/tournament.json`
- Modify: `data/tournaments/wc-2026/tournament.json`
- Modify: `data/tournaments/test-wc-2026/results.json`
- Modify: `apps/web/src/features/pools/application/pools.test.ts`
- Modify: `apps/web/src/shared/authz/policy.test.ts`
- Modify: `docs/functional-spec.md`
- Modify: `docs/features/scoring.md`

- [ ] **Step 1: Remove `teamRightWrongPlace` from all three `tournament.json` scoring configs**

In each of `data/tournaments/mini-2026/tournament.json`, `data/tournaments/test-wc-2026/tournament.json`, and `data/tournaments/wc-2026/tournament.json`, change:

```json
    "topFourOrder": {
      "allCorrect": 20,
      "threeCorrect": 15,
      "twoCorrect": 10,
      "oneCorrect": 5,
      "teamRightWrongPlace": 2
    },
```

to:

```json
    "topFourOrder": {
      "allCorrect": 20,
      "threeCorrect": 15,
      "twoCorrect": 10,
      "oneCorrect": 5
    },
```

- [ ] **Step 2: Update `data/tournaments/test-wc-2026/results.json`**

Replace the line `"topFourOrder": ["ARG", "ESP", "GER", "BRA"],` with `"roundOf4": ["ARG", "ESP", "GER", "BRA"],` (same 4 teams — they're already a subset of that fixture's `roundOf8` list, i.e. plausible QF winners).

- [ ] **Step 3: Remove `teamRightWrongPlace` from the two remaining test fixtures**

In `apps/web/src/features/pools/application/pools.test.ts`, remove the `teamRightWrongPlace: 2,` line from the scoring fixture (around line 48).

In `apps/web/src/shared/authz/policy.test.ts`, remove the `teamRightWrongPlace: 2,` line from the scoring fixture (around line 84).

- [ ] **Step 4: Run the affected test files**

Run: `pnpm --filter web test pools.test.ts policy.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `docs/functional-spec.md` §7.4**

Replace the "Top-4 final ranking" bullet and table (currently lines 415–425):

```markdown
- **Semifinalists ("SF")** — for each team in the player's **derived** top-4 (§6.3 — the four teams
  implied by their Final/Bronze bracket picks) that has actually reached the semifinal
  (`results.answers.roundOf4`, auto-derived from QF winners as QF matches complete) → scored by
  **count of correct teams**, using the tier below. Order and eventual Final/Bronze outcome are
  irrelevant — once a team reaches the SF it counts, permanently:

  | Correct semifinalists | Points |
  | --------------------- | ------ |
  | 4 (all)               | **20** |
  | 3                     | **15** |
  | 2                     | **10** |
  | 1                     | **5**  |
  | 0                     | **0**  |

  Resolves incrementally as each QF match completes — no need to wait for the Final or Bronze match.
```

- [ ] **Step 6: Update `docs/functional-spec.md` §7.6**

Replace the incremental-scoring bullet (currently line 449):

```markdown
- Scores accrue **incrementally** as results sync in: group match/order points during the group
  stage, Round-of-8 once quarter-finalists are known, semifinalists as each QF match completes,
  bronze/final at the end, and each special bet as its answer is filled in.
```

- [ ] **Step 7: Update `docs/functional-spec.md` §7.7 worked example**

Replace the top-4 bullet (currently line 459):

```markdown
- Semifinalists: player predicted [ARG, FRA, NED, POR] to reach the SF; all four actually did
  (`results.answers.roundOf4` = [ARG, FRA, NED, POR] once all QF matches complete) → 4 correct = **20**.
```

- [ ] **Step 8: Update the glossary entry in `docs/functional-spec.md`**

Replace the "Top-4 order" glossary row (currently around line 69):

```markdown
| **Semifinalists** | The four teams that reach the SF. Derived from the player's Final/Bronze bracket picks (§6.3); scored by count of correct teams, resolved incrementally as QF matches complete (§7.4). |
```

- [ ] **Step 9: Update `docs/features/scoring.md` §2.4**

Replace the "Top-Four Order" section (currently lines 73–93):

```markdown
### 2.4 Semifinalists

`DerivedCard.topFour` = `[finalWinner, finalLoser, bronzeWinner, bronzeLoser]`, derived from the
player's final and bronze bracket picks plus the SF pairs they depend on — i.e. the four teams the
player predicts will reach the semifinal.

Scoring counts how many of those four teams are in `actualResults.answers.roundOf4` (teams
confirmed to have won their QF match), **order-agnostic**. `answers.roundOf4` is auto-derived from
QF match winners in `scripts/sync.ts` — same pattern as `roundOf16`/`roundOf8` — so this resolves
incrementally as QF matches complete, not at the end of the tournament.

| Correct semifinalists | Points (WC2026) |
| --------------------- | --------------- |
| 4                     | 20              |
| 3                     | 15              |
| 2                     | 10              |
| 1                     | 5               |
| 0                     | 0               |

**Implementation:** `scoreTopFour()` — `packages/engine/src/scoring/sets-rankings.ts`

---
```

- [ ] **Step 10: Verify docs render sanely**

Read back both edited doc files to confirm no leftover references to `teamRightWrongPlace`, `topFourOrder` (as an actual-results field — the `Scoring['topFourOrder']` _config_ name is unchanged and fine to keep), or "position tier"/"consolation" language.

Run: `grep -rn "teamRightWrongPlace\|topFourOrder.*results.answers\|answers.topFourOrder" docs/functional-spec.md docs/features/scoring.md`
Expected: no output.

---

### Task 13: Full verification and the single feature commit

**Files:** none (verification + commit only)

- [ ] **Step 1: Full repo-wide search for any remaining references**

Run: `grep -rln "teamRightWrongPlace\|topFourOrder" --include=*.ts --include=*.tsx --include=*.json --include=*.md . | grep -v node_modules | grep -v /dist/`

Expected: only matches on `Scoring['topFourOrder']` **config key** usages (e.g. `scoring.topFourOrder.allCorrect`) — no matches for `teamRightWrongPlace` or for `answers.topFourOrder` / `ActualResults['topFourOrder']`. If anything unexpected shows up, fix it before proceeding.

- [ ] **Step 2: Full typecheck, lint, and test suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS across every package (`@cup/engine`, `@cup/schemas`, `@cup/db`, `web`, `scripts`).

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 4: Stage and commit everything as one feature commit**

Run:

```bash
git add -A
git status
```

Review the output — it should include the design spec (`docs/superpowers/specs/2026-07-11-sf-live-scoring-design.md`), every file touched in Tasks 1–12, and nothing unexpected.

```bash
git commit -m "$(cat <<'EOF'
feat(scoring): score SF semifinalists live as QF results land

Replace the all-or-nothing "Top-4 final ranking" bet (which required the
entire tournament to finish before awarding any points) with a live
"Semifinalists" bet: count how many of the player's 4 derived teams are
confirmed to have reached the SF, using the same tier table (5/10/15/20),
order-agnostic. `answers.roundOf4` is now auto-derived from QF winners in
sync.ts, matching the existing roundOf16/roundOf8 pattern — no more manual
results.json entry required. Drops the now-dead position/consolation
scoring path and the unused teamRightWrongPlace config field.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Post-deploy manual step (document, do not execute here)**

Note for whoever deploys this: the sync GitHub Action only auto-triggers on
`data/tournaments/**` pushes, not code changes. After this commit is deployed,
run `pnpm sync -- wc-2026` once (locally, or via the `workflow_dispatch` trigger
on `.github/workflows/sync.yml`) to rescore all existing pool predictions under
the new rule and pick up `roundOf4` from the QF results already on file
(`qf97`, `qf98`).
