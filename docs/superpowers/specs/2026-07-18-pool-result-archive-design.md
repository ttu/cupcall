# Pool Result Archive — Design

## Purpose

When a pool owner considers their cup finished, they can freeze a permanent snapshot of the final
standings and per-member score breakdown for that pool. The snapshot is decoupled from live
`pools`/`users`/`predictions` data so it survives:

- A member changing their display name later (archive keeps the name as it was at archive time).
- A member deleting their account (archive keeps their rank/points/breakdown; only their name is
  scrubbed to `"Deleted user"`, since account deletion is a request to remove PII, not history).

It does **not** survive the owner deleting the whole pool — that remains a full cascade, consistent
with every other table hanging off `pools`.

## Trigger

Manual only. The pool owner clicks an "Archive this pool" control on the pool detail page
(`/pools/[id]`). No automatic detection of tournament completion — the `tournaments.status` enum
(`upcoming`/`active`/`finished`) exists in the schema but is never written or read anywhere today, so
this feature does not depend on it.

Re-running "Archive" on a pool that already has one **replaces** the existing snapshot (delete old
entries, insert new ones, update the archive row's metadata/timestamp). There is no historical log of
multiple snapshots — one archive per pool.

## Data model

New migration in `packages/db`:

```sql
create table pool_archives (
  id              text primary key,
  pool_id         text not null references pools(id) on delete cascade,
  pool_name       text not null,          -- frozen at archive time
  tournament_id   text not null,
  tournament_name text not null,          -- frozen at archive time
  archived_at     timestamptz not null default now(),
  archived_by     text references users(id) on delete set null,
  unique (pool_id)                        -- one archive per pool; re-archive is an upsert
);

create table pool_archive_entries (
  id            text primary key,         -- surrogate key: user_id can become null post-deletion
  archive_id    text not null references pool_archives(id) on delete cascade,
  user_id       text references users(id) on delete set null,
  display_name  text not null,            -- frozen; becomes "Deleted user" on account deletion
  rank          integer not null,
  points_total  integer not null,
  breakdown     jsonb not null            -- ScoreBreakdown, copied verbatim from `scores`
);
```

`archived_by` is informational only (who triggered the archive) and is allowed to go `null` if that
user later deletes their account — this does not affect the archive's own content.

## Archive creation

New vertical slice `apps/web/src/features/pool-archive/`, mirroring the existing `pool-backup` and
`results` feature layout:

- `domain/types.ts` — `PoolArchiveView`, `PoolArchiveEntryView`.
- `application/archive-pool.ts` — `archivePool(db, poolId, actorUserId)`:
  1. Load current pool members and their `scores` rows (`pointsTotal`, `breakdown`) — already
     computed by the existing scoring pipeline; no re-scoring here.
  2. Sort by `pointsTotal` desc; assign `rank = index + 1` (same simple convention as the existing
     `buildUserRank` in the results feature — no dense tie-breaking beyond sort order).
  3. Upsert: if a `pool_archives` row exists for this pool, delete its entries and update its
     metadata; otherwise insert a new row. Insert fresh `pool_archive_entries` rows.
- `application/get-pool-archive.ts` — `getPoolArchiveView(db, poolId)`: fetch the archive + entries
  (already sorted by `rank`) for display, or `undefined` if the pool has never been archived.
- `api/actions.ts` — `archivePoolAction` (owner-only server action; reuses the existing
  `assertIsOwner`-style authz check pattern from `features/pools/api/actions.ts`).
- `ui/ArchivePoolControl.tsx` — owner-only button: "Archive this pool" (no archive yet) or
  "Re-archive" + "Archived on \<date\>" (archive exists). Shown in the pool detail page's owner
  section, alongside `PoolBackupControls`.
- `ui/ArchiveStandingsTable.tsx` — read-only rank/name/points table.
- `ui/ArchiveEntryBreakdown.tsx` — per-member score breakdown, presentation reused/aligned with the
  existing `features/results/ui/ScoreBreakdownCard.tsx` (imported through that feature's public
  barrel — no reaching into `results` internals).
- `index.ts` — public barrel.

## Anonymization on account deletion

`deleteUser(db, id)` (`packages/db/src/repositories/users.ts`) runs two sequential statements (no
`.transaction()` — this codebase has none; every multi-step write here is sequential `await`s):

1. `UPDATE pool_archive_entries SET display_name = 'Deleted user' WHERE user_id = :id`
2. `DELETE FROM users WHERE id = :id`

Step 2's cascade automatically sets `pool_archive_entries.user_id` to `null` via
`ON DELETE SET NULL` (and `pool_archives.archived_by` likewise, if applicable). Being kicked from a
pool, or leaving voluntarily, does **not** trigger anonymization — only actual account deletion does.
Display-name _changes_ (without deletion) never touch the archive at all; it's frozen by design.

**Accepted limitation (discovered during implementation, confirmed with the user):** this
anonymization only has something to act on when the deleted user is a **non-owner member** of the
archived pool. `pools.ownerId` references `users.id` with `onDelete: 'cascade'` (pre-existing,
unrelated to this feature), and `pool_archives.poolId` references `pools.id` with `onDelete: 'cascade'`
(this feature). Chained together, deleting the pool _owner's_ account cascades away the pool and, with
it, the entire archive — there is nothing left to anonymize in that case. This mirrors the existing
"pool deletion cascades the archive away" non-goal below; it was not treated as worth a schema redesign
(e.g. decoupling `pool_archives.poolId` from `pools.id` the way `tournamentId` is already decoupled)
because the user opted to keep the simpler FK-cascade behavior and accept the gap.

## Viewing UI

New page `apps/web/src/app/(authenticated)/pools/[id]/archive/page.tsx`:

- Access: any current pool member (`isMember` check, same pattern as the existing results page). If
  the pool has never been archived, show a simple empty state (owner sees the archive control there
  too; non-owners see "Not archived yet").
- Shows: frozen pool name + tournament name, "Archived on \<date\>", the standings table, and each
  member's score breakdown.
- Pool detail page (`/pools/[id]`) gets a link to `/pools/[id]/archive` once an archive exists (visible
  to all members), plus the owner-only archive/re-archive control.

## Authorization

- `archivePoolAction` — owner-only (same authz pattern as `exportPool`/`deletePool`).
- Viewing the archive page — any current member (`isMember`), matching the existing results page.

## Testing

Per the test diamond (CLAUDE.md): mostly integration tests against the pglite test DB.

- `archive-pool.test.ts` — archiving a pool with several scored members produces correct rank
  ordering and copies `breakdown`/`pointsTotal` verbatim; re-archiving replaces prior entries; a pool
  with no members/scores archives with zero entries without error.
- `users.test.ts` (extend existing `deleteUser` tests) — deleting a user who appears in a
  `pool_archive_entries` row anonymizes `display_name` to `"Deleted user"` and sets `user_id` to
  `null`, while `rank`/`points_total`/`breakdown` are unchanged; deleting a user with no archive
  entries is unaffected (existing behavior).
- `get-pool-archive.test.ts` — returns `undefined` for a never-archived pool; returns entries sorted
  by rank.
- Server action authorization tests — non-owner calling `archivePoolAction` is rejected; any member
  can call `getPoolArchiveView`/load the page.
- No new E2E spec required for this change (small, owner-triggered, non-critical-path feature per
  CLAUDE.md's E2E-covers-critical-flows-only guidance) — covered by integration tests.

## Non-goals / explicit scope boundaries

- No automatic "tournament finished" detection.
- Pool deletion still cascades the archive away — only non-owner member name changes/account deletion
  are protected against, not owner-initiated pool deletion. This also covers the owner _indirectly_
  deleting the pool by deleting their own account (`pools.ownerId` cascades from `users.id`,
  pre-existing behavior) — the archive disappears along with the pool in that case too.
- No full prediction-card capture (group scores, bracket picks, special bet values) — only the
  existing per-category `ScoreBreakdown` totals. Full card capture already exists via `pool-backup`'s
  export for a different purpose (disaster recovery / migration, not a public historical record).
- No historical multi-snapshot log — one archive per pool, overwritten on re-archive.
