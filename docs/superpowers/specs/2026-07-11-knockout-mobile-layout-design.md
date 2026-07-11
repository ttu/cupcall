# Design: mobile layout for the Knockout results tab

**Date:** 2026-07-11
**Status:** Approved

## Problem

`ResultsPageClient`'s Knockout tab renders `KnockoutBracket`: a horizontally-scrolling, SVG-connected
bracket built for wide screens. On a phone this means sideways scrolling through narrow ~150px
columns to see any tie — a poor fit for the functional-spec's "mobile-first responsive" requirement
(functional-spec §11). The desired mobile treatment (reference mockup, two states) is a vertical stack
of collapsible round sections: a compact points summary pill up top, then one accordion section per
round showing "N/M played" (or the round's date before it starts), expanding to reveal each tie.

## Goal

Add a mobile-specific rendering of the Knockout tab's content — same underlying data, new layout —
shown below the `md` breakpoint, leaving the existing desktop bracket untouched above it.

## Scope

In scope: summary pill, collapsible round accordion (auto-expanding the currently-relevant round),
reusing `BracketHealthPanel`/`KnockoutPointsPanel` stacked underneath.

Out of scope for this pass: the reference mockup's "Advanced" (expand-all) and "you called it"
(correct-picks-only filter) toggles — no controls for them are built now; can follow up later if
wanted. No changes to `getResultsView`, `ResultsView`, or any DB/engine code — everything renders from
data already computed today.

## Architecture

`ResultsPageClient`'s knockout tab branch splits into two responsive blocks, both fed by the same
`view` data:

```tsx
{
  activeTab === 'knockout' && (
    <div className="flex flex-col gap-6">
      {view.userKnockoutSummary && (
        <div className="hidden md:block">
          <PointsSummaryPanel summary={view.userKnockoutSummary} />
        </div>
      )}

      <div className="md:hidden flex flex-col gap-4">
        {view.userKnockoutSummary && (
          <KnockoutMobileSummary
            summary={view.userKnockoutSummary}
            tiesCalled={getTiesCalledRatio(view.bracketRounds, view.bronzeMatch)}
          />
        )}
        <KnockoutRoundAccordion
          rounds={view.bracketRounds}
          bronzeMatch={view.bronzeMatch}
          userPredictedKnockoutTeamIds={view.userPredictedKnockoutTeamIds}
        />
        {!viewerMode && (
          <>
            <BracketHealthPanel
              health={view.bracketHealth}
              championPick={finalMatch}
              bronzeMatch={view.bronzeMatch}
            />
            <KnockoutPointsPanel rows={view.userKnockoutRoundBreakdown} />
          </>
        )}
      </div>

      <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_240px] gap-6">
        {/* existing KnockoutBracket + right rail, unchanged */}
      </div>
    </div>
  );
}
```

The existing top-of-tab `PointsSummaryPanel` (3-card Earned/Missed/Still-available grid) is wrapped in
`hidden md:block` — it's redundant with the new compact pill on mobile, which replaces it there.
No data-model changes; this is presentation-only.

## New code

### `domain/knockout-mobile-view.ts` (pure, unit-tested)

```ts
export function getRoundPlayedCount(round: BracketRoundResultView): {
  played: number;
  total: number;
};
export function isRoundInProgress(round: BracketRoundResultView): boolean;
export function pickDefaultExpandedRound(rounds: BracketRoundResultView[]): string | null; // returns a round label
export function getTiesCalledRatio(
  rounds: BracketRoundResultView[],
  bronzeMatch: KnockoutMatchView | null,
): { correct: number; decided: number };
```

- `getRoundPlayedCount` — `played` = matches with `actualHome !== null && actualAway !== null`;
  `total` = `matches.length`.
- `isRoundInProgress` — `played > 0 && played < total`.
- `pickDefaultExpandedRound` — first round (in array order) that `isRoundInProgress`; else the
  **last** round (by array order) that is fully played (`played === total && total > 0`); else the
  first round in the array (covers the pre-tournament / nothing-decided-yet state). Returns `null`
  only when `rounds` is empty.
- `getTiesCalledRatio` — across every match in `rounds` plus `bronzeMatch` (final is already inside
  `rounds` per existing `BracketRoundResultView` shape): `decided` = count with both actual goals set;
  `correct` = subset of those with `hit === 'exact' || hit === 'outcome'`.

### `ui/KnockoutMobileSummary.tsx`

Compact pill/card, one row: `"KNOCKOUT POINTS"` eyebrow on the left, `"{correct}/{decided} ties
called"` as secondary text, `"+{earned}"` as a trailing chip (green, matches existing `.chip`
styling). Props: `{ summary: UserPointsSummary; tiesCalled: { correct: number; decided: number } }`.
Not rendered when `userKnockoutSummary` is null (viewer mode) — same guard the desktop panel already
uses.

### `ui/KnockoutRoundAccordion.tsx`

One section per entry in `rounds` (in existing order — entry round through Final, mirroring
`KnockoutBracket`'s `mainRounds`/`finalRound` split), plus a trailing bronze section when
`bronzeMatch` is present:

- **Header** (`<button>`, full width, tap target): round label on the left; on the right either
  `"{played}/{total} played"` (once `played > 0`) or the round's kickoff date (formatted like
  `BracketMatchCard`'s existing date fallback) when nothing in the round has been played yet. A
  chevron icon rotates on expand.
- **Body** (shown when open): the round's matches rendered as stacked `BracketMatchCard`s, full
  width, `flex-col gap-2` — no SVG connectors, no fixed pixel widths (those are bracket-column-only
  concerns in the existing component and don't apply here). `predictedQualifierIds` passed only to
  the entry round, exactly as `KnockoutBracket` does today for `i === 0`.
- Final/bronze section reuses `FinalResultCard` (already used by `KnockoutBracket`/`FinalCards`)
  instead of `BracketMatchCard`, unchanged content.

State: local `useState<Set<string>>` of open round labels, initialized once from
`pickDefaultExpandedRound` (wrapped in `useState(() => ...)` lazy init, not an effect — avoids a
flash of the wrong default). Clicking a header toggles that label in the set; multiple sections may
be open at once (accordion allows multi-open, it does not force single-open — simplest behavior,
matches the mockup where the user can independently expand more than one round).

## Data flow

No new queries, no new server-side computation. Both new pieces of derived state
(`getTiesCalledRatio`, `pickDefaultExpandedRound`) are pure functions over data `getResultsView`
already returns, computed client-side in `ResultsPageClient`/`KnockoutRoundAccordion` at render time
— consistent with how `KnockoutBracket` already treats `bracketRounds` as pre-fetched, render-only
data.

## Error handling / edge cases

- Empty bracket (`rounds.length === 0`) — `KnockoutRoundAccordion` renders the same "will appear here
  once teams are confirmed" empty state `KnockoutBracket` already renders, reusing that copy.
- No matches decided anywhere yet — `pickDefaultExpandedRound` falls back to the first round so the
  accordion never opens with nothing sensible expanded.
- Viewer mode (`viewerMode === true`) — summary pill, `BracketHealthPanel`, and `KnockoutPointsPanel`
  are all omitted, matching desktop's existing viewer-mode gating.

## Testing

- Unit tests in `domain/knockout-mobile-view.test.ts` covering all four helpers: not-started,
  mid-round, fully-decided, and multi-round scenarios for `pickDefaultExpandedRound`; zero-decided and
  mixed hit/miss scenarios for `getTiesCalledRatio`; boundary counts for `getRoundPlayedCount` /
  `isRoundInProgress`.
- No new component-level (RTL) tests — this feature's existing `ui/` components (`BracketMatchCard`,
  `BracketHealthPanel`, etc.) have none either; the project's test diamond puts UI verification in
  manual/E2E coverage, not per-component unit tests. Manual check via the dev server at a mobile
  viewport width.
- No integration-test surface changes (no DB/schema/server-action changes).

## Out of scope

- "Advanced" expand-all toggle and "you called it" correct-picks-only filter from the reference
  mockup.
- Any visual change to the desktop `KnockoutBracket`.
- Per-team goal-column tie-row redesign — mobile ties reuse `BracketMatchCard` as-is (combined score
  header, not per-team score columns), stacked instead of connected.
