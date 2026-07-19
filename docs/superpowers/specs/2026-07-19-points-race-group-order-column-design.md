# Points Race — Group Order Column

**Date:** 2026-07-19

## Problem

The "By group stage" sub-tab of Points Race (`MatchMatrix`, under `PointsRaceTab`) shows one column
per group-stage match plus a rightmost "Total" column. That Total is computed purely from per-match
hit points (`build-race-view.ts::buildMatchMatrix`) — it silently excludes each player's group-order
(standings) points, which have no representation in this table at all. A player who's actually ahead
once standings points are counted can appear behind here, and sorting uses this incomplete total.

## Goal

Add a "Standings" column to the group-stage matrix showing each player's group-order points, and make
Total the true grand total (match points + standings points), sorted accordingly.

## Design

### Data — `buildMatchMatrix` (`application/build-race-view.ts`)

`LeaderboardEntry.breakdown.groupOrder` is already fetched for every row passed into
`buildMatchMatrix` — no new domain/scoring logic needed. For each leaderboard entry:

```ts
const groupOrderPoints = e.breakdown?.groupOrder ?? 0;
// ...
totalPoints: matchPoints + groupOrderPoints, // was: matchPoints only
groupOrderPoints,
```

Sorting stays `matchMatrix.toSorted((a, b) => b.totalPoints - a.totalPoints)` — unchanged code, but
now sorts by the grand total.

### Type — `MatchMatrixEntry` (`domain/types.ts`)

Add a field:

```ts
export type MatchMatrixEntry = {
  userId: string;
  displayName: string;
  isCurrentUser: boolean;
  cells: MatchMatrixCell[];
  /** Group-order (standings) points, shown in the "Standings" column ahead of Total. */
  groupOrderPoints: number;
  totalPoints: number;
};
```

### `MatrixTable` (`ui/MatrixTable.tsx`) — optional extra column slot

`MatrixTable` is shared by `MatchMatrix`, `KnockoutMatrix`, and `SpecialsMatrix`. Its grid is
currently hardcoded as `avatar | name | N match columns | Total`. Add an optional slot rendered just
before Total, so only `MatchMatrix` needs to use it:

```ts
extraColumn?: {
  header: ReactNode;
  width: number;
  renderCell: (row: MatrixTableEntry<Cell>) => ReactNode;
};
```

- `colTemplate` includes `${extraColumn.width}px` before the trailing `64px` Total column, only when
  `extraColumn` is present.
- Header row renders `extraColumn.header` between the match column headers and the "Total" label.
- Each `MatrixTableRow` renders `extraColumn.renderCell(row)` in the same slot.
- `KnockoutMatrix` and `SpecialsMatrix` pass nothing, so their layout and output are byte-for-byte
  unchanged.

### `MatchMatrix.tsx`

Supply the extra column:

- Header label: **"Standings"** — matches the wording already used in `GroupTable`'s per-group
  footer ("42 matches + 8 standings") and the `earnedBreakdown` design, rather than the domain field
  name `groupOrder`.
- Cell: plain right-aligned number (`row.groupOrderPoints`), styled like the Total digit (tabular
  figures), not like a match hit/miss cell — it isn't a hit/miss outcome, just a point value.
- Width: 56px (narrower than a match column's 52px + a little breathing room; same order of
  magnitude as Total's 64px).

## Testing

Update `apps/web/src/features/results/application/get-results-view.test.ts`:

- Extend the existing matchMatrix test(s) to assert `groupOrderPoints` on a row.
- Extend or add to `'sorts matchMatrix by totalPoints descending'` with a case where a user leads on
  match points alone but trails once standings points are included, to prove sorting now uses the
  grand total.

No engine-level tests needed — no scoring logic changes, only reads an already-computed value.

## Files changed

| File                                                    | Change                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `features/results/application/build-race-view.ts`       | `buildMatchMatrix`: fold `breakdown.groupOrder` into `totalPoints`; add `groupOrderPoints` |
| `features/results/domain/types.ts`                      | Add `groupOrderPoints` to `MatchMatrixEntry`                                               |
| `features/results/ui/MatrixTable.tsx`                   | Add optional `extraColumn` slot (header + per-row cell), rendered before Total             |
| `features/results/ui/MatchMatrix.tsx`                   | Pass `extraColumn` with "Standings" header and `groupOrderPoints` cell                     |
| `features/results/application/get-results-view.test.ts` | Cover `groupOrderPoints` and grand-total sorting                                           |

## Out of scope

- `KnockoutMatrix` / `SpecialsMatrix` — no visual or behavioral change.
- Any change to how group-order points are scored (engine).
- The Group Stage tab's `PointsSummaryPanel` "Earned" breakdown (already covers this at a summary
  level, separate feature).
