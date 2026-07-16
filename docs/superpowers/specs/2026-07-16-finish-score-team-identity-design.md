# Final/Bronze Predicted Score — Team-Identity Fix — Design

Date: 2026-07-16

## Problem

Knockout match summaries show wrong scores for Final/Bronze predictions — e.g. a user who
correctly predicted ENG beating ESP 2–1 was shown as "ENG vs ESP 1:2". Home and away appear
mixed up.

### Root cause

`prediction_finish_scores` stores only positional `homeGoals`/`awayGoals` for a user's Final/Bronze
prediction — there is no record of _which real team_ each number belongs to. Every consumer
re-derives "who is home" by re-running `deriveCard` against the user's **current** bracket picks
(`derived.finalists` / `derived.bronzePair`) at read time:

- The predict page shows it against the live-derived pair, which is fine while editing.
- `buildKnockoutMatrix` (`apps/web/src/features/results/application/build-race-view.ts`) re-derives
  the pair too, and additionally has to work around cases where the user's picks have since diverged
  from the real bracket (see the `deriveImplicitFinaleWinner` workaround) — but still assumes
  `predictedHome` is the picked team's score when building the summary cell.
- `MatchSummarySheet` (via `knockout-match-detail.ts`) renders `predictedHome`–`predictedAway`
  positionally next to `pickedTeamId`–`pickedOpponentId`. Whenever the user's picked winner is the
  _away_-oriented side, the two numbers are shown swapped.
- The same ambiguity exists in the **scoring engine**: `exactScorePoints`
  (`packages/engine/src/scoring/finish-matches.ts`) compares `finishScore.home === actualMatch.homeGoals`
  directly, with no team-identity check at all. This can award or deny the real exact-score bonus
  incorrectly once the actual Final/Bronze is played. It hasn't manifested yet — `wc-2026`'s
  `results.json` has no `finalMatch` yet — but the real final is only days away.

## Goal

Persist which real team each entered Final/Bronze score belongs to, at the moment it's entered, and
make every downstream consumer (scoring engine, results derivation, UI) read the score by team
identity instead of re-deriving position from current picks.

## Scope

- Final and Bronze predicted scores only (the only finish-score inputs in the system).
- Additive/backward-compatible: no change to the card export/import JSON format or the predict-page
  editing UX. The team-id snapshot is DB-only enrichment.
- Includes a one-time backfill for existing rows saved before this ships.

### Out of scope

- Redesigning `FinishScore` itself to be team-keyed (dropping home/away entirely) — bigger surface
  area (breaks the export/import wire contract), not needed to fix the reported bug or the scoring
  bug. Can be revisited later if the positional model causes further issues.
- Re-validating/invalidating an already-entered Final/Bronze score when the user's upstream SF/QF
  picks change after saving it — pre-existing behavior, not part of this bug.

## Architecture

### 1. Schema (`packages/db/src/schema/predictions.ts`)

Add nullable columns to `prediction_finish_scores`:

```ts
homeTeamId: text('home_team_id'),
awayTeamId: text('away_team_id'),
```

New migration in `packages/db/migrations/`.

### 2. Engine type (`packages/engine/src/types.ts`)

```ts
export interface FinishScore {
  home: number;
  away: number;
  homeTeamId?: TeamId | null;
  awayTeamId?: TeamId | null;
}
```

Optional fields — existing callers (card export/import schemas in `@cup/schemas`, engine scoring
inputs) keep compiling unchanged. `CardExport`'s wire format is untouched: import/export continue to
carry only `{ home, away }`; the snapshot is populated server-side when a score is written to the DB
(including via `importCard`, which calls the same write path).

### 3. Write path (`apps/web/src/features/predictions/api/actions.ts`)

`saveFinishScore` and `ownerSaveFinishScore` already compute `derived.finalists` /
`derived.bronzePair` via `deriveFinishWinner` to determine the implicit knockout pick. Reuse that
same derived pair to populate `homeTeamId`/`awayTeamId` when calling `upsertFinishScore`, so the
snapshot is captured atomically with the score, no extra `deriveCard` call needed.

`packages/db/src/repositories/predictions.ts`: `upsertFinishScore` gains `homeTeamId`/`awayTeamId`
params; `getPredictionInputs` and `getFinishScoresByPool` read them back into `FinishScore`.

### 4. Backfill script

New one-off script (`scripts/backfill-finish-score-team-ids.ts`, following the existing `scripts/sync.ts`
pattern): for every prediction with a final/bronze finish-score row where `homeTeamId`/`awayTeamId`
is null, run `deriveCard` on that user's current `CardInputs` and fill in the pair — identical logic
to `deriveFinishWinner`. Idempotent (only touches rows with null team ids), safe to re-run.

