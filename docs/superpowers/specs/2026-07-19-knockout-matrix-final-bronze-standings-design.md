# Points Race — Final/Bronze/Standings Columns (Knockout Matrix)

**Date:** 2026-07-19

## Problem

The "By knockout" sub-tab of Points Race (`KnockoutMatrix`, under `PointsRaceTab`) shows one column
per knockout match. For Final and Bronze specifically, the single column awards `hitPoints.get(key)`
(a flat `scoring.final.perTeam` / `scoring.bronze.perTeam`) whenever the user's effective pick equals
the actual winner (`classifyKnockoutCell` in `build-race-view.ts`). That's a "guessed the outright
winner" proxy — it doesn't correspond to any rule in the real scoring engine
(`packages/engine/src/scoring/finish-matches.ts`), which instead awards, independently:

- **team points**: `perTeam` for each of the user's 2 predicted teams that actually played in the
  match (0/`perTeam`/2×`perTeam`), regardless of who wins;
- **exact-score points**: a flat bonus, independent of team correctness, only when the predicted
  scoreline matches exactly (`exactScorePoints`).

Two consequences:

1. **Exact-score is invisible everywhere in the matrix.** There is no column showing whether a
   player nailed the scoreline.
2. **Bronze's "team points" are invisible too.** Unlike Final — where the 2 semifinal columns
   already happen to award `scoring.final.perTeam` for each predicted team that reaches the Final
   (see below) — nothing anywhere credits "your 2 predicted bronze contestants (i.e. your predicted
   SF losers) actually played in the bronze match."

### Why the SF columns already are "Final · Teams"

`buildHitPointsMap` (`domain/hit-points.ts`) uses an offset-attribution scheme: each round's column
is credited with the _next_ round's per-team reward, because "winning this match" and "reaching the
next round" are the same fact. Concretely, for the two SF match columns:

```ts
// hit-points.ts
const finalProg = bracket.progression.find((p) => p.match === bracket.finalMatch);
if (finalProg) {
  for (const sfKey of finalProg.from) map.set(sfKey as string, scoring.final.perTeam);
}
```

So a correct SF1 pick and a correct SF2 pick already sum to exactly `2 × scoring.final.perTeam` —
the full "team points" component of `scoreFinal`. **Adding a new `Final · Teams` column would
double-count this.** Bronze has no equivalent mechanism (a bronze contestant is a _predicted SF
loser_, which nothing currently derives a column for), so `Bronze · Teams` is genuinely new
information, not a duplicate.

## Goal

Replace the Final/Bronze win-guess proxy with columns that map 1:1 onto real, non-overlapping
scoring components, and surface the `topFourPosition` ("final standing order") bonus, which today
only appears as an aggregate line in `ScoreBreakdownCard`.

## Design

### Column plan

| Before                     | After                                                           |
| -------------------------- | --------------------------------------------------------------- |
| `SF1`, `SF2` (unchanged)   | `SF1`, `SF2` (unchanged) — already = Final · Teams              |
| `Final` (win-guess proxy)  | `Final · Score` (exact-score bonus)                             |
| `Bronze` (win-guess proxy) | `Bronze · Teams` (team points) + `Bronze · Score` (exact-score) |
| _(none)_                   | `Standings` — extra column, `topFourPosition` bonus             |

Net: 2 columns removed, 3 added as regular per-match columns (`Final · Score`, `Bronze · Teams`,
`Bronze · Score`), 1 added as a fixed trailing column (`Standings`, reusing the `extraColumn`
mechanism `MatrixTable` already gained for `MatchMatrix`'s group-order column — see
`docs/superpowers/specs/2026-07-19-points-race-group-order-column-design.md`). Every column now
corresponds to exactly one non-overlapping term of the real scoring formula, so `totalPoints` stops
silently diverging from the engine.

### `Standings` column: reuse `breakdown.topFourPosition`, no new logic

`LeaderboardEntry.breakdown` (already threaded into `buildKnockoutMatrix` via `leaderboard`) is a
`ScoreBreakdown | null` that already has an engine-computed `topFourPosition: Points` field — the
exact value we need, already consistent with the real leaderboard total. No reimplementation of
`scoreTopFourPosition`'s 4-slot logic in the results feature; just:

```ts
const standingsPoints = e.breakdown?.topFourPosition ?? 0;
```

This mirrors `buildMatchMatrix`'s `groupOrderPoints = e.breakdown?.groupOrder ?? 0` exactly.

### `Final · Score` / `Bronze · Teams` / `Bronze · Score`: new per-cell computation

These _do_ need new logic — `ScoreBreakdown.final`/`.bronze` are combined totals, not split. Add two
small pure helpers next to `classifyKnockoutCell` in `build-race-view.ts`:

```ts
/** 0/1/2 of the user's two predicted teams (winner + derived opponent) that actually played this match. */
function finishTeamPoints(
  m: KnockoutMatchView,
  pickedWinnerId: string | null,
  pickedOpponentId: string | null,
  perTeam: number,
): number {
  if (m.status !== 'final') return 0;
  const actualTeams = new Set([m.homeTeamId, m.awayTeamId]);
  const count = [pickedWinnerId, pickedOpponentId].filter(
    (id): id is string => id !== null && actualTeams.has(id),
  ).length;
  return count * perTeam;
}

/** Exact-score bonus, independent of team correctness. */
function finishScorePoints(
  m: KnockoutMatchView,
  isExactScore: boolean,
  exactScore: number,
): number {
  return m.status === 'final' && isExactScore ? exactScore : 0;
}
```

Both take values already resolved by the existing `resolveFinishScorePrediction` /
`derivePredictedOpponent` calls in `buildKnockoutMatrixCell` — no new data sources.

