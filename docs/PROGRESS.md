# Build progress & roadmap

**Start here** if you're picking up this project. This is the single source of truth for _what's done_
and _what's next_. Keep it updated as plans complete.

Companion docs: [`functional-spec.md`](./functional-spec.md) (what), [`technical-spec.md`](./technical-spec.md)
(how), [`/CLAUDE.md`](../CLAUDE.md) (engineering practices), `docs/features/*.md` (per-feature design),
`docs/superpowers/plans/*.md` (the implementation plans).

## Status

| Plan | Scope                                                                             | Status  | Commit                                |
| ---- | --------------------------------------------------------------------------------- | ------- | ------------------------------------- |
| 1    | Foundation + scoring engine (`@cup/engine`, `@cup/schemas`, workspace/tooling/CI) | ✅ done | `feat: foundation and scoring engine` |
| 2    | Persistence + auth (`apps/web`, `@cup/db`, authz layer, Auth.js magic-link)       | ✅ done | `feat: persistence and auth`          |
| 3    | Data-as-code sync pipeline                                                        | ✅ done | `feat: data-as-code sync pipeline`    |
| 4    | Predictions feature slice                                                         | ✅ done | (unpushed)                            |
| 5    | Pools feature slice                                                               | ✅ done | (unpushed)                            |

`main` is linear with one squashed `feat:` commit per plan (no merge commits). The foundation is on
`origin/main`; later plans may be unpushed (pushing is a deliberate, user-initiated step).

## What exists (done)

- **`packages/engine` (`@cup/engine`)** — pure, deterministic derivation + scoring (functional-spec §6–7).
  Public API: `deriveCard`, `scoreCard`, `deriveGroupOrders`, branded id constructors, domain types. Design:
  [`docs/features/scoring-engine.md`](./features/scoring-engine.md).
- **`packages/schemas` (`@cup/schemas`)** — Zod contracts for `tournament.json` / `results.json` /
  card import-export, with cross-ref validation + a compile-time schema↔engine drift guard.
- **`packages/db` (`@cup/db`)** — full Drizzle schema for the functional-spec §10 data model, two
  committed migrations (incl. nullable kickoff), typed repositories for users/pools/members/kicks/scores/
  rate-limits/**tournament**/predictions, and the pglite `makeTestDb` harness (`@cup/db/testing`).
- **`apps/web`** — Next.js 15 App Router. `shared/{env,db,observability,authz}`, `features/auth`
  (Auth.js v5 + Drizzle adapter + Resend magic-link, database sessions), minimal sign-in/settings UI.
  The **authorization policy layer** (`shared/authz`) enforces lock/owner/visibility/audit in TS (no
  RLS), with an injected clock. Design: [`docs/features/persistence-and-auth.md`](./features/persistence-and-auth.md).
- **`scripts/sync.ts`** (`pnpm sync -- <tournamentId>`) — data-as-code sync pipeline:
  reads `data/tournaments/<id>/{tournament.json,results.json}`, Zod-validates, upserts tournament
  definition + results via `@cup/db` repositories, rescores every card via `@cup/engine`, upserts
  scores. Idempotent. CLI entry guarded by `isDirectlyExecuted` so module is testable.
  `@cup/engine/testing` export added for test fixtures.
- **`data/tournaments/mini-2026/`** — sample tournament + empty results JSON files.
- **`.github/workflows/sync.yml`** — GitHub Action: auto-runs sync on push to `data/tournaments/**`;
  supports `workflow_dispatch` with a `tournament_id` input.
- **`vitest.config.ts`** updated: resolves `@cup/*` workspace packages via explicit aliases (enables
  `scripts/*.test.ts` to import workspace packages); includes `scripts/**/*.test.ts` in test discovery.

## What exists — Plan 4 additions

- **`packages/db`** — `getActualResults` repository function; `tournament.definition` (jsonb) column
  storing the full `Tournament` object so the web app avoids runtime type lookups.
