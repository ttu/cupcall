# Build progress & roadmap

**Start here** if you're picking up this project. This is the single source of truth for _what's done_
and _what's next_. Keep it updated as plans complete.

Companion docs: [`functional-spec.md`](./functional-spec.md) (what), [`technical-spec.md`](./technical-spec.md)
(how), [`/CLAUDE.md`](../CLAUDE.md) (engineering practices), `docs/features/*.md` (per-feature design),
`docs/superpowers/plans/*.md` (the implementation plans), [`sql-queries.md`](./sql-queries.md) (common
support/debugging SQL against the real DB).

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

## What exists — Dev tools additions

- **`scripts/seed-ongoing.ts`** (`pnpm seed:ongoing`) — variant seed that creates the same 6 users
  and pool as `seed.ts` but applies only groups A–F results (36/72 matches). Useful for testing the
  mid-tournament experience. Token `dev-ongoing-login` logs in as Alice.
- **`packages/db`** — `listAllUsers(db)` repository function added.
- **`apps/web/src/features/dev-tools/`** — dev-only feature slice:
  - `application/get-dev-state.ts` — `getDevState(db)` queries users + match counts to derive the
    current `SimulationCheckpoint` and return `DevState`.
  - `api/dev-actions.ts` — two server actions guarded by `NODE_ENV !== 'production'`:
    `loginAsUserAction` (log in as any DB user by ID) and `applyCheckpointAction` (advance tournament
    to a named checkpoint: `groups-half`, `groups-done`, `r32-done`, `r16-done`, `qf-done`,
    `finals-done`; upserts results + knockout matches + rescores all predictions).
  - `ui/DevPage.tsx` — client component with Cup Simulator and Login-as-User panels.
- **`apps/web/src/app/dev/page.tsx`** — server page at `/dev`; `notFound()` in production.

## What exists — Design system

Full visual redesign on branch `design-system` (14 commits, not yet merged to main):

- **`apps/web/src/app/globals.css`** — design-system CSS utilities: `.display`, `.eyebrow`, `.tnum`, `.logo`/`.logo-mark`/`.logo-word`, `.btn` + variants + sizes, `.chip` + variants, `.pill-lock`, `.badge` + sizes + country colours, `.card`, `.section-label`, `.score-cell`/`.score-sep`, `.bar`/`.thin`/`.dark`, `.lb-row`/`.lb-rank`/`.lb-pts`, `.avatar`.
- **`apps/web/src/shared/ui/`** — `Logo`, `Button` (asChild), `Chip`, `Avatar` (colour-keyed initials), `SectionLabel`, `Icon` (25 SVG paths), `PageSpinner`.
- **`apps/web/src/app/page.tsx`** — stadium-at-night landing page: turf full-viewport, radial glows, hero grid, guest + email login forms, decorative leaderboard.
- **`apps/web/src/app/(authenticated)/`** — route group with shared layout: `AppNav` (sticky desktop), `MobileNav` (fixed bottom), `nav-actions.ts` server action for sign-out.
- **Pools, Leaderboard, Predictions, Results, Join, Settings** — all screens updated to design system; Anton display font, oklch colours, `.card`/`.turf`/`.chip`/`.btn` throughout.

## Late-joiner partial predictions (2026-06-13)

People who join the pool after `tournament.firstKickoff` can now fill in predictions for
matches/bets without known results, while items with known results are locked.

**Domain:** `PredictionStatus` gains `'partial'`; `GroupMatchView`, `TieView`, `FinishMatchView`,
`SpecialBetView` each have a `locked: boolean`; `getCardView` accepts `joinedAt?`,
`knownResultMatchIds?`, `answeredBetKeys?` for per-item lock computation.

**Policy:** `assertCanEditOwnCard` uses `getMember` (gets `joinedAt` in one call); new
`itemHasResult?: boolean` param — pass `false` to allow late joiner edits; omit to block (safe default).

**DB layer:** `getMember`, `matchHasResult`, `betKeyHasAnswer`, `getKnownResultMatchIds`,
`getAnsweredBetKeys` added to `@cup/db`; `addMember` gains optional `joinedAt?` for tests.

**Server actions:** `saveGroupScore/KnockoutPick/FinishScore/SpecialBet` each check `itemHasResult`
before calling `assertCanEditOwnCard`. Bulk ops (`clearAllPredictions`, `importCard`) remain locked.

**UI:** info banner for `status === 'partial'`; sections use `item.locked || globalLocked`.

## What exists — Points race knockout matrix (2026-06-28)

- **`packages/db`** — `getKnockoutPicksByPool(db, poolId)` JOINs `predictions → prediction_knockout_picks`
  and returns `PoolKnockoutPick[]` (userId, bracketMatchKey, winnerTeamId). Exported from `@cup/db`.
- **`apps/web/src/features/results/domain/types.ts`** — added `KnockoutMatchHit`, `KnockoutMatrixCell`,
  `KnockoutMatrixEntry`, `KnockoutMatrixMatch`; `PointsRaceView` gains `knockoutMatrix` + `knockoutMatrixMatches`.
- **`apps/web/src/features/results/application/build-race-view.ts`** — `buildKnockoutMatrix` (exported for
  unit tests) derives hit/miss/no-pick/pending cells per player per match; `buildHitPointsMap` maps round
  keys to per-pick points (R16→roundOf16PerTeam, R8→roundOf8PerTeam, SF/Final→final.perTeam, Bronze→bronze.perTeam,
  QF→0 when holistic topFour). `buildPointsRaceView` fetches `poolKnockoutPicks` in parallel and passes
  `bracketRounds`/`bronzeMatch` through.
- **`apps/web/src/features/results/ui/KnockoutMatrix.tsx`** — matrix component mirroring `MatchMatrix`;
  four cell states (hit=green+pts, miss=grey·, no-pick=hollow—, pending=outlined+pick).
- **`apps/web/src/features/results/ui/PointsRaceTab.tsx`** — `RaceSubTab` type is now `'race' | 'by-group' | 'by-knockout'`;
  "By match" renamed to "By group stage"; new "By knockout" tab renders `KnockoutMatrix`.

## Live SF (semifinalist) scoring (2026-07-11)

Fixed: the "SF" scoring row always showed `+0` until the entire tournament finished (it required
`answers.topFourOrder`, the full 1st–4th final placement, which also had to be entered manually).
Two follow-up fixes landed the same day after prod verification surfaced further issues.

- **Rule change:** "SF" scores the count of the player's predicted semifinalists confirmed correct
  — order-agnostic, flat rate (`roundOf4PerTeam`, currently 5/team, max 20). Resolves incrementally
  as each QF match completes, not at tournament end.
