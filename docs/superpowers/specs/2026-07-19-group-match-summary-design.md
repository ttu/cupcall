# Group Stage Match Summary Sheet — Design

Date: 2026-07-19

## Goal

Tapping any group-stage match — completed, today, or upcoming — opens the same kind of detail
sheet the knockout tab already has: the user's own predicted score, how the pool split on the
outcome, an adaptive insight line, and every pool member's prediction.

## Scope

- Applies to every group-stage match, regardless of played status (completed, today, upcoming).
- Entry points: `GroupMatchFeed` rows (completed + upcoming, per group) and `TodayMatchesFeed`
  rows (cross-group "Today" strip).
- Presented as a bottom sheet / modal overlay using the native `<dialog>` element, same mechanism
  as the knockout `MatchSummarySheet` — the open/backdrop-close boilerplate is extracted into a
  shared hook (`useDialogSheet`) so both sheets reuse it instead of duplicating the `useEffect` +
  ref wiring.
- Viewer mode (no current user) is supported: the "Your pick" section is simply omitted.
- A dedicated `GroupMatchSummarySheet` component, not a generalization of the knockout
  `MatchSummarySheet` — group matches are always a plain scoreline prediction with no
  penalty-shootout / extra-time / predicted-opponent concepts, so folding them into the same
  component would only add unrelated branching to both.

### Out of scope

- Any change to knockout `MatchSummarySheet` behavior.
- New pool-stats aggregate shapes — the sheet reuses the existing `MatchPredictionStats` shape
  and the existing `PredictionStatsBar` component verbatim.

## Data approach

All data the sheet needs already exists client-side today in `ResultsView.pointsRaceView`:
`matchMatrix: MatchMatrixEntry[]` and `matrixMatches: MatrixMatch[]` (the same data `MatchMatrix.tsx`
renders for the Points Race tab). The sheet's view model is built by **transposing that existing
matrix for one `matchId`** — no new server endpoint, no new engine invocation. This mirrors the
knockout sheet's precedent of reusing `knockoutMatrix`/`knockoutMatrixMatches` rather than adding a
parallel data path.

### Type additions (`domain/types.ts`)

```ts
// Extend the existing MatchMatrixCell with the raw predicted score, so a single match's cells
// can be transposed into a per-user prediction list (mirrors KnockoutMatrixCell's
// predictedHome/predictedAway addition for the knockout sheet).
export type MatchMatrixCell = {
  matchId: string;
  hit: MatchHit;
  points: number;
  predictedOutcome: '1' | 'X' | '2' | null;
  /** The user's predicted score for this match. Null when they made no prediction. */
  predictedHome: number | null;
  predictedAway: number | null;
};

// Extend the existing MatrixMatch with the owning group, so the summary sheet header can show
// a "Group A" label without a second lookup.
export type MatrixMatch = {
  matchId: string;
  groupId: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  status: 'scheduled' | 'in_progress' | 'final' | 'cancelled';
  kickoff: string | null;
  actualHome: number | null;
  actualAway: number | null;
};
```

`buildMatchMatrix` (in `build-race-view.ts`) already computes `pred` (the user's predicted score)
and has `m.groupId` in scope when building `matrixMatches` — populating the new fields is a local
addition to that existing function, no new inputs required.

### New pure domain selector (`domain/group-match-detail.ts`)

```ts
export type GroupMatchDetailPrediction = {
  userId: string;
  displayName: string;
  isCurrentUser: boolean;
  predictedHome: number | null;
  predictedAway: number | null;
  hit: MatchHit;
  points: number;
};

export type GroupMatchDetail = {
  totalPredictions: number;
  poolStats: MatchPredictionStats | null; // null when totalPredictions === 0
  insight: string | null; // null when totalPredictions === 0
  predictions: GroupMatchDetailPrediction[]; // sorted, see below
};

export function buildGroupMatchDetail(
  match: MatrixMatch,
  matchMatrix: MatchMatrixEntry[],
): GroupMatchDetail;
```

Behavior:

- For each `MatchMatrixEntry`, find the cell matching `match.matchId` and map it into a
  `GroupMatchDetailPrediction`. A row with no cell for this match (shouldn't happen, `matchMatrix`
  always has one cell per `matrixMatches` entry) falls back to `predictedHome/Away: null, hit:
'pending', points: 0`.
- `poolStats`: computed directly from the collected `predictedHome/Away` values across all
  predictions (home win / draw / away win counts → rounded percentages, plus average predicted
  goals each side) — same formula as `computeMatchPredictionStats` in `build-group-results.ts`,
  reimplemented locally so the sheet's view model is self-contained (no second data source
  threaded through `ResultsPageClient`). `null` when no one has predicted this match yet.
- Sort order: the current user's row first (when present), then the rest by `points` descending,
  tie-broken by `displayName` ascending — identical to `buildKnockoutMatchDetail`.