- **`apps/web/src/features/predictions/`** — full vertical slice:
  - `domain/types.ts` — `CardView`, `GroupView`, `BracketView`, `TieView`, `SpecialBetView`,
    `AuditEntry`, `CardExport`, `PredictionStatus`.
  - `domain/special-bet-defs.ts` — `getSpecialBetDefs(scoring)` for the 11 spec §6.4 bets.
  - `application/get-card.ts` — `getCardView(params)` assembles the full `CardView` (groups,
    bracket, specials, completion %).
  - `application/rescore.ts` — `rescoreCard` called after every mutation.
  - `application/load-actual-results.ts` — thin wrapper over `getActualResults`.
  - `api/actions.ts` — server actions: `saveGroupScore`, `saveKnockoutPick`, `saveFinishScore`,
    `saveSpecialBet`, `ownerSaveGroupScore`, `ownerSaveSpecialBet`, `exportCard`, `importCard`.
  - `ui/` — `ScoreCell`, `GroupScoresSection`, `BracketSection`, `SpecialsSection`,
    `CompletionBar`, `PredictStepper`, `ReadOnlyCard`, `AuditLog`, `OwnerEditBanner`,
    `ExportImportControls`.
  - `index.ts` — public barrel exporting all types, use-cases, actions, and UI components.
- **`apps/web/src/app/pools/[id]/predict/page.tsx`** — server component: loads card view (creates
  empty prediction on first visit), shows `PredictStepper` (editable) or read-only notice after lock.
- **`apps/web/src/app/pools/[id]/members/[memberId]/page.tsx`** — server component: enforces
  `canViewCard` policy, shows `ReadOnlyCard` with audit log; owner gets import controls.
- **Design system** — `globals.css` with full oklch color tokens, `.turf` class, fonts Anton +
  Archivo via CSS variables `--font-display` / `--font-ui`.

## What exists — Plan 5 additions

- **`packages/db`** — `countPoolsOwnedBy`, `countPoolMembers` repository helpers.
- **`apps/web/src/features/pools/`** — full vertical slice:
  - `domain/types.ts` — `PoolSummary`, `PoolDetail`, `LeaderboardEntry`.
  - `domain/invite.ts` — `generateInviteToken`, `hashInviteToken`, `buildInviteUrl`.
  - `application/create-pool.ts` — pool cap (≤5), rate-limit, first-tournament pick, owner auto-joins.
  - `application/join-pool.ts` — token lookup, expiry, kick check, member cap (≤100), rate-limit.
  - `application/get-user-pools.ts` — parallel leaderboard lookups for score badges.
  - `application/get-pool-detail.ts` — full detail including invite token and leaderboard.
  - `api/actions.ts` — `createPool`, `joinPool`, `kickMember`, `rotateToken`, `deletePool`.
  - `ui/` — `PoolListItem`, `CreatePoolForm`, `Leaderboard`, `InviteSection`, `OwnerControls`.
  - `index.ts` — public barrel.
- **`apps/web/src/features/predictions/`** additions:
  - `GroupScoresSection`, `BracketSection`, `SpecialsSection` — optional `onSave`/`onPick`/`onFinishSave`
    override props; existing callers unaffected.
  - `OwnerCardEditor.tsx` — owner inline-edit card component (locked=false, owner action callbacks).
  - `actions.ts` — added `ownerSaveKnockoutPick`, `ownerSaveFinishScore`.
- **Pages** — `/pools`, `/pools/[id]`, `/join/[token]`. Home (`/`) redirects signed-in users to `/pools`.
  Predict page + member card page updated with back-nav links.
- **Design doc:** [`docs/features/pools.md`](./features/pools.md).

## What exists — Guest auth additions

- **`packages/db/migrations/0003_guest_auth.sql`** — makes `pools.invite_token_hash` nullable (null = invite disabled).
- **`packages/db`** — `createGuestUser(db, { displayName })`, `createDbSession(db, { sessionToken, userId, expires })`,
  `clearInviteToken(db, poolId)`, `getPoolByInviteTokenHash(db, token)`. `PoolRow.inviteTokenHash` is now `string | null`.
