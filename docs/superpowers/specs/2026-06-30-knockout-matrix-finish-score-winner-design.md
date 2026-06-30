# Design: Knockout Matrix — Derive Final/Bronze Winner from Finish Score

**Date:** 2026-06-30
**Area:** Points Race → Knockout sub-tab

---

## Problem

In `buildKnockoutMatrix`, every cell's `pickedWinnerId` (display) and hit/miss determination
(scoring) comes from `poolKnockoutPicks.winnerTeamId`. For the final and bronze matches this is
wrong when a finish score has been set:

- **Non-tied score (e.g. 2-1):** `saveFinishScore` auto-derives the winner and stores it in
  `knockoutPicks`. ✓ Correct while the score stays non-tied.
- **Changing to a tied score (e.g. 1-1):** `saveFinishScore` does _not_ update `knockoutPicks`
  when the score is tied (because the winner must be picked explicitly). The old auto-derived pick
  remains stale — the cell shows the wrong team and awards a spurious hit if the actual winner
  happens to match.

## Solution

Derive the effective pick for the final and bronze cells at read time using pool-wide finish scores:

```
effectivePick(userId, match):
  finishScore = poolFinishScores[userId][match]

  if finishScore is absent:
    → knockoutPick.winner (existing behaviour)

  if finishScore.home > finishScore.away:
    → m.homeTeamId  (winner derived from the score, home side wins)

  if finishScore.home < finishScore.away:
    → m.awayTeamId  (winner derived from the score, away side wins)

  if finishScore.home == finishScore.away:
    → knockoutPick.winner  (tied score — winner is the explicit penalty pick)
```

Edge case: if `m.homeTeamId` or `m.awayTeamId` is null (teams not yet confirmed) and the score
is non-tied, fall back to `knockoutPick.winner`.

This `effectivePick` replaces `pickedWinnerId` in the cell **and** drives the `isHit` check,
fixing both display and scoring.

## Architecture

### 1. New repository function — `getFinishScoresByPool`

Location: `packages/db/src/repositories/predictions.ts`

```ts
export type PoolFinishScore = {
  userId: UserId;
  match: 'final' | 'bronze';
  home: number;
  away: number;
};

export async function getFinishScoresByPool(
  db: Database,
  poolId: PoolId,
): Promise<PoolFinishScore[]>;
```

Single JOIN: `predictions` → `predictionFinishScores` filtered by `poolId`. Exported from
`packages/db/src/repositories/index.ts`.

### 2. Pass data through to the matrix builder

`get-results-view.ts`: fetch `poolFinishScores` in the existing `Promise.all` and pass it into
`buildPointsRaceView`.

`build-race-view.ts` (`RaceParams`): add `poolFinishScores: PoolFinishScore[]`.

### 3. Derive effective pick in `buildKnockoutMatrix`

`build-race-view.ts` (`buildKnockoutMatrix` params): add `poolFinishScores: PoolFinishScore[]`.

Inside the function:

1. Build a lookup map: `Map<userId, { final?: {home, away}, bronze?: {home, away} }>`.
2. Identify the `finalMatchKey` and `bronzeMatchKey` from `def.bracket`.
3. For each user's cell for those two match keys, compute `effectivePick` per the algorithm above.
4. Use `effectivePick` in place of the raw `knockoutPick.winner` for:
   - `pickedWinnerId` in the returned cell (display)
   - The `isHit` determination (scoring)

All other matches are unaffected.

## Files changed

| File                                                                | Change                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `packages/db/src/repositories/predictions.ts`                       | Add `PoolFinishScore` type + `getFinishScoresByPool`                                        |
| `packages/db/src/repositories/index.ts`                             | Export both                                                                                 |
| `apps/web/src/features/results/application/get-results-view.ts`     | Fetch `poolFinishScores`, pass to `buildPointsRaceView`                                     |
| `apps/web/src/features/results/application/build-race-view.ts`      | Accept `poolFinishScores` in `RaceParams` and `buildKnockoutMatrix`; implement derive logic |
| `apps/web/src/features/results/application/build-race-view.test.ts` | Add tests for final/bronze effective-pick derivation                                        |

## Test cases to add (TDD)

All in `buildKnockoutMatrix`:

1. **Non-tied score, teams known, pending match** — user has finish score 2-1 and a stale
   knockoutPick pointing to the away team; `pickedWinnerId` should be `homeTeamId`.
2. **Non-tied score, teams known, match final (scoring)** — actual winner = home team; user has
   score 2-1 (home wins) with a stale away-team knockoutPick; result should be `hit`.
3. **Non-tied score, away wins, pending match** — score 0-3; `pickedWinnerId` = `awayTeamId`.
4. **Tied score, explicit winner pick** — score 1-1; user has knockoutPick = team A;
   `pickedWinnerId` = team A.
5. **Tied score, no winner pick** — score 1-1; no knockoutPick; `pickedWinnerId` = null, cell
   shows no-pick (when match is final) or pending with null.
6. **No finish score** — no `poolFinishScore` row; falls back to `knockoutPick.winner` as before.
7. **Non-tied score, teams unknown (null)** — falls back to `knockoutPick.winner`.
8. Regular QF/SF/R16 matches are unaffected — still use `knockoutPick.winner` directly.