- Insight sentence:
  - `totalPredictions === 0` → `null` (UI hides the insight line).
  - Match not yet final (`match.status !== 'final'`) → `"X of Y predicted a {home win|draw|away
win} so far."` (majority outcome by count).
  - Match final → `"X of Y predicted a {outcome} — the pool got it {right|wrong}."`, where
    right/wrong compares the majority outcome to the actual outcome derived from
    `match.actualHome`/`match.actualAway`. When at least one prediction has `hit === 'exact'`,
    append `" N nailed the exact score."`

## UI

### `GroupMatchSummarySheet.tsx` (new, `features/results/ui/`)

Presentational component, receives `match: MatrixMatch`, `detail: GroupMatchDetail`, `onClose: ()
=> void`. Internally composed of named sub-components in the same file:

- `SheetHeader` — "Group {match.groupId}" eyebrow, team badges/names, actual score (or "vs" +
  kickoff date when not yet played), close button. No penalty/extra-time/opponent handling — group
  matches never have those.
- `YourPickSection` — only rendered when `detail.predictions` contains a current-user row with a
  non-null `predictedHome`. Shows `predictedHome`–`predictedAway` and a hit chip (via `HitChip`,
  which already accepts a plain `MatchHit`).
- Pool distribution — reuses the existing `PredictionStatsBar` component (`ui/TodayMatchesFeed.tsx`
  already exports it) fed by `detail.poolStats`, wrapped in a `data-testid="group-match-summary-pool-bar"`
  container with a "How the pool predicted it · N picks" eyebrow, or "No picks yet." when
  `poolStats === null`.
- Insight paragraph — rendered only when `detail.insight !== null`.
- `PredictionsList` / `PredictionRow` — avatar (reuses shared `Avatar`), display name (+ "YOU"
  chip), predicted score (or "—" when `predictedHome === null`), and a hit chip resolved via a new
  `resolveGroupPredictionHitDisplay` util (`ui/group-match-summary-utils.ts`, mirrors
  `match-summary-utils.ts`'s `resolvePredictionHitDisplay`):
  - `predictedHome === null` → custom muted "No pick" chip.
  - `hit === 'pending'` (has a prediction, match unresolved) → custom muted "Pending" chip.
  - otherwise → `HitChip` with the plain `MatchHit` (`'exact' | 'outcome' | 'missed'`).

### Shared dialog hook (`ui/use-dialog-sheet.ts`, new)

Extracts the `<dialog>` ref/`showModal`/close-listener/backdrop-click-close boilerplate currently
inlined in `MatchSummarySheet`, so `MatchSummarySheet` and `GroupMatchSummarySheet` both use:

```ts
export function useDialogSheet(onClose: () => void): {
  dialogRef: RefObject<HTMLDialogElement | null>;
  handleBackdropClick: (event: React.MouseEvent<HTMLDialogElement>) => void;
};
```

`MatchSummarySheet` is refactored to use this hook (behavior-preserving — no visible change).

### Trigger wiring

- `GroupMatchFeed` gains a required `onOpenMatch: (matchId: string) => void` prop. Both the
  completed-match row and the upcoming-match row wrap their content in a
  `<button type="button" data-testid="group-match-row">` instead of a plain `<div>`.
- `TodayMatchesFeed` gains a required `onOpenMatch: (matchId: string) => void` prop. Its row wraps
  in a `<button type="button" data-testid="today-match-row">`.
- `ResultsPageClient` owns `const [openGroupMatchId, setOpenGroupMatchId] = useState<string |
null>(null)`. Passes `onOpenMatch={setOpenGroupMatchId}` to `GroupMatchFeed` (per group) and
  `TodayMatchesFeed`. When `openGroupMatchId` is set: looks up the `MatrixMatch` from
  `view.pointsRaceView.matrixMatches`, calls `buildGroupMatchDetail(match,
view.pointsRaceView.matchMatrix)`, and renders `<GroupMatchSummarySheet ... onClose={() =>
setOpenGroupMatchId(null)} />`.

## Testing

- **Unit (domain)**: `group-match-detail.test.ts` — pool-stats percentages (including the
  zero-predictions case), insight sentence for right/wrong/pending/no-predictions and the
  exact-score clause, sort order (current user pinned first, points-desc, displayName tie-break),
  fallback when a row has no cell for the match.
- **Unit (ui)**: `group-match-summary-utils.test.ts` — the three display cases (no-pick / pending /
  matchHit).
- **Integration**: extend `get-results-view.test.ts` asserting `matchMatrix` cells carry
  `predictedHome`/`predictedAway` and `matrixMatches` carry `groupId`.
- **E2E**: one flow — tap a finished group match row, assert the sheet's key `data-testid`s are
  visible with expected content, close it. Selectors follow the `data-testid` convention per
  CLAUDE.md.
