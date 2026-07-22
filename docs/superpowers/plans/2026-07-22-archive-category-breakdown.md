# Archive Score Breakdown by Category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a table to the pool archive page comparing every member's points side-by-side within
each scoring category, with the per-category leader(s) highlighted.

**Architecture:** A pure domain function (`buildCategoryBreakdown`) transforms the archive's
per-member `ScoreBreakdown`s into category-major rows with leader flags. A presentational panel
component renders those rows as a sticky-first-column, horizontally-scrollable grid. The page
computes the rows (viewer-aware, so "You" and the current user's column can be styled distinctly)
and passes them straight to the panel — the same split already used for `toRaceChartData` /
`RaceChart` in this feature.

**Tech Stack:** Next.js 15 App Router (server component), TypeScript strict, Tailwind v4
(`@utility` classes already defined in `apps/web/src/app/globals.css`), Vitest for unit tests.

## Global Constraints

- TypeScript strict: no `any`, no untyped dicts, no unsafe casts. Use the branded types already
  exported from `@cup/engine` (`UserId`, `Points`).
- Cross-feature access only through a feature's `index.ts` barrel — never import from another
  feature's internal files.
- No new comments unless they explain non-obvious WHY (this repo's default is no comments).
- Tests before implementation (red → green) for the domain function.
- **One commit for the whole feature** — this project's convention (`CLAUDE.md` "Incremental
  delivery") is one commit per feature including implementation + tests + docs. Do not commit after
  each task; commit once at the end of Task 3.
- Format/lint/typecheck must pass before the final commit.

---

### Task 1: Domain function `buildCategoryBreakdown`

**Files:**

- Create: `apps/web/src/features/pool-archive/domain/category-breakdown.ts`
- Test: `apps/web/src/features/pool-archive/domain/category-breakdown.test.ts`

**Interfaces:**

- Consumes: `PoolArchiveEntryView` (from `./types` — already has `userId: UserId | null`,
  `displayName: string`, `breakdown: ScoreBreakdown`), `UserId` and `Points` from `@cup/engine`.
- Produces (used by Task 2 and Task 3):

  ```ts
  export type CategoryBreakdownCell = {
    userId: UserId | null;
    displayName: string;
    isCurrentUser: boolean;
    points: Points;
    isLeader: boolean;
  };

  export type CategoryBreakdownRow = {
    key: keyof Omit<ScoreBreakdown, 'total'>;
    label: string;
    cells: CategoryBreakdownCell[];
  };

  export function buildCategoryBreakdown(
    entries: PoolArchiveEntryView[],
    viewerUserId: UserId | null,
  ): CategoryBreakdownRow[];
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/pool-archive/domain/category-breakdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildCategoryBreakdown } from './category-breakdown';
import type { PoolArchiveEntryView } from './types';
import { userId, points } from '@cup/engine';
import type { ScoreBreakdown } from '@cup/engine';

function mkBreakdown(
  partial: Partial<Record<keyof Omit<ScoreBreakdown, 'total'>, number>> = {},
): ScoreBreakdown {
  const g = partial.groupMatches ?? 0;
  const go = partial.groupOrder ?? 0;
  const r16 = partial.roundOf16 ?? 0;
  const r8 = partial.roundOf8 ?? 0;
  const tfTeams = partial.topFourTeams ?? 0;
  const tfPosition = partial.topFourPosition ?? 0;
  const fn = partial.final ?? 0;
  const br = partial.bronze ?? 0;
  const sp = partial.specials ?? 0;
  return {
    groupMatches: points(g),
    groupOrder: points(go),
    roundOf16: points(r16),
    roundOf8: points(r8),
    topFour: points(tfTeams + tfPosition),
    topFourTeams: points(tfTeams),
    topFourPosition: points(tfPosition),
    final: points(fn),
    bronze: points(br),
    specials: points(sp),
    total: points(g + go + r16 + r8 + tfTeams + tfPosition + fn + br + sp),
  };
}

function mkEntry(id: string, name: string, breakdown: ScoreBreakdown): PoolArchiveEntryView {
  return {
    userId: userId(id),
    displayName: name,
    rank: 1,
    pointsTotal: breakdown.total,
    breakdown,
    pointsHistory: null,
    stageReasons: null,
  };
}

describe('buildCategoryBreakdown', () => {
  it('returns one row per scoring category, in a fixed order, with a cell per entry', () => {
    const entries = [
      mkEntry('u1', 'Alice', mkBreakdown({ groupMatches: 10 })),
      mkEntry('u2', 'Bob', mkBreakdown({ groupMatches: 20 })),
    ];
    const rows = buildCategoryBreakdown(entries, null);
    expect(rows.map((r) => r.key)).toEqual([
      'groupMatches',
      'groupOrder',
      'roundOf16',
      'roundOf8',
      'topFourTeams',
      'topFourPosition',
      'final',
      'bronze',
      'specials',
    ]);
    expect(rows.map((r) => r.label)).toEqual([
      'Group Matches',
      'Group Order',
      'Round of 16',
      'QF',
      'SF · Teams',
      'SF · Position',
      'Final',
      'Bronze',
      'Special Bets',
    ]);
    expect(rows[0]?.cells).toHaveLength(2);
  });

  it('marks the single highest scorer in a row as the leader', () => {
    const entries = [
      mkEntry('u1', 'Alice', mkBreakdown({ groupMatches: 10 })),
      mkEntry('u2', 'Bob', mkBreakdown({ groupMatches: 20 })),
    ];
    const rows = buildCategoryBreakdown(entries, null);
    const groupMatches = rows.find((r) => r.key === 'groupMatches')!;
    expect(groupMatches.cells.map((c) => ({ name: c.displayName, isLeader: c.isLeader }))).toEqual([
      { name: 'Alice', isLeader: false },
      { name: 'Bob', isLeader: true },
    ]);
  });

  it('marks every entry tied at the max as a leader', () => {
    const entries = [
      mkEntry('u1', 'Alice', mkBreakdown({ topFourTeams: 15 })),
      mkEntry('u2', 'Bob', mkBreakdown({ topFourTeams: 15 })),
      mkEntry('u3', 'Carol', mkBreakdown({ topFourTeams: 5 })),
    ];
    const rows = buildCategoryBreakdown(entries, null);
    const row = rows.find((r) => r.key === 'topFourTeams')!;
    expect(row.cells.map((c) => c.isLeader)).toEqual([true, true, false]);
  });

  it('marks no one as leader when every entry scored 0 in a category', () => {
    const entries = [
      mkEntry('u1', 'Alice', mkBreakdown({})),
      mkEntry('u2', 'Bob', mkBreakdown({})),
    ];
    const rows = buildCategoryBreakdown(entries, null);
    expect(rows.every((r) => r.cells.every((c) => !c.isLeader))).toBe(true);
  });

  it('renames the viewer to "You" and flags isCurrentUser, leaving others untouched', () => {
    const entries = [
      mkEntry('u1', 'Alice', mkBreakdown({ groupMatches: 10 })),
      mkEntry('u2', 'Bob', mkBreakdown({ groupMatches: 20 })),
    ];
    const rows = buildCategoryBreakdown(entries, userId('u2'));
    const groupMatches = rows.find((r) => r.key === 'groupMatches')!;
    expect(groupMatches.cells).toEqual([
      {
        userId: userId('u1'),
        displayName: 'Alice',
        isCurrentUser: false,
        points: 10,
        isLeader: false,
      },
      { userId: userId('u2'), displayName: 'You', isCurrentUser: true, points: 20, isLeader: true },
    ]);
  });

  it('treats a null viewerUserId as no current user (no "You" renaming)', () => {
    const entries = [mkEntry('u1', 'Alice', mkBreakdown({ groupMatches: 10 }))];
    const rows = buildCategoryBreakdown(entries, null);
    expect(rows[0]?.cells[0]?.displayName).toBe('Alice');
    expect(rows[0]?.cells[0]?.isCurrentUser).toBe(false);
  });

  it('returns 9 empty-cell rows for an empty pool', () => {
    const rows = buildCategoryBreakdown([], null);
    expect(rows).toHaveLength(9);
    expect(rows.every((r) => r.cells.length === 0)).toBe(true);
  });

  it('handles guest entries with a null userId as any other cell', () => {
    const entries = [
      mkEntry('u1', 'Alice', mkBreakdown({ groupMatches: 10 })),
      { ...mkEntry('u2', 'Guest', mkBreakdown({ groupMatches: 30 })), userId: null },
    ];
    const rows = buildCategoryBreakdown(entries, null);
    const groupMatches = rows.find((r) => r.key === 'groupMatches')!;
    expect(groupMatches.cells[1]).toEqual({
      userId: null,
      displayName: 'Guest',
      isCurrentUser: false,
      points: 30,
      isLeader: true,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/pool-archive/domain/category-breakdown.test.ts`
Expected: FAIL — `category-breakdown.ts` doesn't exist yet (`Cannot find module './category-breakdown'`).

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/features/pool-archive/domain/category-breakdown.ts`:

```ts
import type { UserId, Points, ScoreBreakdown } from '@cup/engine';
import type { PoolArchiveEntryView } from './types';

export type CategoryBreakdownCell = {
  userId: UserId | null;
  displayName: string;
  isCurrentUser: boolean;
  points: Points;
  isLeader: boolean;
};

export type CategoryBreakdownRow = {
  key: keyof Omit<ScoreBreakdown, 'total'>;
  label: string;
  cells: CategoryBreakdownCell[];
};

const CATEGORY_ROWS: ReadonlyArray<{
  key: keyof Omit<ScoreBreakdown, 'total'>;
  label: string;
}> = [
  { key: 'groupMatches', label: 'Group Matches' },
  { key: 'groupOrder', label: 'Group Order' },
  { key: 'roundOf16', label: 'Round of 16' },
  { key: 'roundOf8', label: 'QF' },
  { key: 'topFourTeams', label: 'SF · Teams' },
  { key: 'topFourPosition', label: 'SF · Position' },
  { key: 'final', label: 'Final' },
  { key: 'bronze', label: 'Bronze' },
  { key: 'specials', label: 'Special Bets' },
];

export function buildCategoryBreakdown(
  entries: PoolArchiveEntryView[],
  viewerUserId: UserId | null,
): CategoryBreakdownRow[] {
  return CATEGORY_ROWS.map(({ key, label }) => {
    const max = entries.reduce((m, e) => Math.max(m, e.breakdown[key]), 0);

    const cells: CategoryBreakdownCell[] = entries.map((entry) => {
      const isCurrentUser = viewerUserId !== null && entry.userId === viewerUserId;
      return {
        userId: entry.userId,
        displayName: isCurrentUser ? 'You' : entry.displayName,
        isCurrentUser,
        points: entry.breakdown[key],
        isLeader: max > 0 && entry.breakdown[key] === max,
      };
    });

    return { key, label, cells };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web exec vitest run src/features/pool-archive/domain/category-breakdown.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no errors.

---

### Task 2: UI component `ArchiveCategoryBreakdownPanel`

**Files:**

- Create: `apps/web/src/features/pool-archive/ui/ArchiveCategoryBreakdownPanel.tsx`

**Interfaces:**

- Consumes: `CategoryBreakdownRow` from `../domain/category-breakdown` (Task 1's output type —
  do not recompute inside this component; it is purely presentational, mirroring
  `ArchiveLeadChangesPanel`'s `{ leadChanges: LeadChangeEvent[] }` prop shape).
- Produces: `ArchiveCategoryBreakdownPanel` component, consumed by Task 3.

- [ ] **Step 1: Write the component**

Create `apps/web/src/features/pool-archive/ui/ArchiveCategoryBreakdownPanel.tsx`:

```tsx
import type { ReactElement } from 'react';
import { cn } from '@/shared/ui';
import type { CategoryBreakdownRow } from '../domain/category-breakdown';

type Props = { rows: CategoryBreakdownRow[] };

const LABEL_COL_WIDTH = 148;
const MEMBER_COL_WIDTH = 88;

export function ArchiveCategoryBreakdownPanel({ rows }: Props): ReactElement | null {
  const header = rows[0]?.cells;
  if (!header || header.length === 0) return null;

  const colTemplate = `${LABEL_COL_WIDTH}px repeat(${header.length}, ${MEMBER_COL_WIDTH}px)`;

  return (
    <div className="card" data-testid="archive-category-breakdown-panel">
      <span className="section-label block p-4 pb-0">Score breakdown · by category</span>
      <div className="overflow-x-auto mt-3">
        <div className="min-w-max">
          <div
            className="grid gap-1 border-b border-line"
            style={{ gridTemplateColumns: colTemplate }}
          >
            <div className="sticky left-0 z-10 bg-surface" />
            {header.map((cell) => (
              <span
                key={cell.userId ?? cell.displayName}
                className={cn(
                  'text-[11px] font-bold text-center py-2 px-1 truncate',
                  cell.isCurrentUser ? 'text-green-700' : 'text-ink-muted',
                )}
              >
                {cell.displayName}
              </span>
            ))}
          </div>

          <div className="divide">
            {rows.map((row) => (
              <div
                key={row.key}
                className="grid gap-1 items-center"
                style={{ gridTemplateColumns: colTemplate }}
              >
                <span className="sticky left-0 z-10 bg-surface text-[12px] font-bold text-ink py-2 px-3">
                  {row.label}
                </span>
                {row.cells.map((cell) => (
                  <span
                    key={cell.userId ?? cell.displayName}
                    className={cn(
                      'display tnum text-center text-[13px] py-2',
                      cell.isLeader
                        ? 'bg-green-050 text-green-700 font-bold'
                        : cell.points > 0
                          ? 'text-ink font-bold'
                          : 'text-ink-muted',
                    )}
                  >
                    {cell.points}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web exec eslint src/features/pool-archive/ui/ArchiveCategoryBreakdownPanel.tsx`
Expected: no errors. (No component test file — matches this codebase's existing convention for
sibling archive panels, e.g. `ArchiveLeadChangesPanel`, `ArchivePoolStatsPanel`, none of which have
`.test.tsx` counterparts; the domain-level logic is what Task 1 already tests.)

---

### Task 3: Wire into the feature barrel and the archive page

**Files:**

- Modify: `apps/web/src/features/pool-archive/index.ts`
- Modify: `apps/web/src/app/(authenticated)/pools/[id]/archive/page.tsx`

**Interfaces:**

- Consumes: `buildCategoryBreakdown` (Task 1), `ArchiveCategoryBreakdownPanel` (Task 2).

- [ ] **Step 1: Export the new pieces from the feature barrel**

In `apps/web/src/features/pool-archive/index.ts`, add:

```ts
export { buildCategoryBreakdown } from './domain/category-breakdown';
export type { CategoryBreakdownRow, CategoryBreakdownCell } from './domain/category-breakdown';
```

and:

```ts
export { ArchiveCategoryBreakdownPanel } from './ui/ArchiveCategoryBreakdownPanel';
```

(Add these next to the existing `export { toRaceChartData } ...` and
`export { ArchivePoolStatsPanel } ...` lines respectively, keeping the file's existing
domain-exports-then-ui-exports grouping.)

- [ ] **Step 2: Compute the rows and render the panel in the archive page**

In `apps/web/src/app/(authenticated)/pools/[id]/archive/page.tsx`:

Add `buildCategoryBreakdown` and `ArchiveCategoryBreakdownPanel` to the existing
`@/features/pool-archive` import (around line 12-22):

```ts
import {
  getPoolArchiveView,
  ArchivePoolCard,
  ArchiveMemberRow,
  ArchiveHeroCard,
  ArchiveHighlightsPanel,
  ArchiveLeadChangesPanel,
  ArchiveCategoryBreakdownPanel,
  ArchiveStatTiles,
  ArchivePoolStatsPanel,
  buildCategoryBreakdown,
  toRaceChartData,
} from '@/features/pool-archive';
```

Next to the existing `raceChartData` line (around line 66):

```ts
const raceChartData = archive ? toRaceChartData(archive, actor.userId) : null;
const categoryBreakdown = archive ? buildCategoryBreakdown(archive.entries, actor.userId) : [];
```

Insert the panel between the two-column grid and the per-member list (between the closing `</div>`
of the `md:grid-cols-[1fr_320px]` grid and the `<div className="flex flex-col gap-3">` that holds
`ArchiveMemberRow`s, i.e. right after line 115's closing `</div>` in the current file):

```tsx
          <ArchiveCategoryBreakdownPanel rows={categoryBreakdown} />

          <div className="flex flex-col gap-3">
```

- [ ] **Step 3: Typecheck, lint, and run the full test suite**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: no errors.

Run: `pnpm --filter web exec eslint src/features/pool-archive src/app/\(authenticated\)/pools/\[id\]/archive/page.tsx`
Expected: no errors.

Run: `pnpm --filter web exec vitest run src/features/pool-archive`
Expected: all pool-archive tests pass, including the new `category-breakdown.test.ts`.

- [ ] **Step 4: Manual check in the browser**

Start the dev server (`pnpm --filter web dev`) if not already running, sign in, and open
`/pools/<id>/archive` for a pool that has been archived and has more than one member. Confirm:

- The new "Score breakdown · by category" card renders below the stats/highlights grid and above
  the per-member accordion list.
- Each row's highest scorer (or tied scorers) is highlighted in green.
- The current user's column header reads "You" in green.
- The table scrolls horizontally without breaking layout when there are many members.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/pool-archive/domain/category-breakdown.ts \
        apps/web/src/features/pool-archive/domain/category-breakdown.test.ts \
        apps/web/src/features/pool-archive/ui/ArchiveCategoryBreakdownPanel.tsx \
        apps/web/src/features/pool-archive/index.ts \
        "apps/web/src/app/(authenticated)/pools/[id]/archive/page.tsx" \
        docs/superpowers/specs/2026-07-22-archive-category-breakdown-design.md \
        docs/superpowers/plans/2026-07-22-archive-category-breakdown.md
git commit -m "feat(pool-archive): add score breakdown by category comparison table"
```
