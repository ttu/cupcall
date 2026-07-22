# Archive pool statistics — design

**Date:** 2026-07-20
**Status:** approved, not yet implemented
**Related:** `docs/features/pool-archive.md`, `docs/PROGRESS.md` ("Champion pick: finish-score
fallback" section, landed 2026-07-20)

## Problem

The pool-archive page (`apps/web/src/app/(authenticated)/pools/[id]/archive/page.tsx`) shows
tournament-wide highlights (champion pick, best single match, biggest upset) but nothing that
answers: "how accurate were the pool's predictions overall?" and "who was actually leading at each
stage of the tournament?" This adds a new, dedicated statistics panel answering both.

## Scope

Three new stats, frozen into `PoolArchiveRecap` at archive time (same pattern as the existing
`championPick`/`bestSingleMatch`/`biggestUpset` fields — no DB schema migration, `recap` is jsonb):

1. **`overallAccuracyPercent: number`** — one blended, pool-wide percentage: of every individual
   prediction anyone made across every category (group-match scores, group order, Final/Bronze
   team + exact-score picks, Round of 16/8 survivor picks, Top Four team + position picks, special
   bets), what fraction earned any credit at all (not necessarily full/exact credit — an
   outcome-only hit on a group score still counts as correct).
2. **`groupStageLeader: { userId, displayName, points } | null`** — whoever had the most points at
   the moment the group stage completed.
3. **`knockoutStageLeader: { userId, displayName, points } | null`** — whoever had the most points
   at tournament end (their final `pointsTotal`). Always shown alongside the group-stage leader,
   even when it's the same person (no lead change) — the "leader" concept is presented plainly, no
   conditional "overtook" framing is required.

Explicitly out of scope: per-member stage-by-stage breakdown tables, per-category accuracy
breakdown display (the engine computes it, but the UI only surfaces the single blended number),
and any change to `ArchiveStatTiles`/`ArchiveHighlightsPanel` (this is a new, separate panel).

## Why a blended "any credit counts" accuracy needs an engine change

Each prediction category currently only exposes **points earned**, not **hit/attempted counts**.
Getting the counts without touching the engine would mean re-implementing each category's
correctness rule outside `packages/engine` — exactly the mistake behind two recent production bugs
(`docs/PROGRESS.md`: "R32 ARG/CPV frozen score" and "SF Position bonus finish-score fallback" — both
were caused by result-derivation logic living outside the engine and drifting out of sync with it).
So this spec adds hit/attempted detail _inside_ the engine's own scoring functions, deriving each
function's point total from that same detail, guaranteeing the accuracy percentage can never
disagree with the real scoring.

## Engine change (`packages/engine/src/scoring/*.ts`, `score.ts`)

Add a small, consistent shape:

```ts
export type CategoryAccuracy = { hits: number; attempted: number };
export type AccuracyBreakdown = {
  groupMatches: CategoryAccuracy;
  groupOrder: CategoryAccuracy;
  bronze: CategoryAccuracy;
  final: CategoryAccuracy;
  roundOf16: CategoryAccuracy;
  roundOf8: CategoryAccuracy;
  topFourTeams: CategoryAccuracy;
  topFourPosition: CategoryAccuracy;
  specials: CategoryAccuracy;
  total: CategoryAccuracy;
};
```

Per category, refactor the existing `scoreXxx` function to compute its `{ hits, attempted }` detail
first, then derive its `Points` return value from that detail (no parallel/duplicate comparison):

- **`scoreGroupMatches`** — attempted += 1 per `actual.matchResults` entry with a corresponding
  predicted score; hit += 1 when the predicted outcome matches (exact **or** correct-outcome —
  both count, per the "any credit" rule).
- **`scoreGroupOrder`** — attempted += 4 per group with a decided `actual.groupOrder`; hit +=
  `positionsCorrect` (the count the function already computes internally before mapping it through
  the 4/2/1/0 point curve).
- **`scoreBronze` / `scoreFinal`** (via `scoreFinishMatch`/`exactScorePoints`) — two independent
  atomic predictions: **team pick** (attempted = `derivedPair.length`, hit = `teamCount`, both
  already computed) and **exact score** (attempted = 1 only if the user submitted a finish score
  _and_ the actual match is decided, hit = 1 if exact).
- **`scoreRoundOf16` / `scoreRoundOf8` / `scoreTopFourTeams`** — attempted = 0 if the actual answer
  set isn't resolved yet, else `derived.<field>.length`; hit = count present in the actual set
  (already computed as `correctCount`/inline loop).
- **`scoreTopFourPosition`** — 4 independent atomic predictions (final winner slot, final loser
  slot, bronze winner slot, bronze loser slot), each attempted only once its match
  (`actual.finalMatch`/`actual.bronzeMatch`) is decided; hit per the existing 4 `if` checks.
- **`scoreSpecials`** — one atomic prediction per bet field; attempted only when the user made that
  specific pick **and** the actual answer is resolved (mirrors the existing guard clauses in
  `scoreIfMatch`/`scoreIfInSet`); hit when the existing match/set-membership check passes.

New `scoreCardAccuracy(derived, inputs, actual, scoring): AccuracyBreakdown` (in `score.ts`,
alongside `scoreCard`) calls each detail function and sums everything into `total`.

**Testing:** one red→green test per category function (mirroring the existing `scoreXxx` test
files), plus aggregate tests for `scoreCardAccuracy`. Existing `scoreXxx`/`scoreCard` tests must
keep passing unchanged (points output is unaffected).

## Pool-archive integration (`apps/web/src/features/pool-archive/application/`)

`build-recap.ts` additionally fetches `getActualResults(db, tournamentId)` (the engine's canonical
`ActualResults`, already used for real scoring via `@/shared/card-scoring`'s `rescoreCard`). For
each pool member (from the already-fetched `leaderboard`):

1. Assemble their `CardInputs` from the pool-wide flat arrays already fetched in `build-recap.ts`
   (`groupScores`, `knockoutPicks`, `finishScores`, `specialBets`), filtered by `userId`.
2. Augment `groupScores` with `actual.matchResults` for any match the member didn't predict —
   mirroring `rescoreCard`'s existing late-joiner handling exactly, so bracket-slot resolution
   can't diverge from real scoring.
3. `deriveCard(augmentedInputs, def)` → `DerivedCard`.
4. `scoreCardAccuracy(derived, cardInputs, actual, scoring)` → that member's `AccuracyBreakdown`.

Sum every member's `.total.hits` / `.total.attempted` into one pool-wide
`overallAccuracyPercent = round(sumHits / sumAttempted * 100)`, or `0` when `sumAttempted === 0`
(nobody predicted anything yet — mirrors the existing `exactScoreRatePercent` null-safe pattern).

**`computeStageLeaders(entryExtras, stages, groupCompletionIndex)`** (new, in `build-highlights.ts`
alongside the other pure highlight computers): finds the member with the max `pointsHistory` value
at the group-completion stage index (reusing the existing `findGroupCompletionDate` helper from
`shared/race-chart.ts` to resolve that index) for `groupStageLeader`, and the member with the max
final `pointsTotal` (from `leaderboard`) for `knockoutStageLeader`. Ties broken by leaderboard order
(existing rank order, itself already tie-broken deterministically).

**Testing:** integration tests via `buildPoolArchiveRecap` (pglite), covering: a member with only
partial-credit picks still counts as correct in the blended %; a pool where nobody has predicted
anything yields `0`, not `NaN`/`Infinity`; group-stage and knockout-stage leaders differing vs. the
same person; tie-break ordering.

## Biggest riser: restrict to the knockout stage

`computeBiggestRiser` (`apps/web/src/features/pool-archive/domain/race-history.ts`) currently scans
every stage transition from index 1 onward, including every group-stage day. With ~48 group matches
spread across many days and 11 pool members, large rank jumps during the group stage are mostly
noise (everyone's points swing a lot as many matches resolve at once) and don't make for a
meaningful highlight the way a knockout-stage jump does (one match, high stakes). `computeBiggestRiser`
gets a new required `knockoutStartIndex: number` parameter; its scan loop starts at
`Math.max(1, knockoutStartIndex)` instead of `1`, so only transitions from the group-stage-complete
point onward are considered (the baseline "from" rank is still taken at the end of the group stage,
so the first eligible transition is "rank at group-stage-end → rank after the first knockout day").
`computeLeadChanges` is unaffected — it keeps scanning the full tournament, since a list of lead
changes isn't distorted by noise the way picking a single "biggest" jump is.

This reuses the same "group-stage-complete" stage index needed for `groupStageLeader` above, so both
consume one new frozen field: **`groupCompletionStageIndex: number`** on `PoolArchiveRecap`,
computed in `build-recap.ts` from the existing `findGroupCompletionDate` helper
(`apps/web/src/shared/race-chart.ts`) resolved to an index within `raceChart.chartStages`
(fallback `0` if not found — shouldn't happen for a finished, archived tournament).
`get-pool-archive.ts` passes `archive.recap?.groupCompletionStageIndex ?? 1` into
`computeBiggestRiser`.

**Testing:** unit tests on `computeBiggestRiser` with a `knockoutStartIndex` that excludes a large
group-stage-only jump but still finds a smaller genuine knockout-stage jump; integration test
confirming `groupCompletionStageIndex` is frozen correctly via `buildPoolArchiveRecap`.

## Data model & UI

`PoolArchiveRecap` (`packages/db/src/schema/pool-archive.ts` — the type, not the DB schema, since
`recap` is jsonb) gains:

```ts
overallAccuracyPercent: number;
groupStageLeader: { userId: UserId; displayName: string; points: number } | null;
knockoutStageLeader: { userId: UserId; displayName: string; points: number } | null;
groupCompletionStageIndex: number;
```

New `apps/web/src/features/pool-archive/ui/ArchivePoolStatsPanel.tsx` — a dedicated `card`-styled
section (matching `ArchiveStatTiles`/`ArchiveHighlightsPanel` visual conventions), rendered on the
archive page below the existing highlights panel. Renders `null`/an empty-state message when
`recap` is null (same fallback pattern `ArchiveHighlightsPanel` already uses for un-archived/legacy
pools).

## Delivery (two commits)

1. **Engine accuracy detail** — `packages/engine` change only, fully covered by its own unit
   tests, no behavior change to existing points output. Self-contained, mergeable independently.
2. **Pool-archive statistics** — builds on (1): `build-recap.ts` integration, `PoolArchiveRecap`
   type extension (including `groupCompletionStageIndex`), the `computeBiggestRiser`
   knockout-restriction change and its `get-pool-archive.ts` call-site update, `ArchivePoolStatsPanel`
   UI, archive-page wiring, tests, `docs/features/pool-archive.md` update, `docs/PROGRESS.md` update.

Both commits update `docs/PROGRESS.md`; this spec is committed together with commit 2 (per this
repo's convention of not committing spec docs separately from their implementation).

## Rollout

The prod WC2026 pool's frozen archive needs re-archiving after commit 2 ships, same as the
champion-pick fix — the user re-archives via the existing owner-only UI action (idempotent).
