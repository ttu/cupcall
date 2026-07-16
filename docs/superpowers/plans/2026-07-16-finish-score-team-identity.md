# Final/Bronze Predicted Score — Team-Identity Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist which real team each entered Final/Bronze predicted score belongs to, and make every consumer (scoring engine, results derivation, UI) read predicted goals by team identity instead of re-deriving "who is home" from the user's current bracket picks — fixing both the knockout match-summary home/away mixup and the same-root-cause exact-score scoring bug.

**Architecture:** Add nullable `home_team_id`/`away_team_id` columns to `prediction_finish_scores`, populated at save time (and by a one-time backfill for existing rows) from the same derived-finalist pair the app already computes for the implicit-winner logic. Every downstream reader — `exactScorePoints` in the engine, `buildKnockoutMatrix`/`knockout-match-detail.ts` behind `MatchSummarySheet`, and `buildBracketRounds`/`FinalResultCard`/`KnockoutUpcomingFeed` on the main results page — gets an **additive** team-keyed lookup (`{ teamId, goals }[]`) alongside the existing positional fields, and prefers it when present. When the snapshot is absent (pre-migration rows, before backfill runs), every consumer falls back to today's exact behavior — no regression, and the entire existing test suite keeps passing unmodified.

**Tech Stack:** TypeScript strict, Drizzle ORM (Postgres), Next.js server actions, Vitest + pglite integration tests.

## Global Constraints

- TypeScript strict — no `any`, no unsafe casts (CLAUDE.md).
- Branded types for domain identifiers at the engine boundary (`TeamId` via `teamId()`) — DB-layer plain data types stay unbranded `string`, matching existing sibling types (`PoolKnockoutPick.winnerTeamId: string`).
- Mock only at system boundaries; prefer real collaborators — integration tests use the pglite harness (`makeTestDb` / `@cup/db/testing`), not mocks.
- One commit per completed task in this plan (not one commit per feature overall — this plan is one feature, but commit after each task so review checkpoints are clean). Do not run `git commit` unless explicitly instructed to in a step below — **the user has asked not to auto-commit; each task's commit step is a suggestion for a human/agent to run manually, do not execute `git commit` without the user confirming first.**
- Format + lint automatically after each step (Prettier + ESLint) — run `pnpm lint` / relevant format command if unsure.
- Run `pnpm typecheck` after any type change before moving to the next task.

---

### Task 1: DB schema + migration — `home_team_id`/`away_team_id` columns

**Files:**

- Modify: `packages/db/src/schema/predictions.ts:71-82`
- Create: `packages/db/migrations/0008_finish_score_team_ids.sql`
- Modify: `packages/db/migrations/meta/_journal.json`
- Test: `packages/db/src/schema/schema.test.ts` (extend if it asserts column presence; otherwise this task is verified transitively by Task 3's repository tests, which requires migrations to apply cleanly)

**Interfaces:**

- Produces: `predictionFinishScores.homeTeamId: text (nullable)`, `predictionFinishScores.awayTeamId: text (nullable)` — Drizzle columns available to `packages/db/src/repositories/predictions.ts` in Task 3.

- [ ] **Step 1: Add the columns to the Drizzle schema**

Edit `packages/db/src/schema/predictions.ts`, the `predictionFinishScores` table definition:

```ts
export const predictionFinishScores = pgTable(
  'prediction_finish_scores',
  {
    predictionId: text('prediction_id')
      .notNull()
      .references(() => predictions.id, { onDelete: 'cascade' }),
    match: finishMatchEnum('match').notNull(),
    homeGoals: integer('home_goals').notNull(),
    awayGoals: integer('away_goals').notNull(),
    /**
     * Snapshot of which real team each goal figure belongs to, captured at save time from the
     * user's then-current derived finalist/bronze pair. Null for rows saved before this column
     * existed, until the one-time backfill (scripts/backfill-finish-score-team-ids.ts) runs.
     */
    homeTeamId: text('home_team_id'),
    awayTeamId: text('away_team_id'),
  },
  (fs) => [primaryKey({ columns: [fs.predictionId, fs.match] })],
);
```

- [ ] **Step 2: Write the migration SQL**

Create `packages/db/migrations/0008_finish_score_team_ids.sql`:

```sql
ALTER TABLE "prediction_finish_scores" ADD COLUMN "home_team_id" text;
--> statement-breakpoint
ALTER TABLE "prediction_finish_scores" ADD COLUMN "away_team_id" text;
```

- [ ] **Step 3: Register the migration in the journal**

Edit `packages/db/migrations/meta/_journal.json` — add a new entry to the `entries` array, after the `0007_match_conduct_scores` entry:

```json
{
  "idx": 8,
  "version": "7",
  "when": 1782100000000,
  "tag": "0008_finish_score_team_ids",
  "breakpoints": true
}
```

(Keep the existing entries unchanged; this is a new array element, comma-separated after the `0007` entry.)

- [ ] **Step 4: Verify the migration applies cleanly**

Run: `pnpm -C packages/db exec vitest run src/repositories/predictions.test.ts`
Expected: PASS — the pglite test harness runs `migrate()` against `packages/db/migrations` on every test file, so if the SQL or journal entry is malformed this suite fails immediately with a migration error.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no consumers reference the new columns yet, so this only validates the schema file itself compiles).

---

### Task 2: Engine type — `FinishScore` gains optional team-id snapshot

**Files:**

- Modify: `packages/engine/src/types.ts:109-112`

**Interfaces:**

- Consumes: `TeamId` (already imported in this file via `./brand.js`).
- Produces: `FinishScore.homeTeamId?: TeamId | null`, `FinishScore.awayTeamId?: TeamId | null` — used by `packages/db/src/repositories/predictions.ts` (Task 3), `packages/engine/src/scoring/finish-matches.ts` (Task 5), and threaded into `apps/web/.../build-bracket-rounds.ts`'s `inputs.finishScores` param (Task 9).

- [ ] **Step 1: Extend the type**

Edit `packages/engine/src/types.ts`:

```ts
export interface FinishScore {
  home: number;
  away: number;
  /**
   * Snapshot of which real team each goal figure belongs to, captured at save time. Optional —
   * absent for legacy rows saved before this field existed (until backfilled) and for the
   * predict-page's own live-editing flow, which doesn't need it (see design doc, "Out of scope").
   */
  homeTeamId?: TeamId | null;
  awayTeamId?: TeamId | null;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @cup/engine typecheck`
Expected: PASS. The two optional fields don't break any existing `FinishScore` literal in the engine package (e.g. `finish-matches.test.ts`'s `makeInputs` helper), since optional fields don't require existing object literals to supply them.

---

### Task 3: DB repository — persist and read back the team-id snapshot

**Files:**

