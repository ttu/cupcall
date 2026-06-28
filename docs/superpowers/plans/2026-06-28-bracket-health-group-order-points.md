# Bracket Health — Group Order Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the user's total earned group-order points as a sub-line under the R32 row in the Bracket Health panel, updated progressively as groups finalise.

**Architecture:** Add `groupOrderPoints: number | null` to the `BracketHealth` domain type. Populate it from `userBreakdown.groupOrder` in `get-results-view.ts`. Render it as a small annotation under the R32 `RoundHealthRow` in `BracketHealthPanel.tsx`. No changes to `BracketRoundHealth`, `buildBracketHealth`, or `buildR32QualHealth`.

**Tech Stack:** TypeScript strict, React, Tailwind CSS, Vitest integration tests (PGlite in-memory DB).

## Global Constraints

- No `any`, no unsafe casts — TypeScript strict throughout.
- `groupOrderPoints: null` in viewer mode (no authenticated user), `0` is valid when user has no points yet.
- Only show the sub-line when `groupOrderPoints > 0` (hide at 0 and null).
- Follow existing Tailwind class patterns in `BracketHealthPanel.tsx` (`text-[11px] font-semibold text-green-700`).
- One commit for the entire feature (code + tests + spec doc).

---

### Task 1: Add `groupOrderPoints` to `BracketHealth` and wire it up

**Files:**

- Modify: `apps/web/src/features/results/domain/types.ts` — add field to `BracketHealth`
- Modify: `apps/web/src/features/results/application/get-results-view.ts` — populate the field
- Modify: `apps/web/src/features/results/application/get-results-view.test.ts` — assert the field

**Interfaces:**

- Produces: `BracketHealth.groupOrderPoints: number | null` consumed by Task 2

- [ ] **Step 1: Write the failing test**

Open `apps/web/src/features/results/application/get-results-view.test.ts` and add this test after the existing `'computes bracketHealth counts correctly'` test (around line 562):

```ts
it('bracketHealth.groupOrderPoints reflects earned group-order points', async () => {
  const pred = await getOrCreatePrediction(db, { poolId, userId, tournamentId: miniTId });

  // Finalize all group A matches with A1 winning all → A1=9pts, A2=6pts, A3=3pts, A4=0pts
  for (const mid of ['mA1', 'mA2', 'mA3', 'mA4', 'mA5', 'mA6']) {
    await finalizeMatch(db, miniTId, mid, 1, 0);
  }

  // User predicts the correct order for group A: A1, A2, A3, A4
  await upsertGroupScore(db, pred.id, 'mA1', 1, 0); // A1 beats A2
  await upsertGroupScore(db, pred.id, 'mA2', 1, 0); // A1 beats A3
  await upsertGroupScore(db, pred.id, 'mA3', 1, 0); // A1 beats A4
  await upsertGroupScore(db, pred.id, 'mA4', 1, 0); // A2 beats A3
  await upsertGroupScore(db, pred.id, 'mA5', 1, 0); // A2 beats A4
  await upsertGroupScore(db, pred.id, 'mA6', 1, 0); // A3 beats A4

  const view = await getResultsView({ db, poolId, userId, now: NOW });
  // allCorrect for group A = 6 pts; groups B/C/D not finalized → 0
  expect(view!.bracketHealth.groupOrderPoints).toBe(miniTournament.scoring.groupOrder.allCorrect);
});

it('bracketHealth.groupOrderPoints is null in viewer mode', async () => {
  const view = await getResultsView({ db, poolId, now: NOW }); // no userId
  expect(view!.bracketHealth.groupOrderPoints).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /workspaces/football-cup-prediction
pnpm --filter @cup/web test run apps/web/src/features/results/application/get-results-view.test.ts 2>&1 | grep -A3 "groupOrderPoints"
```

Expected: type error or test failure — `groupOrderPoints` does not exist on `BracketHealth`.

- [ ] **Step 3: Add `groupOrderPoints` to the `BracketHealth` type**

In `apps/web/src/features/results/domain/types.ts`, extend `BracketHealth`:

