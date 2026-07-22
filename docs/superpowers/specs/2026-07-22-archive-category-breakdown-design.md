# Archive score breakdown by category — design

**Date:** 2026-07-22
**Status:** Approved, not yet implemented

## Problem

The pool archive page (`apps/web/src/app/(authenticated)/pools/[id]/archive/page.tsx`) shows each
member's score breakdown as an individual accordion card (`ArchiveMemberRow` →
`ScoreBreakdownCard`, one per member, stacked vertically). There's no way to compare members
side-by-side within a single category (e.g. "who scored best on Group Order?") without opening
every card.

## Goal

Add a single table to the archive page showing every scoring category as a row and every member as
a column, so members can be compared category-by-category at a glance. The category leader(s) in
each row are visually highlighted. Mockup reference: user-provided screenshot, "SCORE BREAKDOWN · BY
CATEGORY".

## Data

`PoolArchiveView.entries` (`PoolArchiveEntryView[]`) already carries each member's full
`breakdown: ScoreBreakdown` — no new data fetching or schema changes are needed.

## Domain logic

New pure function in `features/pool-archive/domain/category-breakdown.ts`:

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
  currentUserId: UserId | undefined,
): CategoryBreakdownRow[];
```

- Category order/labels (9 rows): Group Matches, Group Order, Round of 16, QF, SF · Teams,
  SF · Position, Final, Bronze, Special Bets — same keys and labels as
  `results/ui/ScoreBreakdownCard`'s `ROWS`, but defined locally in pool-archive rather than imported.
  `score-breakdown-utils.ts` and `ScoreBreakdownCard`'s `ROWS` are private to the `results` feature
  (not exported from its `index.ts`), so pool-archive must not reach into them — each feature owns
  its internals per the vertical-slice rule. The 9-entry list is small and stable; duplicating it
  locally is cheaper than promoting it to `shared/` for two call sites with different row shapes
  (one needs scoring hints, the other doesn't).
- `isLeader`: true for every cell tied at that row's maximum `points`, but only when the maximum is
  greater than 0 (an all-zero row highlights no one — avoids highlighting every cell in, say, a
  Bronze row where nobody scored).
- `isCurrentUser`: `entry.userId === currentUserId`, same convention as
  `results/ui/score-breakdown-utils.ts`'s `deriveTopByCategory`.
- Member/column order follows `entries` order as already ranked by `PoolArchiveView` (no re-sorting).

## UI component

New `ArchiveCategoryBreakdownPanel` in `features/pool-archive/ui/`, server component (static —
no accordion/expand state, unlike `ScoreBreakdownCard`, since the table itself is always the full
view).

- Card wrapper with `section-label` eyebrow: "Score breakdown · by category" — same header
  convention as `ArchivePoolStatsPanel`.
- CSS grid table with a sticky left column (category labels) and horizontally-scrollable member
  columns to the right, using the same sticky-column CSS technique as
  `results/ui/MatrixTable.tsx` (`sticky left-0 z-10 bg-surface`). Not reusing `MatrixTable` itself:
  its shape is one row per player with one column per match/item — the opposite orientation from
  what this table needs (one row per category, one column per player).
- Header row: plain member display names (no avatars, per the mockup); current user's column
  styled distinctly (green + bold), matching the "YOU" treatment used elsewhere in this app.
- Data cell styling, mirroring `ScoreBreakdownCard`'s existing pts>0/pts=0 convention:
  - Leader cell: light-green cell background (`bg-green-050`) + bold green text (`text-green-700`).
  - Non-leader, non-zero cell: bold ink text (`text-ink`).
  - Zero cell: muted text (`text-ink-muted`), no background.

## Placement

Full-width, inserted into `archive/page.tsx` between the existing two-column
stats/highlights grid (`ArchivePoolStatsPanel` / `ArchiveHighlightsPanel` /
`ArchiveLeadChangesPanel`) and the per-member `ArchiveMemberRow` list.

## Exports

Add `ArchiveCategoryBreakdownPanel` and `buildCategoryBreakdown` (+ its row/cell types, if useful
to consumers) to `features/pool-archive/index.ts`.

## Testing

- Unit tests for `buildCategoryBreakdown`: row order/labels match the 9 categories, leader flags
  including ties (multiple members at the same max), zero-max rows have no leader, `isCurrentUser`
  mapping, entries with `userId: null` (guest/legacy entries) handled like any other cell.
- No new component/snapshot test for `ArchiveCategoryBreakdownPanel` — matches this codebase's
  existing convention for sibling archive panels (`ArchiveLeadChangesPanel`,
  `ArchivePoolStatsPanel`, etc.), which have no `.test.tsx` counterparts; behavior is verified at
  the pure-function level.
- No changes needed to existing `get-pool-archive` / `archive-pool` tests — no new data is fetched
  or persisted.

## Out of scope

- No changes to per-member `ScoreBreakdownCard` accordions — they stay as-is.
- No new database columns/migrations — all data already exists in `ScoreBreakdown`.
- No mobile-specific layout beyond horizontal scroll (consistent with how `MatrixTable` already
  handles overflow elsewhere in the app).
