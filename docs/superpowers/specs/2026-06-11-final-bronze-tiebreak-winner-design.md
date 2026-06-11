# Design — pick a winner for tied final / 3rd place predictions

## Problem

On the prediction card, the **Final** and **3rd Place** matches accept a predicted scoreline
(`predictedHome`, `predictedAway`) but no explicit winner. The UI's "champion" pill is inferred
from `predictedHome >= predictedAway`, which silently picks the home team on every tie (incl. 0–0).

Two consequences:

1. A user who predicts a tie has no way to record the shootout winner — yet in real cup football
   these matches always produce a winner via extra time / penalties.
2. The engine derives the player's `topFour` from `pickByKey.get(bracket.finalMatch)` /
   `pickByKey.get(bracket.bronzeMatch)` — i.e. from `knockoutPicks` rows. The current UI never
   writes those rows, so `topFour` is effectively empty for every card, and the Top‑4 ranking
   scoring path produces zero points regardless of the user's predictions.

## Goal

For the Final and 3rd Place matches:

- Treat the predicted scoreline as the **regulation result**.
- When the scoreline is a tie (incl. 0–0), prompt the user to pick the **shootout winner**.
- When the scoreline is non‑tied, the higher‑scoring side is the implicit winner — stored
  explicitly so the engine has a single source of truth.
- The picked winner feeds the existing Top‑4 derivation in `@cup/engine` (no engine change
  needed).

A tied final/bronze without a winner pick is treated as **incomplete** in the completion %.

## Non‑goals

- No changes to `@cup/engine`.
- No DB schema changes (the `knockoutPicks` table and `bracketMatchKey` already accept
  `finalMatch` / `bronzeMatch` keys).
