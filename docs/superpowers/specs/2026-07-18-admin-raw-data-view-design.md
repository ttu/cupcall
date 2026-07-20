# Admin raw data view — design

## Problem

`ResultsView` and `CardView` (see `docs/PROGRESS.md` → "Results & standings additions" / Plan 4)
are the fully-assembled backend view-models the results and predict pages render. When debugging a
production issue (a scoring discrepancy, a stuck pick, an odd bracket state), the only way to
inspect what the backend actually computed for a given pool/member is to read application code and
reason about it, or run ad-hoc SQL against raw tables (`docs/sql-queries.md`) and manually re-derive
what the view-model would have produced. There's no way to see the computed view-model itself in
production.

## Goal

Give pool owners a page that dumps the raw, already-computed `ResultsView` and `CardView` JSON for
any member of their pool, directly in production. Debugging/support tool only — read-only, no new
derivation logic.

## Non-goals

- A general raw-DB-table browser (`docs/sql-queries.md` + the `postgres` MCP tool already cover
  that for one-off investigation).
- A site-wide admin role/dashboard. This project has no global-admin concept today; scope is
  strictly per-pool, gated by the existing pool-owner concept.
- Editing capability. This is a read-only viewer — mutations already exist via `OwnerCardEditor`
  and the owner server actions.

## Access control

Reuse `pool.ownerId` — no schema change, no new authz primitive. The page checks
`actor.userId !== pool.ownerId` and calls `notFound()` for anyone else (including regular pool
members), mirroring how `MemberCardPage` already 404s when `canViewCard` returns false. A 404 (not 403) avoids leaking pool existence/ownership to non-owners.

## Route & data flow

New page: `apps/web/src/app/(authenticated)/pools/[id]/raw/page.tsx`, server component.

- `searchParams: { userId?: string }` — selects which member's data to show. Defaults to the
  owner's own `userId` when omitted or invalid.
- Auth: `getCurrentActor()` → redirect `/` if signed out; `notFound()` if pool missing or actor
  isn't the owner (see above).
- Fetch `getResultsView({ db, poolId, userId: selectedUserId, now })`. Its `leaderboard` field
  (`{ userId, displayName, ... }[]`) is reused as the member picker's data source — no separate
  membership query needed.
- Fetch `getCardView({ db, poolId, userId: selectedUserId, tournamentId, tournament, firstKickoff,
now, createIfMissing: false })`. Returns `null` when the selected member never opened a
  prediction (no row yet) — render "No prediction saved for this member" in that case instead of
  crashing.
- Both calls are existing, already-tested application functions
  (`features/results/application/get-results-view.ts`,
  `features/predictions/application/get-card.ts`). This page adds zero new domain/application
  logic — it's pure composition + display.

## UI

- **Member picker**: plain server-rendered links built from `resultsView.leaderboard`
  (`?userId=<id>`), current selection visually highlighted. No client state.
- **`RawJsonBlock`** (new, `apps/web/src/features/admin/ui/RawJsonBlock.tsx`, client component):
  renders `<pre>{JSON.stringify(data, null, 2)}</pre>` plus a copy-to-clipboard button. The only
  new feature code this design introduces. Two instances on the page: "Card view" and
  "Results view".
- **Entry point**: a "Raw data (debug)" link added to the pool detail page's existing
  owner-controls area, next to `PoolBackupControls`, so the page is discoverable without typing
  the URL.
- Not in `shared/ui` (single-consumer, feature-specific), so per the UI convention in `CLAUDE.md`
  it does not need a Storybook story — consistent with other `features/*/ui` components
  (`GroupTable`, `ScoreCell`, etc., none of which have stories).

## Testing

No new domain/application logic to unit-test — `getResultsView`/`getCardView` are already covered
by existing integration tests. Add one Playwright e2e spec (`apps/web/e2e/admin-raw-view.spec.ts`):

- Pool owner navigates to `/pools/[id]/raw`, sees JSON for the default (own) member.
- Owner switches member via the picker (`data-testid="raw-member-link-<id>"`) and sees the JSON
  update.
- Copy button (`data-testid="raw-card-json-copy-button"`, following the `${testId}-copy-button`
  pattern) is present.
- A non-owner member navigating to the same URL gets a 404.

## Out of scope / deferred

- Raw DB table browser (deferred — SQL/`postgres` MCP tool covers this today).
- Site-wide admin role (deferred — no current need beyond per-pool owner access).
- Interactive/collapsible JSON tree viewer (deferred — plain `<pre>` dump is sufficient for this
  tool's low-traffic, developer-facing usage).