### 5. Scoring engine fix (`packages/engine/src/scoring/finish-matches.ts`)

`exactScorePoints`: when `finishScore.homeTeamId`/`awayTeamId` are present, resolve each side's
predicted goals against the actual match's goals **for the same team id**, regardless of the actual
match's real home/away assignment:

```ts
function exactScorePoints(finishScore, actualMatch, exactScore) {
  if (!finishScore || !actualMatch) return 0;
  if (finishScore.homeTeamId != null && finishScore.awayTeamId != null) {
    const predictedByTeam = new Map([
      [finishScore.homeTeamId, finishScore.home],
      [finishScore.awayTeamId, finishScore.away],
    ]);
    return predictedByTeam.get(actualMatch.home) === actualMatch.homeGoals &&
      predictedByTeam.get(actualMatch.away) === actualMatch.awayGoals
      ? exactScore
      : 0;
  }
  // Fallback for rows without a snapshot (should not occur after backfill).
  return finishScore.home === actualMatch.homeGoals && finishScore.away === actualMatch.awayGoals
    ? exactScore
    : 0;
}
```

### 6. Results feature (`build-race-view.ts`)

For Final/Bronze cells, `buildKnockoutMatrix` currently falls back through
`deriveImplicitFinaleWinner` → `deriveEffectivePick` to guess the winner because it has no stable
team identity to work with. With the snapshot available:

- `pickedWinnerId` = whichever of `fs.homeTeamId`/`fs.awayTeamId` has the higher goals (ties still
  fall back to the explicit `knockoutPick`, unchanged).
- The cell's predicted-score fields are re-expressed keyed to team identity — e.g.
  `homeTeamGoals`/`awayTeamGoals` resolved against **the real match's** `m.homeTeamId`/`m.awayTeamId`
  by looking up each in `predictedByTeam` — instead of raw positional `predictedHome`/`predictedAway`.
  `KnockoutMatrixCell`'s `predictedHome`/`predictedAway` fields are replaced by this team-anchored
  pair (type update in `domain/types.ts`).
- `deriveImplicitFinaleWinner`/`deriveEffectivePick` remain only as the fallback path for legacy rows
  without a snapshot (pre-backfill edge case), otherwise dead code once backfill completes — kept for
  safety, not deleted, since a null snapshot is still theoretically possible (e.g. a row inserted by
  a future code path that forgets to pass team ids). Revisit for removal in a later cleanup once
  confidence is high.

### 7. Domain selector / UI (`knockout-match-detail.ts`, `MatchSummarySheet.tsx`)

`buildKnockoutMatchDetail` resolves each prediction's displayed goals by matching `pickedTeamId`/
`pickedOpponentId` against the cell's team-anchored goals, instead of assuming `predictedHome` is the
picked team's score. `KnockoutMatchDetailPrediction`'s `predictedHome`/`predictedAway` fields keep
their names (still "picked team's goals" / "picked opponent's goals" from the sheet's point of view)
but are now populated correctly regardless of orientation. No UI markup changes needed —
`MatchSummarySheet` already renders `pickedTeamId` next to `predictedHome` and `pickedOpponentId` next
to `predictedAway`; the fix is that those numbers are now guaranteed to match those teams.

## Testing

- **Engine unit** (`finish-matches.test.ts`): exact-score bonus awarded/denied correctly when the
  same two teams/scores are entered with the predicted home/away flipped relative to the actual
  match's real home/away.
- **DB repository** (`predictions.test.ts`): `upsertFinishScore` persists and `getPredictionInputs`/
  `getFinishScoresByPool` round-trip `homeTeamId`/`awayTeamId`.
- **Results unit** (`build-race-view.test.ts`): Final/Bronze knockout matrix cell reports the correct
  team-anchored goals regardless of positional flip; picked winner is derived correctly from the
  snapshot without relying on the current pick chain.
- **Domain unit** (`knockout-match-detail.test.ts`): summary detail's predicted score matches the
  picked team's real goals in an ENG/ESP-style flipped scenario (regression test for the reported
  bug).
- **Backfill script test**: pglite-based test — existing rows without a snapshot get correctly
  populated from `deriveCard` on current inputs; rows that already have a snapshot are left alone
  (idempotency).
- **Integration**: `saveFinishScore` action test extended to assert the snapshot is written alongside
  the score.

## Migration & rollout

1. Ship the additive migration (nullable columns) — no downtime, no behavior change on its own.
2. Ship the write-path change (new saves populate the snapshot) and the engine/results/UI read-path
   fixes together, since the read-path fixes assume a snapshot may be present.
3. Run the backfill script once, before/alongside this deploy, so already-entered Final/Bronze
   predictions are corrected immediately rather than waiting on users to re-save.
