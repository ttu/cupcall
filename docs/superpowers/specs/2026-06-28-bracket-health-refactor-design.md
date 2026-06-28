# Bracket Health: Bug Fixes + Domain Refactor

**Date:** 2026-06-28  
**Status:** Approved for implementation

## Problem

Two production bugs cause the bracket health panel to show incorrect R32 qualifier counts (25/32 instead of the expected 27/32):

**Bug A — `computeBestThirds` omits conduct scores**  
`computeBestThirds` in `build-group-results.ts` calls `selectQualifiers` without including `homeConduct`/`awayConduct` in the scores array. Since WC 2026 uses `conductScore` as the final tiebreaker (in `standingsTiebreak`), teams tied on all other metrics resolve differently here vs. in `buildGroupStanding` (which correctly includes conduct). This produces a `bestThirdsSet` that can name the wrong teams, causing some actual best-third qualifiers to be marked `eliminated=true`.

**Bug B — `buildR32QualHealth` checks `eliminated` before `qualifies`**  
The current classification check order is:

```
!standing → pending
standing.eliminated → busted   ← wrong: fires before qualifies check
standing.qualifies !== false → alive
else → pending
```

A team with `qualifies='best-third'` (set by live marking) AND `eliminated=true` (caused by Bug A or transient intermediate state) is counted as BUSTED instead of ALIVE.

## Approach

Fix both bugs in the same commit, and simultaneously refactor the domain logic out of the application layer where it currently lives.

## Architecture

**Before:** `buildBracketHealth` and `buildR32QualHealth` are private functions in the application layer (`build-bracket-rounds.ts` and `get-results-view.ts` respectively).

**After:** Both are exported pure functions in a new domain module `domain/bracket-health.ts`, named `computeBracketHealth` and `computeR32QualHealth`. The application layer imports and delegates to them.

This follows the project's vertical-slice and DDD conventions: domain logic is pure and IO-free; application layer orchestrates.

## Files Changed

### New: `domain/bracket-health.ts`

Exports:

- `computeR32QualHealth(predictedQualifiers: string[], groupResults: GroupResultView[]): BracketRoundHealth` — classifies each predicted qualifier as alive/busted/pending. **Fix B applied:** checks `qualifies !== false` before `eliminated`.
- `computeBracketHealth(rounds: BracketRoundResultView[], bronze: KnockoutMatchView | null, def: Tournament): BracketHealth` — aggregates pick counts and per-round scoring from bracket match views.

Private helpers (moved/duplicated from application layer):

- `buildRoundScoringMap(def)` — maps each round label to its scoring target and per-pick points, using `bracket.progression` to find the feeding round.
- `getRoundLabel(matchKey, rounds)` — resolves a bracket match key to its display round label (duplicated from `build-bracket-rounds.ts`, which still needs its own copy).

### New: `domain/bracket-health.test.ts`

Unit tests for the two exported domain functions. Key cases:

- `computeR32QualHealth`: auto-qualifier→alive; best-third→alive; **regression: `qualifies='best-third' && eliminated=true`→alive**; non-qualifying+eliminated→busted; pending (group incomplete); pending (team not in standings); mixed picks.
- `computeBracketHealth`: empty rounds; alive/pending/busted/no-pick counts; bronze included in totals; per-round breakdown; per-round pts 0 when no scoring map entry.

### Modified: `application/build-group-results.ts`

In `computeBestThirds`, include `homeConduct`/`awayConduct` in the `GroupScore` array passed to `selectQualifiers` (Fix A). Matches what `buildGroupStanding` already does.

### Modified: `application/build-bracket-rounds.ts`

Remove `buildBracketHealth` and `buildRoundScoringMap`. Import `computeBracketHealth` from `../domain/bracket-health`.

### Modified: `application/get-results-view.ts`

Remove `buildR32QualHealth`. Import `computeR32QualHealth` from `../domain/bracket-health`.

## Correctness Invariants

- A team with `qualifies='best-third'` is ALWAYS alive, regardless of `eliminated` value.
- `computeBestThirds` and `buildGroupStanding` must use identical scoring inputs (including conduct) so that `bestThirdsSet` agrees with the displayed `qualifies` field.
- The `computeR32QualHealth` function is called after the live best-third marking loop in `getResultsView`, so `qualifies='best-third'` is already set on third-place teams that qualify.
