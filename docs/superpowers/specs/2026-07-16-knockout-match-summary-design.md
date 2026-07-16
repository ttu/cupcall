# Knockout Match Summary Sheet — Design

Date: 2026-07-16

## Goal

Tapping any knockout bracket match card opens a detail view showing the user's own pick,
how the pool split on that tie, and every pool member's prediction — matching the reference
mockup (`tmp/clipboard-2026-07-16_06-18-10-001.png`).

## Scope

- Applies to every knockout tie: Round of 16 / QF / SF (winner-only picks) and Final / Bronze
  (score picks).
- Entry point: tapping `BracketMatchCard` (desktop bracket + mobile accordion) or
  `FinalResultCard` (Final/Bronze, both surfaces).
- A match is tappable once at least one team slot is confirmed (`homeTeamId !== null ||
awayTeamId !== null`). Fully-TBD matches (both slots still projected) stay non-interactive.
- Presented as a bottom sheet / modal overlay using the native `<dialog>` element — no new
  dependency, built-in focus trap, Escape-to-close, `::backdrop`.
- Viewer mode (no current user) is supported: the "Your pick" section is simply omitted.
- Unplayed matches are supported: header shows kickoff date instead of score, "Your pick" has
  no hit chip, the pool bar uses predicted picks so far, and each predictions-list row shows a
  "Pending" chip instead of points.

### Out of scope

- Venue/city display — no such data exists anywhere in the schema or tournament data files
  today; adding it is a separate data-modeling task.
- Swipe-to-dismiss gesture — the drag-handle bar is decorative only.
- Live recompute of exact-score bonus points for pool members other than the viewer (see
  "Points accuracy" below) — deferred as a separate improvement if ever needed.

## Data approach

All data the sheet needs already exists client-side today in `ResultsView.pointsRaceView`:
`knockoutMatrix: KnockoutMatrixEntry[]` and `knockoutMatrixMatches: KnockoutMatrixMatch[]`
(the same data `KnockoutMatrix.tsx` renders). The sheet's view model is built by **transposing
that existing matrix for one `bracketMatchKey`** — no new server endpoint, no new engine
invocation.

### Points accuracy for Final/Bronze (accepted simplification)

Exact-score bonus points require re-running `scoreFinal`/`scoreBronze` per pool member —
something the app only does today for the viewing user, at pick-save time. `KnockoutMatrix`
already simplifies this for everyone else, showing only winner-pick (`perTeam`) points. The new
sheet follows the same precedent:

- The current user's own row always shows their true, accurate points (sourced the same way
  `FinalResultCard`/`userKnockoutSummary` already do).
- Every other pool member's row shows winner-pick points only. The hit _label_ (Exact / Correct
  / Missed) is still accurate — it's derived from comparing predicted vs. actual score directly,
  which costs nothing extra — but the point number for a member with an exact-score bonus will
  under-report versus their real scoreboard total.

### Type additions (`domain/types.ts`)

```ts
// Extend the existing KnockoutMatrixCell — populated only for the Final/Bronze columns.
export type KnockoutMatrixCell = {
  bracketMatchKey: string;
  hit: KnockoutMatchHit;
  points: number;
  pickedWinnerId: string | null;
  /** Final/Bronze only: the user's predicted scoreline for this tie. Null everywhere else. */
  predictedHome: number | null;
  predictedAway: number | null;
  /** Final/Bronze only: true when predictedHome/Away matched the actual score exactly. */
  isExactScore: boolean;
};
```

