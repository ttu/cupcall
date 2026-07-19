# SF · Position scoring: fall back to finish-score snapshot — design

Date: 2026-07-19
Status: approved

## Summary

Fix the Top Four position bonus (`topFourPosition`, shipped 2026-07-15) so it survives invalidation
of the explicit Final/Bronze knockout pick. Currently `deriveTopFour()`
(`packages/engine/src/bracket.ts`) only resolves the Final/Bronze winner from an explicit
`prediction_knockout_picks` row, which is silently deleted by the pick-invalidation cascade whenever
an upstream SF/QF pick changes and is never regenerated unless the user re-saves their Final/Bronze
score. As a result, `topFourPosition` is effectively broken in production: **0 of 11 scored
predictions have any `topFourPosition` > 0**, despite users (verified: `tomi.tuhkanen@gmail.com`,
prediction `ddfb271b-1a4d-4eea-adc2-d0f06d5788f5`) having correctly predicted the Final winner (ESP).

## Root cause

1. `applyFinishScore` (`apps/web/src/features/predictions/api/actions.ts`) writes an _implicit_
   knockout pick (`upsertKnockoutPick`) for the Final/Bronze bracket key when the user saves a score,
   derived from the scoreline + then-current SF picks.
2. Any later edit to an SF/QF pick runs `invalidatePicksAfterKnockoutPickChange` →
   `applyPickInvalidation` → `deleteKnockoutPicks`, which deletes that Final/Bronze pick if it's now
   stale relative to the new bracket state.
3. The finish-score row itself (`prediction_finish_scores`, with `home_team_id`/`away_team_id`
   snapshot from migration `0008_finish_score_team_ids.sql`) is _not_ touched by invalidation and
   remains correct.
4. The results-page UI already recovers from this via `resolveFinaleWinner` /
   `deriveImplicitFinaleWinner` (`apps/web/src/features/results/domain/finale-winner.ts`), which
   prefers the finish-score snapshot when no explicit pick exists — this is why the UI still shows
   "1st ESP · still alive" correctly.
5. The scoring engine (`packages/engine/src/bracket.ts`'s `deriveTopFour`, called via `deriveCard` in
   `scripts/sync.ts`'s rescore loop) has no equivalent fallback — it just sees an empty slot and
   `scoreTopFourPosition` awards 0 for it.

Confirmed directly against the production DB (`postgres` MCP, `$PROD_DATABASE_URL`):

- `actual_answers.finalMatch`/`bronzeMatch` are correct (ESP won Final, ENG won Bronze).
- `prediction_knockout_picks` has **no** row for `bracket_match_key IN ('final','bronze')` for the
  verified user, despite valid SF/QF picks that imply ESP as a correct semifinalist and Final
  participant.
- `prediction_finish_scores` for that prediction has `match='final', home_team_id='ESP',
away_team_id='ENG', home_goals=2, away_goals=1` — a resolvable, correct snapshot.
- Across all 11 scored predictions in the DB, `prediction_finish_scores` is 100% populated with the
  `home_team_id`/`away_team_id` snapshot (11/11 for both `final` and `bronze`) — so the fix below
  fully covers the current dataset with no backfill needed.

## Fix

`deriveTopFour()` gains a `finishScores: { final?: FinishScore; bronze?: FinishScore }` parameter
(the `FinishScore` type already carries the `homeTeamId`/`awayTeamId` snapshot — no schema or DB
change needed). For each of the Final/Bronze slots, resolve winner and loser with this precedence,
mirroring the web layer's `resolveFinaleWinner`:

1. **Explicit knockout pick, if present** — unchanged behavior. This also covers the case where the
   scoreline is tied and only an explicit pick can disambiguate a winner (verified in prod: 2 of 11
   predictions have an explicit Final/Bronze pick precisely because their scoreline predictions were
   tied 2-2 / 1-1).
2. **Finish-score snapshot fallback** — when no explicit pick exists, if
   `finishScore.homeTeamId`/`awayTeamId` are both present and the goals aren't tied, derive
   winner/loser from the snapshot directly (`home > away ? homeTeamId : awayTeamId`).
3. **Otherwise** — no pick for that slot (unchanged degraded behavior; matches today for genuinely
   unresolvable/legacy cards with no snapshot).

Loser resolution: prefer the existing `participantsByMatch` pair when the winner matches one of its
two teams (existing behavior, unchanged); otherwise fall back to "the other snapshot team." This
keeps the existing explicit-pick path byte-for-byte unchanged and only adds new fallback behavior for
the case that's broken today (pick missing, snapshot present).

### Threading

- `packages/engine/src/bracket.ts` — `buildBracket()` gains a `finishScores` parameter, passed to
  `deriveTopFour()`. `buildBracket`'s only caller outside its own test file is `derive.ts`.
- `packages/engine/src/derive.ts` — `deriveCard()` passes `input.finishScores` (already exists on
  `CardInputs`, no type change) through to `buildBracket()`.
- No changes needed to `packages/db`, `packages/schemas`, or `apps/web` — the fix is entirely
  contained to `packages/engine`.

### Rollout

After the fix lands, re-run `pnpm sync -- wc-2026` against production (same as any data/scoring
change) — the existing rescore loop recomputes every prediction's `breakdown` from scratch, so this
alone corrects all affected users. No separate backfill script.

## Testing

Per the test diamond (technical-spec §12):

- **Unit tests** (`packages/engine/src/bracket.test.ts`): extend `deriveTopFour`/`buildBracket`
  coverage —
  - explicit pick present → unchanged (regression guard).
  - explicit pick missing, resolvable snapshot present → winner + loser recovered.
  - explicit pick missing, tied score or no snapshot → still empty (no regression from today).
  - explicit pick present with tied score (the "penalty shootout tie-break pick" case) → still
    resolves from the pick, not the (unresolvable) snapshot.
- **Integration test** (`packages/engine/src/score.test.ts` or `scoring/sets-rankings.test.ts`):
  reproduce the exact production scenario end-to-end through `scoreTopFourPosition` — correct SF
  picks, Final finish-score saved, explicit Final pick simulated as deleted (i.e. absent from
  `knockoutPicks`), assert the position bonus is still awarded.

## Out of scope

- Not changing the invalidation cascade (`applyPickInvalidation`/`deleteKnockoutPicks`) — the engine
  fallback makes the deletion harmless, so no change needed there.
- Not adding a "legacy" fallback that re-derives the winner from live bracket picks when the snapshot
  itself is absent (`deriveImplicitFinaleWinner`'s tertiary path in the web layer) — verified 0 rows
  in production lack the snapshot, so this path would be dead code today. Can be added later if a
  future tournament's data shows otherwise.