- **`derived.roundOf4`** (`packages/engine/src/bracket.ts`) — the player's 4 QF-winner picks,
  computed directly from those picks alone. This is what `scoreTopFour` reads. It is a **separate
  field** from `derived.topFour` (`[finalWinner, finalLoser, bronzeWinner, bronzeLoser]`), which is
  order-dependent and kept only for the Predict page's "predicted final standings" display — not
  used for scoring. (Originally `scoreTopFour` read `derived.topFour`, which needed an explicit
  Final/Bronze _winner_ pick before populating at all; most players only enter a _score_ prediction
  there, so SF silently stayed at 0 for most of the pool even after this fix's first version shipped.)
- **`Scoring.roundOf4PerTeam: number`** replaces the old `topFourOrder` tier-table config
  (`{ allCorrect, threeCorrect, twoCorrect, oneCorrect }` + dead `teamRightWrongPlace` consolation
  field) — collapsed to a flat rate since every live tournament config was already exactly linear
  (5/team) and order never mattered once the scoring rule changed.
- **`scripts/sync.ts`** — `answers.roundOf4` is auto-derived from QF match winners, same pattern as
  `roundOf16`/`roundOf8` — no manual `results.json` entry needed for this bet, ever.
- **DB fix:** `upsertTournamentResults`'s `actual_answers` upsert had a no-op `onConflictDoUpdate`
  (`set: { value: schema.actualAnswers.value }` — sets a column to itself). Any bet key written once
  (e.g. `roundOf16`/`roundOf8`) was silently frozen at its first-ever value forever. Fixed with
  `sql`excluded.value`` and a regression test (`packages/db/src/repositories/tournament.test.ts`).
- **Design/plan:** `docs/superpowers/specs/2026-07-11-sf-live-scoring-design.md` /
  `docs/superpowers/plans/2026-07-11-sf-live-scoring.md`.
- **Post-deploy manual step:** the sync GitHub Action only auto-triggers on `data/tournaments/**`
  pushes, not code changes — run `pnpm sync -- wc-2026` once (locally or via `workflow_dispatch`) to
  rescore existing pool predictions under the corrected logic.

## Early impossibility detection for special bets (2026-07-12)

Special bets used to only ever show `pending`, `hit`, or `missed` — `hit`/`missed` gated strictly on
`results.json::answers` (deliberately, per the 2026-06-13 current-leader design, which removed an
earlier bug that inferred `hit` from _who's currently ahead_, a value that can flip). This adds a
second, narrower trigger: a pending pick now shows `missed` as soon as it's **mathematically
guaranteed** to lose — irreversible facts only (a team will never play again; a monotonic counter
already exceeded the guess), never "currently trailing." Mirrors the knockout bracket's existing
`busted`/`impossible` pick detection.

- **New:** `apps/web/src/features/results/domain/special-bet-impossibility.ts` —
  `computeSpecialBetImpossibility(def, matches)` → `{ isImpossible(betKey, value) }`. Covers the 7
  bets with a live data source: `groupTopScoringTeam`/`groupTopConcedingTeam` (team's group fully
  played, not among current leaders), `tournamentTopScoringTeam`/`tournamentTopConcedingTeam` (team
  will never play again, not among current leaders), `highestMatchGoals`/`penaltyShootoutCount`
  (running counter already exceeds the guess), `finalDecisiveGoalPlayer` (player's team will never
  play again). The other 4 bets (`topScorerPlayer`, `firstRedCardPlayer`, `mostYellowCardsTeam`,
  `finalDecidedByPenalties`) have no live per-player/card data and are untouched.
- "Team will never play again" = lost a completed knockout match, or the whole group stage is over
  and the team never appears in a knockout-stage match row — no group-standings elimination
  simulation, sidesteps the qualifies-vs-eliminated ordering gotcha documented in `bracket-health.ts`.
- **Wired into 3 call sites**, all reusing the same oracle instance: `build-special-bet-results.ts`
  (results panel `hit`), `build-race-view.ts` → `buildSpecialsMatrix` (pool-wide grid cells), and
  `buildPerUserSpecialsRemaining` (per-member `canStillGet` in the points-race projection — the
  current viewer's own number already improved for free via the first call site).
- No new `hit` enum value — an impossible pick renders exactly like an officially-resolved miss.
- **Design:** `docs/superpowers/specs/2026-07-12-special-bet-impossibility-design.md`.

## E2E test data: static fixtures + varied seeded pool (2026-07-13)

`apps/web/e2e/global-setup.ts` used to sync the **real, live** `wc-2026` tournament
(`pnpm sync -- wc-2026`) before every Playwright run. On a genuinely fresh DB (exactly what CI's
Postgres service provides), that data's real-world `firstKickoff` and already-recorded
group/R32/R16/QF results meant `bracket-picks.spec.ts` was clicking pick buttons already `disabled`
by real-world date progression — **broken today**, papered over locally only because
`guest-full-prediction.spec.ts` used a dev-only no-lock-check bypass. There was also zero e2e
coverage for the leaderboard, results/points-race, or the late-joiner partial-prediction UI, since
every spec created a single fresh user/pool and never saw another member's predictions.

Fixed by replacing the live sync with two static, date-independent tournament fixtures plus a
seeded multi-member pool:

- **`data/tournaments/e2e-open/`** — copy of `wc-2026`'s full real shape (48 teams, 12 groups, full
  R32 bracket, players), `firstKickoff` overridden to `2099-01-01` (never elapses) and
  `results.json` empty. Backs `guest-full-prediction.spec.ts` and `bracket-picks.spec.ts`: every
  pool created against it stays `editable` forever, regardless of the real-world CI run date.
- **`data/tournaments/e2e-seeded/`** — same shape, `firstKickoff` overridden to `2000-01-01`
  (permanently in the past) and `results.json` extended with the real wc-2026 group/R32/R16/QF
  results plus synthesized SF/Final/Bronze results carried forward from the real QF winners
  (FRA/ESP/ENG/ARG) to a synthetic champion. `answers.firstRedCardPlayer` is deliberately left
  unset — a legitimate "no red card shown" state — so late joiners have exactly one genuinely open
  item to predict. Two fixtures are needed because one tournament-wide `firstKickoff` can't
  simultaneously be "always editable" (for the fill-in-prediction specs) and "already locked with
  resolved results and late joiners" (for the leaderboard/results/late-joiner specs).
- **`scripts/e2e-seed/prediction-variety.ts`** — a deterministic (mulberry32-seeded), pure-function
  generator that produces varied group scores, bracket picks, finish scores, and special bets,
  informed by real production prediction-distribution stats (11 predictions, 1 pool, queried
  read-only — not live-queried at seed time): scorelines weighted toward realistic low-scoring
  results (2-0, 1-1, 2-1 most common), bracket picks concentrated on a favorite but never unanimous
  (~75/25 splits), specials clustered on a few popular teams/players with a long tail. Documented in
  `docs/superpowers/specs/2026-07-13-e2e-test-data-design.md`; unit-tested for determinism and
  distribution shape.
- **`scripts/seed-e2e.ts`** — syncs both fixtures and seeds a 10-member pool under `e2e-seeded`: 1
  fixed dev-login owner/viewer, 7 on-time members with full generator-produced predictions, and 2
  late joiners with predictions only for the one open item. Writes
  `apps/web/e2e/.e2e-fixture-ids.json` so specs can navigate straight to the seeded pool.
  `global-setup.ts` now runs this instead of `pnpm sync -- wc-2026`.
- **3 new specs** in `apps/web/e2e/`: `leaderboard.spec.ts` (member ordering matches score totals,
  viewer's own rank highlighted), `results.spec.ts` (results/points-race page renders the resolved
  bracket, group order, and special-bet outcomes for the completed `e2e-seeded` tournament), and
  `late-joiner.spec.ts` (a late-joiner member sees the partial-prediction banner, only
  `firstRedCardPlayer` is editable, everything else shows locked). The 2 pre-existing specs
  (`guest-full-prediction.spec.ts`, `bracket-picks.spec.ts`) were fixed to explicitly select the
  `e2e-open` tournament rather than relying on whichever tournament sorts first.
- **Design/plan:** `docs/superpowers/specs/2026-07-13-e2e-test-data-design.md` /
  `docs/superpowers/plans/2026-07-13-e2e-test-data.md`.
- Out of scope / untouched: `scripts/seed.ts` / `seed-current.ts` / `seed-ongoing.ts` (dev/demo
  seeding) and lock/late-joiner domain logic itself — this only exercises existing behavior with
  better fixture data.

## Finalist points at SF completion (2026-07-15)

Fixed: a card could show `Finalist 1/2 · 1 pending` (one predicted finalist already confirmed by
winning its semifinal) yet still earn `+0` from the Final category until the Final was actually
played. Mirrors the Live SF scoring precedent above (2026-07-11), one round later: a team _becomes_
a finalist the moment it wins its SF, so its `perTeam` points bank then, not at tournament end.
Bronze is intentionally unchanged (out of scope) — see scoring.md §2.5 for the asymmetry rationale.

- **`scoreFinal()`** (`packages/engine/src/scoring/finish-matches.ts`) — team points now come from a
  confirmed-finalists set (`answers.finalists` plus, once played, `finalMatch`'s participants),
  independent of whether `finalMatch` exists yet. The exact-score component is unchanged (still
  requires the Final to be played). Extracted a small `exactScorePoints()` helper shared with
  `scoreBronze` to stay DRY without touching bronze's timing.
- **`ActualResults.answers.finalists?: TeamId[]`** (`packages/engine/src/types.ts`) — same shape as
  `roundOf4`, auto-derived from SF winners in `scripts/sync.ts`.
- **DB repository gap found and fixed:** `upsertTournamentResults` (write) and `getActualResults`
  (read) in `packages/db/src/repositories/{tournament,actual-results}.ts` enumerate each answer key
  explicitly — there's no generic fallback. The plan didn't call these files out, but without wiring
  `finalists` through both, the derived value would never survive a DB round-trip (only sync's own
  in-process scoring pass would see it). Added the `finalists` case to both, with tests.
- **`computeRemainingMaxPoints`** (`packages/engine/src/scoring/remaining-max.ts`) — `finalMax` drops
  to `exactScore`-only once both SF matches are final (team portion resolved), mirroring `topFourMax`
  locking to 0 at QF completion.
- **UI verified, no changes needed:** `ScoreBreakdownCard` reads `breakdown.final` directly (updates
  automatically once the DB round-trip above is fixed); the bracket-health "Finalist" row's
  alive/pending counts were already derived from real match state, independent of point banking.
- **Design/plan:** `docs/superpowers/plans/2026-07-15-finalist-points-at-sf-completion.md`.

## Top Four position bonus (2026-07-15)

Added a position-accuracy bonus on top of the existing Semifinalists (Top Four) scoring: +3 pts per
team whose predicted final-standing slot (1st/2nd from the Final, 3rd/4th from Bronze) exactly
matches the actual slot, in addition to the existing 5 pts/team membership score. Max per team
5 + 3 = 8 (was 5); max for the category 4 × 8 = 32 (was 20). Resolves incrementally per finish
match, mirroring the QF-completion precedent for membership and the SF-completion precedent for
Final team points (above).

- **`Scoring.topFourPositionBonus: number`** (`packages/engine/src/types.ts`) — new config field,
  set to 3 in every tournament config (`data/tournaments/*/tournament.json`) and test fixture.
- **`ActualFinishMatch.winner: TeamId`** (`packages/engine/src/types.ts`) — new **required** field.
  Goals alone can't determine the winner of a penalty-decided Final/Bronze (confirmed real case:
  `data/tournaments/test-wc-2026/results.json`'s Final, `1-1, decidedBy: penalties`). The raw
  `knockout[]` results format already carried a `winner` per match — it was just discarded when
  `scripts/sync.ts` built `finalMatch`/`bronzeMatch`. Threaded through `packages/schemas/src/results.ts`,
  `scripts/sync.ts`, and `packages/db/src/repositories/actual-results.ts` (read side; the write side
  already stores the object verbatim). Every existing fixture across the repo got a `winner` field
  added, inferred from its own `homeGoals`/`awayGoals`.
- **`scoreTopFour()`** (`packages/engine/src/scoring/sets-rankings.ts`) — split into
  `scoreTopFourMembership()` (unchanged logic) + `scoreTopFourPositionBonus()` (new), summed. The
  position bonus compares `DerivedCard.topFour` (now used for scoring, not just the Predict page
  display) against `actual.finalMatch`/`bronzeMatch`'s `winner`/`home`/`away`.
- **Three duplicated "canStillGet" ceiling calculations updated in lockstep** — discovered mid-plan
  that the ceiling logic isn't centralized: `computeRemainingMaxPoints()`
  (`packages/engine/src/scoring/remaining-max.ts`, tournament-wide),
  `buildPerUserKnockoutCanStillGet()` (`apps/web/.../build-race-view.ts`, Points Race projections),
  and `buildKnockoutRoundBreakdown()` (`apps/web/.../get-results-view.ts`, the bracket-health "SF"
  row) all needed the same treatment: membership ceiling unchanged, plus
  `max(0, 2 - bustedCount) × topFourPositionBonus` per finish match not yet played, reusing each
  file's existing `bustedSfPicks`/`bustedBronzePairs` (or `effectiveBronzeBusted`) counts. If a
  fourth ceiling computation is ever added, it needs the same treatment — there's no shared helper.
- **Design/plan:** `docs/superpowers/specs/2026-07-15-topfour-position-bonus-design.md`,
  `docs/superpowers/plans/2026-07-15-topfour-position-bonus.md`.

## Split SF teams/position in the score breakdown (2026-07-15)

Two bugs surfaced after the Top Four position bonus launch (above): the static `ScoringGuide`
"Semifinalists" max and the `ScoreBreakdownCard` "SF" row hint both still showed the pre-bonus max
(`roundOf4PerTeam × 4`), undercounting by the 12 pts (`topFourPositionBonus × 4`) the position bonus
adds. Fixed those two display bugs, then split the combined "SF" row in `ScoreBreakdownCard` into
two rows — "SF · Teams" and "SF · Position" — so users can see membership and position-bonus points
earned separately.

- **`ScoreBreakdown.topFourTeams` / `.topFourPosition`** (`packages/engine/src/types.ts`) — new
  fields alongside the existing combined `topFour` (kept for sorting/race-chart/leaderboard
  consumers; equals the sum of the two new fields).
- **`scoreTopFourTeams()` / `scoreTopFourPosition()`** (`packages/engine/src/scoring/sets-rankings.ts`)
  — the functions backing `scoreTopFour()` were already split internally; just exported publicly
  under names matching the new `ScoreBreakdown` fields.
- **`computeRemainingMaxPoints()`** (`packages/engine/src/scoring/remaining-max.ts`) — already computed
  `topFourMembershipMax`/`topFourPositionMax` separately before summing; exposed both under the same
  two new field names, so "remaining" stays consistent with "earned."
- **`ScoreBreakdownCard`** (`apps/web/.../results/ui/`) — renders "SF · Teams" and "SF · Position" as
  separate rows; `score-breakdown-utils.ts`'s `CATEGORY_KEYS` swapped `'topFour'` for the two new keys
  so both rows keep showing per-category pool leaders.
- **Non-goal:** `KnockoutPointsPanel`'s combined "SF" earned/missed/avail row was left as-is — only
  the Score breakdown card was split.
- **Rollout gap, found by code review and fixed:** `scripts/sync.ts`'s rescore loop actually
  `catch`es and _skips_ (not rescues) any prediction that throws during scoring — e.g. an
  incomplete card — leaving its existing DB `breakdown` row untouched **permanently**, not just
  until the next sync. Old rows missing `topFourTeams`/`topFourPosition` rendered `+undefined` in
  `ScoreBreakdownCard` and were silently excluded from the "leaders" chips (`undefined > 0` is
  `false`). Fixed at the single read boundary instead of patching every UI consumer:
  `getLeaderboard()` (`packages/db/src/repositories/scores.ts`) now runs a `normalizeBreakdown()`
  step that defaults missing fields to 0 for any row, regardless of when it was last rescored.
- **Dead-code cleanup, also from review:** `score.ts` had started re-deriving
  `topFour = topFourTeams + topFourPosition` inline, duplicating the identical sum already inside
  `scoreTopFour()` (now otherwise uncalled in production). Switched `score.ts` back to calling
  `scoreTopFour()` directly, so there's exactly one place that defines "topFour = teams +
  position."
- **Design/plan:** discussed inline (no separate spec/plan doc — small, already-scoped bugfix +
  follow-on feature).

## Final/Bronze predicted-score team-identity fix (2026-07-16)

Fixed a reported bug: knockout Final/Bronze match summaries showed home/away teams mixed up
(e.g. "ENG vs ESP 1:2" displayed for a user who actually correctly predicted "ENG 2 - ESP 1").
Root cause: `prediction_finish_scores` stored only positional home/away goals, with every
consumer re-deriving "who is home" from the user's **current** bracket picks at read time —
which diverges from what was true when the score was entered. The same root cause also affected
the real point-scoring engine's exact-score bonus (a correctness bug, not just a display one).

- **`packages/db`** — migration `0008_finish_score_team_ids.sql` adds nullable
  `home_team_id`/`away_team_id` to `prediction_finish_scores`. `upsertFinishScore` gains two
  optional trailing params; `getPredictionInputs`/`getFinishScoresByPool` read them back.
- **`packages/engine`** — `FinishScore` gains an optional `homeTeamId`/`awayTeamId: TeamId | null`
  snapshot. `exactScorePoints` (`scoring/finish-matches.ts`) now compares by team identity when
  the snapshot is present, falling back to the old positional comparison otherwise.
- **`apps/web` predictions** — `saveFinishScore`/`ownerSaveFinishScore`/`importCard` all snapshot
  the team pair (reusing the existing derived-finalist computation) at save time.
- **`apps/web` results** — two independent rendering paths both fixed, additively (existing
  `predictedHome`/`predictedAway` fields kept unchanged for rows without a snapshot):
  `build-race-view.ts`'s `buildKnockoutMatrix` (feeds `MatchSummarySheet`, the originally-reported
  bug site) and `build-bracket-rounds.ts` (feeds the always-visible `FinalResultCard` +
  `KnockoutUpcomingFeed` on the main results page — a second, independently-discovered occurrence
  of the same bug class).
- **`scripts/backfill-finish-score-team-ids.ts`** — one-time, idempotent backfill for
  already-saved Final/Bronze predictions that predate the migration.
- **Design/plan:** [`docs/superpowers/specs/2026-07-16-finish-score-team-identity-design.md`](./superpowers/specs/2026-07-16-finish-score-team-identity-design.md),
  [`docs/superpowers/plans/2026-07-16-finish-score-team-identity.md`](./superpowers/plans/2026-07-16-finish-score-team-identity.md).

**⚠️ Required rollout step before/at deploy — the real World Cup final is only days away:**
Run `pnpm backfill-finish-score-team-ids -- wc-2026` against production **before** the real Final
result is entered into `results.json`. The read-path changes are safe to deploy without it
(rows without a snapshot keep today's fallback behavior), but any already-saved Final/Bronze
prediction stays on the buggy path — display and exact-score bonus — until the backfill runs.

**Known follow-ups (minor, from final review, not blocking):** the `teamId → goals` Map-building
snippet is duplicated across 5 files (candidate for a small shared helper); the new field is named
`predictedScoreByTeam` on `KnockoutMatrixCell` vs `predictedGoalsByTeam` on `KnockoutMatchView` for
the identical shape (worth unifying); `saveFinishScore` now runs `deriveCard` twice per save
(acknowledged, low-frequency action, not optimized).

## Architecture review: results/scoring durability (2026-07-16)

Full review at
[`docs/reviews/2026-07-16-results-scoring-architecture-review.md`](./reviews/2026-07-16-results-scoring-architecture-review.md) —
6 candidates for making the prediction data model / results / scoring engine more durable against the
"wrong team shown" bug class, ranked by strength. First candidate (live bug) fixed below; the rest are
tracked in that doc, not yet scheduled.

**Fixed — candidate 1: sibling recurrence of the Final/Bronze team-identity bug.**
`build-bracket-rounds.ts`'s implicit-winner derivation (used when no explicit Final/Bronze knockout
pick is stored) still resolved the winner from the **current** `pickMap` instead of preferring the
`homeTeamId`/`awayTeamId` snapshot on the finish score — the exact bug class the 2026-07-16
team-identity fix (above) closed everywhere else, missed in this one call site. Reachable whenever an
SF pick changes after a Final/Bronze score was saved: `invalidatePicksAfterKnockoutPickChange` deletes
the stale explicit pick but leaves the finish-score snapshot untouched, so the old bug resurfaces.
Fix: prefer the snapshot when present, falling back to the live-pickMap derivation only for legacy rows
without one (`build-bracket-rounds.ts`, `deriveImplicitFinaleWinner` call site). One new regression
test in `build-bracket-rounds.test.ts`.

**Fixed — candidates 2 and 5: centralize the two duplicated resolution rules.**

- **Candidate 5** — the "snapshot-first, else derive from live picks" rule (the actual bug class) was
  duplicated between `build-bracket-rounds.ts` and `build-race-view.ts`. Extracted into one shared,
  unit-tested function `resolveFinaleWinner()` (new file
  `apps/web/src/features/results/domain/finale-winner.ts`, alongside relocated
  `deriveImplicitFinaleWinner`/`derivePredictedOpponent`), used by both call sites. A full
  discriminated-union reshape of `FinishScore` (the review's original idealized solution) was
  deliberately **not** done — `FinishScore` is used across ~15 files including the predict page's
  live-editing flow, where a score can be genuinely unresolved-but-not-legacy; reshaping the type was
  judged out of proportion to this session's scope. See the review doc's implementation note.
- **Candidate 2** — the "look up predicted goals for a team from the identity snapshot" `new
Map(...).get(...)` snippet was duplicated in `FinalResultCard.tsx`, `KnockoutUpcomingFeed.tsx`, and
  `knockout-match-detail.ts`. Extracted into one pure function `resolveGoalsByTeamId()` (new file
  `apps/web/src/features/results/domain/predicted-goals.ts`), used by all three. Fixed plain
  `pickedGoals`/`opponentGoals` fields (the review's original idea) were **not** added —
  `FinalResultCard.tsx` resolves goals for whichever team lands on the visual left/right side after a
  multi-step fallback chain that isn't always `pickedWinnerId`/`pickedOpponentId`, so fixed fields
  would have silently dropped a tied-score edge case. See the review doc's implementation note.

All 450 tests in `features/results` + `features/predictions` pass; typecheck and lint clean.
Candidates 3, 4, and 6 in the review doc remain open, not yet scheduled.

**Partially implemented — candidate 3: bracket topology walk duplication.**
Investigating this finding turned up two genuinely byte-identical pure functions duplicated across
2-3 files: `resolveActualWinner` (a.k.a. `getMatchWinner`/`resolveKnockoutWinner` — 3 copies across
`build-bracket-rounds.ts`, `build-race-view.ts`, `special-bet-impossibility.ts`) and
`computeKnockoutEliminatedTeams` (2 copies). Extracted both into a new unit-tested module,
`apps/web/src/features/results/domain/knockout-match-winner.ts`, used everywhere via import aliases
(no call-site churn). The finding's larger proposal — widening `@cup/engine`'s `buildBracket()` to
absorb the whole topology walk — was **not** attempted: the results feature's inputs are `MatchRow[]`
(a `@cup/db` type), not the engine's pure `ActualMatchResult` shape, and the remaining duplicated
functions (`computeDerivedParticipants`, `computeUserPredictedParticipants`,
`computeUserPickedParticipants`) encode results-specific policy (projected-vs-actual participants,
cross-slot pick correction), not just boilerplate — merging them into the engine is real,
higher-risk design work, left open. 459 tests pass; typecheck/lint clean.

**Bug found via the above extraction, fixed (2026-07-16): SF loser wrongly treated as eliminated
for Bronze picks.** Centralizing `computeKnockoutEliminatedTeams` surfaced that it treats every
knockout-match loser as fully eliminated — correct everywhere except the semifinal: an SF loser
advances to play Bronze, so it's still a live pick there. `build-race-view.ts`'s `buildKnockoutMatrix`
had already been fixed for this independently; `build-bracket-rounds.ts` (pickStatus/
pickedOpponentStatus) and `build-race-view.ts`'s `buildPerUserKnockoutCanStillGet` (candidate 4's
other subject — undercounted `canStillGet` for correctly-picked Bronze contenders) both still had it.
Added `computeSemiFinalLoserTeams()` to `domain/knockout-match-winner.ts` and applied the carve-out
at both remaining sites, each verified red→green with its own regression test. 471 tests pass;
typecheck/lint clean. Candidates 4 and 6 remain open.

**Investigated — candidate 4: closed, not a bug.** Built the parity test the finding recommended
(same fixture/picks/results, compare `buildKnockoutRoundBreakdown`'s summed `canStillGet` for a user
against `buildPerUserKnockoutCanStillGet`'s value for that same user). It fails, but production code
already treats these as intentionally different: `buildPointsRaceView` (`build-race-view.ts:128-129`)
substitutes the "own path" value for the viewer's own row instead of the "other path" value — an
already-shipped design distinction (own dashboard = optimistic/motivational ceiling; other pool
members' leaderboard projection = conservative, counts only picks already committed to), not
accidental duplication. A real but production-irrelevant gap surfaced along the way:
`buildPerUserKnockoutCanStillGet`'s per-match hit-point ceiling never fires when the scored round
coincides with the bracket's entry round (true of the `miniTournament` test fixture, not of WC2026's
R32→R16→QF→SF→Final shape) — documented, not fixed; the correct fix needs group-stage prediction
viability this function doesn't currently model. No production code changed; the parity test was
deliberately not kept (see review doc for the full writeup).

**Implemented (scoped down) — candidate 6: unsafe array→tuple casts.** The review's "structured named
fields" proposal for `DerivedCard.finalists`/`bronzePair` wasn't implemented — those arrays are
genuinely variable-length (0-2 elements) while SF picks are incomplete, a real partial-card state, so
named optional fields wouldn't fit any better and would touch far more of the engine's public API.
What was real: three call sites (`predictions/api/actions.ts`'s `deriveFinishPair`,
`predictions/application/import-card.ts` ×2) used an unsafe `arr as [TeamId, TeamId]` cast to narrow
the array — replaced with a small tested helper, `toPair<T>()` (new file
`apps/web/src/features/predictions/domain/pair.ts`). 474 tests pass; typecheck/lint clean.

**Review closed.** All 6 candidates in
[`docs/reviews/2026-07-16-results-scoring-architecture-review.md`](./reviews/2026-07-16-results-scoring-architecture-review.md)
worked through — 1/2/5 implemented as designed, 3/6 implemented in a smaller/safer scope than
proposed, 4 investigated and closed as intentional (not a bug). No further work scheduled from it.

## Pool result archive (2026-07-18)

Pool owners can now freeze a permanent snapshot of a pool's final standings and per-member score
breakdown ("archive"), decoupled from live `pools`/`users` data so it survives a member's later
display-name change or account deletion — except that account deletion also scrubs the deleted
member's name from any archive to `"Deleted user"` (rank/points/breakdown stay). Design:
[`docs/features/pool-archive.md`](./features/pool-archive.md).

- **`packages/db`** — two new tables (`packages/db/migrations/0009_pool_archives.sql`):
  `pool_archives` (one per pool, unique on `pool_id`, frozen `pool_name`/`tournament_name`) and
  `pool_archive_entries` (`user_id` nullable — `onDelete: 'set null'` — `display_name`, `rank`,
  `points_total`, `breakdown: ScoreBreakdown`). New repository `pool-archive.ts`:
  `upsertPoolArchive` (delete+reinsert entries on re-archive — one archive per pool, not a historical
  log) and `getPoolArchiveWithEntries`.
- **`deleteUser`** (`packages/db/src/repositories/users.ts`) now anonymizes matching
  `pool_archive_entries.display_name` to `"Deleted user"` before deleting the user row (sequential
  awaits, no `.transaction()` — this codebase has none).
- **Accepted limitation** (discovered mid-implementation, confirmed with the user): anonymization only
  has an observable effect for **non-owner** members. `pools.ownerId` cascades from `users.id`
  (pre-existing) and `pool_archives.poolId` cascades from `pools.id` — so deleting an archived pool's
  _owner_ cascades away the whole pool and archive, same as any pool deletion. Closing this fully
  would mean decoupling `pool_archives.poolId` from `pools.id` (the way `tournamentId` already is);
  the user chose to keep the simpler FK-cascade schema and accept the gap instead.
- **`apps/web/src/features/pool-archive/`** — new vertical slice: `archivePool` (snapshots
  `getLeaderboard` into the archive tables, `rank = index + 1`, defaults members with no `scores` row
  to 0/zeroed breakdown), `getPoolArchiveView` (read side), `archivePoolAction` (owner-only server
  action), `ArchivePoolCard` (archive/re-archive button + "View archive" link), `ArchiveMemberRow`
  (rank/name/points + embedded `ScoreBreakdownCard`, now exported from `@/features/results`'s public
  barrel).
- **`app/(authenticated)/pools/[id]/archive/page.tsx`** — new route, member-gated, empty state until
  archived. Pool detail page (`/pools/[id]`) gained the `ArchivePoolCard` in the owner-controls
  section.
- **Verification gap:** no docker/local Postgres was reachable in the implementing sandbox (only a
  read-only connection to the production Neon DB, never used for this) — the new page/route was
  verified via typecheck, lint, the existing test suite, and specific code-path tracing, but **not**
  browser-tested live. Recommend a quick manual pass (archive → re-archive → view as owner and as a
  non-owner member) before relying on it in production.

## Pool archive recap (2026-07-19)

Upgraded the plain archive standings page into a recap: a champion hero card, four highlight stats,
a points-race chart, and a lead-changes timeline — all computed once at archive time from that pool's
predictions so they survive a member's later account deletion, same guarantee as the base archive
feature. Champion/final-score/matches-played are read **live** from tournament results instead
(never user-deletable, so no permanence risk there). Design:
[`docs/features/pool-archive.md`](./features/pool-archive.md) (updated), spec at
`docs/superpowers/specs/2026-07-18-pool-archive-recap-design.md`.

- **`packages/db`** — two new nullable jsonb columns (migration `0010_pool_archive_recap.sql`):
  `pool_archives.recap` (`{ stages, championPick, bestSingleMatch, biggestUpset, predictionsMade,
exactScoreRatePercent }`) and per-entry `pool_archive_entries.points_history`/`stage_reasons`.
  Nullable and not backfilled — a pool archived before this feature (or re-archived without race
  data) just shows "no recap yet" until re-archived.
- **Archive-time computation** (`apps/web/src/features/pool-archive/application/build-recap.ts`,
  `build-highlights.ts`) reuses existing pool-wide query helpers
  (`getGroupScoresByPool`/`getKnockoutPicksByPool`/etc.) and the existing `buildRaceChartData` —
  no new DB queries were needed. Computes: champion pick (most-picked final winner), best single
  match (highest group-stage exact-score agreement — knockout rounds before the Final only ever
  capture winner-picks, never score guesses, so they're excluded), biggest upset called (least
  popular correct knockout pick, via the existing `resolveActualWinner` helper — `winnerTeamId` is
  only populated for penalty shootouts), predictions made, and pool-wide exact-score rate. Per-member
  per-stage "reason" strings are template-filled (exact-hit counts, correctly-picked-advancing team
  codes, champion-pick correctness) — not free-text generated.
- **Read-time derivation** (`apps/web/src/features/pool-archive/domain/race-history.ts`, pure,
  no DB) — "biggest riser" and "lead changes" are derived from the frozen `points_history` at view
  time, not stored again; both use `displayName`-ascending tiebreaks for equal points, matching
  `getLeaderboard`'s existing convention.
- **UI** — `ArchiveHeroCard`, `ArchiveHighlightsPanel`, `ArchiveLeadChangesPanel`, `ArchiveStatTiles`,
  plus a `toRaceChartData` adapter reusing the existing `RaceChart` component. All degrade gracefully
  when `recap` is `null` (pre-recap-feature archives). `ArchivePoolCard`'s owner-facing copy was
  corrected to not claim the snapshot survives the _owner's own_ account deletion (it doesn't — that
  cascades away the whole pool, per the base feature's accepted limitation).
- **Simplifications** (deliberate, documented in the design spec): race-chart stage labels are dates
  ("Jul 19"), not named milestones ("R16"/"QF") — reuses the existing, already-tested
  `buildRaceChartData` rather than building a second variant; no "Download recap" in this pass.
- **Verification note:** unlike every prior task in this feature (base + recap), Task 9's
  implementer had a live, reachable dev Postgres (this repo's own devcontainer `db` service) and
  performed genuine end-to-end manual verification — archived a real seeded pool via the actual UI,
  confirmed the hero card/race chart/stat tiles/highlights/lead-changes/standings all render
  correctly with real data, plus the non-member 404 and never-archived empty-state paths. First
  real browser confirmation this feature works end-to-end; still worth a spot-check in your own
  environment before relying on it in production.

## Final/bronze exact-score: removed pre-migration positional fallback (2026-07-18)

Follow-up cleanup to the [team-identity fix](#finalbronze-predicted-score-team-identity-fix-2026-07-16):
`exactScorePoints` (`packages/engine/src/scoring/finish-matches.ts`) had a fallback that compared
predicted vs. actual goals **positionally** (`home === home`, `away === away`, ignoring team
identity) for any `prediction_finish_scores` row without a `homeTeamId`/`awayTeamId` snapshot —
originally kept for legacy rows saved before migration `0008` until the one-time backfill ran.
Confirmed (by the user) that `pnpm backfill-finish-score-team-ids -- wc-2026` has been run against
production, so all real rows now carry the snapshot. Removed:

- The positional-fallback branch in `exactScorePoints` — a missing snapshot now always yields 0
  exact-score points (team points are unaffected; they're always derived live from
  `derived.finalists`/`derived.bronzePair`, never from the snapshot).
- `scripts/backfill-finish-score-team-ids.ts` (+ its test) and the `backfill-finish-score-team-ids`
  package.json script — one-time, already served its purpose.
- The now-unused `getFinishScoresMissingTeamIds`/`setFinishScoreTeamIds` repository functions
  (`packages/db/src/repositories/predictions.ts`), only ever called by that script.

**Note:** a missing snapshot isn't purely a legacy condition — it also occurs today when a player
saves a final/bronze score before their semifinal picks resolve the finalist/bronze pair
(`FinishScore.homeTeamId`/`awayTeamId` stay `null` until they next resave that score, which
re-derives the pair). Post-cleanup, such a row scores 0 exact-score points until resaved — arguably
more correct than the old positional guess, since there's no way to know which predicted goal
figure belongs to which real team without the snapshot.

## Final scenario summary (2026-07-19)

Once the Final is the sole remaining match, the Points Race tab auto-shows who wins the pool for
each possible Final outcome and which of their own still-open special bets need to hit to hold it.

- **`apps/web/src/features/results/domain/final-scenario.ts`** — `buildFinalScenarioView(...)`, a
  pure function. Trigger: the Final's `KnockoutMatchView` (from `bracketRounds`) has both finalists
  confirmed and is not yet played, and Bronze is played — checked this way (not via a raw
  `allMatches` scan) because knockout matches without a result are never inserted into the `matches`
  table. Per scenario (home/away winner), computes each user's `lockedScore` (banked `pointsTotal` +
  `topFourPositionBonus` from their own Final winner/opponent pick, independently per side — not a
  binary 2×/0×, since a busted bracket pick chain can match on only one side) and `pendingItems`
  (their own still-open special bets, plus the Final exact-score bonus when their saved prediction's
  implied winner is compatible with that scenario, or unconditionally when it's a draw). A greedy
  algorithm then classifies each scenario as `'clinched'` (leader wins even worst-case), `'checklist'`
  (leader needs a minimal prefix of their own highest-value pending items), or `'too-close'` (even
  everything they have falls short — also depends on a rival's own bets).
- **`apps/web/src/features/results/domain/special-bet-resolution.ts`** (new) — `resolveActualForBet`
  / `isBetResolved` extracted out of `build-race-view.ts` so both the specials matrix and the new
  module share one source of truth for "is this bet still open" instead of diverging.
- **`PointsRaceView.finalScenario: FinalScenarioView`** (`domain/types.ts`), populated in
  `buildPointsRaceView` (`build-race-view.ts`).
- **`ui/FinalScenarioCard.tsx`** — renders at the top of `RaceView.tsx`, in both viewer mode and
  member mode (pool-wide result, not tied to "my" points). Renders `null` when `finalScenario` is
  null — for a normal in-progress tournament this is always the case, so the card is invisible until
  the Final is genuinely the only match left.
- No E2E test yet — no existing seeded fixture reaches the only-Final-left state; deferred.
- **Design/plan:** `docs/superpowers/specs/2026-07-19-final-scenario-summary-design.md` /
  `docs/superpowers/plans/2026-07-19-final-scenario-summary.md`.

## SF Position bonus: finish-score snapshot fallback (2026-07-19)

Fixed a production bug found via a user report: the Top Four position bonus (`topFourPosition`,
shipped 2026-07-15) was effectively non-functional — 0 of 11 scored predictions in production had
any `topFourPosition` > 0, despite users having correctly predicted the Final winner.

**Root cause:** `deriveTopFour()` (`packages/engine/src/bracket.ts`) only resolved the Final/Bronze
winner from an explicit `prediction_knockout_picks` row. That row is written implicitly when a user
saves their Final/Bronze score (`applyFinishScore` in
`apps/web/src/features/predictions/api/actions.ts`), but gets deleted by the pick-invalidation
cascade whenever an upstream SF/QF pick changes afterward, and is never regenerated unless the score
is re-saved. The `prediction_finish_scores` snapshot (`home_team_id`/`away_team_id`, from migration
`0008_finish_score_team_ids.sql`) survives untouched and is what the results-page UI already uses to
recover (`resolveFinaleWinner` / `deriveImplicitFinaleWinner` in
`apps/web/src/features/results/domain/finale-winner.ts`) — the scoring engine had no equivalent
fallback.

- **`deriveTopFour()`** now tries the explicit pick first (unchanged — also the only way a tied
  scoreline can register a winner, via an explicit tie-break pick), then falls back to the
  finish-score snapshot when no pick exists and the scoreline isn't tied.
- **`buildBracket()`** gained an optional `finishScores` parameter (defaults to `{}`, so existing
  callers are unaffected); **`deriveCard()`** now threads `input.finishScores` through. No DB/schema/
  web changes — `CardInputs['finishScores']` already carried the needed snapshot.
- **Rollout:** the code fix only affects _future_ rescoring — production's existing
  `scores.breakdown` rows still needed a fresh `pnpm sync -- wc-2026` run (against prod
  `DATABASE_URL`) to actually recompute everyone's `topFourPosition`. Verified via direct prod DB
  query (`postgres` MCP) that all 11 current `prediction_finish_scores` rows already had the
  snapshot populated, so one rescore fully resolves the backlog — no separate backfill script.
- **Design/plan:**
  `docs/superpowers/specs/2026-07-19-sf-position-finish-score-fallback-design.md`,
  `docs/superpowers/plans/2026-07-19-sf-position-finish-score-fallback.md`.

## Admin raw data view (2026-07-18)

Pool owners can now inspect the raw, already-computed `CardView`/`ResultsView` JSON for any member
of their pool in production, at `/pools/[id]/raw` — for debugging scoring/bracket discrepancies
without reading application code or hand-deriving state from SQL.

- **`apps/web/src/features/admin/`** — new minimal feature slice: `ui/RawJsonBlock.tsx` (JSON
  dump + copy-to-clipboard), `index.ts` barrel. No new domain/application logic — pure
  composition of the existing `getResultsView`/`getCardView`.
- **`apps/web/src/app/(authenticated)/pools/[id]/raw/page.tsx`** — owner-only (404 for
  non-owners), member picker built from `leaderboard`, dumps both view-models for the selected
  member.
- **Pool detail page** — "Raw data (debug)" link added next to `PoolBackupControls`, owner-only.
- **`apps/web/src/app/not-found.tsx`** — new styled root 404 boundary (was missing app-wide).
  Investigated whether this would also fix `notFound()` returning HTTP 200 instead of 404 — it
  doesn't: `/pools/[id]/*` streams under ancestor `loading.tsx` files, and Next.js currently locks
  the response status once streaming starts, regardless of a later `notFound()` (open Next.js
  App Router limitation, not an app bug). Fixing that properly means either dropping `loading.tsx`
  under `/pools/[id]/*` (UX regression) or adding middleware-level auth before streaming starts
  (real architecture change) — both out of scope here. The e2e test below asserts on rendered
  404 content via `data-testid`, not `response.status()`, until one of those is worth doing.
- **`apps/web/e2e/admin-raw-view.spec.ts`** — owner flow + non-owner sees the 404 page content.
- **Design/plan:** `docs/superpowers/specs/2026-07-18-admin-raw-data-view-design.md`,
  `docs/superpowers/plans/2026-07-18-admin-raw-data-view.md`.

## Pool archive champion pick: finish-score fallback (2026-07-20)

Fixed a production bug found via a user report: the "Champion pick" archive highlight showed
"1 of 11 players backed Brazil" when the real most-backed Final winner (derived from finish-score
predictions) was a 3-way tie between Spain and England. Same failure mode as the SF Position bonus
bug above — a stats/narrative function reading raw `prediction_knockout_picks` rows without the
finish-score fallback that most players' data actually depends on.

**Root cause:** `computeChampionPick` (`apps/web/src/features/pool-archive/application/
build-highlights.ts`) and `describeKnockoutOutcome` (`build-recap.ts`, drives the "Champion pick
correct" per-member stage-reason narrative) both filtered `PoolKnockoutPick` rows by
`bracketMatchKey === 'final'` directly. Only 2 of 11 predictions in the prod WC2026 pool have an
explicit pick for that key — the other 9 only submitted a `finishScores.final` scoreline, so their
implied Final winner was silently excluded from both the highlight and the narrative.

- **`resolveEffectiveFinalePick(matchKey, def, pickMap, finishScore)`** (new, exported from
  `build-highlights.ts`) — explicit pick wins if present, else derives the winner from the
  finish-score snapshot via `resolveFinaleWinner`/`deriveImplicitFinaleWinner` (now exported from
  `@/features/results`). Mirrors the same pick-then-finish-score precedence already used by the
  engine's scoring path and the results-page bracket rendering.
  `computeChampionPick` and `describeKnockoutOutcome` now both use it (for Final **and** Bronze).
- **Rollout:** the prod WC2026 pool archive needs re-archiving to pick up the corrected
  `championPick` and stage reasons — the existing frozen `pool_archives.recap` row still has the
  stale "Brazil, 1 of 11" data until that happens.
- **Design/plan:** none written — small, well-scoped bugfix following an established pattern
  (see the SF Position bonus fix above), done directly via TDD.

## What's next (the remaining-plan sequence)

All planned slices are complete. Potential follow-ups:

1. Merge `design-system` branch to `main` (squash into one `feat(design): ...` commit).
2. Playwright E2E now covers create-pool/predict (`guest-full-prediction`, `bracket-picks`),
   leaderboard ordering, the results/points-race page, and the late-joiner partial-prediction flow
   (2026-07-13, above). Still deferred: an explicit sign-in-via-magic-link e2e test (see "Deferred /
   known follow-ups" below — already tracked there, not duplicated here).
3. Real tournament data (`data/tournaments/`) for a live competition.
4. Email notifications for pool events (join, kick, lock).

## Deferred / known follow-ups

- **Browser e2e** of the magic-link flow → a Playwright pass (the NextAuth HTTP flow is intentionally
  untested in vitest; only injectable seams are unit-tested).
- **Design system merged** — branch `design-system` ready to squash onto `main`.
- **`makeTestDb` perf** — applies the full migration per test; switch to per-module DB + tx rollbacks
  when the pglite suite exceeds ~120s.
- **`notFound()` returns HTTP 200, not 404, under streaming routes** — `/pools/[id]/*` (and any
  other route tree with an ancestor `loading.tsx`) renders correct 404 content but keeps an HTTP
  200 status, because Next.js locks the response status once streaming starts. Open upstream
  issue, not unique to this app. Fix requires either removing `loading.tsx` there (UX regression)
  or middleware-level auth before the response starts streaming (real architecture change).
- Open product/tech questions live in functional-spec §14 and technical-spec §15.

## How to continue (workflow)

- **Stack/conventions:** pnpm workspace, TS strict, Vitest, Drizzle, Auth.js, Tailwind. pnpm 10.30.3
  via `packageManager`. If `node_modules` breaks after dep changes (rollup native error), run
  `CI=true pnpm install`.
- **Gate (must stay green):** `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm -C apps/web build`.
  Tests are integration-first against in-memory Postgres (pglite). CI mirrors the gate.
- **Coverage:** `pnpm test:coverage` runs the Vitest suite with `@vitest/coverage-v8` and
  writes `coverage/` (HTML, lcov, text-summary). CI runs the same on every PR and uploads
  `coverage/{lcov.info,index.html}` as a workflow artifact (`actions/upload-artifact@v4`,
  `if: always()`). No thresholds — measurement only. Scope: domain + application + API +
  shared + scripts; UI components and `app/` routes are intentionally excluded (see
  [`docs/superpowers/specs/2026-06-11-coverage-tooling-design.md`](./superpowers/specs/2026-06-11-coverage-tooling-design.md)).
- **New plan:** use `superpowers:writing-plans` → save under `docs/superpowers/plans/YYYY-MM-DD-<name>.md`.
- **Execute:** `superpowers:subagent-driven-development` — per chunk: implementer → spec-compliance
  review → code-quality review → apply fixes → commit (Conventional Commits, TDD).
- **Finish:** branch from `main`; integrate by **squashing the branch into a single `feat: <plan>`
  commit** on `main` (no merge commits). Update this file.
