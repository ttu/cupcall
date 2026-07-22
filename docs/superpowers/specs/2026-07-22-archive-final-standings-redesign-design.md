# Archive final standings redesign — design

**Date:** 2026-07-22
**Status:** Approved, not yet implemented

## Problem

The pool archive page (`apps/web/src/app/(authenticated)/pools/[id]/archive/page.tsx`) renders each
member as a stacked `ArchiveMemberRow`: rank + name + total on one line, with a nested
`ScoreBreakdownCard` accordion (its own "Score breakdown" header and chevron) underneath. This reads
as two separate cards glued together rather than one ranked list. The user supplied two mockups:

1. A compact "Final standings" list — rank (medal-colored for top 3), avatar, name, a "YOU" badge
   for the current user, points — one row per member, current-user row highlighted.
2. Clicking a row expands it in place into a score breakdown: avatar/name/badge/total header, then
   one row per scoring category with a label, a scoring-rule hint, a green progress bar showing
   points earned vs. that category's max, and the points earned.

## Goal

Redesign the member list on the archive page to match both mockups, reusing existing design-system
primitives rather than inventing new visual language.

## Existing primitives being reused (not rebuilt)

- `lb-row` / `lb-rank` (`.t1`/`.t2`/`.t3` for gold/silver/bronze) / `lb-pts` — CSS utilities already
  used for the marketing homepage's decorative leaderboard demo (`apps/web/src/app/page.tsx`).
- `.chip.green` "YOU" badge — used today in `PredictionIdentityCell` and `MatrixTable`.
- `.bar` CSS utility (track + `<i style={{ width }}>` fill) — used today by
  `features/predictions/ui/CompletionBar.tsx`.
- `shared/ui/Avatar.tsx` — colored circular initials, cycling a 6-color palette by index.
- `computeRemainingMaxPoints` (`packages/engine/src/scoring/remaining-max.ts`) — already used
  elsewhere (`results/application/build-race-view.ts`, `get-results-view.ts`) via
  `computeRemainingMaxPoints(def, { finalMatchIds: new Set() })` to get the _absolute_ max points
  per scoring category (tournament structure is fixed regardless of progress, so an empty
  `finalMatchIds` set yields the full theoretical max, not the "remaining" max).

## Bug fix in scope: `Avatar` initials

`shared/ui/Avatar.tsx`'s `initials()`:

```ts
return (first[0] ?? '' + (second[0] ?? '')).toUpperCase();
```

`+` binds tighter than `??`, so this evaluates as `first[0] ?? (second[0] ?? '')` — for any non-empty
first word, `first[0]` is never nullish, so the second word's initial is silently dropped. Multi-word
names always render a single-letter avatar ("Marko V." → "M" instead of "MV"). The mockup explicitly
relies on two-letter initials for multi-word names, so this is directly in scope. Fix:

```ts
return ((first[0] ?? '') + (second[0] ?? '')).toUpperCase();
```

This is a shared component — the fix also corrects initials everywhere else `Avatar` renders
multi-word names (live pool `Leaderboard`, homepage demo), not just the archive page.

## New shared component: `AvatarNameBadge`

The "avatar + name + optional YOU chip" composition already exists near-identically twice:
`results/ui/PredictionIdentityCell.tsx` and inline inside `results/ui/MatrixTable.tsx`. Adding a
third copy for the archive standings row crosses the "multiple real use cases" bar in CLAUDE.md for
promoting to `shared/`.

- New `shared/ui/AvatarNameBadge.tsx`:
  ```ts
  type Props = {
    name: string;
    avatarIndex: number;
    isCurrentUser: boolean;
    size?: number; // default 28, matches PredictionIdentityCell's current size
  };
  ```
  Renders `Avatar` + name (bold, green when `isCurrentUser`) + `.chip.green` "YOU" badge when
  `isCurrentUser`.
- `PredictionIdentityCell` becomes a thin wrapper delegating to `AvatarNameBadge` (same rendered
  output, `testId`/`className` props preserved) — behavior-preserving refactor, covered by that
  component's existing tests if any exist, otherwise verified by not changing its exported props.
- `MatrixTable.tsx`'s inline copy is **left untouched** — its avatar and name live in separate sticky
  grid cells, so consolidating it isn't a clean fit and would be an unrelated structural change.

## New pool-archive components

Both new, in `features/pool-archive/ui/`, replacing `ArchiveMemberRow` (deleted):