Hit/pending/impossible classification is unchanged: reuse `pendingKnockoutHitStatus` as today
(pending while `m.status !== 'final'`, using the same elimination/impossibility rule already special
-cased for Bronze). Once final, `hit = points > 0 ? 'hit' : 'miss'` — same binary the generic
`KnockoutCell` renderer (`KnockoutMatrix.tsx`) already handles for every other column; **no changes
needed to `KnockoutCell`'s rendering logic.** A `Teams` cell showing `+5` (1 of 2 correct) or `+10`
(2 of 2) looks like any other "hit" cell — just a bigger number.

### `buildKnockoutMatrixCell` → `buildKnockoutMatrixCells` (plural)

`buildKnockoutMatrix`'s per-user mapping currently does `sortedMatches.map((m) =>
buildKnockoutMatrixCell(m, shared, user))` — one cell per match. Change to `flatMap`:

- Every match except Final/Bronze: unchanged, yields 1 cell (existing `buildKnockoutMatrixCell`,
  untouched).
- The Final match: yields 1 cell, `Final · Score` (using `finishScorePoints`).
- The Bronze match: yields 2 cells, `Bronze · Teams` then `Bronze · Score`.

Each new cell's `bracketMatchKey` gets a suffix so `getCellKey` stays unique:
`${finalMatchKey}:score`, `${bronzeMatchKey}:teams`, `${bronzeMatchKey}:score`.

`knockoutMatrixMatches` (the column headers) is built the same way, in the same position (so
chronological ordering — Bronze before Final, matching kickoff order — is preserved automatically,
since both new Bronze columns and the new Final column sit at their original match's sorted
position).

### Types

`domain/types.ts`:

```ts
export type KnockoutMatrixMatch = {
  bracketMatchKey: string;
  round: string;
  /** Distinguishes split Final/Bronze columns from a normal progression column. Absent = normal. */
  variant?: 'teams' | 'score';
  homeTeamId: string | null;
  homeTeamName: string | null;
  awayTeamId: string | null;
  awayTeamName: string | null;
  actualWinnerId: string | null;
  kickoff: string | null;
  status: 'scheduled' | 'final';
};

export type KnockoutMatrixEntry = {
  userId: string;
  displayName: string;
  isCurrentUser: boolean;
  cells: KnockoutMatrixCell[];
  /** topFourPosition bonus — shown in the trailing "Standings" column, ahead of Total. */
  standingsPoints: number;
  totalPoints: number;
};
```

`KnockoutMatrixCell` is unchanged — the new cells reuse the exact same shape (`predictedHome`,
`predictedScoreByTeam`, `isExactScore` etc. simply aren't meaningful for a `Teams`-variant cell and
stay at their already-computed values from the shared prediction).

### UI — `KnockoutMatrix.tsx`

- `renderColumnHeader`: when `m.variant` is set, render the round label (`FINAL` / `BRONZE`) as
  today, but replace the team-abbreviation/kickoff sub-line with a muted variant tag ("Teams" /
  "Score") — avoids showing the same two team names twice across a match's split columns.
- Wire `extraColumn` (new `MatrixExtraColumn<KnockoutMatrixCell, { standingsPoints: number }>`):
  header `"Standings"`, `renderCell: (row) => row.standingsPoints`, `width: 56` — copying
  `MatchMatrix.tsx`'s usage verbatim.
- `KnockoutCell` (the per-cell badge renderer): **no changes.**

## Testing

Extend `apps/web/src/features/results/application/get-results-view.test.ts` /
`build-race-view.test.ts` (wherever the existing "includes bronze match and gives bronze.perTeam
points for a hit" case lives):

- Replace/update that case: Bronze should now produce two cells (`Teams`, `Score`) with independently
  correct points for team-count and exact-score scenarios (0/1/2 teams × `perTeam`; exact vs
  non-exact scoreline).
- Add an equivalent case for `Final · Score`.
- Add a case asserting `standingsPoints` reflects `breakdown.topFourPosition` and folds into
  `totalPoints`, mirroring the existing `groupOrderPoints` test added for `MatchMatrix`.
- Add a case proving no double-count: a user who correctly predicts both finalists (SF1 + SF2 hits)
  and nothing else has a `Final · Score` of `0` and `totalPoints` unaffected by any `Final · Teams`
  column (because there isn't one).

No engine-level test changes — no scoring logic changes, only new reads/derivations in the results
feature.

## Files changed

| File                                                    | Change                                                                                                                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/results/application/build-race-view.ts`       | `buildKnockoutMatrix`: split Final/Bronze into `flatMap`'d cells; add `finishTeamPoints`/`finishScorePoints` helpers; add `standingsPoints` from `breakdown.topFourPosition` |
| `features/results/domain/types.ts`                      | Add `variant` to `KnockoutMatrixMatch`; add `standingsPoints` to `KnockoutMatrixEntry`                                                                                       |
| `features/results/ui/KnockoutMatrix.tsx`                | Header renders variant sub-label; wire `extraColumn` for `Standings`                                                                                                         |
| `features/results/application/get-results-view.test.ts` | Cover split Final/Bronze cells and `standingsPoints`                                                                                                                         |

## Out of scope

- Any change to R32/R16/QF/SF column semantics or `hit-points.ts` (they remain the existing
  offset-attribution scheme; SF columns keep double-serving as Final · Teams, unchanged).
- Any change to the Final/Bronze match cards in the Knockout tab (`FinalResultCard.tsx`) or the tap-
  through `MatchSummarySheet` — this is scoped to the Points Race → By knockout matrix only.
- Any change to the real scoring engine (`packages/engine`) — purely a results-feature display fix.
