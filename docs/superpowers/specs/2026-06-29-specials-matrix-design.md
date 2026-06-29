# Specials matrix — Points Race sub-tab

**Date:** 2026-06-29
**Status:** Approved

## Overview

Add a **"Specials"** sub-tab to the Points Race section, alongside the existing Race / By group stage / By knockout sub-tabs. The new tab shows a matrix where rows are pool members (sorted by total specials points descending) and columns are special bets. Each cell displays the member's abbreviated pick with hit/miss/pending styling, making it easy to see who got which special bets correct.

## Data layer

### New types (`domain/types.ts`)

```typescript
export type SpecialsMatrixCell = {
  betKey: string;
  hit: 'hit' | 'missed' | 'pending' | 'no-pick';
  points: number;
  pickLabel: string | null; // abbreviated pick for cell display
};

export type SpecialsMatrixEntry = {
  userId: string;
  displayName: string;
  isCurrentUser: boolean;
  cells: SpecialsMatrixCell[];
  totalPoints: number;
};

export type SpecialsMatrixBet = {
  betKey: string;
  label: string; // full label for column header tooltip / title
  points: number;
  kind: 'player' | 'team' | 'number' | 'bool';
  actualPickLabel: string | null; // correct answer abbreviation, null while pending
};
```

### `PointsRaceView` additions

```typescript
specialsMatrix: SpecialsMatrixEntry[];
specialsMatrixBets: SpecialsMatrixBet[];
```

### `buildSpecialsMatrix()` — new function in `build-race-view.ts`

Signature:

```typescript
function buildSpecialsMatrix(params: {
  leaderboard: LeaderboardEntry[];
  userId: string | null;
  poolSpecialBets: PoolSpecialBet[];
  actualResults: ActualResults;
  def: Tournament;
}): { specialsMatrix: SpecialsMatrixEntry[]; specialsMatrixBets: SpecialsMatrixBet[] };
```

Algorithm:

1. Call `getSpecialBetDefs(def.scoring)` to get all bet definitions; filter to those with `points > 0`.
2. Build lookup maps: `teamMap` (id → name), `playerMap` (id → name).
3. For each bet def, resolve `actualPickLabel`:
   - `finalDecidedByPenalties` → derive from `actualResults.finalMatch?.decidedBy`
   - `finalDecisiveGoalPlayer` → derive from `actualResults.finalMatch?.decisiveGoalPlayer`
   - Array-answer bets (`groupTopScoringTeam`, `groupTopConcedingTeam`, `tournamentTopScoringTeam`, `tournamentTopConcedingTeam`, `mostYellowCardsTeam`, `topScorerPlayer`) → join all values from `(actualResults.answers as Record<string,unknown[]>)[key]` using `" / "` (matches existing `buildSpecialBetResults` display logic)
   - Other bets → scalar from `(actualResults.answers as Record<string,unknown>)[key]`
   - Apply the same `makePickLabel` abbreviation to each resolved value.
   - `actualPickLabel` is `null` when the result is not yet available.
4. Build a `Map<userId, Map<betKey, value>>` index from `poolSpecialBets` for O(1) cell lookup.
5. For each leaderboard member, build cells:
   - Look up their raw pick value from the index.
   - Compute `hit`:
     - Bet unresolved + user has no pick → `'pending'`
     - Bet unresolved + user has a pick → `'pending'`
     - Bet resolved + user has no pick → `'no-pick'`
     - Array-answer bet resolved + pick is in the actual array → `'hit'`
     - Other bet resolved + pick equals actual → `'hit'`
     - Otherwise resolved → `'missed'`
   - Compute `pickLabel` from the raw value using the abbreviation rules below.
   - Accumulate `totalPoints` (only for `'hit'` cells).

6. Sort rows by `totalPoints` DESC.

### Pick label abbreviation

| Kind     | Raw value        | `pickLabel`                                                                |
| -------- | ---------------- | -------------------------------------------------------------------------- |
| `team`   | `"BRA"`          | `"BRA"` — use team ID directly (3-letter code)                             |
| `bool`   | `true`/`false`   | `"Y"` or `"N"`                                                             |
| `number` | `7`              | `"7"`                                                                      |
| `player` | player ID string | Last word of `playerMap` lookup, uppercased, max 6 chars (e.g. `"MBAPPE"`) |

If the pick value is null/undefined, `pickLabel` is `null` and `hit` is `'no-pick'` (if bet is resolved) or `'pending'` (if bet is still pending).

### `buildPointsRaceView` params change

Add two fields to `RaceParams`:

```typescript
poolSpecialBets: PoolSpecialBet[];
actualResults: ActualResults;
```

`get-results-view.ts` already fetches both; they are passed through to `buildPointsRaceView`, which calls `buildSpecialsMatrix` internally.

## UI layer

### `SpecialsMatrix.tsx` (new file)

Follows the same grid pattern as `KnockoutMatrix.tsx`:

- **Grid template:** `50px 150px repeat(N, 56px) 64px`
  - 56px columns (slightly wider than KO matrix's 48px, to accommodate "Yes"/"No" and longer player abbreviations)
- **Sticky avatar column** (same pattern as other matrices)
- **Column headers:** bet `label` shown in two wrapped lines at 10px, `points` value below, and `actualPickLabel` badge (green chip) once resolved — so you can see the correct answer at a glance
- **Cells:**
  - **`hit`:** green background (`bg-green-500`), `+{points}` text
  - **`missed`:** muted surface background, shows `pickLabel` (dimmed), identical to KO miss style
  - **`pending` with pick:** bordered cell (`shadow-[inset_0_0_0_1px_var(--line-strong)]`), shows `pickLabel`
  - **`pending` no pick:** `bg-surface-2`, shows `·`
  - **`no-pick`:** bordered cell, shows `—`
- **Total column:** rightmost, same style as other matrices
- **Empty state:** card with "No special bets configured." message
- **Leader blurb** below the card (same pattern as KO/match matrices)
- **Horizontal scroll:** card wraps in `overflow-x-auto` + `min-w-max` inner div

### `PointsRaceTab.tsx` changes

- Add `'by-specials'` to the `RaceSubTab` union type
- Add `{ 'by-specials': 'Specials' }` to `SUB_TAB_LABELS`
- Add the button to the sub-tab list
- Render `<SpecialsMatrix>` when `subTab === 'by-specials'`
- Pass `race.specialsMatrix` and `race.specialsMatrixBets` as props

## Tests

- Unit tests for `buildSpecialsMatrix` in `build-race-view.test.ts` (or a sibling file):
  - Hit detection for all bet kinds (team array-answer, scalar team, bool, number, player)
  - Pending state when no actual result yet
  - No-pick state for members who didn't submit a pick
  - `pickLabel` abbreviation for each kind
  - Rows sorted by totalPoints DESC
  - Bets with `points === 0` excluded from `specialsMatrixBets`

## Out of scope

- No changes to the top-level Specials tab (it continues to show the current user's per-bet detail view)
- No new DB queries — all data is already fetched by `getResultsView`