- Modify: `packages/db/src/repositories/predictions.ts:198-212` (`upsertFinishScore`), `:277-312` (`PoolFinishScore` type + `getFinishScoresByPool`), `:433-441` (`getPredictionInputs`'s finish-score assembly)
- Test: `packages/db/src/repositories/predictions.test.ts`

**Interfaces:**

- Consumes: `TeamId`, `teamId()` from `@cup/engine` (already imported in this file).
- Produces:
  - `upsertFinishScore(db, predictionId, match, homeGoals, awayGoals, homeTeamId?: string | null, awayTeamId?: string | null): Promise<void>` — new optional trailing params, backward compatible with existing call sites that omit them.
  - `PoolFinishScore` gains `homeTeamId: string | null; awayTeamId: string | null`.
  - `getFinishScoresByPool` selects and returns the two new columns.
  - `getPredictionInputs`'s `FinishScore` construction includes `homeTeamId`/`awayTeamId` (branded via `teamId()`) when the DB row has them.

- [ ] **Step 1: Write the failing repository test for `upsertFinishScore`/`getPredictionInputs` round-trip**

Add to `packages/db/src/repositories/predictions.test.ts`, inside the existing `describe('getPredictionInputs', ...)` block (after the "assembles finish scores for final and bronze" test at line ~158):

```ts
it('round-trips the home/away team-id snapshot when provided', async () => {
  const predId = await seedPrediction(db, poolId, userId1, tournamentId);
  await upsertFinishScore(db, predId, 'final', 2, 1, 'A1', 'B1');

  const inputs = await getPredictionInputs(db, predId);
  expect(inputs.finishScores.final).toEqual({
    home: 2,
    away: 1,
    homeTeamId: teamId('A1'),
    awayTeamId: teamId('B1'),
  });
});

it('leaves the team-id snapshot undefined when not provided', async () => {
  const predId = await seedPrediction(db, poolId, userId1, tournamentId);
  await upsertFinishScore(db, predId, 'final', 2, 1);

  const inputs = await getPredictionInputs(db, predId);
  expect(inputs.finishScores.final).toEqual({ home: 2, away: 1 });
});
```

Add `upsertFinishScore` to the existing import block at the top of the file if not already imported (check first — `upsertGroupScore`/`upsertKnockoutPick` are likely already imported there following the same pattern; add `upsertFinishScore` alongside them).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm -C packages/db exec vitest run src/repositories/predictions.test.ts -t "team-id snapshot"`
Expected: FAIL — `upsertFinishScore` doesn't accept a 5th/6th argument yet, and `getPredictionInputs` doesn't return `homeTeamId`/`awayTeamId`.

- [ ] **Step 3: Update `upsertFinishScore`**

Edit `packages/db/src/repositories/predictions.ts`:

```ts
/** Upserts the predicted exact score for the final or bronze match. */
export async function upsertFinishScore(
  db: Database,
  predictionId: PredictionId,
  match: 'final' | 'bronze',
  homeGoals: number,
  awayGoals: number,
  homeTeamId?: string | null,
  awayTeamId?: string | null,
): Promise<void> {
  await db
    .insert(schema.predictionFinishScores)
    .values({
      predictionId,
      match,
      homeGoals,
      awayGoals,
      homeTeamId: homeTeamId ?? null,
      awayTeamId: awayTeamId ?? null,
    })
    .onConflictDoUpdate({
      target: [schema.predictionFinishScores.predictionId, schema.predictionFinishScores.match],
      set: { homeGoals, awayGoals, homeTeamId: homeTeamId ?? null, awayTeamId: awayTeamId ?? null },
    });
}
```

- [ ] **Step 4: Update `getPredictionInputs`'s finish-score assembly**

Edit `packages/db/src/repositories/predictions.ts`, inside `getPredictionInputs`:

```ts
const finishScores: { final?: FinishScore; bronze?: FinishScore } = {};
for (const r of finishRows) {
  const score: FinishScore = {
    home: r.homeGoals,
    away: r.awayGoals,
    ...(r.homeTeamId !== null && { homeTeamId: teamId(r.homeTeamId) }),
    ...(r.awayTeamId !== null && { awayTeamId: teamId(r.awayTeamId) }),
  };
  if (r.match === 'final') {
    finishScores.final = score;
  } else {
    finishScores.bronze = score;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm -C packages/db exec vitest run src/repositories/predictions.test.ts`
Expected: PASS — all tests in the file, including the two new ones and the pre-existing "assembles finish scores for final and bronze" test (which doesn't pass team ids and must still get back a bare `{ home, away }` object with no `homeTeamId`/`awayTeamId` keys, matching `toEqual`'s exact-shape check — the `...(r.homeTeamId !== null && {...})` spread ensures the keys are omitted entirely rather than set to `undefined`).

- [ ] **Step 6: Update `PoolFinishScore` and `getFinishScoresByPool`**

Edit `packages/db/src/repositories/predictions.ts`:

```ts
export type PoolFinishScore = {
  userId: UserId;
  match: 'final' | 'bronze';
  home: number;
  away: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
};

/**
 * Returns all finish-score predictions (final and bronze) for every member of
 * a pool. Used to derive the effective pick in the knockout matrix.
 */
export async function getFinishScoresByPool(
  db: Database,
  poolId: PoolId,
): Promise<PoolFinishScore[]> {
  const rows = await db
    .select({
      userId: schema.predictions.userId,
      match: schema.predictionFinishScores.match,
      home: schema.predictionFinishScores.homeGoals,
      away: schema.predictionFinishScores.awayGoals,
      homeTeamId: schema.predictionFinishScores.homeTeamId,
      awayTeamId: schema.predictionFinishScores.awayTeamId,
    })
    .from(schema.predictions)
    .innerJoin(
      schema.predictionFinishScores,
      eq(schema.predictionFinishScores.predictionId, schema.predictions.id),
    )
    .where(eq(schema.predictions.poolId, poolId));

  return rows.map((r) => ({
    userId: userId(r.userId),
    match: r.match,
    home: r.home,
    away: r.away,
    homeTeamId: r.homeTeamId,
    awayTeamId: r.awayTeamId,
  }));
}
```

- [ ] **Step 7: Add a repository test for `getFinishScoresByPool`'s new fields**

Find the existing `describe('getFinishScoresByPool', ...)` block in `predictions.test.ts` (search for it — it exists alongside the other `getXByPool` describe blocks) and add:

```ts
it('includes the team-id snapshot when present, null when absent', async () => {
  const predId = await seedPrediction(db, poolId, userId1, tournamentId);
  await upsertFinishScore(db, predId, 'final', 2, 1, 'A1', 'B1');
  await upsertFinishScore(db, predId, 'bronze', 1, 1);

  const rows = await getFinishScoresByPool(db, poolId);
  const finalRow = rows.find((r) => r.match === 'final');
  const bronzeRow = rows.find((r) => r.match === 'bronze');
  expect(finalRow).toMatchObject({ homeTeamId: 'A1', awayTeamId: 'B1' });
  expect(bronzeRow).toMatchObject({ homeTeamId: null, awayTeamId: null });
});
```

(If no `describe('getFinishScoresByPool', ...)` block exists yet, add one at the end of the file, following the same pattern as `describe('getKnockoutPicksByPool', ...)`.)

- [ ] **Step 8: Run the full repository test suite**

Run: `pnpm -C packages/db exec vitest run src/repositories/predictions.test.ts`
Expected: PASS.

- [ ] **Step 9: Typecheck the whole workspace**

Run: `pnpm typecheck`
Expected: PASS. (Other callers of `upsertFinishScore` — `apps/web`'s actions.ts — still compile because the two new params are optional; `PoolFinishScore`'s two new required fields will surface as errors in `apps/web` test fixtures that construct `PoolFinishScore` literals directly — this is expected and fixed in Task 7's Step 0 below.)

- [ ] **Step 9b: Fix `PoolFinishScore` fixture literals broken by the new required fields**

`PoolFinishScore` is a DB-layer type (not `FinishScore`), so adding two new _required_ fields to it will break any test fixture in `apps/web` that constructs a `PoolFinishScore` object literal directly (TypeScript strict mode requires all fields). The only such fixture is `makeFinishScore` in `apps/web/src/features/results/application/build-race-view.test.ts:104-111`. Update it:

```ts
function makeFinishScore(
  uid: string,
  match: 'final' | 'bronze',
  home: number,
  away: number,
  teamIds?: { homeTeamId: string; awayTeamId: string },
): PoolFinishScore {
  return {
    userId: uid as UserId,
    match,
    home,
    away,
    homeTeamId: teamIds?.homeTeamId ?? null,
    awayTeamId: teamIds?.awayTeamId ?? null,
  };
}
```

This keeps every existing call site (`makeFinishScore('u1', 'final', 2, 1)`) compiling unchanged (the new 5th param is optional and defaults both new fields to `null`, matching today's behavior exactly) while allowing new tests in Task 7 to pass a snapshot.

Run: `pnpm typecheck`
Expected: PASS.

---

### Task 4: Write path — snapshot team ids at save time

**Files:**

- Modify: `apps/web/src/features/predictions/api/actions.ts:160-176` (`deriveFinishWinner`), `:511-540` (`saveFinishScore`), and the equivalent `ownerSaveFinishScore` block (search for `OwnerSaveFinishScoreSchema` at line ~543 onward and its handler)
- Modify: `apps/web/src/features/predictions/application/import-card.ts` (verify it calls the same `upsertFinishScore` path — see Step 4)
- Test: `apps/web/src/features/predictions/api/actions.test.ts`

**Interfaces:**

- Consumes: `deriveCard` (already imported in actions.ts), `upsertFinishScore(db, predictionId, match, home, away, homeTeamId?, awayTeamId?)` from Task 3.
- Produces: every `saveFinishScore`/`ownerSaveFinishScore`/`importCard` call now persists the team-id snapshot alongside the score.

- [ ] **Step 1: Read the current `deriveFinishWinner` and `saveFinishScore` to confirm exact structure**

Run: `sed -n '155,180p;505,545p' apps/web/src/features/predictions/api/actions.ts`
Expected output should match what's already known from `deriveFinishWinner` (packages/engine's `deriveCard` gives `derived.finalists`/`derived.bronzePair`, destructured as `[homeSide, awaySide]`) and `saveFinishScore` (calls `upsertFinishScore(db, prediction.id, match, home, away)` then `deriveFinishWinner`).

- [ ] **Step 2: Write the failing action test**

Add to `apps/web/src/features/predictions/api/actions.test.ts`, near the existing `saveFinishScore` tests (search for `describe('saveFinishScore'` or similar):

```ts
it('snapshots the home/away team-id pair alongside the score', async () => {
  // Arrange a prediction with full SF picks so derived.finalists is known, matching the
  // fixture pattern used by the existing saveFinishScore tests in this file (reuse the same
  // pool/tournament/user setup helpers already present above in this describe block).
  const predictionId = await seedFullBracketPrediction(db, poolId, userId1, tournamentId); // reuse existing helper used by sibling tests in this file — do not invent a new one if one already exists under a different name; grep this file for the helper the other saveFinishScore tests use and call that instead
  await saveFinishScore({ poolId, match: 'final', home: 2, away: 1 });

  const rows = await db
    .select()
    .from(schema.predictionFinishScores)
    .where(eq(schema.predictionFinishScores.predictionId, predictionId));
  const finalRow = rows.find((r) => r.match === 'final');
  expect(finalRow?.homeTeamId).not.toBeNull();
  expect(finalRow?.awayTeamId).not.toBeNull();
});
```

Note: the exact helper name for seeding a prediction with full SF picks must match whatever the existing `saveFinishScore` tests in this file already use (this file has existing tests for `deriveFinishWinner` behavior that require the same setup) — read the file first and reuse that helper rather than introducing a duplicate.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm -C apps/web exec vitest run src/features/predictions/api/actions.test.ts -t "snapshots the home/away team-id"`
Expected: FAIL — `finalRow.homeTeamId` is `null` today.

- [ ] **Step 4: Update `saveFinishScore` to pass the derived pair through**

Edit `apps/web/src/features/predictions/api/actions.ts`. `deriveFinishWinner` already computes `derived.finalists`/`derived.bronzePair` internally but only returns the winner — refactor it to also expose the pair, and have `saveFinishScore` use both:

```ts
async function deriveFinishPair(
  predictionId: PredictionId,
  match: 'final' | 'bronze',
  tournamentDef: Tournament,
): Promise<[TeamId, TeamId] | null> {
  const inputs = await getPredictionInputs(db, predictionId);
  const derived = deriveCard(inputs, tournamentDef);
  const pair = match === 'final' ? derived.finalists : derived.bronzePair;
  if (pair.length < 2) return null;
  return pair as [TeamId, TeamId];
}

async function deriveFinishWinner(
  predictionId: PredictionId,
  match: 'final' | 'bronze',
  home: number,
  away: number,
  tournamentDef: Tournament,
): Promise<TeamId | undefined> {
  if (home === away) return undefined;
  const pair = await deriveFinishPair(predictionId, match, tournamentDef);
  if (pair === null) return undefined;
  const [homeSide, awaySide] = pair;
  return home > away ? homeSide : awaySide;
}
```

Then in `saveFinishScore`'s handler (the `async ({ tournamentDef, prediction }) => { ... }` callback around line 524):

```ts
    async ({ tournamentDef, prediction }) => {
      const pair = await deriveFinishPair(prediction.id, match, tournamentDef);
      await upsertFinishScore(
        db,
        prediction.id,
        match,
        home,
        away,
        pair?.[0] ?? null,
        pair?.[1] ?? null,
      );
      const implicitWinner = await deriveFinishWinner(
        prediction.id,
        match,
        home,
        away,
        tournamentDef,
      );
      if (implicitWinner !== undefined) {
        const bracketKey =
          match === 'final' ? tournamentDef.bracket.finalMatch : tournamentDef.bracket.bronzeMatch;
        await upsertKnockoutPick(db, prediction.id, bracketKey, implicitWinner);
      }
      return {};
    },
```

This computes the derived pair once via `deriveFinishPair` and reuses it for both the snapshot and (inside `deriveFinishWinner`, which now also calls `deriveFinishPair`) the winner derivation — two `getPredictionInputs`/`deriveCard` calls per save, same as today's behavior had one call for the winner derivation alone (no new query, `getPredictionInputs` was already being called by the old `deriveFinishWinner`; this makes it two calls instead of one, an acceptable small overhead for a low-frequency user action — not worth caching for this scope).

- [ ] **Step 5: Apply the same change to `ownerSaveFinishScore`**

Find the `ownerSaveFinishScore` handler (search `apps/web/src/features/predictions/api/actions.ts` for `OwnerSaveFinishScoreSchema` at line ~543 and read its handler body, which will mirror `saveFinishScore`'s structure with an added audit-log call). Apply the identical `deriveFinishPair` + `upsertFinishScore(..., pair?.[0] ?? null, pair?.[1] ?? null)` change there.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm -C apps/web exec vitest run src/features/predictions/api/actions.test.ts`
Expected: PASS — the whole file, including all pre-existing `saveFinishScore`/`ownerSaveFinishScore` tests (unaffected — they only assert `homeGoals`/`awayGoals`/the derived winner pick, none of which changed).

- [ ] **Step 7: Verify `importCard` goes through the same path**

Run: `grep -n "finishScore\|upsertFinishScore" apps/web/src/features/predictions/application/import-card.ts`

If `import-card.ts` calls `upsertFinishScore` directly (bypassing `saveFinishScore`'s action wrapper), apply the same `deriveFinishPair`-and-pass-through change there. If it delegates to the same internal helper `saveFinishScore` calls, no further change is needed — confirm by reading the file's finish-score handling block before deciding which case applies.

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

---

### Task 5: Engine scoring fix — `exactScorePoints` reads by team identity

**Files:**

- Modify: `packages/engine/src/scoring/finish-matches.ts:12-24`
- Modify (fix pre-existing incorrect expectations): `packages/engine/src/scoring/finish-matches.test.ts:87-95` (final "sides swapped" test), `:193-201` (bronze "sides swapped" test)
- Test: `packages/engine/src/scoring/finish-matches.test.ts` (new cases)

**Interfaces:**

- Consumes: `FinishScore.homeTeamId`/`awayTeamId` (Task 2), `ActualFinishMatch.home`/`away: TeamId` (existing).
- Produces: `exactScorePoints` now correct regardless of positional orientation when a snapshot is present; unchanged (today's positional comparison) when absent.

- [ ] **Step 1: Fix the two existing tests that currently encode the bug**

These two tests currently assert "no exact points" for a scenario that, by team identity, IS an exact match (same two teams, same two goal counts, just labelled `home`/`away` differently between predicted and actual) — that's the exact bug being fixed. Update them in `packages/engine/src/scoring/finish-matches.test.ts`.

Replace the test at line 87-95 (`'predicted 3-2, actual 2-3 (sides swapped) → no exact points'`):

```ts
it('predicted A1=3/A2=2 with team-id snapshot, actual reports the same score with sides swapped → exact points awarded', () => {
  // The user predicted A1 beats A2 3-2 (home=A1, away=A2, per the snapshot). The real match
  // assigns A2 as home and A1 as away, but the goals are identical per-team (A2 scored 2,
  // A1 scored 3) — this IS an exact-score match by team identity, even though the raw
  // home/away numbers are swapped relative to the actual match's own home/away assignment.
  const derived = makeDerived([A1, A2], [B1, B2]);
  const inputs = makeInputs({ home: 3, away: 2, homeTeamId: A1, awayTeamId: A2 });
  const actual = makeActual({
    finalMatch: { home: A2, away: A1, homeGoals: 2, awayGoals: 3, winner: A1 },
  });
  expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(15); // 10 teams + 5 exact
});

it('predicted 3-2 without a team-id snapshot, actual 2-3 (sides swapped) → falls back to positional comparison, no exact points', () => {
  // Legacy/unbackfilled row: no snapshot present, so the fallback positional comparison
  // applies — this preserves today's (imprecise but previously-shipped) behavior.
  const derived = makeDerived([A1, A2], [B1, B2]);
  const inputs = makeInputs({ home: 3, away: 2 }); // no homeTeamId/awayTeamId
  const actual = makeActual({
    finalMatch: { home: A2, away: A1, homeGoals: 2, awayGoals: 3, winner: A1 },
  });
  expect(scoreFinal(inputs, derived, actual, miniScoring)).toBe(10); // 10 teams + 0 exact
});
```

Replace the test at line 193-201 (`'predicted 3-0, actual 0-3 (sides swapped) → no exact points for bronze'`):

```ts
it('predicted B1=3/B2=0 with team-id snapshot, actual reports the same score with sides swapped → exact points awarded for bronze', () => {
  const derived = makeDerived([A1, A2], [B1, B2]);
  const inputs = makeInputs(undefined, { home: 3, away: 0, homeTeamId: B1, awayTeamId: B2 });
  const actual = makeActual({
    bronzeMatch: { home: B2, away: B1, homeGoals: 0, awayGoals: 3, winner: B1 },
  });
  expect(scoreBronze(inputs, derived, actual, miniScoring)).toBe(15); // 10 teams + 5 exact
});

it('predicted 3-0 without a team-id snapshot, actual 0-3 (sides swapped) → falls back to positional comparison, no exact points', () => {
  const derived = makeDerived([A1, A2], [B1, B2]);
  const inputs = makeInputs(undefined, { home: 3, away: 0 }); // no team-id snapshot
  const actual = makeActual({
    bronzeMatch: { home: B2, away: B1, homeGoals: 0, awayGoals: 3, winner: B1 },
  });
  expect(scoreBronze(inputs, derived, actual, miniScoring)).toBe(10); // 10 teams + 0 exact
});
```

- [ ] **Step 2: Update the `makeInputs` test helper to accept an optional team-id snapshot**

Edit `packages/engine/src/scoring/finish-matches.test.ts`'s `makeInputs` (line 26-39):

```ts
function makeInputs(
  finalScore?: { home: number; away: number; homeTeamId?: TeamId; awayTeamId?: TeamId },
  bronzeScore?: { home: number; away: number; homeTeamId?: TeamId; awayTeamId?: TeamId },
): CardInputs {
  return {
    groupScores: [],
    knockoutPicks: [],
    finishScores: {
      ...(finalScore !== undefined ? { final: finalScore } : {}),
      ...(bronzeScore !== undefined ? { bronze: bronzeScore } : {}),
    },
    specials: {},
  };
}
```

- [ ] **Step 3: Run the tests to verify the (now-corrected) expectations fail against the current implementation**

Run: `pnpm --filter @cup/engine exec vitest run src/scoring/finish-matches.test.ts`
Expected: The two new "with team-id snapshot" tests FAIL (current `exactScorePoints` has no team-identity path yet, so it awards 10, not 15, for both). The two "without a team-id snapshot" tests already PASS (unchanged behavior). The rest of the suite still passes.

- [ ] **Step 4: Implement the team-identity-aware `exactScorePoints`**

Edit `packages/engine/src/scoring/finish-matches.ts`:

```ts
/** Award exactScore iff finishScore is present AND home/away goals match the actual match exactly. */
function exactScorePoints(
  finishScore: FinishScore | undefined,
  actualMatch: ActualFinishMatch | undefined,
  exactScore: number,
): number {
  if (finishScore === undefined || actualMatch === undefined) {
    return 0;
  }

  if (finishScore.homeTeamId != null && finishScore.awayTeamId != null) {
    const predictedByTeam = new Map<TeamId, number>([
      [finishScore.homeTeamId, finishScore.home],
      [finishScore.awayTeamId, finishScore.away],
    ]);
    return predictedByTeam.get(actualMatch.home) === actualMatch.homeGoals &&
      predictedByTeam.get(actualMatch.away) === actualMatch.awayGoals
      ? exactScore
      : 0;
  }

  // Fallback for rows without a team-id snapshot (pre-migration, not yet backfilled).
  return finishScore.home === actualMatch.homeGoals && finishScore.away === actualMatch.awayGoals
    ? exactScore
    : 0;
}
```

- [ ] **Step 5: Run the full engine test suite**

Run: `pnpm --filter @cup/engine exec vitest run`
Expected: PASS — every test in the package, including all of `finish-matches.test.ts` and `score.test.ts` (which exercises `scoreFinal`/`scoreBronze` end-to-end and does not set a team-id snapshot, so it stays on the fallback path, unaffected).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @cup/engine typecheck`
Expected: PASS.

---

### Task 6: One-time backfill script for existing rows

**Files:**

- Create: `scripts/backfill-finish-score-team-ids.ts`
- Create: `scripts/backfill-finish-score-team-ids.test.ts`
- Modify: `packages/db/src/repositories/predictions.ts` (two new small query functions)
- Modify: `package.json:18-25` (new `backfill-finish-score-team-ids` script entry)

**Interfaces:**

- Consumes: `deriveCard` (`@cup/engine`), `getPredictionInputs`, `createDb`, `getTournamentById` (all `@cup/db`).
- Produces: `backfillFinishScoreTeamIds(db, tournamentId): Promise<{ updated: number; skipped: number }>` — exported for the test; CLI entry point mirrors `scripts/sync.ts`'s `isDirectlyExecuted` pattern.

- [ ] **Step 1: Add the two repository query functions**

Edit `packages/db/src/repositories/predictions.ts`. Add `isNull` to the `drizzle-orm` import at the top (`import { and, eq, inArray, isNull } from 'drizzle-orm';`), then add these two functions near `getFinishScoresByPool`:

```ts
export type FinishScoreMissingTeamIds = {
  predictionId: PredictionId;
  match: 'final' | 'bronze';
};

/**
 * Finds every final/bronze finish-score row for a tournament that has no team-id snapshot yet
 * (saved before that column existed). Used by the one-time backfill script.
 */
export async function getFinishScoresMissingTeamIds(
  db: Database,
  tid: TournamentId,
): Promise<FinishScoreMissingTeamIds[]> {
  const rows = await db
    .select({
      predictionId: schema.predictionFinishScores.predictionId,
      match: schema.predictionFinishScores.match,
    })
    .from(schema.predictionFinishScores)
    .innerJoin(
      schema.predictions,
      eq(schema.predictions.id, schema.predictionFinishScores.predictionId),
    )
    .where(
      and(
        eq(schema.predictions.tournamentId, tid),
        isNull(schema.predictionFinishScores.homeTeamId),
      ),
    );

  return rows.map((r) => ({ predictionId: asPredictionId(r.predictionId), match: r.match }));
}

/** Sets the team-id snapshot on an existing finish-score row (does not touch the goal counts). */
export async function setFinishScoreTeamIds(
  db: Database,
  predictionId: PredictionId,
  match: 'final' | 'bronze',
  homeTeamId: string,
  awayTeamId: string,
): Promise<void> {
  await db
    .update(schema.predictionFinishScores)
    .set({ homeTeamId, awayTeamId })
    .where(
      and(
        eq(schema.predictionFinishScores.predictionId, predictionId),
        eq(schema.predictionFinishScores.match, match),
      ),
    );
}
```

Add `getFinishScoresMissingTeamIds` and `setFinishScoreTeamIds` to `packages/db/src/index.ts`'s repository re-exports (find where `getFinishScoresByPool` is re-exported and add the two new names alongside it).

- [ ] **Step 2: Write the failing backfill script test**

Create `scripts/backfill-finish-score-team-ids.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import type { Db } from '@cup/db';
import * as schema from '@cup/db/schema';
import {
  createUser,
  createPool,
  getOrCreatePrediction,
  upsertKnockoutPick,
  upsertFinishScore,
  upsertTournamentDef,
} from '@cup/db';
import { tournamentId as asTournamentId, bracketMatchKey, userId as asUserId } from '@cup/engine';
import { miniTournament } from '@cup/engine/testing';
import { eq } from 'drizzle-orm';
import { backfillFinishScoreTeamIds } from './backfill-finish-score-team-ids';

describe('backfillFinishScoreTeamIds', () => {
  let db: Db<typeof schema>;
  const tid = asTournamentId('mini-2026');

  beforeEach(async () => {
    db = await makeTestDb();
    await upsertTournamentDef(db, miniTournament, new Date('2026-06-01T00:00:00Z'), new Map());
  });

  it('fills in the team-id snapshot for a final finish-score row missing it', async () => {
    const user = await createUser(db, { email: 'u1@x.com', displayName: 'Alice' });
    const pool = await createPool(db, {
      ownerId: user.id,
      tournamentId: tid,
      name: 'Pool',
      inviteTokenHash: 'h1',
    });
    const prediction = await getOrCreatePrediction(db, {
      poolId: pool.id,
      userId: user.id,
      tournamentId: tid,
    });
    // Full bracket picks so derived.finalists resolves to a concrete pair — mirrors the
    // fixture pattern used by build-bracket-rounds.test.ts's fullBracketPicks.
    await upsertKnockoutPick(db, prediction.id, bracketMatchKey('qf1'), 'A1');
    await upsertKnockoutPick(db, prediction.id, bracketMatchKey('qf2'), 'B1');
    await upsertKnockoutPick(db, prediction.id, bracketMatchKey('qf3'), 'C1');
    await upsertKnockoutPick(db, prediction.id, bracketMatchKey('qf4'), 'D1');
    await upsertKnockoutPick(db, prediction.id, bracketMatchKey('sf1'), 'A1');
    await upsertKnockoutPick(db, prediction.id, bracketMatchKey('sf2'), 'C1');
    await upsertFinishScore(db, prediction.id, 'final', 2, 1); // no snapshot yet

    const result = await backfillFinishScoreTeamIds(db, tid);
    expect(result.updated).toBe(1);

    const [row] = await db
      .select()
      .from(schema.predictionFinishScores)
      .where(eq(schema.predictionFinishScores.predictionId, prediction.id));
    expect(row?.homeTeamId).toBe('A1');
    expect(row?.awayTeamId).toBe('C1');
  });

  it('is idempotent — does not touch rows that already have a snapshot', async () => {
    const user = await createUser(db, { email: 'u2@x.com', displayName: 'Bob' });
    const pool = await createPool(db, {
      ownerId: user.id,
      tournamentId: tid,
      name: 'Pool',
      inviteTokenHash: 'h2',
    });
    const prediction = await getOrCreatePrediction(db, {
      poolId: pool.id,
      userId: user.id,
      tournamentId: tid,
    });
    await upsertFinishScore(db, prediction.id, 'final', 2, 1, 'X1', 'X2');

    const result = await backfillFinishScoreTeamIds(db, tid);
    expect(result.updated).toBe(0);

    const [row] = await db
      .select()
      .from(schema.predictionFinishScores)
      .where(eq(schema.predictionFinishScores.predictionId, prediction.id));
    expect(row?.homeTeamId).toBe('X1'); // unchanged
  });

  it('skips rows where the finalist pair cannot be derived (incomplete picks)', async () => {
    const user = await createUser(db, { email: 'u3@x.com', displayName: 'Cara' });
    const pool = await createPool(db, {
      ownerId: user.id,
      tournamentId: tid,
      name: 'Pool',
      inviteTokenHash: 'h3',
    });
    const prediction = await getOrCreatePrediction(db, {
      poolId: pool.id,
      userId: user.id,
      tournamentId: tid,
    });
    await upsertFinishScore(db, prediction.id, 'final', 2, 1); // no SF picks at all

    const result = await backfillFinishScoreTeamIds(db, tid);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
```

(Check the exact signatures of `createUser`/`createPool`/`upsertTournamentDef` against their current definitions in `packages/db/src/repositories/*.ts` before running — copy the parameter shape used by an existing integration test such as `packages/db/src/repositories/predictions.test.ts`'s top-of-file setup rather than assuming the above is letter-perfect.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run scripts/backfill-finish-score-team-ids.test.ts`
Expected: FAIL — `./backfill-finish-score-team-ids` doesn't exist yet.

- [ ] **Step 4: Implement the backfill script**

Create `scripts/backfill-finish-score-team-ids.ts`:

```ts
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
import { deriveCard, tournamentId as asTournamentId } from '@cup/engine';
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
    const [homeTeamId, awayTeamId] = pair as [string, string];
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
```

- [ ] **Step 5: Add the `getFinishScoresMissingTeamIds`/`setFinishScoreTeamIds` re-exports**

Confirm Step 1 of this task already added these to `packages/db/src/index.ts` — if not done yet, do it now (grep the file for `getFinishScoresByPool` to find the export block and add the two new names there).

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm exec vitest run scripts/backfill-finish-score-team-ids.test.ts`
Expected: PASS.

- [ ] **Step 7: Register the CLI script in `package.json`**

Edit `package.json`, add alongside the existing `"sync"` entry:

```json
    "backfill-finish-score-team-ids": "TSX_TSCONFIG_PATH=scripts/tsconfig.json tsx scripts/backfill-finish-score-team-ids.ts",
```

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

---

### Task 7: Results — `buildKnockoutMatrix` team-anchored predicted score (fixes the reported summary-sheet bug)

**Files:**

- Modify: `apps/web/src/features/results/domain/types.ts:265-277` (`KnockoutMatrixCell`)
- Modify: `apps/web/src/features/results/application/build-race-view.ts:661-797` (`buildKnockoutMatrix`)
- Modify: `apps/web/src/features/results/domain/knockout-match-detail.test.ts:53-65` (`cell()` fixture helper — new required field)
- Test: `apps/web/src/features/results/application/build-race-view.test.ts` (new cases)

**Interfaces:**

- Consumes: `PoolFinishScore.homeTeamId`/`awayTeamId` (Task 3).
- Produces: `KnockoutMatrixCell.predictedScoreByTeam: { teamId: string; goals: number }[] | null` — new additive field, non-null only for Final/Bronze cells when the finish score has a team-id snapshot. `predictedHome`/`predictedAway` (existing fields) are **unchanged** — still populated exactly as today, for backward compatibility with rows lacking a snapshot. `isExactScore` and `pickedWinnerId` now prefer the snapshot when present.

- [ ] **Step 1: Add the new field to the type**

Edit `apps/web/src/features/results/domain/types.ts`:

```ts
export type KnockoutMatrixCell = {
  bracketMatchKey: string;
  hit: KnockoutMatchHit;
  points: number;
  pickedWinnerId: string | null;
  /** Final/Bronze only: the other finalist/bronze participant from this user's own SF/QF pick chain. Null for other rounds or when the chain is incomplete. */
  pickedOpponentId: string | null;
  /** Final/Bronze only: the user's predicted scoreline for this tie. Null everywhere else. */
  predictedHome: number | null;
  predictedAway: number | null;
  /**
   * Final/Bronze only, and only when the finish score has a team-id snapshot (see migration
   * 0008): the predicted goals for each of the two predicted teams, keyed by team identity
   * instead of home/away position. Prefer this over predictedHome/predictedAway when non-null —
   * it's immune to home/away orientation mismatches between the user's own predicted pair and
   * the real match's home/away assignment. Null when no finish score exists, or the score
   * predates the team-id snapshot.
   */
  predictedScoreByTeam: { teamId: string; goals: number }[] | null;
  /** Final/Bronze only: true when predictedHome/Away matched the actual score exactly. */
  isExactScore: boolean;
};
```

- [ ] **Step 2: Update the `cell()` fixture helper in `knockout-match-detail.test.ts`**

Edit `apps/web/src/features/results/domain/knockout-match-detail.test.ts`'s `cell()` helper (line 53-65) to add the new required field:

```ts
function cell(overrides: Partial<KnockoutMatrixCell> = {}): KnockoutMatrixCell {
  return {
    bracketMatchKey: 'qf1',
    hit: 'no-pick',
    points: 0,
    pickedWinnerId: null,
    pickedOpponentId: null,
    predictedHome: null,
    predictedAway: null,
    predictedScoreByTeam: null,
    isExactScore: false,
    ...overrides,
  };
}
```

- [ ] **Step 3: Write the failing tests for the new field and the orientation-swap fix**

Add to `apps/web/src/features/results/application/build-race-view.test.ts`, inside `describe('predicted score fields on cell (final/bronze only)', ...)` (after the existing tests in that block, before its closing `});`):

```ts
it('populates predictedScoreByTeam when the finish score has a team-id snapshot', () => {
  const alice = makeLeaderboardEntry('u1', 'Alice');
  const finalMatch = makeKnockoutMatch('final', 'Final', 'final', {
    homeTeamId: 'USA',
    awayTeamId: 'BRA',
    actualWinnerId: 'USA',
    actualHome: 2,
    actualAway: 1,
  });

  const { knockoutMatrix } = buildKnockoutMatrix({
    leaderboard: [alice],
    userId: null,
    bracketRounds: [makeRound('Final', [finalMatch])],
    bronzeMatch: null,
    poolKnockoutPicks: [],
    poolFinishScores: [
      makeFinishScore('u1', 'final', 2, 1, { homeTeamId: 'USA', awayTeamId: 'BRA' }),
    ],
    def: miniTournament,
  });

  const cell = knockoutMatrix[0]!.cells[0]!;
  expect(cell.predictedScoreByTeam).toEqual(
    expect.arrayContaining([
      { teamId: 'USA', goals: 2 },
      { teamId: 'BRA', goals: 1 },
    ]),
  );
});

it('leaves predictedScoreByTeam null when the finish score has no team-id snapshot', () => {
  const alice = makeLeaderboardEntry('u1', 'Alice');
  const finalMatch = makeKnockoutMatch('final', 'Final', 'final', {
    homeTeamId: 'USA',
    awayTeamId: 'BRA',
    actualWinnerId: 'USA',
    actualHome: 2,
    actualAway: 1,
  });

  const { knockoutMatrix } = buildKnockoutMatrix({
    leaderboard: [alice],
    userId: null,
    bracketRounds: [makeRound('Final', [finalMatch])],
    bronzeMatch: null,
    poolKnockoutPicks: [],
    poolFinishScores: [makeFinishScore('u1', 'final', 2, 1)], // no snapshot
    def: miniTournament,
  });

  const cell = knockoutMatrix[0]!.cells[0]!;
  expect(cell.predictedScoreByTeam).toBeNull();
  // predictedHome/predictedAway (legacy fields) stay populated as before.
  expect(cell.predictedHome).toBe(2);
  expect(cell.predictedAway).toBe(1);
});

it('regression: isExactScore is true via team identity even when the real match home/away is swapped relative to the predicted pair', () => {
  // This is the bug from the bug report: user correctly predicted USA beating BRA 2-1.
  // The predicted pair was captured as home=USA/away=BRA. The REAL match happens to have
  // BRA as home and USA as away (an unrelated real-world draw outcome) — same two teams,
  // same two actual goal counts, just a different real home/away assignment. The predicted
  // score is still exactly correct by team identity and must be marked isExactScore.
  const alice = makeLeaderboardEntry('u1', 'Alice');
  const finalMatch = makeKnockoutMatch('final', 'Final', 'final', {
    homeTeamId: 'BRA',
    awayTeamId: 'USA',
    actualWinnerId: 'USA',
    actualHome: 1, // BRA (real home) scored 1
    actualAway: 2, // USA (real away) scored 2
  });

  const { knockoutMatrix } = buildKnockoutMatrix({
    leaderboard: [alice],
    userId: null,
    bracketRounds: [makeRound('Final', [finalMatch])],
    bronzeMatch: null,
    poolKnockoutPicks: [],
    poolFinishScores: [
      // User's own predicted pair: home=USA/away=BRA (their own SF-derived orientation)
      makeFinishScore('u1', 'final', 2, 1, { homeTeamId: 'USA', awayTeamId: 'BRA' }),
    ],
    def: miniTournament,
  });

  const cell = knockoutMatrix[0]!.cells[0]!;
  expect(cell.isExactScore).toBe(true);
  expect(cell.pickedWinnerId).toBe('USA');
});
```

- [ ] **Step 4: Run the tests to verify the new ones fail and all existing ones still pass**

Run: `pnpm -C apps/web exec vitest run src/features/results/application/build-race-view.test.ts src/features/results/domain/knockout-match-detail.test.ts`
Expected: The three new tests FAIL (no `predictedScoreByTeam` computed yet, `isExactScore` still uses raw positional comparison). Every pre-existing test in both files PASSES unchanged.

- [ ] **Step 5: Implement the fix in `buildKnockoutMatrix`**

Edit `apps/web/src/features/results/application/build-race-view.ts`. Replace the `isFinalOrBronze` block (currently lines 681-710) with:

```ts
if (isFinalOrBronze) {
  const matchType = m.bracketMatchKey === finalMatchKey ? 'final' : 'bronze';
  const fs = finishScoreMap.get(e.userId)?.get(matchType);
  if (fs !== undefined) {
    predictedHome = fs.home;
    predictedAway = fs.away;
    isExactScore =
      m.actualHome !== null &&
      m.actualAway !== null &&
      fs.home === m.actualHome &&
      fs.away === m.actualAway;
  }

  if (fs?.homeTeamId != null && fs.awayTeamId != null) {
    // Team-identity path: the finish score has a snapshot of which real team each goal
    // figure belongs to, captured at save time. Prefer this over the positional
    // fallback below — it's correct regardless of how the real match's home/away
    // assignment relates to the user's own predicted orientation.
    predictedScoreByTeam = [
      { teamId: fs.homeTeamId, goals: fs.home },
      { teamId: fs.awayTeamId, goals: fs.away },
    ];
    const predictedByTeam = new Map(predictedScoreByTeam.map((s) => [s.teamId, s.goals]));
    if (fs.home !== fs.away) {
      pickedWinnerId = fs.home > fs.away ? fs.homeTeamId : fs.awayTeamId;
    } else {
      pickedWinnerId = knockoutPick;
    }
    if (
      m.actualHome !== null &&
      m.actualAway !== null &&
      m.homeTeamId !== null &&
      m.awayTeamId !== null
    ) {
      isExactScore =
        predictedByTeam.get(m.homeTeamId) === m.actualHome &&
        predictedByTeam.get(m.awayTeamId) === m.actualAway;
    }
  } else if (fs !== undefined && fs.home !== fs.away) {
    // Fallback for finish scores without a team-id snapshot (pre-migration, not yet
    // backfilled) — unchanged from today's behavior.
    pickedWinnerId = deriveImplicitFinaleWinner(
      m.bracketMatchKey,
      def.bracket,
      userPickMap,
      fs.home,
      fs.away,
    );
    if (pickedWinnerId === null) {
      pickedWinnerId = deriveEffectivePick(fs, m.homeTeamId, m.awayTeamId, knockoutPick);
    }
  } else {
    pickedWinnerId = deriveEffectivePick(fs, m.homeTeamId, m.awayTeamId, knockoutPick);
  }
}
```

Add `let predictedScoreByTeam: { teamId: string; goals: number }[] | null = null;` alongside the existing `let predictedHome`/`predictedAway`/`isExactScore` declarations just above this block (in the `cells: KnockoutMatrixCell[] = sortedMatches.map((m) => { ... })` callback).

Then add `predictedScoreByTeam` to each of the three `return { ... }` object literals inside this same `.map()` callback (the not-final, hit, and miss/no-pick branches) — each one already lists `predictedHome, predictedAway, isExactScore,`; add `predictedScoreByTeam,` alongside them in all three places.

Also update `finishScoreMap`'s type (currently `Map<string, Map<'final' | 'bronze', { home: number; away: number }>>`, built a few lines above from `poolFinishScores`) to carry the new fields:

```ts
const finishScoreMap = new Map<
  string,
  Map<
    'final' | 'bronze',
    { home: number; away: number; homeTeamId: string | null; awayTeamId: string | null }
  >
>();
for (const fs of poolFinishScores) {
  if (!finishScoreMap.has(fs.userId)) finishScoreMap.set(fs.userId, new Map());
  finishScoreMap.get(fs.userId)!.set(fs.match, {
    home: fs.home,
    away: fs.away,
    homeTeamId: fs.homeTeamId,
    awayTeamId: fs.awayTeamId,
  });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm -C apps/web exec vitest run src/features/results/application/build-race-view.test.ts src/features/results/domain/knockout-match-detail.test.ts`
Expected: PASS — all three new tests, and every pre-existing test in both files (none of which set a team-id snapshot, so they all stay on the unchanged fallback path).

- [ ] **Step 7: Typecheck**

Run: `pnpm -C apps/web exec tsc --noEmit -p tsconfig.json`
Expected: PASS.

---

### Task 8: Results — `knockout-match-detail.ts` consumes the team-anchored score (the actual `MatchSummarySheet` fix)

**Files:**

- Modify: `apps/web/src/features/results/domain/knockout-match-detail.ts:44-67`
- Test: `apps/web/src/features/results/domain/knockout-match-detail.test.ts`

**Interfaces:**

- Consumes: `KnockoutMatrixCell.predictedScoreByTeam` (Task 7).
- Produces: `KnockoutMatchDetailPrediction.predictedHome`/`predictedAway` (unchanged field names/types — still "picked team's goals" / "picked opponent's goals" from the sheet's point of view, per the design doc) now resolved via team identity when possible.

- [ ] **Step 1: Write the failing regression test — the exact reported bug scenario**

Add to `apps/web/src/features/results/domain/knockout-match-detail.test.ts`, a new `describe` block after the existing ones:

```ts
describe('buildKnockoutMatchDetail — predicted score resolved by team identity', () => {
  it('regression: shows the correct per-team score even when the picked team is on the "away" side of the snapshot', () => {
    // Bug report scenario: TNH81 correctly predicted ENG beating ESP 2-1, but the summary
    // showed "ENG vs ESP 1:2" — the numbers were swapped because they were displayed
    // positionally instead of being resolved by team identity.
    const m = match({
      bracketMatchKey: 'final',
      homeTeamId: 'ESP',
      homeTeamName: 'Spain',
      awayTeamId: 'ENG',
      awayTeamName: 'England',
      actualHome: 1,
      actualAway: 2,
      actualWinnerId: 'ENG',
      status: 'final',
    });
    const entries = [
      entry({
        userId: 'tnh81',
        displayName: 'TNH81',
        cells: [
          cell({
            bracketMatchKey: 'final',
            pickedWinnerId: 'ENG',
            pickedOpponentId: 'ESP',
            hit: 'hit',
            // Snapshot: the user predicted their own home=ENG/away=ESP pair (an orientation
            // that happens to be flipped relative to the real match's home=ESP/away=ENG).
            predictedScoreByTeam: [
              { teamId: 'ENG', goals: 2 },
              { teamId: 'ESP', goals: 1 },
            ],
            isExactScore: true,
          }),
        ],
      }),
    ];

    const detail = buildKnockoutMatchDetail(m, entries);
    const prediction = detail.predictions.find((p) => p.userId === 'tnh81')!;

    expect(prediction.pickedTeamId).toBe('ENG');
    expect(prediction.pickedOpponentId).toBe('ESP');
    expect(prediction.predictedHome).toBe(2); // ENG's (the picked team's) goals
    expect(prediction.predictedAway).toBe(1); // ESP's (the opponent's) goals
  });

  it('falls back to the raw predictedHome/predictedAway when no team-id snapshot exists', () => {
    const m = match({
      bracketMatchKey: 'final',
      homeTeamId: 'ESP',
      awayTeamId: 'ENG',
      status: 'scheduled',
    });
    const entries = [
      entry({
        userId: 'u1',
        cells: [
          cell({
            bracketMatchKey: 'final',
            pickedWinnerId: 'ENG',
            pickedOpponentId: 'ESP',
            predictedHome: 2,
            predictedAway: 1,
            predictedScoreByTeam: null,
          }),
        ],
      }),
    ];

    const detail = buildKnockoutMatchDetail(m, entries);
    const prediction = detail.predictions[0]!;
    expect(prediction.predictedHome).toBe(2);
    expect(prediction.predictedAway).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify the first one fails**

Run: `pnpm -C apps/web exec vitest run src/features/results/domain/knockout-match-detail.test.ts`
Expected: The regression test FAILS (currently `predictedHome`/`predictedAway` come straight from `c?.predictedHome`/`c?.predictedAway`, which are unset/`null` in this fixture since only `predictedScoreByTeam` was provided). The fallback test PASSES already (matches today's behavior).

- [ ] **Step 3: Implement the fix**

Edit `apps/web/src/features/results/domain/knockout-match-detail.ts`, the `predictions` mapping inside `buildKnockoutMatchDetail`:

```ts
const predictions: KnockoutMatchDetailPrediction[] = knockoutMatrix.map((row) => {
  const c = row.cells.find((cell) => cell.bracketMatchKey === match.bracketMatchKey);
  const pickedTeamId = c?.pickedWinnerId ?? null;
  const pickedOpponentId = c?.pickedOpponentId ?? null;

  let predictedHome = c?.predictedHome ?? null;
  let predictedAway = c?.predictedAway ?? null;
  if (c?.predictedScoreByTeam != null && pickedTeamId !== null) {
    const goalsByTeam = new Map(c.predictedScoreByTeam.map((s) => [s.teamId, s.goals]));
    const pickedGoals = goalsByTeam.get(pickedTeamId);
    const opponentGoals = pickedOpponentId !== null ? goalsByTeam.get(pickedOpponentId) : undefined;
    if (pickedGoals !== undefined && opponentGoals !== undefined) {
      predictedHome = pickedGoals;
      predictedAway = opponentGoals;
    }
  }

  return {
    userId: row.userId,
    displayName: row.displayName,
    isCurrentUser: row.isCurrentUser,
    pickedTeamId,
    pickedTeamName: pickedTeamId !== null ? resolveTeamName(match, pickedTeamId) : null,
    pickedOpponentId,
    pickedOpponentName: pickedOpponentId !== null ? resolveTeamName(match, pickedOpponentId) : null,
    predictedHome,
    predictedAway,
    hit: c?.hit ?? 'no-pick',
    isExactScore: c?.isExactScore ?? false,
    points: c?.points ?? 0,
  };
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm -C apps/web exec vitest run src/features/results/domain/knockout-match-detail.test.ts`
Expected: PASS — both new tests and every pre-existing test in the file.

- [ ] **Step 5: Typecheck**

Run: `pnpm -C apps/web exec tsc --noEmit -p tsconfig.json`
Expected: PASS.

---

### Task 9: Results — `build-bracket-rounds.ts` additive team-keyed lookup + `computeKnockoutHit` fix

**Files:**

- Modify: `apps/web/src/features/results/domain/types.ts` (`KnockoutMatchView`)
- Modify: `apps/web/src/features/results/application/build-bracket-rounds.ts:30-36` (inputs type), `:145-155` (predicted-score block), `:190-199` (`computeKnockoutHit` call), `:263-341` (return object), `:402-442` (`computeKnockoutHit` definition)
- Modify (new required field in fixture helpers): `apps/web/src/features/results/application/build-race-view.test.ts` (`makeKnockoutMatch`), `apps/web/src/features/results/domain/knockout-match-detail.test.ts` (`match()`), `apps/web/src/features/results/domain/bracket-health.test.ts` (`match()`), `apps/web/src/features/results/domain/knockout-mobile-view.test.ts` (`match()`), `apps/web/src/features/results/ui/bracket-health-panel-utils.test.ts` (`mkMatch()`)
- Test: `apps/web/src/features/results/application/build-bracket-rounds.test.ts` (new cases)

**Interfaces:**

- Consumes: `CardInputs['finishScores']`'s new optional `homeTeamId`/`awayTeamId` (Task 2), threaded through the `inputs` param.
- Produces: `KnockoutMatchView.predictedGoalsByTeam: { teamId: string; goals: number }[] | null` — new additive field. `computeKnockoutHit`'s exact-score check now uses team identity when the snapshot is available, falling back to the existing positional check otherwise. **Note:** unlike Task 7's `KnockoutMatrixCell`, this file's existing `predictedHome`/`predictedAway`/`predictedHomeTeamId`/`pickedHomeTeamId` fields and their extensive existing test coverage (the "Contract: predictedHomeTeamId / predictedAwayTeamId must preserve home/away slot order" test at `build-bracket-rounds.test.ts:746`, and the "Germany 3rd place bug" regression test at line 780) are left completely untouched — this task is purely additive.

- [ ] **Step 1: Add the new field to `KnockoutMatchView`**

Edit `apps/web/src/features/results/domain/types.ts`, inside the `KnockoutMatchView` type (after the existing `predictedHome`/`predictedAway` fields, around line 128-131):

```ts
/** User's predicted score — only populated for Final and Bronze ties. */
predictedHome: number | null;
/** User's predicted score — only populated for Final and Bronze ties. */
predictedAway: number | null;
/**
 * Final/Bronze only, and only when the finish score has a team-id snapshot: the predicted
 * goals for each of the two predicted teams, keyed by team identity. Prefer this over
 * predictedHome/predictedAway + a positionally-assumed team pairing — it's immune to
 * mismatches between whichever team ends up on which visual side. Null when no finish score
 * exists, or the score predates the team-id snapshot.
 */
predictedGoalsByTeam: {
  teamId: string;
  goals: number;
}
[] | null;
```

- [ ] **Step 2: Update the five fixture helpers that construct `KnockoutMatchView` literals**

Add `predictedGoalsByTeam: null,` to each of these five helper functions' returned object literal (each already has a `predictedHome: null, predictedAway: null,` pair — add the new field directly after it):

- `apps/web/src/features/results/application/build-race-view.test.ts` — `makeKnockoutMatch` (line ~64-65)
- `apps/web/src/features/results/domain/knockout-match-detail.test.ts` — `match` (line ~25-26)
- `apps/web/src/features/results/domain/bracket-health.test.ts` — `match` (line ~72)
- `apps/web/src/features/results/domain/knockout-mobile-view.test.ts` — `match` (line ~29)
- `apps/web/src/features/results/ui/bracket-health-panel-utils.test.ts` — `mkMatch` (line ~25)

- [ ] **Step 3: Run the full results-feature test suite to confirm it still compiles and passes before making functional changes**

Run: `pnpm -C apps/web exec vitest run src/features/results`
Expected: PASS (the new field is optional-by-null-default in every fixture, so no existing assertion is affected yet).

- [ ] **Step 4: Write the failing tests**

Add to `apps/web/src/features/results/application/build-bracket-rounds.test.ts`, a new `describe` block at the end of the file:

```ts
describe('buildBracketRounds — predictedGoalsByTeam and team-identity exact-hit detection', () => {
  it('populates predictedGoalsByTeam for the Final when the finish score has a team-id snapshot', () => {
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [],
      {
        knockoutPicks: fullBracketPicks,
        finishScores: { final: { home: 2, away: 1, homeTeamId: 'A1', awayTeamId: 'B1' } },
      },
      [],
      [],
    );
    const finalCard = bracketRounds.find((r) => r.label === 'Final')!.matches[0]!;
    expect(finalCard.predictedGoalsByTeam).toEqual(
      expect.arrayContaining([
        { teamId: 'A1', goals: 2 },
        { teamId: 'B1', goals: 1 },
      ]),
    );
  });

  it('leaves predictedGoalsByTeam null when the finish score has no team-id snapshot', () => {
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [],
      { knockoutPicks: fullBracketPicks, finishScores: { final: { home: 2, away: 1 } } },
      [],
      [],
    );
    const finalCard = bracketRounds.find((r) => r.label === 'Final')!.matches[0]!;
    expect(finalCard.predictedGoalsByTeam).toBeNull();
  });

  it('regression: hit is "exact" via team identity even when the real match home/away is swapped relative to the snapshot', () => {
    // Real Final: BRA (home) 1 - 2 (away) ARG. User's own predicted pair (snapshot) has
    // ARG=home/BRA=away with score 2-1 — same teams, same per-team goals, different real
    // home/away assignment. Must still register as an exact hit.
    const finalPlayed = makeMatch(miniTournament.bracket.finalMatch as string, 'Final', {
      homeTeamId: 'BRA',
      awayTeamId: 'ARG',
      homeGoals: 1,
      awayGoals: 2,
      winnerTeamId: 'ARG',
      status: 'final',
    });
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [finalPlayed],
      {
        knockoutPicks: fullBracketPicks,
        finishScores: { final: { home: 2, away: 1, homeTeamId: 'ARG', awayTeamId: 'BRA' } },
      },
      [],
      [],
    );
    const finalCard = bracketRounds.find((r) => r.label === 'Final')!.matches[0]!;
    expect(finalCard.hit).toBe('exact');
  });
});
```

(`fullBracketPicks` and `makeMatch` are existing helpers already used earlier in this test file — reuse them as-is; check their exact team-id values in the miniTournament fixture — e.g. via the "sets predictedHomeTeamId=sf1-winner..." test already in this file at line 746 — before assuming `A1`/`B1`/`ARG`/`BRA` are the right ids for the Final; substitute the real fixture team ids used by `fullBracketPicks` if different.)

- [ ] **Step 5: Run the tests to verify they fail as expected**

Run: `pnpm -C apps/web exec vitest run src/features/results/application/build-bracket-rounds.test.ts`
Expected: The three new tests FAIL. All pre-existing tests in the file still PASS.

- [ ] **Step 6: Thread the team-id snapshot through the `inputs` param type**

Edit `apps/web/src/features/results/application/build-bracket-rounds.ts`, the `inputs` param type (line 30-36):

```ts
  inputs: {
    knockoutPicks: { bracketMatchKey: string; winner: string }[];
    finishScores: {
      final?: { home: number; away: number; homeTeamId?: string | null; awayTeamId?: string | null };
      bronze?: { home: number; away: number; homeTeamId?: string | null; awayTeamId?: string | null };
    };
  } | null,
```

- [ ] **Step 7: Compute `predictedGoalsByTeam` and fix `computeKnockoutHit`'s exact check**

Edit `apps/web/src/features/results/application/build-bracket-rounds.ts`, the predicted-score block inside `buildMatchView` (line 145-155):

```ts
// Predicted score: only Final and Bronze have a finish score.
let predictedHome: number | null = null;
let predictedAway: number | null = null;
let predictedGoalsByTeam: { teamId: string; goals: number }[] | null = null;
const isFinale = key === finalMatchKey || key === bronzeMatchKey;
const finishScoreForKey =
  key === finalMatchKey
    ? finishScores.final
    : key === bronzeMatchKey
      ? finishScores.bronze
      : undefined;
if (finishScoreForKey) {
  predictedHome = finishScoreForKey.home;
  predictedAway = finishScoreForKey.away;
  if (finishScoreForKey.homeTeamId != null && finishScoreForKey.awayTeamId != null) {
    predictedGoalsByTeam = [
      { teamId: finishScoreForKey.homeTeamId, goals: finishScoreForKey.home },
      { teamId: finishScoreForKey.awayTeamId, goals: finishScoreForKey.away },
    ];
  }
}
```

Then update the `computeKnockoutHit` call (line 191-199) to pass the new data plus the real match's team ids:

```ts
const stagePicks = actual?.stage ? (stagePicksMap.get(actual.stage) ?? null) : null;
const hit = computeKnockoutHit({
  pickedWinnerId: effectivePickedId,
  actualWinnerId: winnerId,
  stagePicks,
  predictedHome,
  predictedAway,
  predictedGoalsByTeam,
  actualHome: actual?.homeGoals ?? null,
  actualAway: actual?.awayGoals ?? null,
  actualHomeTeamId: actual?.homeTeamId ?? null,
  actualAwayTeamId: actual?.awayTeamId ?? null,
});
```

And update `computeKnockoutHit`'s definition (line 402-442):

```ts
function computeKnockoutHit(args: {
  pickedWinnerId: string | null;
  actualWinnerId: string | null;
  /** All teams the user picked to advance in this stage — show "correct" when the actual winner is in this set. */
  stagePicks: Set<string> | null;
  predictedHome: number | null;
  predictedAway: number | null;
  predictedGoalsByTeam: { teamId: string; goals: number }[] | null;
  actualHome: number | null;
  actualAway: number | null;
  actualHomeTeamId: string | null;
  actualAwayTeamId: string | null;
}): MatchHit {
  const {
    pickedWinnerId,
    actualWinnerId,
    stagePicks,
    predictedHome,
    predictedAway,
    predictedGoalsByTeam,
    actualHome,
    actualAway,
    actualHomeTeamId,
    actualAwayTeamId,
  } = args;

  if (actualWinnerId === null) return 'pending';

  // Exact requires both predicted and actual scores; only Final/Bronze populate predicted.
  // Prefer team-identity comparison when a snapshot is available — it's correct regardless of
  // how the real match's home/away assignment relates to the user's own predicted orientation.
  if (actualHome !== null && actualAway !== null) {
    if (predictedGoalsByTeam !== null && actualHomeTeamId !== null && actualAwayTeamId !== null) {
      const goalsByTeam = new Map(predictedGoalsByTeam.map((s) => [s.teamId, s.goals]));
      if (
        goalsByTeam.get(actualHomeTeamId) === actualHome &&
        goalsByTeam.get(actualAwayTeamId) === actualAway
      ) {
        return 'exact';
      }
    } else if (
      predictedHome !== null &&
      predictedAway !== null &&
      predictedHome === actualHome &&
      predictedAway === actualAway
    ) {
      return 'exact';
    }
  }

  // Credit the pick on the card where the predicted team actually played and won,
  // regardless of which slot the user assigned them to.
  if (stagePicks?.has(actualWinnerId) ?? pickedWinnerId === actualWinnerId) {
    return 'outcome';
  }
  return 'missed';
}
```

Finally, add `predictedGoalsByTeam,` to the `buildMatchView` return object (line 263-341, alongside the existing `predictedHome, predictedAway,` at line 287-288).

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm -C apps/web exec vitest run src/features/results/application/build-bracket-rounds.test.ts`
Expected: PASS — the three new tests, plus every pre-existing test in the file, including the "Contract" test at line 746 and the "Germany 3rd place bug" regression at line 780 (both untouched by this change — they don't pass a team-id snapshot, so `predictedGoalsByTeam` stays `null` for them and `computeKnockoutHit` uses the same positional path as before).

- [ ] **Step 9: Thread the snapshot through `get-results-view.ts`'s call site**

Run: `grep -n "buildBracketRounds(" apps/web/src/features/results/application/get-results-view.ts`

Confirm the call passes `inputs` (the `CardInputs | null` from `getPredictionInputs`, Task 3) straight through without reconstructing the `finishScores` object manually. If it does pass `inputs` directly (expected, per the earlier read of this file), no further change is needed here — `inputs.finishScores.final`/`.bronze` now already carry `homeTeamId`/`awayTeamId` as `TeamId | undefined` (branded), which is structurally assignable to the `string | null | undefined`-typed param in `buildBracketRounds` (TypeScript widens the branded `TeamId` to its underlying `string` for structural compatibility — verify with `pnpm -C apps/web exec tsc --noEmit -p tsconfig.json` in the next step; if it errors, adjust `buildBracketRounds`'s inputs type to accept `TeamId | string | null | undefined` for these two fields instead of introducing a manual cast).

- [ ] **Step 10: Full typecheck**

Run: `pnpm typecheck`
Expected: PASS.

---

### Task 10: UI — `FinalResultCard.tsx` resolves `PickPill` goals by team identity

**Files:**

- Modify: `apps/web/src/features/results/ui/FinalResultCard.tsx:125-233`

**Interfaces:**

- Consumes: `KnockoutMatchView.predictedGoalsByTeam` (Task 9).

- [ ] **Step 1: Update `PickPill` and its call site**

Edit `apps/web/src/features/results/ui/FinalResultCard.tsx`. Change `PickPill`'s props from required numbers to nullable, and resolve them via the team-keyed lookup when available:

```tsx
function PickPill({
  leftId,
  rightId,
  leftGoals,
  rightGoals,
  hit,
}: {
  leftId: string | null;
  rightId: string | null;
  leftGoals: number | null;
  rightGoals: number | null;
  hit: MatchHit;
}): ReactElement {
  return (
    <div
      data-testid="final-card-pick-pill"
      className={cn(
        'relative flex items-center gap-1.5 mt-2.5 p-[8px_14px] rounded-full border bg-surface w-fit mx-auto',
        borderClassForPickHit(hit),
      )}
    >
      <span className="text-[11px] font-bold text-ink-muted">Your pick:</span>
      {leftId !== null && <TeamBadge teamId={leftId} size="sm" />}
      <span className="tnum text-[12px] font-extrabold text-ink">
        {leftGoals}–{rightGoals}
      </span>
      {rightId !== null && <TeamBadge teamId={rightId} size="sm" />}
      <PickBadge hit={hit} />
    </div>
  );
}
```

Then in `FinalResultCard`, after `pickRowLeftId`/`pickRowRightId` are computed (existing lines 174-190), add the team-keyed resolution and update the render call:

```tsx
// Resolve each side's predicted goals by team identity when a snapshot is available — this
// is correct regardless of which fallback branch produced pickRowLeftId/pickRowRightId above.
// Falls back to the legacy positional fields (predictedHome/predictedAway), which assume
// leftId===home-slot-team, when no snapshot exists (pre-migration/unbackfilled rows).
const goalsByTeam =
  match.predictedGoalsByTeam !== null
    ? new Map(match.predictedGoalsByTeam.map((s) => [s.teamId, s.goals]))
    : null;
const pickLeftGoals =
  goalsByTeam !== null && pickRowLeftId !== null
    ? (goalsByTeam.get(pickRowLeftId) ?? null)
    : match.predictedHome;
const pickRightGoals =
  goalsByTeam !== null && pickRowRightId !== null
    ? (goalsByTeam.get(pickRowRightId) ?? null)
    : match.predictedAway;
```

And change the render guard + call (existing lines 225-233):

```tsx
{
  pickLeftGoals !== null && pickRightGoals !== null && (
    <PickPill
      leftId={pickRowLeftId}
      rightId={pickRowRightId}
      leftGoals={pickLeftGoals}
      rightGoals={pickRightGoals}
      hit={match.hit}
    />
  );
}
```

- [ ] **Step 2: Check for an existing `FinalResultCard` component test**

Run: `find apps/web/src/features/results/ui -iname "FinalResultCard.test.tsx"`

If it exists, read it and run it now:

Run: `pnpm -C apps/web exec vitest run src/features/results/ui/FinalResultCard.test.tsx`
Expected: PASS (this task doesn't change the pill's rendered structure or `data-testid`s, only how the two numbers are computed — every existing fixture that sets `match.predictedHome`/`predictedAway` without a `predictedGoalsByTeam` snapshot falls back to the exact same values as before).

If no such test file exists, skip this step — this component is exercised indirectly via `get-results-view.test.ts`/E2E, and adding a new component test is out of scope for this bite-sized task (would require setting up a full render harness not otherwise touched by this plan).

- [ ] **Step 3: Typecheck**

Run: `pnpm -C apps/web exec tsc --noEmit -p tsconfig.json`
Expected: PASS.

---

### Task 11: UI — `KnockoutUpcomingFeed.tsx` resolves the pick label by team identity

**Files:**

- Modify: `apps/web/src/features/results/ui/KnockoutUpcomingFeed.tsx:36-49`

**Interfaces:**

- Consumes: `KnockoutMatchView.predictedGoalsByTeam` (Task 9).

- [ ] **Step 1: Update `KnockoutUpcomingRow`'s pick label**

Edit `apps/web/src/features/results/ui/KnockoutUpcomingFeed.tsx`:

```tsx
function KnockoutUpcomingRow({ match }: { match: KnockoutMatchView }): ReactElement {
  const homeId = match.homeTeamId ?? match.predictedHomeTeamId;
  const homeName = match.homeTeamName ?? match.predictedHomeTeamName ?? 'TBD';
  const awayId = match.awayTeamId ?? match.predictedAwayTeamId;
  const awayName = match.awayTeamName ?? match.predictedAwayTeamName ?? 'TBD';

  const hasPool = match.poolPickHomePct !== null && match.poolPickAwayPct !== null;

  // For Final/Bronze, predictedHome/Away are set — show score alongside pick. Resolve by team
  // identity when a snapshot is available so "you → WINNER · X–Y" always pairs X with the
  // winner's own goals, regardless of home/away orientation.
  const goalsByTeam =
    match.predictedGoalsByTeam !== null
      ? new Map(match.predictedGoalsByTeam.map((s) => [s.teamId, s.goals]))
      : null;
  const winnerGoals =
    goalsByTeam !== null && match.pickedWinnerId !== null
      ? (goalsByTeam.get(match.pickedWinnerId) ?? null)
      : match.predictedHome;
  const opponentGoals =
    goalsByTeam !== null && match.pickedOpponentId !== null
      ? (goalsByTeam.get(match.pickedOpponentId) ?? null)
      : match.predictedAway;
  const pickLabel =
    match.pickedWinnerName !== null
      ? winnerGoals !== null
        ? `you → ${match.pickedWinnerName} · ${winnerGoals}–${opponentGoals}`
        : `you → ${match.pickedWinnerName}`
      : null;
```

- [ ] **Step 2: Check for an existing `KnockoutUpcomingFeed` component test**

Run: `find apps/web/src/features/results/ui -iname "KnockoutUpcomingFeed.test.tsx"`

If it exists, run it: `pnpm -C apps/web exec vitest run src/features/results/ui/KnockoutUpcomingFeed.test.tsx`
Expected: PASS (fixtures without `predictedGoalsByTeam` fall back to the exact same `match.predictedHome`/`predictedAway` values as before).

If no such file exists, skip — same reasoning as Task 10 Step 2.

- [ ] **Step 3: Typecheck**

Run: `pnpm -C apps/web exec tsc --noEmit -p tsconfig.json`
Expected: PASS.

---

### Task 12: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck`
Expected: PASS across every workspace package.

- [ ] **Step 2: Full lint**

Run: `pnpm lint`
Expected: PASS. Fix any lint errors surfaced by the new code before proceeding.

- [ ] **Step 3: Full unit + integration test suite**

Run: `pnpm test` (or the repo's equivalent root test script — check `package.json`'s `"scripts"` block for the exact name if `pnpm test` isn't defined)
Expected: PASS — every package and app, including `@cup/engine`, `@cup/db`, `apps/web`, and `scripts/`.

- [ ] **Step 4: Manual smoke check against the mini-2026 fixture**

Run: `pnpm sync -- mini-2026` (requires `DATABASE_URL` pointed at a local dev DB — skip this step with a note if no local DB is available in this environment) followed by starting the dev server and visiting a pool's results page to confirm the Final/Bronze match summary sheet renders correctly for at least one seeded prediction with a saved finish score. If no local DB/dev server is available in this environment, state that explicitly rather than claiming this step passed.

- [ ] **Step 5: Report back**

Summarize: all tasks complete, full verification green (or list any exceptions from Step 4), and note that `pnpm backfill-finish-score-team-ids -- wc-2026` still needs to be run against the real production database before or alongside deploying this change — that is a deliberate, user-approved production action or explicitly ask for it, per this repo's rules on real/production-affecting operations.
