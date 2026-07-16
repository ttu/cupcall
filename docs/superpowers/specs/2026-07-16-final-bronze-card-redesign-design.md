# Final / 3rd-Place Result Card Redesign — Design

Date: 2026-07-16

## Goal

Redesign `FinalResultCard` (used for both the Final and 3rd-Place/Bronze tie) to match the
reference mockup (`tmp/clipboard-2026-07-16_07-01-02-200.png`): a dark, unified card per team
with a highlighted winner row, a score line, and a separate "Your pick" pill below the card
that visually signals whether the pick was correct.

## Scope

- Full replacement of `FinalResultCard`'s visual design — not a layer on top of the existing
  structure.
- Applies to both surfaces: mobile (`KnockoutRoundAccordion`) and desktop (`KnockoutBracket`'s
  `FinalCards` column).
- `BracketMatchCard` (R32/R16/QF/SF ties) is untouched.

### Out of scope

- Inventing a per-team penalty shootout scoreline (e.g. "4-2p") — no such data exists anywhere
  in the schema. The mockup's `1-1 · 4-2p` is approximated with existing `decidedBy` data
  instead (see below).
- Points display on the card face — dropped entirely; tapping the card still opens
  `MatchSummarySheet` for the full breakdown.
- Any change to the pick-resolution fallback chain (`pickRowLeftId`/`pickRowRightId`/
  `pickWinnerId` derivation in current `FinalResultCard.tsx`) — that logic encodes real bug
  fixes from recent commits and is reused as-is, just re-skinned.

## Data model addition

`MatchRow.decidedBy: 'regulation' | 'extraTime' | 'penalties' | null` already exists as a column
on every match row (`packages/db/src/repositories/tournament.ts`), it's just not exposed on
`KnockoutMatchView` today (only consumed internally for the "Final decided by penalties" special
bet). Add:

```ts
// domain/types.ts — KnockoutMatchView
/** How the match was decided. Null until the match is played. */
decidedBy: 'regulation' | 'extraTime' | 'penalties' | null;
```

Populated in `buildBracketRounds`'s `buildMatchView` as `decidedBy: actual?.decidedBy ?? null` —
a one-line addition, no new query.

## UI

### Header (new — owned by the card, not the surrounding wrapper)

Centered, above the card body:

- Title: `THE FINAL` / `3RD-PLACE PLAYOFF` — bold, green-600, uppercase, letter-spaced (same
  weight as the current `eyebrow` style, colored green instead of muted).
- Subtitle, centered, muted:
  - Match final: `FT · {kickoff date}` (falls back to just `FT` if kickoff is somehow null).
  - Scheduled with known kickoff: `{kickoff date}` only.
  - Neither: subtitle omitted.

Because the card now owns this header, the surrounding wrapper stops duplicating it:

- **`KnockoutRoundAccordion`**: the `Final` and `3rd Place` entries are no longer wrapped in
  `AccordionSection` — they render directly (no collapse/expand toggle), since the card is a
  single self-explanatory unit now. Other rounds keep their existing `AccordionSection` +
  `BracketMatchCard` list behavior unchanged.
- **`KnockoutBracket`'s `FinalCards`**: drop the `<div className="eyebrow ...">Final</div>` /
  `3rd Place` label lines above each card.

### Card body

Single dark card (`bg-ink-900`, `rounded-cup`) for **both** Final and Bronze — Bronze no longer
uses the lighter `bg-surface` treatment; the two matches now share one visual language.

Two stacked team rows, each: `TeamBadge` (existing `shared/ui` component — already renders the
colored-square/3-letter-code look from the mockup, no changes needed) + team name.

- **Winner row** (`match.actualWinnerId === teamId`): inset background using the existing
  `green-600` token at low opacity (`bg-green-600/15`) — a translucent dark-green tint that
  reads correctly on the `ink-900` card (unlike `bg-green-050`, which is a pale/light tint meant
  for light-background cards elsewhere in the app). Bold `text-on-dark` name, `check` icon
  (existing `Icon` component) at the row's right edge.
- **Loser row**: no background tint, muted `text-on-dark-soft` name, no icon.
- **Unresolved match** (`actualWinnerId === null`): neither row highlighted; both names render
  plain/muted as today (existing `teamLabel` "—" fallback for unknown teams).

The gold `ChampionPill` sub-component is removed — the winner-row highlight now conveys "who
won" inline, making the separate trophy pill redundant.

### Score line

Centered below the two rows, bold, `text-on-dark`: `{actualHome}–{actualAway}`. When
`decidedBy === 'penalties'`, append `· Decided on penalties`. Omitted entirely pre-match (the
header's date subtitle already covers that state).

### "Your pick" pill (new — separate element below the card)

Replaces today's inline "Your pick: 🇫🇷 2–3 🇦🇷" text row. Rendered only when
`hasPredictedScore` (unchanged condition), using the existing pick-resolution fallback chain
(`pickRowLeftId`/`pickRowRightId`, untouched):

- Rounded pill: `Your pick:` label + `TeamBadge` + `{predictedHome}–{predictedAway}` +
  `TeamBadge`.
- Border + corner badge driven by `match.hit`:
  - `'exact'` / `'outcome'` → green border (`border-green-300`), green circular badge with the
    existing `check` icon, positioned overlapping the pill's top-right corner.
  - `'missed'` → red/orange border (existing `border-[oklch(0.85_0.08_25)]` /
    `red-300` token), red circular badge with the existing `close` (X) icon in the same
    overlapping position.
  - `'pending'` → neutral `border-line-soft`, no corner badge.

### Points removed from the card face

`HitChip` is no longer rendered inside `FinalResultCard`. Tapping the card still opens
`MatchSummarySheet` (existing, unrelated feature) for the full points breakdown — no change
needed there.

## Testing

- **Component/unit**: `FinalResultCard` — winner-row highlight for home win / away win /
  unresolved match; score line with and without `decidedBy === 'penalties'`; pick pill border +
  badge for `exact`/`outcome`/`missed`/`pending`; header title text and date/FT subtitle for
  final vs. scheduled matches; existing pick-resolution-chain tests continue to pass unchanged.
- **Unit (domain)**: extend `build-bracket-rounds` coverage asserting `decidedBy` is populated
  from `actual.decidedBy` for Final and Bronze (and `null` for an unplayed match).
- **Integration**: `KnockoutRoundAccordion` — `Final`/`3rd Place` render without an
  accordion/collapse wrapper; other rounds' accordion behavior unaffected.
- **E2E**: existing `results.spec.ts` Final/Bronze card assertions updated to the new DOM
  structure (data-testids on the header, card, and pick pill as needed).
