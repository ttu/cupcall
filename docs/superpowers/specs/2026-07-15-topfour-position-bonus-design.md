# Top Four position bonus — design

Date: 2026-07-15
Status: approved

## Summary

Add a position-accuracy bonus to the Top Four (semifinalists) scoring rule. Today, `scoreTopFour`
awards a flat 5 pts per correctly-predicted semifinalist team (set membership only, order-agnostic).
This adds a **+3 pt bonus per team** when the player's predicted final-standing slot for that team
(1st/2nd/3rd/4th) exactly matches the team's actual final-standing slot, determined by the outcome
of the Final and Bronze matches.

- Membership: 5 pts/team (unchanged).
- Position bonus: +3 pts/team (new), only for teams that also earned the membership points.
- Max per team: 8 pts. Max for all 4 teams: 32 pts (up from today's 20).

## Motivation

Two players might both correctly pick all 4 semifinalists but disagree on who reaches the Final vs.
who's knocked out in the semis. The current rule doesn't reward getting that finer-grained final
standing right. This is a natural, incremental extension of the existing membership rule.

## Rule detail

For each of the 4 real semifinalist teams:

1. **Membership (unchanged):** 5 pts if the player predicted that team to reach the semifinal, via
   their quarterfinal winner picks (`DerivedCard.roundOf4` vs `ActualResults.answers.roundOf4`).
   Banked incrementally as each QF match completes — no change to this behavior.
2. **Position bonus (new):** +3 pts if the player's predicted final-standing slot for that team
   exactly matches its actual slot. Slots are:
   - 1st = Final winner
   - 2nd = Final loser
   - 3rd = Bronze-match winner
   - 4th = Bronze-match loser

A team can only earn the position bonus if it also earned membership points — a team that reaches
the Final or Bronze match is definitionally one of the 4 real semifinalists, so this is automatic,
not a separate check.

### Worked example

Player predicts: France (1st), Spain (2nd), England (3rd), Portugal (4th) — all 4 correctly picked
to reach the semis (20 pts membership under old rule; unaffected here, still 5 pts/team = 20 pts).

Actual result: Spain wins the Final (1st), France is Final runner-up (2nd), Portugal wins Bronze
(3rd), England is Bronze runner-up (4th).

- France: membership ✓ (5), position ✗ (predicted 1st, actual 2nd) → 5 pts
- Spain: membership ✓ (5), position ✗ (predicted 2nd, actual 1st) → 5 pts
- England: membership ✓ (5), position ✗ (predicted 3rd, actual 4th) → 5 pts
- Portugal: membership ✓ (5), position ✗ (predicted 4th, actual 3rd) → 5 pts

Total: 20 pts (no position bonus, despite getting all 4 teams right — every slot was swapped).

If instead the actual result had matched the prediction exactly (France 1st, Spain 2nd, England 3rd,
Portugal 4th), each team would earn 5 + 3 = 8 pts, for a total of 32 pts.

## Data derivation

- **Predicted slots** reuse the existing `DerivedCard.topFour` field
  (`packages/engine/src/bracket.ts:196-213`): `[finalWinner, finalLoser, bronzeWinner, bronzeLoser]`.
  This field already exists (used today only for the Predict page's standings display) and is
  order-dependent, built from the player's Final/Bronze `knockoutPicks`.
- **Actual slots** are derived from `actual.finalMatch` and `actual.bronzeMatch`
  (`ActualResults`, already populated by results ingestion) at scoring time.

### New requirement: `ActualFinishMatch.winner`

Goals alone cannot determine the actual winner/loser when a Final or Bronze match is decided by
penalties (tied `homeGoals`/`awayGoals` — confirmed in real fixture data,
`data/tournaments/test-wc-2026/results.json`'s `finalMatch`, which is `1-1, decidedBy: penalties`
with no winner recorded). Today's scoring never needed to know the winner (Final/Bronze scoring is
team-presence + exact-scoreline only), so this was never modeled. The position bonus is the first
feature that needs "who won" as a fact, so `ActualFinishMatch` gains a required `winner: TeamId`
field:

```ts
export interface ActualFinishMatch {
  home: TeamId;
  away: TeamId;
  homeGoals: number;
  awayGoals: number;
  winner: TeamId; // new — not derivable from goals alone when the match went to penalties
}
```

The raw `knockout[]` results format already carries a `winner` per match
(`packages/schemas/src/results.ts:34`, `knockoutEntrySchema`) — it's just discarded when
`scripts/sync.ts` builds `derivedFinalMatch`/`derivedBronzeMatch` into `ActualFinishMatch` shape.
This is a threading fix, not new data collection:

- `packages/engine/src/types.ts` — add `winner: TeamId` to `ActualFinishMatch`.
- `packages/schemas/src/results.ts` — add `winner: teamIdSchema` (required) to
  `actualFinishMatchSchema` (the top-level `finalMatch`/`bronzeMatch` override shape) and thread it
  through the `resultsSchema` transform.
- `scripts/sync.ts` — carry `winner: teamId(derivedFinalMatch.winner)` /
  `teamId(derivedBronzeMatch.winner)` into `mergedActual.finalMatch`/`bronzeMatch`.
- `packages/db/src/repositories/actual-results.ts` (`getActualResults`) — read `winner` out of the
  stored `bronzeMatch`/`finalMatch` JSON alongside the existing fields. (The write side,
  `upsertTournamentResults`, already stores the whole object verbatim — no change needed there.)
- Every existing fixture/literal across the repo that constructs an `ActualFinishMatch` (tests,
  `dev-actions.ts` seed data, `data/tournaments/test-wc-2026/results.json`) gains a `winner` field,
  set to whichever team the existing `homeGoals`/`awayGoals` already implies won.

With `winner` available, position scoring is simple comparison, no goal arithmetic:
`loser = winner === home ? away : home`.

## Incremental banking

Consistent with the existing precedent that Top Four membership points bank as each QF match
completes (and the recent change banking Finalist team points at semifinal completion):

- 1st/2nd position bonus resolves as soon as the **Final** match is complete (goals recorded).
- 3rd/4th position bonus resolves as soon as the **Bronze** match is complete.
- Before the Final/Bronze are played, `scoreTopFour` returns membership points only, exactly as
  today.

## Config

Add one new scoring config value:

```ts
// packages/engine/src/types.ts — Scoring
topFourPositionBonus: Points; // new, e.g. 3
roundOf4PerTeam: Points; // unchanged, e.g. 5
```

Set `topFourPositionBonus: 3` in the WC2026 scoring config.

## Ceiling / "canStillGet" impact

The reachable-ceiling calculation is duplicated in three places, all of which must stay consistent
with the new max:

- `packages/engine/src/scoring/remaining-max.ts` (`computeRemainingMaxPoints`) — tournament-wide
  ceiling used for the Points Race hit-rate projection.
- `apps/web/src/features/results/application/build-race-view.ts`
  (`buildPerUserKnockoutCanStillGet`) — per-user ceiling used for Points Race projections.
- `apps/web/src/features/results/application/get-results-view.ts`
  (`buildKnockoutRoundBreakdown`) — per-user ceiling used for the bracket-health "SF" row shown to
  the viewing user.

All three must reflect:

- Membership still open (QF not yet decided for that team) → +5 pts potential per team, as today
  (unchanged).
- Position bonus not yet ruled out, independent of membership:
  - 1st/2nd pair: +3 pts potential per non-busted predicted finalist, open until the Final is
    played.
  - 3rd/4th pair: +3 pts potential per non-busted predicted bronze participant, open until the
    Bronze match is played.
  - Note this means the ceiling can stay above zero even after membership has fully resolved (all
    4 QF matches played) — position bonus keeps its own independent timer.

## UI / breakdown

`ScoreBreakdown.topFour` remains a single combined number (membership + position bonus summed) —
no new line item is added to the results breakdown UI. The existing "predicted final standings"
display on the Predict page is unaffected structurally (it already shows 1st/2nd/3rd/4th); it may
gain a small explainer of the bonus, decided during implementation.

## Testing

Per the test diamond (technical-spec §12):

- **Unit tests** (`packages/engine/src/scoring/sets-rankings.test.ts`): extend `scoreTopFour` tests
  to cover position bonus — all slots correct, no slots correct (swapped), partial (Final decided,
  Bronze not yet), partial card (player missing a Final/Bronze pick).
- **Integration tests** (`packages/engine/src/score.test.ts`): update worked examples for the new
  max (8/team, 32 total) and add a case exercising incremental banking (Final only vs. Final +
  Bronze complete).
- **Ceiling tests** (`packages/engine/src/scoring/remaining-max.test.ts`): extend to cover the new
  position-bonus reachability logic.
- **Web-layer tests** (`apps/web/src/features/results/application/build-race-view.test.ts`,
  `get-results-view.test.ts`): update fixtures/expectations for the new max where Top Four totals
  are asserted.

## Docs to update alongside implementation

- `docs/functional-spec.md` §7.4 (rule text) and §7.7 (worked example).
- `docs/features/scoring.md` §2.4 (Top Four) and §4.1 (canStillGet).
- `docs/features/scoring-engine.md:48` — also fix the pre-existing stale/incorrect tiered-formula
  text while touching this section (unrelated bug, but in the same area).
- `docs/PROGRESS.md` — record the change once implemented.

## Out of scope

- No change to Final/Bronze bet scoring (`finish-matches.ts`) itself — that remains unordered
  team-presence + exact-scoreline, untouched by this work.
- No new UI line items for the position bonus (folded into existing total, per design decision).
- No champion/winner-of-tournament bet type — doesn't exist today and isn't being added.