- **`apps/web/src/features/auth/guest.ts`** — `signInAsGuest(displayName, redirectTo)` and
  `signInAsExistingGuest(userId, redirectTo)`: create a guest user (display name only, no email), insert an
  Auth.js-compatible session row, write the `authjs.session-token` cookie, then redirect. Bypasses email
  magic-link entirely; Auth.js `auth()` validates these sessions normally via the same DB table.
- **`apps/web/src/features/pools/api/actions.ts`** — added `clearInviteLink` (owner disables invite) and
  `joinAsGuest({ displayName, token })` (name-only join: creates user → joins pool → opens session → redirects).
- **`apps/web/src/features/pools/ui/InviteSection.tsx`** — handles `token: string | null`:
  when null, owner sees "Generate invite link"; when set, owner gets "Remove link" in addition to rotate.
- **`apps/web/src/app/page.tsx`** — home page shows two options: "Join without email" (name-only form) and
  "Sign in with email" (existing magic-link flow).
- **`apps/web/src/app/join/[token]/page.tsx`** — unauthenticated visitors see a `GuestJoinForm` (name input)
  rather than being redirected to sign-in; signed-in path unchanged.
- **`scripts/sync.ts`** — auto-loads `apps/web/.env.local` when `DATABASE_URL` is not already set, so
  `pnpm sync -- <id>` works on developer machines without manually exporting env vars.

## What exists — Bracket validation additions

- **`packages/engine`** — `findInvalidatedPickKeys(tournament, newGroupOrders, newQualifiers, existingPicks)`
  walks entry-round slots and bracket progression in topological order; returns keys of picks whose
  team is no longer a valid participant, cascading through R16 → QF → SF → Final/Bronze.
  `selectQualifiers` and `deriveGroupOrders` now exported from `@cup/engine`. Design:
  [`docs/superpowers/specs/2026-06-08-bracket-validation-design.md`](./superpowers/specs/2026-06-08-bracket-validation-design.md).
- **`packages/db`** — `deleteKnockoutPicks` WHERE bug fixed (JS `&&` → Drizzle `and()`).
- **`apps/web/src/features/predictions/application/get-card.ts`** — qualifying highlight suppressed
  until group is complete; entry-round slots resolve to null team when the relevant group has
  incomplete scores (cross-group 3rd-place slots require all groups complete).
- **`apps/web/src/features/predictions/ui/BracketSection.tsx`** — both pick buttons disabled when
  either team slot is empty (`eitherMissing`), not only the missing-team button.
- **`apps/web/src/features/predictions/api/actions.ts`** — `saveGroupScore` and `ownerSaveGroupScore`
  now run `invalidatePicksAfterGroupScoreChange` before persisting the score; deletes any picks
  whose team is displaced and cascades all downstream picks.
- **Tests** — 14 new integration + unit tests covering all three behaviours.

## What exists — Pool backup additions

- **`apps/web/src/features/pools/application/pool-backup.ts`** — `buildPoolExport` (assembles all members + predictions into a `PoolBackup` JSON), `restorePoolFromBackup` (resolves/creates users, clears existing data, writes backup predictions, writes audit record), Zod schemas (`PoolBackupSchema`, `MemberBackupSchema`), and derived types.
- **`apps/web/src/features/pools/api/actions.ts`** — `exportPool` (owner-only; returns `PoolBackup` JSON for download) and `importPool` (owner-only; validates backup, restores members/predictions, rescores all in parallel).
- **`apps/web/src/features/pools/ui/PoolBackupControls.tsx`** — client component with export and import buttons; shown in pool detail owner section.
- **`apps/web/src/features/predictions/index.ts`** — `rescoreCard` added to the public barrel so the pools feature can rescore without reaching into predictions internals.
- **Design doc:** [`docs/features/pool-backup.md`](./features/pool-backup.md).

