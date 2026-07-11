# Design: live SF (semifinalist) scoring

**Date:** 2026-07-11
**Status:** Approved

## Problem

The "SF" scoring row (`ScoreBreakdown.topFour`) always shows `+0` until the entire tournament is
over. `scoreTopFour()` requires `actualResults.answers.topFourOrder` — the full 1st–4th final
placement — which can only be known once **both** the Final and Bronze matches are played, and (worse)
`topFourOrder` is never auto-derived; it requires manual entry in `results.json`. So even after all
four QF matches are played and the four real semifinalists are known, players see no credit and no
live signal beyond the existing "avail/missed" ceiling preview.

Reported symptom: with 2 of 4 QF matches played (one of the player's four SF-bound picks busted, one
confirmed alive), the SF row showed `+0 · 5 missed · 15 avail` — mathematically consistent with the
old rule, but not what the pool owner wants: points should accrue live, per confirmed semifinalist,
without waiting for Final/Bronze.

## Goal

Score the SF category live, per confirmed semifinalist, using the existing tier point values — no
waiting for the tournament to finish, no manual data entry.

## Solution overview

Redefine the bet from "predict the exact 1st–4th final order" to "predict which four teams reach the
semifinal" — order-agnostic, resolved incrementally as each QF match completes. Reuse the existing
tier table (1 correct → 5, 2 → 10, 3 → 15, 4 → 20) as the payout scale; drop the old
position-vs-consolation duality since position no longer matters.

## 1. New actual-results field: `answers.roundOf4`

Add `roundOf4?: TeamId[]` to `ActualResults['answers']` (packages/engine/src/types.ts,
packages/schemas/src/results.ts) — the teams confirmed to have won their QF match (i.e. reached the
SF). Auto-derived in `scripts/sync.ts` from QF winners in the `knockout[]` array, mirroring the
existing derivation of `roundOf16` (from R32 winners) and `roundOf8` (from R16 winners):

```ts
const qfWinners = knockoutMatches.filter((m) => m.round === 'QF').map((m) => teamId(m.winner));
// ...
answers: {
  ...(r32Winners.length > 0 ? { roundOf16: r32Winners } : {}),
  ...(r16Winners.length > 0 ? { roundOf8: r16Winners } : {}),
  ...(qfWinners.length > 0 ? { roundOf4: qfWinners } : {}),
  ...actual.answers,
}
```

No manual `results.json` edits are ever needed for this bet again.

## 2. Engine: rewrite `scoreTopFour`

`packages/engine/src/scoring/sets-rankings.ts` — replace the position-tier/consolation logic with:

```ts
export function scoreTopFour(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  if (actual.answers.roundOf4 === undefined) return points(0);
  const actualSet = new Set(actual.answers.roundOf4);
  const correctCount = derived.topFour.filter((team) => actualSet.has(team)).length;
  return points(topFourTierPoints(correctCount, scoring));
}
```

`derived.topFour` (the 4 teams implied by the player's Final/Bronze picks — unchanged, still built in
`bracket.ts`) is compared for **set membership only**; `topFourTierPoints` (existing tier lookup) is
reused unchanged. Once a team is confirmed into `roundOf4` it never leaves the set, so this score is
monotonically non-decreasing.

## 3. Remove the now-dead consolation path

- Drop `teamRightWrongPlace` from `Scoring['topFourOrder']` (types.ts, schemas/tournament.ts) and from
  all three `tournament.json` files (`mini-2026`, `test-wc-2026`, `wc-2026`).
- Drop `topFourOrder` from `ActualResults['answers']` and `answersSchema` (schemas/results.ts); remove
  the manually-entered `topFourOrder` from `test-wc-2026/results.json`.
- Update fixtures/tests that reference either field.

## 4. `computeRemainingMaxPoints` (packages/engine/src/scoring/remaining-max.ts)

`topFourMax` currently gates on `bronzePlayed && finalPlayed`. Change the gate to "all QF matches
played" (`bracket.roundOf8Matches.every(isFinal)`), mirroring how `roundOf16Max`/`roundOf8Max` already
gate on group-stage-complete — this is a tournament-wide (not per-user) ceiling, consistent with the
existing conservative style of this function.

## 5. Per-user live breakdown (`apps/web/.../get-results-view.ts`)

No change needed to the SF row's `earned` — it already reads `bd?.topFour ?? 0` directly from the
engine-computed `ScoreBreakdown`, which will now be live. The `canStillGet.topFour` calc
(`sfMaxPossible - (bd?.topFour ?? 0)`) already uses the bracket-health "SF" row's
`totalPicks - bustedPicks` for the ceiling — drop the now-redundant
`actualResults.answers.topFourOrder !== undefined ? 0 : ...` special case: once all QF matches
resolve, `sfMaxPossible` naturally equals `earned` and the expression evaluates to 0 on its own.

## 6. Points Race projection (`apps/web/.../build-race-view.ts`)

`buildPerUserKnockoutCanStillGet`'s topFour contribution currently adds the **full ceiling**
(`topFourTierMax(nonBustedQf, ...)`) as "still to gain," which was correct only because banked
`topFour` was always 0. Now that banked `topFour` can be nonzero, change this to add only the
**remaining upside above what's already banked**:

```ts
const ceiling = topFourTierMax(nonBustedQf, scoring.topFourOrder);
const banked = topFourTierMax(confirmedQf, scoring.topFourOrder); // confirmedQf: match final AND pick correct
canStillGet += Math.max(0, ceiling - banked);
```

Replace the `topFourResolved = actualResults.answers.topFourOrder !== undefined` gate with checking
whether all QF matches are final.

## 7. UI copy

- `ScoreBreakdownCard.tsx` — reword the SF row hint from "positions correct" to "correct
  semifinalists" (still shows the same 5/10/15/20 tier values).
- `ScoringGuide.tsx` — remove the `teamRightWrongPlace` row; update the Top-4 section description to
  match the new rule.

## 8. Docs

- `docs/functional-spec.md` §7.4 — rewrite "Top-4 final ranking" as "Semifinalists," describing
  set-membership scoring against `answers.roundOf4`, resolved incrementally per QF result.
- `docs/features/scoring.md` §2.4 — same rewrite; drop the consolation formula.

## Rollout

This is a pure scoring-rule + derived-data change — no changes to raw prediction data
(`knockoutPicks`, `finishScores`, etc.), so no data migration for existing predictions. After deploy,
the sync workflow (`.github/workflows/sync.yml`) only auto-triggers on `data/tournaments/**` pushes,
not code changes, so someone must run `pnpm sync -- wc-2026` once (locally or via
`workflow_dispatch`) to rescore all existing cards under the new rule and pick up `roundOf4` from the
QF results already on file.

## Out of scope

- Any change to Final/Bronze scoring (`scoreFinal`/`scoreBronze`) — unaffected, already live.
- Any change to Round of 16 / Round of 8 scoring — unaffected, already live.
- A UI indicator distinguishing "still could grow" vs "fully resolved" beyond the existing
  avail/missed figures.
