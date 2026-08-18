# Final/Bronze card pick breakdown

**Date:** 2026-08-18
**Status:** proposed

## Problem

The Final/Bronze result card (`FinalResultCard.tsx`) shows the user's "Your pick" pill with a
single green checkmark whenever the pick counts as correct at all. But the real scoring rule
(functional-spec §7.3) is granular: 5 points per correct team (regardless of which side —
winner/runner-up), up to 10, plus 5 for an exact score, for 15 max. A pick that got the winner
right but the runner-up and score wrong earns 5/15 — yet shows the exact same green checkmark and
green border as a fully correct pick.

Worse, the existing `hit` field driving that checkmark (`computeKnockoutHit` in
`build-bracket-rounds.ts`) is winner-oriented: it checks whether the predicted winner matches the
actual winner. A pick with the correct runner-up but the wrong predicted winner scores real points
(5/15) but is currently classified as `'missed'` (red X) — the opposite of what happened.

## Non-goals

- No changes to `computeKnockoutHit`, the pool-wide knockout matrix (`build-race-view.ts`), the
  `MatchHit` type, `HitChip`, or `MatchSummarySheet`. Those are shared with other knockout rounds
  (R32–SF) where a pick is genuinely a single team, so the ambiguity this fixes doesn't apply.
- No new server/domain plumbing. Everything needed already exists on `KnockoutMatchView`
  (`homeTeamId`/`awayTeamId` as actual participants, `pickRowLeftId`/`pickRowRightId` already
  derived in `FinalResultCard.tsx`, and `hit === 'exact'` for team-identity-aware exact-score
  detection).
- Scoped to `FinalResultCard.tsx` only (used exclusively for the Final and Bronze matches).

## Architecture

### New local helper

Colocated in `FinalResultCard.tsx`:

```ts
type FinalPickBreakdown = {
  leftCorrect: boolean; // pickRowLeftId is one of the actual two participants
  rightCorrect: boolean; // pickRowRightId is one of the actual two participants
  scoreExact: boolean; // match.hit === 'exact' (already team-identity-aware)
  isPending: boolean; // actual result not in yet
};

function computeFinalPickBreakdown(
  match: KnockoutMatchView,
  pickRowLeftId: string | null,
  pickRowRightId: string | null,
): FinalPickBreakdown;
```

- `isPending` is true when `match.actualHome === null || match.actualAway === null` (mirrors the
  existing pending check in `computeKnockoutHit`).
- When not pending, `leftCorrect`/`rightCorrect` are membership checks against
  `{match.homeTeamId, match.awayTeamId}` (the real participants), independent of which side won —
  this is what fixes the winner-oriented bug described above.
- `scoreExact` is just `match.hit === 'exact'`, reused as-is (already correct).

### Derived visual tier

From the breakdown, compute one of four tiers, used for both the border and the corner badge:

- `pending` — `isPending`
- `full` — `scoreExact` (implies both teams correct, since exact-score comparison is
  team-identity-keyed)
- `zero` — not pending, `!leftCorrect && !rightCorrect && !scoreExact`
- `partial` — everything else (at least one team correct, or both teams correct but wrong score)

## Visual design

- **Per-team marks:** each team badge inside the pill gets a small corner check/x (same visual
  language as the existing `PickBadge`, scaled down to fit the smaller team badge) reflecting
  `leftCorrect`/`rightCorrect` individually. Not shown while pending.
- **Score color:** the "2–1" score text renders green/bold when `scoreExact`, muted/red-tinted
  otherwise (still neutral while pending).
- **Corner badge (whole pill):** kept only for the two unambiguous tiers — green check for `full`,
  red X for `zero`. No corner badge for `partial` — the per-team marks and score color already
  communicate the state, avoiding new iconography for a three-state badge.
- **Card border:** `borderClassForPickHit` becomes tier-based instead of `hit`-based:
  - `full` → `border-green-300` (unchanged visual)
  - `partial` → new `border-amber-300` (matches the existing `-300` weight used for
    `border-green-300`/`border-red-300`; `amber` is already used as a warning tier elsewhere, e.g.
    `BracketHealthPanel.tsx`'s `bg-amber-400`)
  - `zero` → `border-red-300` (unchanged visual)
  - `pending` → `border-line-soft` (unchanged)
- Penalty note (`PenaltyNote`) is unaffected — it renders independently of the pick pill.

## Testing

- **Unit** test for `computeFinalPickBreakdown`: full (both teams + exact score), partial with 1
  correct team, partial with both teams correct but wrong score, zero, pending, and the bug-fix
  case — correct runner-up + wrong predicted winner → `partial`, not `zero`.
- **Component** test on `FinalResultCard` (extend existing test file if present): assert the
  right per-team mark, score color class, corner-badge presence, and border class for each tier.
  Reuse `data-testid="final-card-pick-pill"`; add new `data-testid`s for the per-team marks if the
  existing tests need to target them directly.
