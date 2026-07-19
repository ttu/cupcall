# Pool Result Archive

**Status:** Implemented
**Location:** `apps/web/src/features/pool-archive/`

## Purpose

When a pool owner considers their cup finished, they can freeze a permanent snapshot ("archive") of
that pool's final standings and per-member score breakdown. The archive is decoupled from live
`pools`/`users`/`predictions` data so it survives a member changing their display name later, and
survives a member deleting their account — except that account deletion also scrubs the deleted
member's name from any archive they appear in (`"Deleted user"`), since account deletion is a request
to remove PII, not history.

## Trigger

Manual only, owner-triggered. The pool owner clicks "Archive this pool" (or "Re-archive" if one
already exists) on the pool detail page or the archive page itself. There is no automatic detection of
"tournament finished" — the `tournaments.status` enum (`upcoming`/`active`/`finished`) exists in the
schema but is not written or read anywhere in the app, so this feature does not depend on it.

Re-archiving a pool **replaces** its previous snapshot (delete old entries, insert new ones, update
the archive row's metadata/timestamp) — there is no historical log of multiple snapshots, one archive
per pool.

## Data model

Two tables, added in `packages/db/migrations/0009_pool_archives.sql`:

```sql
pool_archives (
  id              text primary key
  pool_id         text not null references pools(id) on delete cascade, unique
  pool_name       text not null              -- frozen at archive time
  tournament_id   text not null
  tournament_name text not null              -- frozen at archive time
  archived_at     timestamptz not null default now()
  archived_by     text references users(id) on delete set null
)

pool_archive_entries (
  id            text primary key
  archive_id    text not null references pool_archives(id) on delete cascade
  user_id       text references users(id) on delete set null   -- nullable: survives anonymization
  display_name  text not null              -- frozen; becomes "Deleted user" on account deletion
  rank          integer not null
  points_total  integer not null
  breakdown     jsonb not null             -- ScoreBreakdown, copied verbatim from `scores`
)
```

`pool_archives.pool_id` is unique — enforcing one archive per pool, so re-archiving is an upsert
(delete + reinsert entries) rather than an append.

## Archive creation

`archivePool(db, { poolId, poolName, tournamentId, tournamentName, archivedBy })`
(`apps/web/src/features/pool-archive/application/archive-pool.ts`):

1. Reads the pool's current leaderboard via the existing `getLeaderboard(db, poolId)` — the same
   `pointsTotal`/`breakdown: ScoreBreakdown` already computed by the scoring pipeline and stored in
   the `scores` table. No re-scoring happens here.
2. Assigns `rank = index + 1` from `getLeaderboard`'s existing sort order
   (`pointsTotal DESC NULLS LAST, displayName ASC`) — this function does no re-sorting of its own, so
   ranking authority stays in one place.
3. Members with no `scores` row yet default to 0 points and an all-zero `ScoreBreakdown`
   (`emptyBreakdown()`).
4. Calls `upsertPoolArchive` (`packages/db/src/repositories/pool-archive.ts`), which upserts the
   `pool_archives` row (unique on `poolId`) and replaces its `pool_archive_entries`.

## Anonymization on account deletion

`deleteUser(db, id)` (`packages/db/src/repositories/users.ts`) runs two sequential statements (no
`.transaction()` — this codebase has none):

1. `UPDATE pool_archive_entries SET display_name = 'Deleted user' WHERE user_id = :id`
2. `DELETE FROM users WHERE id = :id`

Step 2's cascade sets `pool_archive_entries.user_id` to `null` automatically via
`ON DELETE SET NULL`. Being kicked from a pool, or leaving voluntarily, does **not** trigger
anonymization — only account deletion does. Display-name _changes_ (without deletion) never touch the
archive at all; it's frozen by design.

**Accepted limitation:** this anonymization only has something to act on when the deleted user is a
**non-owner member** of the archived pool. `pools.ownerId` references `users.id` with
`onDelete: 'cascade'` (pre-existing, unrelated to this feature), and `pool_archives.poolId` references
`pools.id` with `onDelete: 'cascade'`. Chained together, deleting the pool's _owner_ cascades away the
pool and, with it, the entire archive — there is nothing left to anonymize in that case. This was
discovered during implementation and confirmed with the user: the simpler FK-cascade schema was kept,
and the gap accepted, rather than decoupling `pool_archives.poolId` from `pools.id` (the way
`tournamentId` is already decoupled) to close it.

## Authorization

- Archiving (`archivePoolAction`) — owner-only, via `assertIsOwner`.
- Viewing the archive page — any current pool member (`isMember`), same pattern as the results page.

## File layout

```
features/pool-archive/
  domain/types.ts                        ← PoolArchiveView, PoolArchiveEntryView, PoolArchiveRecap,
                                            ChampionPickHighlight, BestSingleMatchHighlight,
                                            BiggestUpsetHighlight, LeadChangeEvent, BiggestRiserEvent
  domain/race-history.ts                 ← computeLeadChanges, computeBiggestRiser (pure, no DB)
  domain/race-history.test.ts            ← 6 unit tests
  domain/race-chart-adapter.ts           ← toRaceChartData (frozen data → RaceChart's expected shape)
  application/archive-pool.ts            ← archivePool
  application/archive-pool.test.ts       ← 3 integration tests
  application/build-recap.ts             ← buildPoolArchiveRecap (orchestrates the recap computation)
  application/build-recap.test.ts        ← 2 integration tests
  application/build-highlights.ts        ← computeChampionPick, computeBestSingleMatch,
                                            computeBiggestUpset, computePredictionsMade,
                                            computeExactScoreRatePercent (pure aggregation functions)
  application/build-highlights.test.ts   ← 12 unit tests
  application/get-pool-archive.ts        ← getPoolArchiveView
  application/get-pool-archive.test.ts   ← 4 integration tests
  api/actions.ts                         ← archivePoolAction (owner-only server action)
  api/actions.test.ts                    ← 3 integration tests (owner/non-owner/invalid input)
  ui/ArchivePoolCard.tsx                 ← archive/re-archive button + "View archive" link
  ui/ArchiveMemberRow.tsx                ← rank/name/points row + embedded ScoreBreakdownCard
  ui/ArchiveHeroCard.tsx                 ← champion/final-score hero card (data read live)
  ui/ArchiveHighlightsPanel.tsx          ← 4 highlight rows
  ui/ArchiveLeadChangesPanel.tsx         ← lead-changes timeline
  ui/ArchiveStatTiles.tsx                ← matches played / predictions made / exact-score rate / upset
  index.ts                               ← public barrel
```

`ScoreBreakdownCard` is exported from `@/features/results`'s public barrel so this feature can reuse
it without reaching into `results`' internals. The recap additions needed several more helpers from
that same barrel: `resolveActualWinner`, `computeHit`, `buildRaceEventDates`, `RACE_COLORS`,
`utcDateStr`, and `buildRaceChartData`/`RaceChart`/`RaceChartData` (already exported).

## Recap (hero card, highlights, race chart, lead changes)

On top of the plain standings, the archive page now shows a richer recap, split between data that's
**frozen at archive time** (because it depends on that pool's members' predictions, which can
disappear if a member deletes their account) and data that's **read live** (tournament-level facts
that are never user-deletable):

