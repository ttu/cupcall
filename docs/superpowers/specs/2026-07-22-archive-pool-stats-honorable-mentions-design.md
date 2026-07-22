# Archive pool statistics — honorable mentions — design

**Date:** 2026-07-22
**Status:** approved, not yet implemented
**Related:** `docs/superpowers/specs/2026-07-20-archive-pool-statistics-design.md` (introduced the
`ArchivePoolStatsPanel` this extends), `docs/features/pool-archive.md`

## Problem

The existing `ArchivePoolStatsPanel` shows a `knockoutStageLeader` field, but it's mislabeled: it's
simply the member with the max final `pointsTotal` — i.e. the pool's actual winner, **including**
special bets. There's no way to see whether special bets changed who was leading, and no
"honorable mention" recognition for whoever scored best within a single category (knockout picks
alone, or special bets alone). This adds those distinctions.

## Scope

Rename one existing field and add three new ones to `PoolArchiveRecap`, all derived from data
already frozen at archive time (each leaderboard entry already carries a full `ScoreBreakdown`,
including `specials` — no new queries, no DB schema migration, `recap` stays jsonb):

1. **`finalWinner`** (renamed from `knockoutStageLeader`, same computation: max `pointsTotal`) —
   whoever actually won the pool, special bets included.
2. **`preSpecialsLeader`** (new) — whoever would have led based on group + knockout points alone,
   before special bets are added: max of `entry.pointsTotal - entry.breakdown.specials`.
3. **`bestKnockoutPerformer`** (new) — whoever scored the most points from knockout-stage picks
   alone (excludes group stage and special bets): max of
   `bronze + final + roundOf16 + roundOf8 + topFour` (per `ScoreBreakdown`, `topFour` already equals
   `topFourTeams + topFourPosition`).
4. **`bestSpecialBetsPerformer`** (new) — whoever scored the most points from special bets alone:
   max of `entry.breakdown.specials`.

`groupStageLeader` is unchanged (point-in-time from `pointsHistory` at group completion — already
answers "who was best at the group stage").

Explicitly out of scope: tie-break UI (ties keep the existing silent "first in leaderboard order
wins" behavior), backfilling old archives (see Rollout), any change to the accuracy percentage or
other existing highlight panels.

## Computation (`build-highlights.ts` + `build-recap.ts`)

Extend `computeStageLeaders` to accept the full `leaderboard` entries (each already has
`.breakdown: ScoreBreakdown` — confirmed via `archive-pool.ts`'s existing `entry.breakdown` usage)
instead of the stripped-down `{ userId, displayName, pointsTotal }` projection it takes today.
Single pass over entries, tracking five running maxes (strict `>`, so ties go to whichever entry
appears first in leaderboard/rank order — same convention `groupStageLeader`/`knockoutStageLeader`
already use):

```ts
export function computeStageLeaders(
  entries: {
    userId: UserId;
    displayName: string;
    pointsTotal: number;
    breakdown: ScoreBreakdown | null;
  }[],
  pointsHistory: Map<UserId, number[]>,
  groupCompletionStageIndex: number,
): {
  groupStageLeader: StageLeader | null;
  preSpecialsLeader: StageLeader | null;
  finalWinner: StageLeader | null;
  bestKnockoutPerformer: StageLeader | null;
  bestSpecialBetsPerformer: StageLeader | null;
};
```

`LeaderboardEntry.breakdown` (`packages/db/src/repositories/scores.ts`) is typed `ScoreBreakdown |
null` — a member with no score row at all has no breakdown yet. Treat a `null` breakdown as all-zero
categories (not a skip): that member simply can't lead any of these categories, same as if they'd
scored 0 in each.

- `preSpecialsLeader.points` = `entry.pointsTotal - (entry.breakdown?.specials ?? 0)`
- `finalWinner.points` = `entry.pointsTotal` (identical computation to today's `knockoutStageLeader`)
- `bestKnockoutPerformer.points` = `(entry.breakdown?.bronze ?? 0) + (entry.breakdown?.final ?? 0) +
(entry.breakdown?.roundOf16 ?? 0) + (entry.breakdown?.roundOf8 ?? 0) + (entry.breakdown?.topFour ?? 0)`
- `bestSpecialBetsPerformer.points` = `entry.breakdown?.specials ?? 0`

`build-recap.ts` passes the already-fetched `leaderboard` (which has `.breakdown`) straight into
`computeStageLeaders` instead of building a narrower projection, and stores all five results onto
`recap`.

**Testing:** unit tests on the extended `computeStageLeaders` — one case per new leader computation
(distinct winners for each), a case where `preSpecialsLeader` and `finalWinner` differ (specials
changed the outcome) and a case where they're the same person, and a tie-break case confirming
leaderboard-order precedence is preserved. Integration test via `buildPoolArchiveRecap` (pglite)
confirming all five fields land in the frozen recap.

## Data model (`packages/db/src/schema/pool-archive.ts`)

`PoolArchiveRecap` changes:

```ts
export type PoolArchiveRecap = {
  // ...unchanged fields (stages, championPick, bestSingleMatch, biggestUpset,
  // predictionsMade, exactScoreRatePercent, overallAccuracyPercent,
  // groupCompletionStageIndex, groupStageLeader)
  preSpecialsLeader: StageLeader | null; // new
  finalWinner: StageLeader | null; // renamed from knockoutStageLeader
  bestKnockoutPerformer: StageLeader | null; // new
  bestSpecialBetsPerformer: StageLeader | null; // new
};
```

`StageLeader` (`{ userId, displayName, points }`) is reused as-is for all four leader/performer
fields — same shape, different point computation.

## UI (`ArchivePoolStatsPanel.tsx`)

Two groups in the same card, per the approved mockup:

```
POOL STATISTICS
───────────────────────────────────────
Overall prediction accuracy         54%
Group stage leader          Niksmann (209 pts)
Leader before special bets   G. Infantino (270 pts)
Final winner (with specials) G. Infantino (286 pts)

HONORABLE MENTIONS
───────────────────────────────────────
Best at knockout stage       G. Infantino (77 pts)
Best at special bets         J. Doe (16 pts)
```

Each of the four new/renamed rows (`preSpecialsLeader`, `finalWinner`, `bestKnockoutPerformer`,
`bestSpecialBetsPerformer`) renders only when non-null — progressive enhancement, so an
already-archived pool that hasn't been re-archived since this change simply shows fewer rows (no
crash, no new empty-state copy needed). The existing fully-empty fallback (`recap` missing or
`overallAccuracyPercent` not a number → "Statistics aren't available... re-archive to generate
them") is unchanged.

**Testing:** component/story cases for `ArchivePoolStatsPanel` — full recap (all rows present),
legacy recap (old fields only, new ones `undefined`/absent — renders `Pool statistics` section
without the new rows and without an `Honorable mentions` section at all if none of its two fields
are present), and the existing fully-empty legacy state.

## Delivery (one commit)

Single self-contained commit: `computeStageLeaders` extension, `PoolArchiveRecap` type change,
`build-recap.ts` wiring, `ArchivePoolStatsPanel` UI, tests, this spec, and a `docs/PROGRESS.md`
update — per this repo's one-commit-per-feature convention.

## Rollout

The prod WC2026 pool's frozen archive needs re-archiving after this ships (same pattern as prior
archive-recap changes) to populate the four new/renamed fields — the user re-archives via the
existing owner-only UI action (idempotent).
