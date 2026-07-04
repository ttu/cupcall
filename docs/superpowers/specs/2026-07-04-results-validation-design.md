# Design: results.json pre-commit validation

**Date:** 2026-07-04  
**Status:** Approved

## Problem

Invalid values in `results.json` (e.g. `"extra-time"` instead of `"extraTime"`) are only caught at sync time — after they are already committed. Nothing stops malformed data from reaching the repository.

## Goal

Reject a commit that stages an invalid `results.json` or `tournament.json` before it lands in git history.

## Solution overview

A `scripts/validate-data.ts` script runs via lint-staged on every commit that touches `data/**/{results,tournament}.json`. It validates structure and cross-checks IDs between the two files, exiting non-zero with a specific error on failure.

## 1. Schema: move knockout schema to the schemas package

`rawKnockoutResultsSchema` is currently defined inline in `scripts/sync.ts`. Move and export it from `packages/schemas/src/results.ts` so it is shared between `sync.ts` and the new validate script — no duplication, single source of truth for the knockout entry shape.

Fields validated by the schema:

| Field                      | Rule                                                   |
| -------------------------- | ------------------------------------------------------ |
| `round`                    | enum `R32 \| R16 \| QF \| SF \| Final \| bronze`       |
| `matchId`                  | non-empty string                                       |
| `home` / `away` / `winner` | non-empty string                                       |
| `homeGoals` / `awayGoals`  | non-negative integer                                   |
| `decidedBy`                | enum `regulation \| extraTime \| penalties` (optional) |
| `kickoff`                  | ISO datetime string (optional)                         |

## 2. Validate script: `scripts/validate-data.ts`

Called by lint-staged with one or more staged file paths as `argv`. Collects unique tournament directories from those paths, then for each directory runs:

### 2a. Schema validation

1. Parse `tournament.json` via `tournamentSchema`
2. Parse `results.json` via `resultsSchema` (group results, groupOrder, finalMatch, bronzeMatch, answers)
3. Parse the `knockout` array via the exported `knockoutResultsSchema`

Any Zod parse error surfaces as a clear, formatted message and exits 1.

### 2b. Cross-checks

After both files parse cleanly:

| Check                                                        | Source                                                                                   | Against                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------- |
| Knockout `matchId` values exist in bracket slots             | results.json `knockout[].matchId`                                                        | tournament.json `bracket.slots[].match` |
| Knockout team IDs (`home`, `away`, `winner`) are known teams | results.json `knockout[]`                                                                | tournament.json `teams[].id`            |
| `groupOrder` team IDs are all known                          | results.json `groupOrder` values                                                         | tournament.json `teams[].id`            |
| Player ID references are known                               | `answers.firstRedCardPlayer`, `answers.topScorerPlayer`, `finalMatch.decisiveGoalPlayer` | tournament.json `players[].id`          |

Each cross-check failure prints the specific unknown ID and the field it came from, then exits 1.

### 2c. Output

- **Success:** prints `✓ data/tournaments/<id>/results.json valid` and exits 0
- **Failure:** prints the first validation error with field path and exits 1

## 3. lint-staged config

Add one entry in `package.json`:

```json
"data/**/{results,tournament}.json": ["tsx scripts/validate-data.ts"]
```

Triggers when either file is staged. The script always reads **both** files from disk (they must be validated together as a pair), so staging one validates both.

## Out of scope

- Validating that scores are arithmetically consistent (e.g. winner matches goals)
- Validating `tournament.json` cross-references beyond player/team IDs
- Running in CI (the pre-push `pnpm test` gate is sufficient for that layer)
