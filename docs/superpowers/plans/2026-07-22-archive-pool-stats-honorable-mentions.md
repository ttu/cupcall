# Archive Pool Statistics — Honorable Mentions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the mislabeled `knockoutStageLeader` stat (it's actually the final overall winner
including special bets) and add three new "honorable mention" stats to the archive Pool Statistics
card: who led before special bets were applied, who scored the most from knockout picks alone, and
who scored the most from special bets alone.

**Architecture:** All the data these stats need (a full `ScoreBreakdown` per pool member, including
the already-separate `specials` field) is already frozen into each archived pool's leaderboard
entries — no new queries, no DB migration. This is a pure extension of the existing
`computeStageLeaders` function (one more pass over data already in hand), a rename + three new
fields on the existing `PoolArchiveRecap` jsonb type, and two new rows (grouped as "Honorable
mentions") on the existing `ArchivePoolStatsPanel` component.

**Tech Stack:** TypeScript (strict), Vitest + pglite (`@cup/db/testing`), Next.js/React, Drizzle
(jsonb, no migration needed).

## Global Constraints

- TypeScript strict — no `any`, no unsafe casts. `StageLeader.points` is a plain `number` (existing
  convention); `ScoreBreakdown` fields are the branded `Points` type from `@cup/engine`, which is
  freely assignable to `number` (it's `Brand<number, 'Points'>`).
- `LeaderboardEntry.breakdown` (`packages/db/src/repositories/scores.ts`) is typed
  `ScoreBreakdown | null` — a member with no score row yet has no breakdown. Treat `null` as
  all-zero categories, not a skip.
- Ties are broken by leaderboard (rank) order — first entry to reach a new max wins, matching the
  existing `groupStageLeader`/`knockoutStageLeader` convention. Do not change this.
- No DB schema migration — `pool_archives.recap` is `jsonb`; new/renamed fields are TS-type-only.
- This repo has no `.test.tsx` component tests anywhere (UI relies on integration tests one layer
  down + Playwright E2E for critical flows) — do not introduce one for `ArchivePoolStatsPanel`;
  that would be a new, unestablished pattern for a purely presentational change.
- One commit per feature — do not create intermediate/partial commits. The spec doc
  (`docs/superpowers/specs/2026-07-22-archive-pool-stats-honorable-mentions-design.md`) lands in
  the same commit as the implementation, per this repo's convention (no docs-only commits, no
  separate spec commits).
- Format + lint + typecheck must pass before each commit (pre-commit hook enforces this on staged
  files; still run `pnpm typecheck` manually since it isn't staged-file-scoped).

---

## Task 1: Extend `computeStageLeaders` with the four new leader computations

**Files:**

- Modify: `apps/web/src/features/pool-archive/application/build-highlights.ts:51-84`
- Test: `apps/web/src/features/pool-archive/application/build-highlights.test.ts:274-320`

**Interfaces:**

- Produces: `computeStageLeaders(entries, pointsHistory, groupCompletionStageIndex)` now returns
  `{ groupStageLeader, preSpecialsLeader, finalWinner, bestKnockoutPerformer,
bestSpecialBetsPerformer }` (each `StageLeader | null`, `StageLeader = { userId, displayName,
points: number }`, unchanged import from `@cup/db`). The `entries` parameter's element type gains
  a required `breakdown: ScoreBreakdown | null` field. `knockoutStageLeader` no longer exists on the
  return type — renamed to `finalWinner` (identical computation: max `pointsTotal`).
- Consumed by: Task 2's `build-recap.ts` wiring.

- [ ] **Step 1: Write the failing tests**

Replace the entire `describe('computeStageLeaders', ...)` block (lines 274-320) in
`apps/web/src/features/pool-archive/application/build-highlights.test.ts` with:

```ts
function fakeBreakdown(overrides: Partial<ScoreBreakdown> = {}): ScoreBreakdown {
  return {
    groupMatches: points(0),
    groupOrder: points(0),
    bronze: points(0),
    final: points(0),
    roundOf16: points(0),
    roundOf8: points(0),
    topFour: points(0),
    topFourTeams: points(0),
    topFourPosition: points(0),
    specials: points(0),
    total: points(0),
    ...overrides,
  };
}

describe('computeStageLeaders', () => {
  it('finds the group-stage leader from pointsHistory at the completion index, and the final winner from final totals', () => {
    const entries = [
      { userId: asUserId('u1'), displayName: 'Alice', pointsTotal: 50, breakdown: fakeBreakdown() },
      { userId: asUserId('u2'), displayName: 'Bob', pointsTotal: 80, breakdown: fakeBreakdown() },
    ];
    const pointsHistory = new Map([
      [asUserId('u1'), [0, 42, 50]], // leads at index 1 (group stage complete)
      [asUserId('u2'), [0, 20, 80]], // overtakes by the end
    ]);

    const result = computeStageLeaders(entries, pointsHistory, 1);

    expect(result.groupStageLeader).toEqual({
      userId: asUserId('u1'),
      displayName: 'Alice',
      points: 42,
    });
    expect(result.finalWinner).toEqual({
      userId: asUserId('u2'),
      displayName: 'Bob',
      points: 80,
    });
  });

  it('shows the same person for both leaders when there is no lead change', () => {
    const entries = [
      { userId: asUserId('u1'), displayName: 'Alice', pointsTotal: 90, breakdown: fakeBreakdown() },
      { userId: asUserId('u2'), displayName: 'Bob', pointsTotal: 60, breakdown: fakeBreakdown() },
    ];
    const pointsHistory = new Map([
      [asUserId('u1'), [0, 42, 90]],
      [asUserId('u2'), [0, 20, 60]],
    ]);

    const result = computeStageLeaders(entries, pointsHistory, 1);

    expect(result.groupStageLeader?.displayName).toBe('Alice');
    expect(result.finalWinner?.displayName).toBe('Alice');
  });

  it('finds a pre-specials leader distinct from the final winner when special bets change the outcome', () => {
    const entries = [
      // Alice: 70 total, all from group+knockout (no specials) -> pre-specials leader.
      { userId: asUserId('u1'), displayName: 'Alice', pointsTotal: 70, breakdown: fakeBreakdown() },
      // Bob: 80 total, but 20 of it is specials -> only 60 pre-specials, yet still the final winner.
      {
        userId: asUserId('u2'),
        displayName: 'Bob',
        pointsTotal: 80,
        breakdown: fakeBreakdown({ specials: points(20) }),
      },
    ];
    const pointsHistory = new Map([
      [asUserId('u1'), [0, 0, 70]],
      [asUserId('u2'), [0, 0, 80]],
    ]);

    const result = computeStageLeaders(entries, pointsHistory, 1);

    expect(result.preSpecialsLeader).toEqual({
      userId: asUserId('u1'),
      displayName: 'Alice',
      points: 70,
    });
    expect(result.finalWinner).toEqual({
      userId: asUserId('u2'),
      displayName: 'Bob',
      points: 80,
    });
  });

  it('finds the best knockout-only performer, excluding group-stage and specials points', () => {
    const entries = [
      {
        userId: asUserId('u1'),
        displayName: 'Alice',
        pointsTotal: 100,
        // 90 of Alice's 100 points are groupMatches/groupOrder, not knockout.
        breakdown: fakeBreakdown({
          groupMatches: points(60),
          groupOrder: points(30),
          final: points(10),
        }),
      },
      {
        userId: asUserId('u2'),
        displayName: 'Bob',
        pointsTotal: 80,
        // Bob's 80 points are almost entirely knockout categories.
        breakdown: fakeBreakdown({
          bronze: points(10),
          final: points(20),
          roundOf16: points(15),
          roundOf8: points(15),
          topFour: points(20),
        }),
      },
    ];
    const pointsHistory = new Map([
      [asUserId('u1'), [0, 90, 100]],
      [asUserId('u2'), [0, 0, 80]],
    ]);

    const result = computeStageLeaders(entries, pointsHistory, 1);

    expect(result.bestKnockoutPerformer).toEqual({
      userId: asUserId('u2'),
      displayName: 'Bob',
      points: 80,
    });
  });

  it('finds the best special-bets performer', () => {
    const entries = [
      {
        userId: asUserId('u1'),
        displayName: 'Alice',
        pointsTotal: 50,
        breakdown: fakeBreakdown({ specials: points(5) }),
      },
      {
        userId: asUserId('u2'),
        displayName: 'Bob',
        pointsTotal: 40,
        breakdown: fakeBreakdown({ specials: points(16) }),
      },
    ];
    const pointsHistory = new Map([
      [asUserId('u1'), [0, 0, 50]],
      [asUserId('u2'), [0, 0, 40]],
    ]);

    const result = computeStageLeaders(entries, pointsHistory, 1);

    expect(result.bestSpecialBetsPerformer).toEqual({
      userId: asUserId('u2'),
      displayName: 'Bob',
      points: 16,
    });
  });

  it('treats a null breakdown as all-zero categories, not a skip', () => {
    const entries = [
      { userId: asUserId('u1'), displayName: 'Alice', pointsTotal: 0, breakdown: null },
      {
        userId: asUserId('u2'),
        displayName: 'Bob',
        pointsTotal: 30,
        breakdown: fakeBreakdown({ specials: points(10) }),
      },
    ];
    const pointsHistory = new Map([
      [asUserId('u1'), [0, 0, 0]],
      [asUserId('u2'), [0, 0, 30]],
    ]);

    const result = computeStageLeaders(entries, pointsHistory, 1);

    expect(result.bestSpecialBetsPerformer?.displayName).toBe('Bob');
    expect(result.bestKnockoutPerformer?.displayName).toBe('Bob');
    expect(result.preSpecialsLeader?.displayName).toBe('Bob');
  });

  it('returns null for every leader when there are no entries', () => {
    const result = computeStageLeaders([], new Map(), 1);
    expect(result.groupStageLeader).toBeNull();
    expect(result.preSpecialsLeader).toBeNull();
    expect(result.finalWinner).toBeNull();
    expect(result.bestKnockoutPerformer).toBeNull();
    expect(result.bestSpecialBetsPerformer).toBeNull();
  });
});
```

Add these two imports at the top of the test file (alongside the existing `@cup/engine` import):

```ts
import { points } from '@cup/engine';
import type { ScoreBreakdown } from '@cup/engine';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run apps/web/src/features/pool-archive/application/build-highlights.test.ts`
Expected: FAIL — `computeStageLeaders` entries don't have a `breakdown` field yet / return type has
no `preSpecialsLeader`/`finalWinner`/`bestKnockoutPerformer`/`bestSpecialBetsPerformer` (TS compile
errors surfacing as Vitest failures, or property-not-found assertion failures).

- [ ] **Step 3: Implement the extended `computeStageLeaders`**

In `apps/web/src/features/pool-archive/application/build-highlights.ts`, add `ScoreBreakdown` to
the existing `@cup/engine` type import (line 8):

```ts
import type { Tournament, TeamId, UserId, ScoreBreakdown } from '@cup/engine';
```

Replace the existing `computeStageLeaders` function (lines 51-84) with:

```ts
export function computeStageLeaders(
  entries: {
    userId: UserId;
    displayName: string;
    pointsTotal: number;
    breakdown: ScoreBreakdown | null;
  }[],
  pointsHistory: Map<UserId, number[]>,
  groupCompletionStageIndex: number,
): {
  groupStageLeader: StageLeader | null;
  preSpecialsLeader: StageLeader | null;
  finalWinner: StageLeader | null;
  bestKnockoutPerformer: StageLeader | null;
  bestSpecialBetsPerformer: StageLeader | null;
} {
  if (entries.length === 0) {
    return {
      groupStageLeader: null,
      preSpecialsLeader: null,
      finalWinner: null,
      bestKnockoutPerformer: null,
      bestSpecialBetsPerformer: null,
    };
  }

  let groupStageLeader: StageLeader | null = null;
  let bestGroupPoints = -Infinity;
  let preSpecialsLeader: StageLeader | null = null;
  let bestPreSpecialsPoints = -Infinity;
  let finalWinner: StageLeader | null = null;
  let bestFinalPoints = -Infinity;
  let bestKnockoutPerformer: StageLeader | null = null;
  let bestKnockoutPoints = -Infinity;
  let bestSpecialBetsPerformer: StageLeader | null = null;
  let bestSpecialBetsPoints = -Infinity;

  for (const entry of entries) {
    const groupPoints = pointsHistory.get(entry.userId)?.[groupCompletionStageIndex] ?? 0;
    if (groupPoints > bestGroupPoints) {
      bestGroupPoints = groupPoints;
      groupStageLeader = {
        userId: entry.userId,
        displayName: entry.displayName,
        points: groupPoints,
      };
    }

    const specials = entry.breakdown?.specials ?? 0;
    const preSpecialsPoints = entry.pointsTotal - specials;
    if (preSpecialsPoints > bestPreSpecialsPoints) {
      bestPreSpecialsPoints = preSpecialsPoints;
      preSpecialsLeader = {
        userId: entry.userId,
        displayName: entry.displayName,
        points: preSpecialsPoints,
      };
    }

    if (entry.pointsTotal > bestFinalPoints) {
      bestFinalPoints = entry.pointsTotal;
      finalWinner = {
        userId: entry.userId,
        displayName: entry.displayName,
        points: entry.pointsTotal,
      };
    }

    const knockoutPoints =
      (entry.breakdown?.bronze ?? 0) +
      (entry.breakdown?.final ?? 0) +
      (entry.breakdown?.roundOf16 ?? 0) +
      (entry.breakdown?.roundOf8 ?? 0) +
      (entry.breakdown?.topFour ?? 0);
    if (knockoutPoints > bestKnockoutPoints) {
      bestKnockoutPoints = knockoutPoints;
      bestKnockoutPerformer = {
        userId: entry.userId,
        displayName: entry.displayName,
        points: knockoutPoints,
      };
    }

    if (specials > bestSpecialBetsPoints) {
      bestSpecialBetsPoints = specials;
      bestSpecialBetsPerformer = {
        userId: entry.userId,
        displayName: entry.displayName,
        points: specials,
      };
    }
  }

  return {
    groupStageLeader,
    preSpecialsLeader,
    finalWinner,
    bestKnockoutPerformer,
    bestSpecialBetsPerformer,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run apps/web/src/features/pool-archive/application/build-highlights.test.ts`
Expected: PASS — all `computeStageLeaders` cases green, plus every other existing test in the file
still passing (this function is the only thing that changed).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: FAILS at this point — `build-recap.ts` (Task 2) still calls `computeStageLeaders` with the
old projection and destructures `knockoutStageLeader`, and `PoolArchiveRecap` still has the old
field. This is expected; do not fix it in this task. Confirm the _only_ errors are in
`build-recap.ts` and files referencing `PoolArchiveRecap.knockoutStageLeader` — if errors appear
inside `build-highlights.ts` or its test, fix those before proceeding.

- [ ] **Step 6: Commit**

Do NOT commit yet — this repo lands one commit per feature, and Task 1 alone leaves the build
broken (by design, per Step 5). Proceed directly to Task 2; the commit happens at the end of Task 3.

---

## Task 2: Rename `knockoutStageLeader` → `finalWinner`, add the 3 new fields to `PoolArchiveRecap`, wire `build-recap.ts`

**Files:**

- Modify: `packages/db/src/schema/pool-archive.ts:36-47` (`PoolArchiveRecap` type)
- Modify: `apps/web/src/features/pool-archive/application/build-recap.ts:230-322`
  (`buildPoolArchiveRecap`)
- Modify: `apps/web/src/features/pool-archive/application/build-recap.test.ts:192-217` (rename +
  extend the existing "freezes groupCompletionStageIndex and stage leaders" test)
- Modify: `packages/db/src/repositories/pool-archive.test.ts:155-206` (the round-trip recap fixture
  — a required-fields `PoolArchiveRecap` literal, will fail to compile once the type changes)

**Interfaces:**

- Consumes: `computeStageLeaders` from Task 1 (now returns 5 fields, takes `leaderboard` entries
  with `breakdown`).
- Produces: `PoolArchiveRecap` with `finalWinner`, `preSpecialsLeader`, `bestKnockoutPerformer`,
  `bestSpecialBetsPerformer` (all `StageLeader | null`) in place of `knockoutStageLeader`. Consumed
  by Task 3's `ArchivePoolStatsPanel`.

- [ ] **Step 1: Write the failing integration test**

In `apps/web/src/features/pool-archive/application/build-recap.test.ts`, replace the last test
(`'freezes groupCompletionStageIndex and stage leaders into the recap'`, lines 192-217) with:

```ts
it('freezes groupCompletionStageIndex and all five leader/performer fields into the recap', async () => {
  const finalKickoff = new Date('2026-07-19T18:00:00Z');
  await upsertKnockoutMatch(db, {
    id: miniTournament.bracket.finalMatch,
    tournamentId,
    stage: 'Final',
    homeTeamId: 'A1',
    awayTeamId: 'B1',
    homeGoals: 2,
    awayGoals: 1,
    kickoff: finalKickoff,
    status: 'final',
  });

  const { recap } = await buildPoolArchiveRecap(db, {
    poolId,
    tournamentId,
    def: miniTournament,
    scoring: miniTournament.scoring,
  });

  expect(typeof recap.groupCompletionStageIndex).toBe('number');
  // Single-member pool: the only member leads every category by definition.
  expect(recap.groupStageLeader?.userId).toBe(ownerId);
  expect(recap.preSpecialsLeader?.userId).toBe(ownerId);
  expect(recap.finalWinner?.userId).toBe(ownerId);
  expect(recap.bestKnockoutPerformer?.userId).toBe(ownerId);
  expect(recap.bestSpecialBetsPerformer?.userId).toBe(ownerId);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/web/src/features/pool-archive/application/build-recap.test.ts`
Expected: FAIL — `recap.finalWinner`/`recap.preSpecialsLeader`/etc. don't exist yet (TS compile
error surfaced via Vitest, or `undefined` if using loose typing at this stage).

- [ ] **Step 3: Update the `PoolArchiveRecap` type**

In `packages/db/src/schema/pool-archive.ts`, replace lines 36-47:

```ts
export type PoolArchiveRecap = {
  stages: string[];
  championPick: ChampionPickHighlight | null;
  bestSingleMatch: BestSingleMatchHighlight | null;
  biggestUpset: BiggestUpsetHighlight | null;
  predictionsMade: number;
  exactScoreRatePercent: number;
  overallAccuracyPercent: number;
  groupCompletionStageIndex: number;
  groupStageLeader: StageLeader | null;
  preSpecialsLeader: StageLeader | null;
  finalWinner: StageLeader | null;
  bestKnockoutPerformer: StageLeader | null;
  bestSpecialBetsPerformer: StageLeader | null;
};
```

- [ ] **Step 4: Wire `build-recap.ts`**

In `apps/web/src/features/pool-archive/application/build-recap.ts`, change the
`computeStageLeaders` call (lines 281-285) to pass the full `leaderboard` (which already has
`.breakdown`) instead of a stripped-down projection, and rename the destructured result:

```ts
const {
  groupStageLeader,
  preSpecialsLeader,
  finalWinner,
  bestKnockoutPerformer,
  bestSpecialBetsPerformer,
} = computeStageLeaders(leaderboard, pointsHistoryByUser, groupCompletionStageIndex);
```

Then update the `recap` object literal (lines 287-319) to replace:

```ts
    groupStageLeader,
    knockoutStageLeader,
  };
```

with:

```ts
    groupStageLeader,
    preSpecialsLeader,
    finalWinner,
    bestKnockoutPerformer,
    bestSpecialBetsPerformer,
  };
```

Note: `leaderboard` (from `getLeaderboard(db, poolId)`, already fetched at the top of
`buildPoolArchiveRecap`) is typed `LeaderboardEntry[]` (`{ userId, displayName, pointsTotal:
Points, breakdown: ScoreBreakdown | null, completionPercent: number | null }`), which structurally
satisfies `computeStageLeaders`'s entries parameter (extra `completionPercent` field is fine; TS
structural typing allows excess properties on a variable of a wider inferred type — this is not an
object literal, so there's no excess-property-check issue).

- [ ] **Step 5: Run the integration test to verify it passes**

Run: `pnpm vitest run apps/web/src/features/pool-archive/application/build-recap.test.ts`
Expected: PASS — all cases green, including the updated leader-fields test.

- [ ] **Step 6: Fix the now-broken `pool-archive.test.ts` fixture in `packages/db`**

`packages/db/src/repositories/pool-archive.test.ts` constructs a full `PoolArchiveRecap` literal at
lines 155-182 (the `'stores and retrieves recap and per-entry points history / stage reasons'`
test) — this will fail to typecheck once `PoolArchiveRecap` requires the 4 new/renamed fields.
Replace line 181 (`knockoutStageLeader: { userId: owner.id, displayName: 'Owner', points: 50 },`)
with:

```ts
      preSpecialsLeader: { userId: owner.id, displayName: 'Owner', points: 40 },
      finalWinner: { userId: owner.id, displayName: 'Owner', points: 50 },
      bestKnockoutPerformer: { userId: owner.id, displayName: 'Owner', points: 30 },
      bestSpecialBetsPerformer: { userId: owner.id, displayName: 'Owner', points: 10 },
```

(These are fixture values for a round-trip DB-storage test — they don't need to be internally
consistent with the `entries`/`breakdown` fixtures elsewhere in that same test; the test only
asserts `fetched?.archive.recap` equals the `recap` object it wrote.)

- [ ] **Step 7: Run the full test suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS. If typecheck still fails, search for any remaining reference to
`knockoutStageLeader` with `grep -rn "knockoutStageLeader" --include="*.ts" --include="*.tsx" .`
from the repo root and fix each (there should be none left outside historical comments in
`get-pool-archive.test.ts`, which intentionally casts a partial legacy object `as PoolArchiveRecap`
and does not need updating).

- [ ] **Step 8: Commit**

Do NOT commit yet — proceed to Task 3; the commit happens at the end of that task (one commit per
feature).

---

## Task 3: Update `ArchivePoolStatsPanel` UI, docs, and commit

**Files:**

- Modify: `apps/web/src/features/pool-archive/ui/ArchivePoolStatsPanel.tsx`
- Modify: `docs/features/pool-archive.md:153-163`
- Modify: `docs/PROGRESS.md` (append a completed-work entry)
- (already created) `docs/superpowers/specs/2026-07-22-archive-pool-stats-honorable-mentions-design.md`

**Interfaces:**

- Consumes: `PoolArchiveRecap.{groupStageLeader,preSpecialsLeader,finalWinner,
bestKnockoutPerformer,bestSpecialBetsPerformer}` from Task 2.

- [ ] **Step 1: Update `ArchivePoolStatsPanel.tsx`**

Replace the file's return block (lines 27-51) with:

```tsx
return (
  <div className="card p-4" data-testid="archive-pool-stats-panel">
    <span className="section-label">Pool statistics</span>
    <ul className="mt-3 space-y-2">
      <StatRow label="Overall prediction accuracy" value={`${recap.overallAccuracyPercent}%`} />
      <StatRow
        label="Group stage leader"
        value={
          recap.groupStageLeader
            ? `${recap.groupStageLeader.displayName} (${recap.groupStageLeader.points} pts)`
            : '—'
        }
      />
      {recap.preSpecialsLeader && (
        <StatRow
          label="Leader before special bets"
          value={`${recap.preSpecialsLeader.displayName} (${recap.preSpecialsLeader.points} pts)`}
        />
      )}
      {recap.finalWinner && (
        <StatRow
          label="Final winner (with specials)"
          value={`${recap.finalWinner.displayName} (${recap.finalWinner.points} pts)`}
        />
      )}
    </ul>
    {(recap.bestKnockoutPerformer || recap.bestSpecialBetsPerformer) && (
      <>
        <span className="section-label mt-4 block">Honorable mentions</span>
        <ul className="mt-3 space-y-2">
          {recap.bestKnockoutPerformer && (
            <StatRow
              label="Best at knockout stage"
              value={`${recap.bestKnockoutPerformer.displayName} (${recap.bestKnockoutPerformer.points} pts)`}
            />
          )}
          {recap.bestSpecialBetsPerformer && (
            <StatRow
              label="Best at special bets"
              value={`${recap.bestSpecialBetsPerformer.displayName} (${recap.bestSpecialBetsPerformer.points} pts)`}
            />
          )}
        </ul>
      </>
    )}
  </div>
);
```

`StatRow` (lines 6-13) and the empty-state branch (lines 16-25) are unchanged — leave them exactly
as they are.

- [ ] **Step 2: Typecheck, lint, and run the full test suite**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`
Expected: all PASS. If Prettier/ESLint reformat the file, re-run `pnpm format:check` /
`pnpm lint` once more to confirm clean.

- [ ] **Step 3: Verify in the browser**

Start the dev server (`pnpm -C apps/web dev`, or the project's existing `run` workflow if one is
configured) and view an archived pool's `/pools/[id]/archive` page. If no archived pool exists
locally, use `pnpm seed:fresh` (or `pnpm seed:fresh:current`, whichever produces a completed
tournament in this repo's seed data) and archive a pool via the existing owner-only "Archive pool"
UI action, then open its archive page. Confirm:

- "Group stage leader", "Leader before special bets", and "Final winner (with specials)" all render
  under "Pool statistics".
- A new "Honorable mentions" section renders below it with "Best at knockout stage" and "Best at
  special bets".
- No layout regression compared to the existing card style (compare against `ArchiveHighlightsPanel`
  directly above/below it on the page).

- [ ] **Step 4: Update `docs/features/pool-archive.md`**

Replace the bullet at lines 153-163 (starting `- **Pool statistics** (\`overallAccuracyPercent\`,
\`groupStageLeader\`, \`knockoutStageLeader\`, ...`) with:

```markdown
- **Pool statistics** (`overallAccuracyPercent`, `groupStageLeader`, `preSpecialsLeader`,
  `finalWinner`, `bestKnockoutPerformer`, `bestSpecialBetsPerformer`, `groupCompletionStageIndex`)
  — frozen at archive time alongside the other recap fields. `overallAccuracyPercent` sums
  hit/attempted accuracy detail (`AccuracyBreakdown`, from `@cup/engine`'s `scoreCardAccuracy`)
  across every member with a prediction record, using their full `CardInputs`, assembled and
  augmented the same way `rescoreCard` already does for real scoring — so it can never disagree
  with the actual points. Members with no prediction row at all are skipped entirely (contribute
  neither hits nor attempted), matching how real scoring never scores them either.
  `groupStageLeader` reads `pointsHistory` at the group-completion stage index. `finalWinner` is
  simply the max final `pointsTotal` (renamed from the earlier, mislabeled
  `knockoutStageLeader` — it was never knockout-only, it's the tournament-end total including
  special bets). `preSpecialsLeader` is the max of `pointsTotal - breakdown.specials`, i.e. who
  would have led without special bets. `bestKnockoutPerformer` is the max of
  `bronze + final + roundOf16 + roundOf8 + topFour` (knockout-bracket categories only, no group
  or specials). `bestSpecialBetsPerformer` is the max of `breakdown.specials` alone. All five are
  computed in a single pass over the pool's `leaderboard` (each entry already carries a full
  `ScoreBreakdown`) by `computeStageLeaders`. `groupCompletionStageIndex` is also used to restrict
  `computeBiggestRiser` to knockout-stage-onward transitions (see below), since group-stage rank
  swings are mostly noise (many matches resolve per day across a large pool).
```

- [ ] **Step 5: Append to `docs/PROGRESS.md`**

Add a new bullet to the completed-work section (mirroring the existing "archive pool statistics"
entry's style — find it via `grep -n "ArchivePoolStatsPanel" docs/PROGRESS.md` and add immediately
after it):

```markdown
- **Archive pool statistics — honorable mentions** (2026-07-22): fixed `knockoutStageLeader` being
  mislabeled (it was always just the final winner including specials, renamed to `finalWinner`) and
  added `preSpecialsLeader` (who led before special bets), `bestKnockoutPerformer` (most points from
  knockout picks alone), and `bestSpecialBetsPerformer` (most points from special bets alone) to
  `PoolArchiveRecap`, computed in one pass by the extended `computeStageLeaders`
  (`apps/web/src/features/pool-archive/application/build-highlights.ts`). `ArchivePoolStatsPanel`
  gained a new "Honorable mentions" sub-section. No DB migration (`recap` is jsonb).
  **Rollout:** the prod WC2026 pool's frozen archive still has the old shape until the owner
  re-archives via the existing UI action (idempotent).
  **Design/plan:** `docs/superpowers/specs/2026-07-22-archive-pool-stats-honorable-mentions-design.md`,
  `docs/superpowers/plans/2026-07-22-archive-pool-stats-honorable-mentions.md`.
```

- [ ] **Step 6: Stage and commit everything as one feature commit**

```bash
git add \
  apps/web/src/features/pool-archive/application/build-highlights.ts \
  apps/web/src/features/pool-archive/application/build-highlights.test.ts \
  apps/web/src/features/pool-archive/application/build-recap.ts \
  apps/web/src/features/pool-archive/application/build-recap.test.ts \
  apps/web/src/features/pool-archive/ui/ArchivePoolStatsPanel.tsx \
  packages/db/src/schema/pool-archive.ts \
  packages/db/src/repositories/pool-archive.test.ts \
  docs/features/pool-archive.md \
  docs/PROGRESS.md \
  docs/superpowers/specs/2026-07-22-archive-pool-stats-honorable-mentions-design.md \
  docs/superpowers/plans/2026-07-22-archive-pool-stats-honorable-mentions.md

git commit -m "$(cat <<'EOF'
feat(pool-archive): add pre-specials leader and knockout/specials honorable mentions

`knockoutStageLeader` was mislabeled — it was always just the final winner
including special bets. Renamed to `finalWinner` and added three new stats:
who led before special bets, who scored most from knockout picks alone, and
who scored most from special bets alone. All derived from data already
frozen at archive time, no DB migration needed.
EOF
)"
```

- [ ] **Step 7: Verify the commit and clean working tree**

Run: `git status`
Expected: working tree clean, `git log -1 --stat` shows exactly the files listed in Step 6.

---

## Plan self-review notes

- **Spec coverage:** `finalWinner` rename (Task 2), `preSpecialsLeader` (Tasks 1-2), `finalWinner`
  distinct-from-`preSpecialsLeader` behavior (Task 1 test), `bestKnockoutPerformer` (Tasks 1-2),
  `bestSpecialBetsPerformer` (Tasks 1-2), two-section UI layout (Task 3), progressive-enhancement
  rendering for legacy archives (Task 3, conditional rendering), rollout note (Task 3 docs). All
  spec sections are covered.
- **Null-breakdown handling** (`LeaderboardEntry.breakdown: ScoreBreakdown | null`, found during
  research after the spec was approved) is explicitly covered by both the spec correction and a
  dedicated Task 1 test case.
- **No new component-test pattern** is introduced, matching this repo's existing lack of `.test.tsx`
  files — verification for the UI task relies on typecheck/lint/test plus a manual browser check
  (per this repo's CLAUDE.md requirement to verify UI changes in a browser), not a new automated
  layer.
