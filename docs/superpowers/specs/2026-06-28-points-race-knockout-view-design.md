# Points Race: By Knockout Match View

**Date:** 2026-06-28
**Status:** Approved

## Overview

Add a "By knockout" sub-tab to the Points Race tab, showing a flat scrollable matrix of all knockout matches with per-player winner-pick results. Companion to the existing "By group stage" matrix. Also renames the current "By match" sub-tab to "By group stage".

## User story

Pool members want to see, for every knockout match, which players correctly predicted the winner and which didn't pick (or picked wrong) — so they can understand how bracket picks are shaping the standings.

## Cell states

Four distinct states per cell:

| State     | Meaning               | Visual                                        |
| --------- | --------------------- | --------------------------------------------- |
| `hit`     | Correct winner picked | Green pill, shows points earned (e.g. `+5`)   |
| `miss`    | Wrong winner picked   | Grey pill, `·` dot                            |
| `no-pick` | No pick for this slot | Hollow/outlined pill, `—` dash                |
| `pending` | Match not yet played  | Outlined, shows pick team abbreviation or `·` |

`miss` and `no-pick` are visually distinct — the user can tell whether a player actively picked the wrong team vs made no pick at all.

## Architecture

### 1. DB layer — `packages/db`

**New function** `getKnockoutPicksByPool(db, poolId)` in `src/repositories/predictions.ts`:

```ts
export type PoolKnockoutPick = {
  userId: UserId;
  bracketMatchKey: BracketMatchKey;
  winnerTeamId: string;
};

export async function getKnockoutPicksByPool(
  db: Database,
  poolId: PoolId,
): Promise<PoolKnockoutPick[]>;
```

JOIN `predictions → prediction_knockout_picks`, filter by `poolId`. Mirrors `getGroupScoresByPool`. Exported from `@cup/db`.

### 2. Domain types — `results/domain/types.ts`

```ts
export type KnockoutMatchHit = 'hit' | 'miss' | 'no-pick' | 'pending';

export type KnockoutMatrixCell = {
  bracketMatchKey: string;
  hit: KnockoutMatchHit;
  points: number; // 0 for non-hits
};

export type KnockoutMatrixEntry = {
  userId: string;
  displayName: string;
  isCurrentUser: boolean;
  cells: KnockoutMatrixCell[];
  totalPoints: number; // sum of hit cell points
};

export type KnockoutMatrixMatch = {
  bracketMatchKey: string;
  round: string; // e.g. 'R32', 'R16', 'QF', 'SF', 'Final', 'Bronze'
  homeTeamId: string | null;
  homeTeamName: string | null;
  awayTeamId: string | null;
  awayTeamName: string | null;
  actualWinnerId: string | null;
  kickoff: string | null;
  status: 'scheduled' | 'final';
};
```

`PointsRaceView` gains:

```ts
knockoutMatrix: KnockoutMatrixEntry[];
knockoutMatrixMatches: KnockoutMatrixMatch[];  // sorted flat by kickoff, nulls last
```

### 3. Application layer — `results/application/build-race-view.ts`

`RaceParams` gains:

```ts
bracketRounds: BracketRoundResultView[];
bronzeMatch: KnockoutMatchView | null;
poolKnockoutPicks: PoolKnockoutPick[];
```

**`buildKnockoutMatrix`** (new function):

**Match metadata** — derived by flattening `bracketRounds` + `bronzeMatch` (already computed upstream in `getResultsView`). Each `KnockoutMatchView` provides all necessary fields; per-user pick data is stripped when projecting into `KnockoutMatrixMatch[]`. Sorted flat by kickoff (nulls last).

**Points per hit** — mapped from round label to `def.scoring`:

| Round                       | Scoring key                            |
| --------------------------- | -------------------------------------- |
| Entry round (R32 for WC-48) | `roundOf16` (team is now in R16)       |
| R16                         | `roundOf8`                             |
| QF                          | `topFour`                              |
| SF                          | `final` (winner advances to the Final) |
| Final                       | `final`                                |
| Bronze                      | `bronze`                               |

**Cell logic** per player per match:

- Match not final → `pending`, 0 pts
- Match final, no pick for `bracketMatchKey` → `no-pick`, 0 pts
- Match final, `pickedWinnerId === actualWinnerId` → `hit`, points from round mapping
- Match final, wrong pick → `miss`, 0 pts

`knockoutMatrix` sorted by `totalPoints` DESC.

### 4. Application layer — `results/application/get-results-view.ts`

- Add `getKnockoutPicksByPool(db, poolId)` to the parallel `Promise.all` fetch
- Pass `bracketRounds`, `bronzeMatch`, and `poolKnockoutPicks` into `buildPointsRaceView`

### 5. UI — `results/ui/KnockoutMatrix.tsx`

New component mirroring `MatchMatrix.tsx` structure:

- Outer `card overflow-x-auto` / `min-w-max` scroll wrapper
- **Header row**: round abbreviation + team abbreviations (once known), score if final, date if scheduled
- **Player rows**: sticky avatar, player name, cells, right-aligned `totalPoints`
- Current user row highlighted `bg-green-050`, sticky avatar inherits background
- **Empty state**: `"No knockout matches yet."` when `knockoutMatrixMatches` is empty

Column width: narrower than group matrix (no score prediction to display), ~48px per cell.

### 6. UI — `results/ui/PointsRaceTab.tsx`

- `RaceSubTab` type: `'race' | 'by-group' | 'by-knockout'`
- Button labels: `Race` / `By group stage` / `By knockout`
- `data-testid` attributes: `points-race-subtab-race`, `points-race-subtab-by-group`, `points-race-subtab-by-knockout`
- Renders `KnockoutMatrix` when `by-knockout` active

## Testing

- **Unit:** `buildKnockoutMatrix` — hit/miss/no-pick/pending cell derivation, points mapping per round, sorting
- **Integration:** `getKnockoutPicksByPool` — returns picks for pool members only, correct shape
- **Integration:** `buildPointsRaceView` with knockout data flows through to `PointsRaceView`
- No new E2E tests (existing critical-path coverage unchanged)

## Out of scope

- Per-match points breakdown in the total column tooltip
- Filtering by round
- Showing predicted team name in pending cells (team abbreviation only)