`buildKnockoutMatrix` (in `build-race-view.ts`) already has `fs` (the user's finish score) and
`m.actualHome`/`m.actualAway` in scope when building Final/Bronze cells — populating the three
new fields is a local addition to that existing block. Non-Final/Bronze cells get
`predictedHome: null, predictedAway: null, isExactScore: false`.

### New pure domain selector (`domain/knockout-match-detail.ts`)

```ts
export type KnockoutMatchDetailPrediction = {
  userId: string;
  displayName: string;
  isCurrentUser: boolean;
  pickedTeamId: string | null;
  pickedTeamName: string | null;
  /** Final/Bronze only. */
  predictedHome: number | null;
  predictedAway: number | null;
  hit: KnockoutMatchHit;
  isExactScore: boolean;
  points: number;
};

export type KnockoutMatchDetail = {
  totalPredictions: number;
  homePickCount: number;
  awayPickCount: number;
  homePickPct: number | null; // null when totalPredictions === 0
  awayPickPct: number | null;
  insight: string | null; // null when totalPredictions === 0
  predictions: KnockoutMatchDetailPrediction[]; // sorted, see below
};

export function buildKnockoutMatchDetail(
  match: KnockoutMatchView,
  knockoutMatrix: KnockoutMatrixEntry[],
): KnockoutMatchDetail;
```

Behavior:

- For each `KnockoutMatrixEntry`, find the cell matching `match.bracketMatchKey` and map it into
  a `KnockoutMatchDetailPrediction` (team name resolved against
  `match.home/awayTeamName`/`predictedHome/awayTeamName`, falling back to the raw id).
- `homePickCount`/`awayPickCount`: tally predictions whose `pickedTeamId` equals
  `match.homeTeamId`/`match.awayTeamId`. `totalPredictions`: count of predictions with a non-null
  `pickedTeamId`. Percentages are rounded, `null` when `totalPredictions === 0` (avoids
  divide-by-zero and gives the UI an explicit "no picks yet" case).
- Sort order: the current user's row first (when present), then the rest by `points` descending,
  tie-broken by `displayName` ascending.
- Insight sentence:
  - `totalPredictions === 0` → `null` (UI hides the insight line).
  - Match not yet final → `"X of Y have backed <Team> so far."` (majority side by count; no
    right/wrong claim since the match hasn't resolved).
  - Match final → `"X of Y backed <Team> — the pool got it {right|wrong}."`, where
    right/wrong compares the majority side to `match.actualWinnerId`. For Final/Bronze, when at
    least one prediction has `isExactScore`, append `" N nailed the exact score."`

## UI

### `MatchSummarySheet.tsx` (new, `features/results/ui/`)

Presentational component, receives `match: KnockoutMatchView`, `matchKey: 'final' | 'bronze' |
null`, `detail: KnockoutMatchDetail`, `onClose: () => void`. Internally composed of named
sub-components (per CLAUDE.md's extraction guidance) in the same file:

- `SheetHeader` — round eyebrow (uppercase), date or actual score, close button.
- `YourPickSection` — only rendered when `detail.predictions` contains a current-user row with a
  non-null `pickedTeamId`. Final/Bronze show `predictedHome`–`predictedAway`; other rounds show
  team only. Reuses `HitChip`-style visuals.
- `PoolCallBar` — horizontal split bar using `homePickPct`/`awayPickPct`, plus the
  `homePickCount`/`awayPickCount` counts and `totalPredictions` label ("N PICKS").
- Insight paragraph — rendered only when `detail.insight !== null`.
- `PredictionsList` / `PredictionRow` — avatar (reuses shared `Avatar`), display name (+ "YOU"
  chip), pick (team badge + name, or scoreline for Final/Bronze), and a hit chip:
  - Final/Bronze: reuse the existing `HitChip` (`MatchHit`-shaped) by mapping
    `hit === 'hit' && isExactScore` → `'exact'`, `hit === 'hit'` → `'outcome'`,
    `hit === 'miss'` → `'missed'`, `hit === 'pending'` → no chip.
  - Other rounds: reuse `HitChip` mapping `'hit'` → `'outcome'` (never `'exact'`, since no score
    is predicted), `'miss'` → `'missed'`; add small local chip variants for `'no-pick'` (muted
    "No pick") and `'impossible'` (red, matching `KnockoutMatrix`'s styling) since those aren't
    part of `HitChip`'s `MatchHit` union.

Implemented with a native `<dialog>` ref: `showModal()` on open, `close()` on
backdrop-click/Escape/close-button, styled bottom-sheet on mobile and centered modal on desktop
via Tailwind breakpoints. Feature-scoped component (not `shared/ui`), so no Storybook story is
required by CLAUDE.md's rule (that applies to reusable `shared/ui` components).

### Trigger wiring

- `BracketMatchCard` and `FinalResultCard` gain an optional `onSelect?: () => void` prop. When
  provided and the match is tappable, the card's root renders as a `<button>` instead of a
  `<div>` (or wraps content in one) so it's keyboard-accessible.
- `KnockoutBracket` and `KnockoutRoundAccordion` gain an optional `onOpenMatch?: (bracketMatchKey:
string) => void` prop, threaded down to each card as `onSelect={() => onOpenMatch?.(match.
bracketMatchKey)}`.
- `ResultsPageClient` owns `const [openMatchKey, setOpenMatchKey] = useState<string | null>
(null)`. Passes `onOpenMatch={setOpenMatchKey}` to both bracket components. When
  `openMatchKey` is set: looks up the `KnockoutMatchView` from `view.bracketRounds` /
  `view.bronzeMatch`, calls `buildKnockoutMatchDetail(match, view.pointsRaceView.knockoutMatrix)`,
  and renders `<MatchSummarySheet ... onClose={() => setOpenMatchKey(null)} />`.

## Testing

- **Unit (domain)**: `knockout-match-detail.test.ts` — pick counts/percentages (including the
  zero-predictions case), insight sentence for right/wrong/pending/no-predictions and the
  exact-score clause (Final/Bronze only), sort order (current user pinned first, points-desc,
  displayName tie-break), team-name fallback resolution.
- **Unit (domain)**: extend `build-race-view.test.ts` coverage (or a focused test) asserting
  `predictedHome`/`predictedAway`/`isExactScore` are populated correctly for Final/Bronze cells
  and null/false elsewhere.
- **Component**: `MatchSummarySheet` renders header/your-pick/pool-bar/insight/list correctly
  from a fixture `KnockoutMatchDetail`, including the viewer-mode (no "Your pick") and
  not-yet-played variants.
- **Integration**: tapping a `BracketMatchCard`/`FinalResultCard` opens the sheet with the
  right match's data; closing via the close button, Escape, and backdrop click all work.
- **E2E**: one flow — tap a finished knockout match card, assert the sheet's key
  `data-testid`s are visible with expected content, close it. Selectors follow the
  `data-testid` convention per CLAUDE.md.
