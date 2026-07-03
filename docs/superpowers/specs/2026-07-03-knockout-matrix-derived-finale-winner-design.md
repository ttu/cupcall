# Design: Knockout Matrix — Derived Final/Bronze Winner Pick

**Date:** 2026-07-03

## Problem

In the Points Race "By knockout" tab (`KnockoutMatrix`), pending cells for the Final and Bronze matches show a team label only when the user has an explicit `knockout_picks` entry for that match. That entry is only stored when the user predicted a draw/penalty outcome and explicitly selected a winner. Users who predicted a non-tied score (implying a winner from the score alone) have no explicit entry, so their cell shows `·` instead of their implied pick.

The same scenario was already solved in `buildBracketRounds` via `deriveImplicitFinaleWinner`, which walks the user's SF/QF pick chain to determine which team would be on the home/away side of the Final or Bronze, then applies the score to pick the winner. The knockout matrix (`buildKnockoutMatrix`) never received this treatment.

## Solution

Reuse `deriveImplicitFinaleWinner` as a fallback in `buildKnockoutMatrix` when `deriveEffectivePick` returns null.

### Files changed

**`apps/web/src/features/results/application/build-bracket-rounds.ts`**

- Add `export` to the existing `deriveImplicitFinaleWinner` function. No logic change.

**`apps/web/src/features/results/application/build-race-view.ts`**

- Import `deriveImplicitFinaleWinner` from `build-bracket-rounds`.
- Inside `buildKnockoutMatrix`, in the per-user `leaderboard.map` loop, after `deriveEffectivePick` resolves `pickedWinnerId` for a Final/Bronze cell:
  - If `pickedWinnerId` is still null, a finish score exists, and the score is non-tied: build a per-user `Map<matchKey, teamId>` by filtering `poolKnockoutPicks` to the current user, then call `deriveImplicitFinaleWinner` with that map and the score. Use the result as `pickedWinnerId`.

No UI changes — `KnockoutCell` already renders the team label when `pickedWinnerId` is non-null.

### Data flow example

User picks ESP for SF1, BRA for SF2, Final score 2–1:

1. `deriveEffectivePick` → null (Final teams unknown, no explicit pick)
2. Fallback: build `userPickMap` = `{ sf1-key → "ESP", sf2-key → "BRA" }`
3. `deriveImplicitFinaleWinner("final", bracket, userPickMap, 2, 1)` → home side = SF1 winner = "ESP" → score says home wins → returns "ESP"
4. `pickedWinnerId = "ESP"` → pending cell shows "ESP"

Same logic applies for Bronze via the existing `getSfLoser` path inside `deriveImplicitFinaleWinner`.

## Testing

Add cases to `build-race-view.test.ts`:

| Scenario                                                           | Expected                                           |
| ------------------------------------------------------------------ | -------------------------------------------------- |
| Non-tied finish score, no explicit knockout pick, SF picks present | Cell shows derived team                            |
| Tied finish score with explicit knockout pick                      | Existing behaviour unchanged (shows explicit pick) |
| Tied finish score, no explicit pick                                | Cell shows `·`                                     |
| No finish score at all                                             | Cell shows `·`                                     |
| Finish score present but SF picks missing (chain incomplete)       | Cell shows `·`                                     |