- **Read live**: champion team, final score, matches played — from `getActualResults`/
  `getTournamentById`/`getMatchesForTournament`.
- **Frozen at archive time** (`pool_archives.recap` + per-entry `points_history`/`stage_reasons`,
  both nullable, not backfilled — a pool archived before this feature just shows "no recap yet"):
  - **Champion pick** — the most-picked team for the tournament's final match, among the pool's
    knockout picks. Tie-break: first team in `Tournament.teams` order.
  - **Best single match** — the group-stage match with the highest exact-score agreement across the
    pool. Restricted to group-stage matches only: knockout rounds before the Final only ever capture
    a winner _pick_, never a score guess, so there's no "exact scoreline" to agree on there.
  - **Biggest upset called** — the resolved knockout tie with the fewest (but nonzero) correct picks
    on the actual winner, via the existing `resolveActualWinner` helper (`MatchRow.winnerTeamId` is
    only populated for penalty-shootout wins, so this must never read it directly).
  - **Predictions made** / **pool exact-score rate** — simple pool-wide aggregates.
  - **Points-race chart** — the existing `buildRaceChartData`'s output (stage labels + per-member
    cumulative points), frozen verbatim rather than recomputed live. Stage labels are calendar dates
    ("Jul 19"), not named milestones ("R16"/"QF") — this reuses the existing, already-tested date-
    based chart rather than building a second milestone-based variant.
  - **Biggest riser** / **Lead changes** — derived (not stored) from the frozen per-member
    `points_history` at _view_ time, via `race-history.ts`'s pure `computeBiggestRiser`/
    `computeLeadChanges`. Both use `displayName`-ascending tiebreaks for equal points, matching
    `getLeaderboard`'s existing convention.
  - **Per-member "stage reasons"** — a short, template-filled reason for each stage transition
    (e.g. `"5 exact scores"`, `"ARG, BRA advance as picked"`, `"Champion pick correct"`), used by the
    lead-changes/biggest-riser UI. Template-filled from bounded aggregates computed at archive time —
    not free-text/NLG-generated, so wording won't match every scenario as specifically as a
    hand-written recap would.

## UI

`ArchivePoolCard` appears in the pool detail page's owner section
(`app/(authenticated)/pools/[id]/page.tsx`), right after `PoolBackupControls`: owner-only
archive/re-archive button, plus a "View archive" link (shown to any viewer once an archive exists).
Its owner-facing copy is explicit that the snapshot doesn't survive the _owner's own_ account
deletion (that cascades away the whole pool, per the accepted limitation above).

`/pools/[id]/archive` (`app/(authenticated)/pools/[id]/archive/page.tsx`) is the full recap view:
`ArchiveHeroCard` (champion/score, read live) full-width, then a two-column layout — the points-race
chart + `ArchiveStatTiles` on the left, `ArchiveHighlightsPanel` + `ArchiveLeadChangesPanel` on the
right — followed by the original per-member standings list (`ArchiveMemberRow` + `ScoreBreakdownCard`
per member), unchanged. Gated by `isMember`; shows an empty state if the pool has never been archived.
Every recap section degrades gracefully (a "not available yet" message, or simply not rendering) when
`recap` is `null` — e.g. for a pool archived before this feature existed.

## Non-goals / explicit scope boundaries

- No automatic "tournament finished" detection.
- Pool deletion (and, per the accepted limitation above, the pool owner deleting their own account)
  still cascades the archive away — only non-owner members' name changes/account deletions are
  protected against.
- No full prediction-card capture (group scores, bracket picks, special bet values) — only the
  existing per-category `ScoreBreakdown` totals, plus the bounded recap aggregates above. Full card
  capture already exists via `pool-backup`'s export for a different purpose (disaster recovery /
  migration, not a public historical record).
- No historical multi-snapshot log — one archive per pool, overwritten on re-archive.
- No "Download recap" export (deferred, no spec yet).
- Race-chart stage labels are dates, not named tournament milestones (see "Recap" above).
- Stage-reason text is template-filled from bounded aggregates, not free-text generated.
