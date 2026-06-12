# Results knockout redesign

**Status:** draft
**Date:** 2026-06-12
**Owner:** ttu
**Related:** [`docs/features/results.md`](../../features/results.md), `apps/web/src/features/results/`, `apps/web/src/features/predictions/ui/BracketSection.tsx`

## Motivation

The results page **Knockout** tab today uses a plain, utilitarian card per tie (`BracketMatchCard`) and a 1100px page container. It conveys whether a user's pick is alive/busted/pending, but it does **not** match the visual richness of the predict page knockout bracket (`BracketSection` + `TieCard` + `FinalCard`), which has team flags, a distinctive dark Final card with a gold Champion pill, and a bronze 3rd-place card. The results page also feels cramped at 1100px when the bracket and right-rail health panel render together.

We want the results knockout to feel like a finished, animated retelling of the user's predict-page experience: same visual language, plus the **actual** results layered in, plus the user's predicted score on Final/Bronze, plus a per-tie hit chip telling them whether each pick scored.

## Goals

- The results knockout tab visually mirrors the predict knockout: rich `TieCard`-style cards with `TeamBadge` flags, a dark Final card with gold Champion pill, a lighter 3rd-place card with bronze pill.
- The user's picked winner is visibly highlighted on every tie card (not gated on the tie being final).
- A `HitChip` on every tie communicates the per-tie outcome — `exact` / `outcome` / `missed` / `pending`.
- For Final and 3rd-place ties, the user's **predicted score** is shown alongside the **actual score**.
- The results page container widens from 1100 → 1400 so the bracket + 240px right-rail health panel breathe.
- Vertical-slice boundary preserved: no cross-feature imports between `features/results` and `features/predictions`.

## Non-goals

- No change to the predict page width (stays 1200px) or `BracketSection`.
- No change to the `Group Stage` or `Points Race` tabs.
- No new domain logic in `@cup/engine`. Hit derivation lives in the results application layer (`get-results-view.ts`), same place stage progress and bracket health derivation live today.
- No shared/ui extraction — CLAUDE.md says shared code only after multiple use cases justify it; two consumers (predict, results) is the minimum, and the results bracket has enough read-only specifics (HitChip, actual/predicted score pair, locked-feeling interaction) that a forced shared abstraction would muddy both call sites.

## Design

### 1. Page shell — width bump

`apps/web/src/app/(authenticated)/pools/[id]/results/page.tsx`:

- `style={{ maxWidth: 1100, ... }}` → `maxWidth: 1400`.

That is the only change to the page shell. The header (eyebrow + title + user-rank chip), `StageBar`, and `ResultsPageClient` all already lay out fine at wider widths.

### 2. `ResultsPageClient` knockout grid

No structural change. Today's grid is `[minmax(0,1fr)_240px]`. At the new 1400 width, the bracket gets ~1140px before horizontal scroll vs ~840 today, comfortably fitting R16 + QF + SF + Final columns on a typical 1440p desktop.

### 3. `KnockoutBracket` — column geometry and bronze placement

Rewrite to mirror predict's `BracketSection` column geometry while staying read-only:

- Column geometry constants borrowed from predict: `TIE_GAP = 8`, `TIE_H` set to match the redesigned card height (target ~80 — header strip + two team rows). `columnPaddingTop(n)` and `columnItemGap(n)` keep the doubling-pattern centering.
- Round-column width `minWidth: 190` (was 160), Final column `minWidth: 220`.
- Banner stays at the top, but copy and styling normalized to match predict's `.green-050 / .green-300 / .green-700` palette and 13px font.
- **Bronze moves into the right-most "Final" column under the Final card**, separated by an eyebrow `3rd Place` label, exactly like predict. It is no longer rendered as a separate row beneath the bracket.

### 4. `BracketMatchCard` — non-Final ties, predict-style

Rewrite the card to mirror predict's `TieCard` look with results overlays:

- `.card` container with conditional border color driven by `hit`:
  - `exact` / `outcome` → `var(--green-300)`
  - `missed` → `oklch(0.85 0.08 25)` (the busted red predict already uses)
  - `pending` → `var(--line-soft)`
- **Header strip** (small, sits above the team rows):
  - Left slot: actual score `2–1` if final, else kickoff date `Jun 14`, else round label fallback
  - Right slot: `<HitChip status={hit} />` (replaces today's `PickStatusChip`)
- **Two team rows**, modeled on predict's `PickRow`:
  - `<TeamBadge teamId={...} size="sm" />` (the predict feature's badge component is in `@/shared/ui` — both features already import it from shared)
  - Team name
  - **Picked row** — green-tint background + small green check icon (`Icon name="check"`). Visible as soon as the user has picked, regardless of whether the tie is final.
  - **Actual winner row** (when the tie is final) — small green check icon on the right end of the row, distinct from the picked-row's row-background highlight (which lives on the left/middle of the row). If picked == actual, both treatments stack on the same row and read as a clear win for the user. If picked ≠ actual, the picked row stays green-tinted on the left, the actual-winner row gets the right-edge check, and the card border goes red — at a glance the user sees "I picked them, but they lost".
  - Rows do not function as buttons; they are non-interactive presentational elements.

When neither team has resolved yet (group stage incomplete, upstream tie undecided), the card renders the `To be determined` placeholder like today.

### 5. `FinalResultCard` — new component

Add `apps/web/src/features/results/ui/FinalResultCard.tsx`, modeled on predict's `FinalCard`:

Props:

```ts
type Props = {
  match: KnockoutMatchView; // home/away/actual/picked + new predictedHome/predictedAway
  matchKey: 'final' | 'bronze';
};
```

Behavior:

- `matchKey === 'final'` → dark `var(--ink-900)` background, **gold Champion pill** at the bottom showing the user's picked champion (the Final winner pick). If the tie is final and an actual champion exists, the pill switches to the actual champion (still gold).
- `matchKey === 'bronze'` → lighter `var(--surface)` background, **bronze pill** (`oklch(0.80 0.06 55)`) showing the user's picked 3rd-place winner.
- **Header strip**: actual score (large, prominent) if final; else kickoff date or "Final" label. Right slot: `<HitChip />`.
- **Predicted score readout** (small, sits under the actual score): `Your pick: 2–1`. When there is no actual yet, only the predicted line shows.
- Team rows like `BracketMatchCard`, dark-on-dark for Final.
- Read-only — no `ScoreCell`, no tiebreak picker.

### 6. `PickStatusChip` — deletable

After `HitChip` replaces it in every consumer, `PickStatusChip.tsx` becomes dead code. Delete it and prune the import path. `BracketHealthPanel` does not currently use it (verified during exploration); if any other consumer surfaces, switch it to `HitChip`.

### 7. `BracketHealthPanel` — keep

No structural change. Visual pass to make sure borders and font sizes look right next to the redesigned cards. Same props.

### 8. Data — extend `KnockoutMatchView` and derive `hit`

`apps/web/src/features/results/domain/types.ts`:

```ts
export type KnockoutMatchView = {
  // existing fields
  predictedHome: number | null; // populated only for round === 'Final' or bracketMatchKey === 'bronze'
  predictedAway: number | null; // ditto
  hit: MatchHit; // exact | outcome | missed | pending
};
```

`MatchHit` already exists for group matches and includes `exact / outcome / missed / pending` — reuse it.

`apps/web/src/features/results/application/get-results-view.ts`:

- Load each user's Final and Bronze predicted scores from the prediction record (the predict feature already persists these via `saveFinishScore`). The application file already loads predictions for group matches and already has a `computeHit(predictedHome, predictedAway, actualHome, actualAway)` helper that returns `{ hit, points }` — reuse it.
- Populate `predictedHome` / `predictedAway` only on the Final and Bronze `KnockoutMatchView`s. All other rounds leave them `null`.
- Compute `hit` per tie:
  - **Non-Final / Non-Bronze**: `pending` until tie is final; then `outcome` if `pickedWinnerId === actualWinnerId && pickedWinnerId !== null`, else `missed`. `exact` is not possible (no score prediction on these ties).
  - **Final / Bronze**: `pending` until final; then `exact` if predicted score matches actual score; else `outcome` if picked winner matches actual winner; else `missed`. If the user never picked a winner (`pickedWinnerId === null`) or never entered a predicted score, `missed` once final. Reuses the existing `computeHit` helper for the exact/outcome/missed branch.

`pickStatus` (today's `alive | busted | pending | no-pick`) becomes redundant for the card rendering once `hit` is on every tie. Keep `pickStatus` on the type for now (it's still consumed by `BracketHealthPanel`'s alive/busted counts via the prior path); revisit removal after the redesign lands.

### 9. Files touched

- **Modify** `apps/web/src/app/(authenticated)/pools/[id]/results/page.tsx` — width bump 1100 → 1400.
- **Modify** `apps/web/src/features/results/ui/KnockoutBracket.tsx` — column geometry, banner alignment, bronze into Final column, render new `FinalResultCard` for Final + Bronze.
- **Modify** `apps/web/src/features/results/ui/BracketMatchCard.tsx` — rewrite to predict-style two team rows + `HitChip` header.
- **Create** `apps/web/src/features/results/ui/FinalResultCard.tsx` — new dark-Final / bronze-3rd-place card with actual + predicted score.
- **Modify** `apps/web/src/features/results/domain/types.ts` — add `predictedHome`, `predictedAway`, `hit` on `KnockoutMatchView`.
- **Modify** `apps/web/src/features/results/application/get-results-view.ts` — populate the new fields.
- **Delete** `apps/web/src/features/results/ui/PickStatusChip.tsx` once unreferenced; remove its export from the feature barrel if exported.
- **Modify** `apps/web/src/features/results/index.ts` — export adjustments only if barrels change.
- **Tests**: unit tests for `BracketMatchCard` and `FinalResultCard` (render-by-state matrix), updated integration assertions if any existing test selects on `PickStatusChip` output or on the old card structure.

### 10. Testing

Per the test diamond and the project's coverage scope (UI components and `app/` routes intentionally excluded; tests cover domain + application + API + shared + scripts):

- **Integration** (`get-results-view.test.ts`): extend the existing knockout-pick tests to assert `predictedHome` / `predictedAway` / `hit` on `KnockoutMatchView`. Cover the full matrix: a non-Final tie with each of `outcome` / `missed` / `pending`, and a Final tie with each of `exact` / `outcome` / `missed` / `pending`, including the "no predicted score" path on Final.
- **No new UI unit tests** — UI components are excluded from coverage scope by project convention. Components are testable indirectly via integration plus E2E.
- **No new E2E** — the bracket rendering is covered transitively by existing flows. Add a `data-testid` to the new `FinalResultCard` and keep `data-testid` on each tie card so future E2Es can hook in (per CLAUDE.md's `data-testid` rule).

### 11. Out of scope

- Animation / transition flourishes (e.g., pick row flipping when the actual winner is revealed). Not requested.
- Mobile-specific layout changes. The bracket is already horizontally scrollable; the wider page container does not change small-screen behavior because the page is centered and capped.
- Sharing bracket primitives with predict via `shared/ui`. Considered and deferred — see Non-goals.

## Open questions

None at draft time.

## Out of scope but adjacent

If, after the redesign, `pickStatus` proves fully redundant (i.e. `BracketHealthPanel` can derive its alive/busted/pending counts from `hit` directly), drop `pickStatus` from `KnockoutMatchView` in a follow-up. Not gated on this work.
