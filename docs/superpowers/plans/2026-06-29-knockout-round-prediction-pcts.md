# Knockout Round Prediction Percentages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the % of pool members who predicted each team to reach that round on every bracket match card (entry round already done; extend to all later rounds).

**Architecture:** Rename the existing `homeTeamR32Pct`/`awayTeamR32Pct` fields to `homeTeamPredictedPct`/`awayTeamPredictedPct` on `KnockoutMatchView`, then compute those fields for non-entry rounds from `poolKnockoutPicks` (already fetched in `getResultsView`). For a non-entry round match, the feeder match for the home slot is `prog.from[0]` and for the away slot is `prog.from[1]` (from `bracket.progression`). The pct for a team is: count of users who picked that team to win their feeder match ÷ total distinct users in `poolKnockoutPicks`.

**Tech Stack:** TypeScript (strict), Vitest, React, domain types in `features/results/domain/types.ts`, application layer in `features/results/application/`.

## Global Constraints

- TypeScript strict — no `any`, no unsafe casts.
- Test with Vitest; run with `pnpm test --filter @web/app` from repo root.
- Lint/format: `pnpm lint` and `pnpm format` from repo root.
- Never mock internal collaborators; only mock at system boundaries.
- `poolKnockoutPicks` is of type `PoolKnockoutPick[]` imported from `@cup/db`.

---

## File Map

| File                                                                 | Change                                                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `apps/web/src/features/results/domain/types.ts`                      | Rename `homeTeamR32Pct` → `homeTeamPredictedPct`, `awayTeamR32Pct` → `awayTeamPredictedPct` |
| `apps/web/src/features/results/application/build-bracket-rounds.ts`  | Add `poolKnockoutPicks` param; add `computeKnockoutRoundPcts`; populate pcts for all rounds |
| `apps/web/src/features/results/application/get-results-view.ts`      | Pass `poolKnockoutPicks` to `buildBracketRounds`                                            |
| `apps/web/src/features/results/ui/BracketMatchCard.tsx`              | Rename `r32Pct` prop → `predictedPct`                                                       |
| `apps/web/src/features/results/application/build-race-view.test.ts`  | Update field name references                                                                |
| `apps/web/src/features/results/application/get-results-view.test.ts` | Update field name references + add pct tests for SF round                                   |
| `apps/web/src/features/results/domain/bracket-health.test.ts`        | Update field name references                                                                |

---

## Task 1: Rename R32Pct fields — types, application, UI, tests

**Files:**

- Modify: `apps/web/src/features/results/domain/types.ts:148-150`
- Modify: `apps/web/src/features/results/application/build-bracket-rounds.ts:128-129`
- Modify: `apps/web/src/features/results/ui/BracketMatchCard.tsx:24,35,75,77,147,162`
- Modify: `apps/web/src/features/results/application/build-race-view.test.ts:61-62`
- Modify: `apps/web/src/features/results/application/get-results-view.test.ts:729,733,741-742`
- Modify: `apps/web/src/features/results/domain/bracket-health.test.ts:83-84`

**Interfaces:**

- Produces: `KnockoutMatchView.homeTeamPredictedPct: number | null` and `KnockoutMatchView.awayTeamPredictedPct: number | null` (replaces the R32 variants)

- [ ] **Step 1: Rename the type fields**

In `apps/web/src/features/results/domain/types.ts`, find:

```typescript
/** % of pool members who predicted the home team to qualify to the entry round. Null when not an entry-round match or no predictions exist. */
homeTeamR32Pct: number | null;
/** % of pool members who predicted the away team to qualify to the entry round. */
awayTeamR32Pct: number | null;
```

Replace with:

```typescript
/** % of pool members who predicted this team would be playing in this round. For the entry round: derived from group-score predictions. For later rounds: derived from knockout winner picks. Null when team slot is unknown or no predictions exist. */
homeTeamPredictedPct: number | null;
/** % of pool members who predicted the away team would be playing in this round. */
awayTeamPredictedPct: number | null;
```

- [ ] **Step 2: Rename the field in build-bracket-rounds.ts**

In `apps/web/src/features/results/application/build-bracket-rounds.ts` lines 128-129, find:

```typescript
      homeTeamR32Pct: isEntryRound && homeId ? (r32PredPcts.get(homeId) ?? null) : null,
      awayTeamR32Pct: isEntryRound && awayId ? (r32PredPcts.get(awayId) ?? null) : null,
```

Replace with (keep logic identical for now — Task 2 will extend it):

```typescript
      homeTeamPredictedPct: isEntryRound && homeId ? (r32PredPcts.get(homeId) ?? null) : null,
      awayTeamPredictedPct: isEntryRound && awayId ? (r32PredPcts.get(awayId) ?? null) : null,
```

- [ ] **Step 3: Rename in BracketMatchCard.tsx**

In `apps/web/src/features/results/ui/BracketMatchCard.tsx`:

In `TeamRow` props interface and destructuring, rename `r32Pct` → `predictedPct`:

```typescript
  predictedPct,
```

and:

```typescript
predictedPct: number | null;
```

and the render:

```typescript
      {predictedPct !== null && (
        <span className="text-[10px] font-bold text-ink-muted tabular-nums shrink-0">
          {predictedPct}%
        </span>
      )}
```

In the `BracketMatchCard` function body, update the two `TeamRow` usages:

```typescript
          r32Pct={match.homeTeamPredictedPct}
```

→

```typescript
          predictedPct={match.homeTeamPredictedPct}
```

and:

```typescript
          r32Pct={match.awayTeamPredictedPct}
```

→

```typescript
          predictedPct={match.awayTeamPredictedPct}
```

- [ ] **Step 4: Update test files to use new field names**

In `apps/web/src/features/results/application/build-race-view.test.ts`, rename both occurrences:

```typescript
    homeTeamPredictedPct: null,
    awayTeamPredictedPct: null,
```

In `apps/web/src/features/results/domain/bracket-health.test.ts`, rename both occurrences:

```typescript
    homeTeamPredictedPct: null,
    awayTeamPredictedPct: null,
```

In `apps/web/src/features/results/application/get-results-view.test.ts`, rename four occurrences:

```typescript
expect(qf1.homeTeamPredictedPct).toBe(100);
```

```typescript
expect(qf3.awayTeamPredictedPct).toBe(100);
```

```typescript
expect(match.homeTeamPredictedPct).toBeNull();
expect(match.awayTeamPredictedPct).toBeNull();
```

- [ ] **Step 5: Run tests to confirm rename compiles cleanly**

```bash
cd /workspaces/football-cup-prediction && pnpm --filter @web/app test run --reporter=verbose 2>&1 | tail -30
```

Expected: all existing tests pass (no new failures from the rename).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/results/domain/types.ts \
        apps/web/src/features/results/application/build-bracket-rounds.ts \
        apps/web/src/features/results/ui/BracketMatchCard.tsx \
        apps/web/src/features/results/application/build-race-view.test.ts \
        apps/web/src/features/results/application/get-results-view.test.ts \
        apps/web/src/features/results/domain/bracket-health.test.ts