### `ArchiveStandingsPanel` (server component)

- Card wrapper (`card p-4`) with a header row: `section-label` "Final standings" on the left,
  small muted "Points" label on the right — mirrors the mockup's column header bar.
- Renders one `ArchiveStandingRow` per `archive.entries` item, in existing rank order (no
  re-sorting), separated by `border-line-soft` dividers (no per-row card borders — one continuous
  list, matching the mockup).
- Props: `entries: PoolArchiveEntryView[]`, `currentUserId: UserId | undefined`, `scoring: Scoring |
null`, `categoryMax: ScoreBreakdown | null`.

### `ArchiveStandingRow` (client component — needs local expand/collapse state)

- Props: `entry: PoolArchiveEntryView`, `rank: number`, `avatarIndex: number`, `isCurrentUser:
boolean`, `scoring: Scoring | null`, `categoryMax: ScoreBreakdown | null`.
- Independent expand state per row (`useState`, not shared/coordinated across rows) — matches
  today's `ScoreBreakdownCard` behavior; multiple rows can be open at once.
- **Collapsed:** `lb-row` grid — `lb-rank` (with `.t1`/`.t2`/`.t3` for ranks 1–3) + `AvatarNameBadge`
  - `lb-pts`. `bg-green-050` on the row when `isCurrentUser` (same convention as `LeaderboardRow`).
- **Expanded:** header strip — `AvatarNameBadge` + total points + a collapse chevron (same rotate-
  on-expand SVG already used in `ScoreBreakdownCard`) — same `bg-green-050` treatment when
  `isCurrentUser`. Below: one row per scoring category (label, `scoring` hint text, progress bar,
  points), using the same 9 categories/labels/hints as `ScoreBreakdownCard`'s `ROWS`, but defined
  locally in this file — `results/ui/ScoreBreakdownCard`'s `ROWS` isn't exported from that feature's
  barrel, so pool-archive can't import it (vertical-slice boundary); duplicating a small, stable
  9-entry list is cheaper than promoting it for two features with different row shapes (this one
  needs a category max for the bar, `ScoreBreakdownCard` doesn't).
- Progress bar: `.bar` track + `<i style={{ width: pct }}>` fill, where
  `pct = categoryMax ? clamp(points / categoryMax[key], 0, 1) * 100% : 0%`. If `categoryMax` is
  `null` (defensive — tournament definition unavailable), rows render without a bar, points-only.

## `archive/page.tsx` changes

- Compute `categoryMax = def ? computeRemainingMaxPoints(def, { finalMatchIds: new Set() }) : null`
  once, alongside the existing `final` derivation (same `def` already loaded there).
- Replace the trailing `archive.entries.map(ArchiveMemberRow)` block with a single
  `<ArchiveStandingsPanel entries={archive.entries} currentUserId={actor.userId} scoring={scoring}
categoryMax={categoryMax} />`.
- `avatarIndex` per row = its index within `archive.entries` (already rank-ordered), same convention
  as `LeaderboardRow`'s `avatarIndex` prop.

## Exports

Add `ArchiveStandingsPanel` (not `ArchiveStandingRow`, kept private to the panel) to
`features/pool-archive/index.ts`, replacing the `ArchiveMemberRow` export. Add `AvatarNameBadge` to
`shared/ui/index.ts`.

## Testing

- New `shared/ui/Avatar.test.tsx`: single-word name → first 2 chars; two-word name → first char of
  each word (red before the fix, green after); confirms the operator-precedence bug is actually
  fixed rather than coincidentally passing.
- No new component test for `ArchiveStandingsPanel`/`ArchiveStandingRow` — matches this codebase's
  existing convention for sibling archive panels (`ArchiveLeadChangesPanel`, `ArchivePoolStatsPanel`,
  etc.), none of which have `.test.tsx` counterparts.
- No changes needed to `get-pool-archive`/`archive-pool` tests — no new data is fetched or persisted;
  `categoryMax` is derived page-side from data already loaded for the final-match card.

## Out of scope

- The separate "score breakdown by category" comparison table
  (`docs/superpowers/specs/2026-07-22-archive-category-breakdown-design.md`) — kept independent, not
  implemented as part of this work.
- No new database columns/migrations.
- No changes to `MatrixTable.tsx`'s inline avatar/name/badge markup.
- No mobile-specific layout beyond what `lb-row`/existing responsive classes already provide.