```ts
export type BracketHealth = {
  totalPicks: number;
  alivePicks: number;
  pendingPicks: number;
  bustedPicks: number;
  missedPicks: number;
  perRound: BracketRoundHealth[];
  /** Total group-order points the user has earned so far. Null in viewer mode. */
  groupOrderPoints: number | null;
};
```

- [ ] **Step 4: Populate the field in `get-results-view.ts`**

In `apps/web/src/features/results/application/get-results-view.ts`, after the line:

```ts
const bracketHealth = buildBracketHealth(bracketRounds, bronzeMatch, def);
```

add:

```ts
bracketHealth.groupOrderPoints = userBreakdown?.groupOrder ?? null;
```

`userBreakdown` is already computed earlier in the same function:

```ts
const userBreakdown =
  userId !== undefined ? (leaderboard.find((e) => e.userId === userId)?.breakdown ?? null) : null;
```

- [ ] **Step 5: Fix the TypeScript error in `buildBracketHealth`**

`buildBracketHealth` in `apps/web/src/features/results/application/build-bracket-rounds.ts` returns a `BracketHealth` object literal. Now that `BracketHealth` requires `groupOrderPoints`, add `groupOrderPoints: null` to its return:

```ts
return {
  totalPicks: allMatches.length,
  alivePicks: allMatches.filter((m) => m.pickStatus === 'alive').length,
  pendingPicks: allMatches.filter((m) => m.pickStatus === 'pending').length,
  bustedPicks: allMatches.filter((m) => m.pickStatus === 'busted').length,
  missedPicks: allMatches.filter((m) => m.pickStatus === 'no-pick').length,
  perRound,
  groupOrderPoints: null,
};
```

(`get-results-view.ts` overwrites this to the correct value immediately after.)

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd /workspaces/football-cup-prediction
pnpm --filter @cup/web test run apps/web/src/features/results/application/get-results-view.test.ts 2>&1 | tail -20
```

Expected: all tests pass, including the two new ones.

---

### Task 2: Render group-order points sub-line in `BracketHealthPanel`

**Files:**

- Modify: `apps/web/src/features/results/ui/BracketHealthPanel.tsx` — render sub-line under R32 row

**Interfaces:**

- Consumes: `BracketHealth.groupOrderPoints: number | null` from Task 1

- [ ] **Step 1: Update `BracketHealthPanel` to render the sub-line**

In `apps/web/src/features/results/ui/BracketHealthPanel.tsx`, replace the existing `perRound` map:

```tsx
{
  health.perRound.length > 0 && (
    <div className="mt-3 pt-2.5 border-t border-green-200 flex flex-col gap-1">
      {health.perRound.map((r) => (
        <RoundHealthRow key={r.label} round={r} />
      ))}
    </div>
  );
}
```

with:

```tsx
{
  health.perRound.length > 0 && (
    <div className="mt-3 pt-2.5 border-t border-green-200 flex flex-col gap-1">
      {health.perRound.map((r) => (
        <div key={r.label}>
          <RoundHealthRow round={r} />
          {r.label === 'R32' && health.groupOrderPoints !== null && health.groupOrderPoints > 0 && (
            <div className="pl-10 mt-0.5 text-[11px] font-semibold text-green-700">
              Group order +{health.groupOrderPoints} pts
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd /workspaces/football-cup-prediction
pnpm typecheck 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 3: Run the full test suite**

```bash
cd /workspaces/football-cup-prediction
pnpm test run 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 4: Commit everything (code + tests + spec doc)**

```bash
cd /workspaces/football-cup-prediction
git add \
  apps/web/src/features/results/domain/types.ts \
  apps/web/src/features/results/application/get-results-view.ts \
  apps/web/src/features/results/application/build-bracket-rounds.ts \
  apps/web/src/features/results/application/get-results-view.test.ts \
  apps/web/src/features/results/ui/BracketHealthPanel.tsx \
  docs/superpowers/specs/2026-06-28-bracket-health-group-order-points-design.md
git commit -m "feat(results): show group-order points under R32 row in bracket health panel"
```