git commit -m "refactor(results): rename homeTeamR32Pct/awayTeamR32Pct to homeTeamPredictedPct/awayTeamPredictedPct"
```

---

## Task 2: Compute and populate prediction pcts for all non-entry rounds

**Files:**

- Modify: `apps/web/src/features/results/application/build-bracket-rounds.ts`
- Modify: `apps/web/src/features/results/application/get-results-view.ts`
- Test: `apps/web/src/features/results/application/get-results-view.test.ts`

**Interfaces:**

- Consumes: `PoolKnockoutPick` from `@cup/db` — `{ userId: UserId; bracketMatchKey: BracketMatchKey; winnerTeamId: string }`
- Consumes: `bracket.progression` — `Array<{ match: BracketMatchKey; from: BracketMatchKey[] }>`
- Produces: `homeTeamPredictedPct` and `awayTeamPredictedPct` populated for all rounds on `KnockoutMatchView`

- [ ] **Step 1: Write a failing integration test for SF-round predicted pct**

Add inside the existing `describe('getResultsView', ...)` block in `apps/web/src/features/results/application/get-results-view.test.ts`, near the existing R32Pct tests. The `db`, `poolId`, `userId`, `ownerId` variables are available from `beforeEach`. Both `userId` and `ownerId` are already members of the pool (set up by `setupDb`).

The mini tournament has QF as entry round; SF is the next round. `prog.from[0] = 'qf1'` feeds `sf1`'s home slot. Inserting a final QF1 result makes `sf1.homeTeamId` known, enabling the pct lookup.

```typescript
describe('SF round predicted pct from knockout picks', () => {
  it('shows % who picked each team to win their QF match on the SF match view', async () => {
    // Insert a finalised QF1 match so sf1.homeTeamId = 'A1'
    await upsertKnockoutMatch(db, {
      id: 'qf1',
      tournamentId: miniTId,
      stage: 'QF',
      homeTeamId: 'A1',
      awayTeamId: 'B2',
      homeGoals: 2,
      awayGoals: 1,
      winnerTeamId: 'A1',
      status: 'final',
    });

    // userId picks A1 for qf1
    const pred1 = await getOrCreatePrediction(db, { poolId, userId, tournamentId: miniTId });
    await upsertKnockoutPick(db, pred1.id, bracketMatchKey('qf1'), 'A1');

    // ownerId picks B2 for qf1
    const pred2 = await getOrCreatePrediction(db, {
      poolId,
      userId: ownerId,
      tournamentId: miniTId,
    });
    await upsertKnockoutPick(db, pred2.id, bracketMatchKey('qf1'), 'B2');

    const view = await getResultsView({ db, poolId, userId, now: NOW });
    const sfRound = view!.bracketRounds.find((r) => r.label === 'SF')!;
    const sf1 = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
    expect(sf1.homeTeamId).toBe('A1');
    // 1 of 2 users picked A1 for qf1 → 50%
    expect(sf1.homeTeamPredictedPct).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /workspaces/football-cup-prediction && pnpm --filter @web/app test run get-results-view 2>&1 | tail -20
```

Expected: FAIL — `homeTeamPredictedPct` is `null`, not `50`.

- [ ] **Step 3: Add `computeKnockoutRoundPcts` function to build-bracket-rounds.ts**

Add this function at the bottom of `apps/web/src/features/results/application/build-bracket-rounds.ts`, before the closing of the module:

```typescript
/**
 * For each bracket match key, computes the % of pool members who picked each
 * team to win that match. Used to derive "predicted to be in this round" pcts
 * for non-entry rounds: the pct for a team in round R is the pick-pct from
 * their feeder match in round R-1.
 */
function computeKnockoutRoundPcts(
  poolKnockoutPicks: PoolKnockoutPick[],
): Map<string, Map<string, number>> {
  const users = new Set<string>();
  const counts = new Map<string, Map<string, number>>();

  for (const pick of poolKnockoutPicks) {
    users.add(pick.userId as string);
    const key = pick.bracketMatchKey as string;
    if (!counts.has(key)) counts.set(key, new Map());
    const teamCounts = counts.get(key)!;
    teamCounts.set(pick.winnerTeamId, (teamCounts.get(pick.winnerTeamId) ?? 0) + 1);
  }

  const totalUsers = users.size;
  if (totalUsers === 0) return new Map();

  return new Map(
    Array.from(counts.entries()).map(([key, teams]) => [
      key,
      new Map(
        Array.from(teams.entries()).map(([tid, count]) => [
          tid,
          Math.round((count / totalUsers) * 100),
        ]),
      ),
    ]),
  );
}
```

You also need to import `PoolKnockoutPick` from `@cup/db`. Add it to the existing import at the top of the file:

```typescript
import type { MatchRow, PoolGroupScore, PoolKnockoutPick } from '@cup/db';
```

- [ ] **Step 4: Add `poolKnockoutPicks` parameter to `buildBracketRounds` and wire the new computation**

Change the function signature of `buildBracketRounds` to accept `poolKnockoutPicks`:

```typescript
export function buildBracketRounds(
  def: Tournament,
  allMatches: MatchRow[],
  inputs: {
    knockoutPicks: { bracketMatchKey: string; winner: string }[];
    finishScores: {
      final?: { home: number; away: number };
      bronze?: { home: number; away: number };
    };
  } | null,
  poolGroupScores: PoolGroupScore[],
  poolKnockoutPicks: PoolKnockoutPick[],
): { bracketRounds: BracketRoundResultView[]; bronzeMatch: KnockoutMatchView | null } {
```

Add this line near the top of `buildBracketRounds`, after the existing `r32PredPcts` computation:

```typescript
const knockoutRoundPcts = computeKnockoutRoundPcts(poolKnockoutPicks);
```

Build a lookup from match key to its progression entry, so `buildMatchView` can find feeder matches:

```typescript
const progressionByMatch = new Map<string, { from: string[] }>(
  def.bracket.progression.map((p) => [p.match as string, { from: p.from as string[] }]),
);
```

Inside `buildMatchView`, replace the two `homeTeamPredictedPct` / `awayTeamPredictedPct` lines:

```typescript
      homeTeamPredictedPct: isEntryRound && homeId ? (r32PredPcts.get(homeId) ?? null) : null,
      awayTeamPredictedPct: isEntryRound && awayId ? (r32PredPcts.get(awayId) ?? null) : null,
```

with:

```typescript
      homeTeamPredictedPct: computeTeamRoundPct(key, homeId, 0, isEntryRound, r32PredPcts, progressionByMatch, knockoutRoundPcts, bronzeMatchKey),
      awayTeamPredictedPct: computeTeamRoundPct(key, awayId, 1, isEntryRound, r32PredPcts, progressionByMatch, knockoutRoundPcts, bronzeMatchKey),
```

Add the helper function `computeTeamRoundPct` to the module:

```typescript
/**
 * Returns the "% predicted this team in this round" for one slot (home=slotIndex 0, away=1).
 * - Entry round: derived from group-score qualification predictions.
 * - Bronze: always null (participants are SF losers; no direct pick exists for this).
 * - Other rounds: % of users who picked `teamId` to win their feeder match (prog.from[slotIndex]).
 */
function computeTeamRoundPct(
  matchKey: string,
  teamId: string | null,
  slotIndex: 0 | 1,
  isEntryRound: boolean,
  r32PredPcts: Map<string, number>,
  progressionByMatch: Map<string, { from: string[] }>,
  knockoutRoundPcts: Map<string, Map<string, number>>,
  bronzeMatchKey: string,
): number | null {
  if (!teamId) return null;
  if (isEntryRound) return r32PredPcts.get(teamId) ?? null;
  if (matchKey === bronzeMatchKey) return null;
  const prog = progressionByMatch.get(matchKey);
  const feederKey = prog?.from[slotIndex];
  if (!feederKey) return null;
  return knockoutRoundPcts.get(feederKey)?.get(teamId) ?? null;
}
```

- [ ] **Step 5: Pass `poolKnockoutPicks` from `getResultsView`**

In `apps/web/src/features/results/application/get-results-view.ts`, find the call to `buildBracketRounds`:

```typescript
const { bracketRounds, bronzeMatch } = buildBracketRounds(def, allMatches, inputs, poolGroupScores);
```

Replace with:

```typescript
const { bracketRounds, bronzeMatch } = buildBracketRounds(
  def,
  allMatches,
  inputs,
  poolGroupScores,
  poolKnockoutPicks,
);
```

- [ ] **Step 6: Run the new test to confirm it passes**

```bash
cd /workspaces/football-cup-prediction && pnpm --filter @web/app test run get-results-view 2>&1 | tail -30
```

Expected: the new SF pct test PASSES; all existing tests still pass.

- [ ] **Step 7: Run full test suite**

```bash
cd /workspaces/football-cup-prediction && pnpm --filter @web/app test run 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 8: Typecheck**

```bash
cd /workspaces/football-cup-prediction && pnpm --filter @web/app typecheck 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/results/application/build-bracket-rounds.ts \
        apps/web/src/features/results/application/get-results-view.ts \
        apps/web/src/features/results/application/get-results-view.test.ts \
        docs/superpowers/specs/2026-06-29-knockout-round-prediction-pcts-design.md \
        docs/superpowers/plans/2026-06-29-knockout-round-prediction-pcts.md
git commit -m "feat(results): show prediction pcts for all knockout rounds on bracket match cards"
```
