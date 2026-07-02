# Design: Per-player "still available" in Projected final table

**Date:** 2026-07-02
**Feature area:** Results → Points Race tab → Projected final table

## Goal

Add a `+Avail` column to the Projected final table so every pool member can see, per player, how many points that player can still earn given their current picks. This lets players assess whether they can catch the leader, and how much runway each competitor has left.

## Scope

- `ProjectedEntry` domain type: add `canStillGet: number`
- `build-race-view.ts`: compute per-player `canStillGet` and pass it through `buildProjectedEntries`
- `ProjectedStandings.tsx`: add a 5th column `+Avail`
- New test coverage for the per-player computation

## Data model

### `ProjectedEntry` (domain/types.ts)

```ts
export type ProjectedEntry = {
  userId: string;
  displayName: string;
  isCurrentUser: boolean;
  currentPoints: number;
  currentRank: number;
  projectedPoints: number; // hit-rate extrapolation (unchanged)
  projectedRank: number;
  rankDelta: number;
  canStillGet: number; // NEW: max additional points this player can earn
};
```

### Per-player `canStillGet` computation

Three independent components, summed per player:

#### 1. Group remaining (same for all players)

```
groupRemaining = remainingMax.groupMatches + remainingMax.groupOrder
```

`remainingMax` is already computed in `buildPointsRaceView` from `computeRemainingMaxPoints(def, { finalMatchIds })`. No new DB queries needed.

#### 2. Knockout remaining (per-player)

New helper: `buildPerUserKnockoutRemaining(poolKnockoutPicks, allKnockoutMatches, hitPoints)`

For each pending knockout match (status !== 'final'):

- Look up the player's pick for that match (`pickedWinnerId`)
- If the player has no pick: 0 points for this match
- If match participants are both confirmed (`homeTeamId` and `awayTeamId` both non-null):
  - Viable iff `pickedWinnerId === homeTeamId || pickedWinnerId === awayTeamId`
- If either participant is still TBD (null slot):
  - Conservatively treat the pick as viable (cannot determine bust without tracing upstream)
- Viable picks contribute `hitPoints.get(bracketMatchKey) ?? 0`

Returns `Map<string, number>` (userId → knockout canStillGet).

The `hitPoints` map already exists as `buildHitPointsMap(def)` (private in `build-race-view.ts`).

The `allKnockoutMatches` list is assembled from `bracketRounds` + `bronzeMatch`, already available as a local in `buildKnockoutMatrix`; extract and share with `buildProjectedEntries`.

**Note on Final/Bronze:** For these ties, `deriveEffectivePick` already resolves the effective winner pick. For the "still available" computation we use the raw `poolKnockoutPicks` map (same as the rest of the matrix), which is consistent — if the finish score already determined the pick and the match is still pending, the effective pick is used.

#### 3. Specials remaining (per-player)

New helper: `buildPerUserSpecialsRemaining(poolSpecialBets, defs, actualResults)`

For each special bet definition with `points > 0`:

- Determine if the bet is resolved using `resolveActualForBet` (already exists, exported or duplicated)
- If unresolved: for each player who has a pick for this bet, add `d.points`
- If resolved: 0 (points already locked in as hit or missed)

Returns `Map<string, number>` (userId → specials canStillGet).

`defs` = `getSpecialBetDefs(def.scoring).filter(d => d.points > 0)` — already computed in `buildSpecialsMatrix`.

### `buildProjectedEntries` signature change

```ts
function buildProjectedEntries(
  leaderboard: LeaderboardEntry[],
  userId: string | null,
  stillLiveByUser: Map<string, number>,
  canStillGetByUser: Map<string, number>, // NEW
): ProjectedEntry[];
```

`canStillGetByUser` is built in `buildPointsRaceView` before calling `buildProjectedEntries`, from:

```ts
const groupRemaining = remainingMax.groupMatches + remainingMax.groupOrder;
const knockoutRemaining = buildPerUserKnockoutRemaining(
  poolKnockoutPicks,
  allKnockoutMatches,
  hitPoints,
);
const specialsRemaining = buildPerUserSpecialsRemaining(poolSpecialBets, defs, actualResults);
const canStillGetByUser = new Map(
  leaderboard.map((e) => [
    e.userId,
    groupRemaining +
      (knockoutRemaining.get(e.userId) ?? 0) +
      (specialsRemaining.get(e.userId) ?? 0),
  ]),
);
```

## UI

### `ProjectedStandings` (ui/ProjectedStandings.tsx)

Grid changes from 4 to 5 columns:

```
grid-cols-[44px_1fr_52px_52px_64px]
```

| Col  | Header      | Content                     | Style     |
| ---- | ----------- | --------------------------- | --------- |
| 44px | `Now → Fin` | rank delta + projected rank | unchanged |
| 1fr  | `Player`    | display name                | unchanged |
| 52px | `Now`       | `currentPoints`             | unchanged |
| 52px | `+Avail`    | `+{canStillGet}` or `–`     | **new**   |
| 64px | `Proj.`     | `projectedPoints`           | unchanged |

**`+Avail` rendering:**

- `canStillGet > 0`: `+{canStillGet}` in `text-green-600 font-semibold text-[13px] tnum text-right`
- `canStillGet === 0`: `–` in `text-ink-muted text-right`

No changes to `SwingCard`, `RaceView`, `PointsRaceTab`, or `ProjectedFinalSidebar`.

## Tests

### New: `build-race-view-canstillget.test.ts`

Four unit test cases covering `buildProjectedEntries` and the two helpers:

1. **All picks alive** — all knockout matches pending, both participant slots confirmed, all picks match a participant → `canStillGet` = full group remaining + full knockout remaining + full specials remaining
2. **Busted SF pick** — SF pick is for a team not in the confirmed SF slot → Final/Bronze points excluded from that player's `canStillGet`
3. **No knockout picks** — player has no picks → `canStillGet` = group remaining + specials only (knockout = 0)
4. **Specials differentiation** — one player has a pick for a pending bet, another does not → player with pick has higher `canStillGet`

### Existing: `build-race-view.test.ts`

Add assertions that each `projectedEntry` has `canStillGet >= 0`.

## Definition of done

- [ ] `ProjectedEntry.canStillGet` computed per-player and correct
- [ ] `ProjectedStandings` renders 5 columns, `+Avail` column correct
- [ ] All new tests pass; existing tests unaffected
- [ ] Format, lint, typecheck green