- No changes to the Results / standings feature (display of the _actual_ winner, not the
  player's prediction).
- No "needs penalties" toggle or other UI scaffolding; the winner row appears purely as a
  function of the predicted scoreline.

## Approach

### Data model

No migrations. The existing tables already support what we need:

- `prediction_knockout_picks (prediction_id, bracket_match_key, winner)` — accepts rows for
  `finalMatch` and `bronzeMatch`. The engine's `buildBracket` (`packages/engine/src/bracket.ts`)
  already reads them via `pickByKey.get(bracket.finalMatch)` and uses them to populate
  `topFour = [finalWinner, finalLoser, bronzeWinner, bronzeLoser]`.
- `prediction_finish_scores (prediction_id, match, home, away)` — unchanged.

The fix is wiring the application layer and the UI to actually write the winner row.

### Server actions (`features/predictions/api/actions.ts`)

**`saveFinishScore(poolId, match, home, away)` (own card)** — modified:

1. Resolve actor, pool, tournament, prediction (unchanged).
2. Upsert the finish score (unchanged).
3. **If `home !== away`** — derive the implicit winner from the two finalists/bronze‑pair
   resolved by `deriveCard(...)`:
   - If `home > away` → winner = finalists/bronzePair home side.
   - If `away > home` → winner = finalists/bronzePair away side.
   - Upsert `knockoutPicks(finalMatch|bronzeMatch, winner)` and run the existing
     `invalidatePicksAfterKnockoutPickChange` (defensive; final/bronze have no downstream).
4. **If `home === away`** — leave any existing pick untouched (the user's explicit choice
   persists across score edits; nothing is silently overwritten).
5. Rescore (unchanged).

**`ownerSaveFinishScore`** — mirrors the same logic, plus the existing audit‑log entry.

**`saveKnockoutPick` / `ownerSaveKnockoutPick`** — no behavioural change. The UI calls them
with `bracketMatchKey: 'final' | 'bronze'` when the user explicitly picks a tied‑score winner.
Engine validation in `buildBracket` already rejects a pick whose team is not one of the
resolved finalists / bronze pair.

Edge case: the implicit winner derivation requires the two finalist or bronze‑pair teams to
be known (i.e. the player has picked enough SF winners). If they aren't yet resolved — e.g.
the user fills in the final scoreline before completing the semi‑finals — `saveFinishScore`
upserts the score but skips the implicit pick, falling back to the existing UI flow (no
champion pill until the finalists exist). The explicit pick row similarly stays hidden until
both team slots resolve.

### View model (`features/predictions/domain/types.ts`)

```ts
export type FinishMatchView = {
  homeTeamId: TeamId | null;
  homeTeamName: string | null;
  awayTeamId: TeamId | null;
  awayTeamName: string | null;
  predictedHome: number | null;
  predictedAway: number | null;
  pickedWinnerId: TeamId | null; // NEW
};
```

### `getCardView` (`features/predictions/application/get-card.ts`)

- For the Final and Bronze views, populate `pickedWinnerId` from `knockoutPickMap` using
  `bracket.finalMatch` / `bracket.bronzeMatch`.
- **Completion %** — adjust the formula:
  - A finish match counts as "filled" when:
    - `finishScores[match]` is set, AND
    - (`home !== away` OR `pickedWinnerId` is set).
  - The current "+2 for final + bronze scores" approximation in `totalFields` /
    `filledFields` is replaced by per‑match evaluation against the rule above.

### UI — `BracketSection.tsx` / `FinalCard`

- Champion pill reads `match.pickedWinnerId`. No more `predictedHome >= predictedAway`
  inference. When `pickedWinnerId === null`, no pill is shown.
- New `WinnerPickRow` rendered inside `FinalCard` only when:
  - both team slots are resolved (`homeTeamId && awayTeamId`),
  - score is set (`predictedHome !== null && predictedAway !== null`),
  - score is tied (`predictedHome === predictedAway`).

  Two buttons styled like the existing `PickRow` in `TieCard` (home team / away team). Each
  click invokes the existing `saveKnockoutPick` action (or the `onPick` callback when used
  inside `OwnerCardEditor`).

- When score is tied with no pick, a small helper label reads "Pick the shootout winner."
- Disabled state under `locked` mirrors the rest of the bracket.

### UI — `ReadOnlyCard.tsx`

- Render the explicit winner under each finish match (e.g. a small "Winner: ARG" line or a
  reused chip). When `pickedWinnerId` is null and the score is tied, render an em‑dash so it's
  obvious the pick was missing at lock time.

### UI — `OwnerCardEditor.tsx`

- Wire the `onPick` and `onFinishSave` callbacks for the final/bronze cells to
  `ownerSaveKnockoutPick` and the updated `ownerSaveFinishScore`. No new server action.

### Import / Export & Pool backup

- `exportCard` already serializes all `knockoutPicks`; rows for `finalMatch` / `bronzeMatch`
  ride through automatically once the UI starts writing them.
- `importCard`'s `bracketKeys` set already includes both keys via
  `bracket.progression.map((p) => p.match)`, so winner picks are accepted on import.
- `pool-backup` uses `getPredictionInputs(...).knockoutPicks` directly — covered.

## Files changed

| File                                                        | Change                                                                                              |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/predictions/domain/types.ts`         | Add `pickedWinnerId: TeamId \| null` to `FinishMatchView`.                                          |
| `apps/web/src/features/predictions/application/get-card.ts` | Populate `pickedWinnerId` for final/bronze; rework completion math.                                 |
| `apps/web/src/features/predictions/api/actions.ts`          | `saveFinishScore` + `ownerSaveFinishScore` auto‑upsert implicit winner pick when score is non‑tied. |
| `apps/web/src/features/predictions/ui/BracketSection.tsx`   | Render `WinnerPickRow` when score tied; champion pill reads `pickedWinnerId`.                       |
| `apps/web/src/features/predictions/ui/ReadOnlyCard.tsx`     | Render explicit winner; em‑dash when tied + unset.                                                  |
| `apps/web/src/features/predictions/ui/OwnerCardEditor.tsx`  | Pass through `ownerSaveKnockoutPick` for final/bronze winners.                                      |

## Tests

Following the existing test diamond (integration‑first against pglite):

- `apps/web/src/features/predictions/api/actions.test.ts` (or new sibling)
  - `saveFinishScore` with non‑tied score writes a `knockoutPicks` row for the higher side.
  - `saveFinishScore` with tied score does **not** clobber an existing pick.
  - `saveFinishScore` with tied score + no prior pick leaves no row.
  - `saveFinishScore` with non‑tied score before the SF picks are made upserts the score
    only (no implicit pick).
  - Same coverage for `ownerSaveFinishScore`, including the audit‑log entry.
- `apps/web/src/features/predictions/application/get-card.test.ts`
  - `pickedWinnerId` returned for final/bronze when a knockoutPick exists.
  - `completionPercent` treats tied + unset final/bronze as incomplete.
- `apps/web/src/features/predictions/ui/BracketSection.stories.tsx` (Storybook)
  - Final card: non‑tied score with champion pill.
  - Final card: tied score, no winner pick (renders `WinnerPickRow`, no pill).
  - Final card: tied score, winner picked (renders pill).
  - Locked variants of all three.

## Acceptance

A user predicts a tied final score → a winner picker appears → they pick a team → the
champion pill shows that team and the engine's `topFour` derivation includes that team in
position 1. The same flow works for 3rd place. A user with a non‑tied score has the same
visible champion pill as before, but it is now backed by an explicit `knockoutPicks` row so
Top‑4 scoring derives correctly. Lock‑time completion % does not reach 100% while a tied
final/bronze has no winner picked.