## What exists — Results & standings additions

- **`packages/db`** — `getMatchesForTournament(db, tournamentId)` → all match rows (group +
  knockout); `finalizeMatch` → set a match to status='final' with goals; `upsertKnockoutMatch` →
  insert/update a knockout match result. All exposed from `@cup/db`.
- **`apps/web/src/features/results/`** — full vertical slice:
  - `domain/types.ts` — `ResultsView`, `GroupResultView`, `GroupMatchResultRow`, `GroupStandingRow`,
    `KnockoutMatchView`, `BracketRoundResultView`, `BracketHealth`, `StageProgress`, `UserRankChip`.
  - `application/get-results-view.ts` — `getResultsView(params)` assembles the full view: user rank,
    stage progress, group match results with hit/miss/exact status, group standings from actual match
    data, knockout bracket tracker with pick-alive/busted/pending status, bracket health counts.
  - `ui/StageBar.tsx` — horizontal tournament-stage stepper (Group → R16 → QF → SF → Final).
  - `ui/UserScoreChip.tsx` — points + rank readout for the page header.
  - `ui/HitChip.tsx` — color-coded exact/outcome/missed chip.
  - `ui/GroupMatchFeed.tsx` — completed match rows with score, your prediction, and hit chip.
  - `ui/GroupTable.tsx` — live group standings (P, GD, Pts) with qualifying highlight.
  - `ui/PickStatusChip.tsx` — alive/busted/upcoming bracket pick chip.
  - `ui/BracketMatchCard.tsx` — knockout tie card with teams, score/date, pick status.
  - `ui/KnockoutBracket.tsx` — bracket columns (entry round → Final) plus third-place.
  - `ui/BracketHealthPanel.tsx` — right-rail bracket health + champion pick.
  - `ui/ResultsPageClient.tsx` — client shell owning Group Stage / Knockout tab + group selector.
  - `index.ts` — public barrel.
- **`apps/web/src/app/pools/[id]/results/page.tsx`** — server component requiring member auth.
- **Pool page** — added "Results & standings" link alongside existing pool actions.
- **Design doc:** [`docs/features/results.md`](./features/results.md).

## What's next (the remaining-plan sequence)

All planned slices are complete. Potential follow-ups:

1. Playwright E2E for critical flows (sign-in, create pool, join, predict, leaderboard).
2. Real tournament data (`data/tournaments/`) for a live competition.
3. Email notifications for pool events (join, kick, lock).

## Deferred / known follow-ups

- **Browser e2e** of the magic-link flow → a Playwright pass (the NextAuth HTTP flow is intentionally
  untested in vitest; only injectable seams are unit-tested).
- **Styled UI / design system** → arrives with the feature slices; auth/settings UI is a placeholder.
- **`makeTestDb` perf** — applies the full migration per test; switch to per-module DB + tx rollbacks
  when the pglite suite exceeds ~120s.
- Open product/tech questions live in functional-spec §14 and technical-spec §15.

## How to continue (workflow)

- **Stack/conventions:** pnpm workspace, TS strict, Vitest, Drizzle, Auth.js, Tailwind. pnpm 10.30.3
  via `packageManager`. If `node_modules` breaks after dep changes (rollup native error), run
  `CI=true pnpm install`.
- **Gate (must stay green):** `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm -C apps/web build`.
  Tests are integration-first against in-memory Postgres (pglite). CI mirrors the gate.
- **New plan:** use `superpowers:writing-plans` → save under `docs/superpowers/plans/YYYY-MM-DD-<name>.md`.
- **Execute:** `superpowers:subagent-driven-development` — per chunk: implementer → spec-compliance
  review → code-quality review → apply fixes → commit (Conventional Commits, TDD).
- **Finish:** branch from `main`; integrate by **squashing the branch into a single `feat: <plan>`
  commit** on `main` (no merge commits). Update this file.
