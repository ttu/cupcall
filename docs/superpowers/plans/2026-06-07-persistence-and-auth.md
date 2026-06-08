# Persistence + Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js app, a provider-agnostic PostgreSQL layer (Drizzle) covering the whole data model, magic-link auth (Auth.js + Resend), and a server-side authorization/policy layer — all integration-tested against in-memory Postgres.

**Architecture:** A `@cup/db` package owns the Drizzle schema, a client factory, migrations, and typed repositories (consumed by both `apps/web` and the future sync script — two real consumers). `apps/web` (Next.js App Router) wires auth, env validation, the authorization policy layer, and minimal sign-in/settings pages. The browser never touches the DB; all access goes through server code → repositories. Authorization is enforced in TypeScript (no RLS), per technical-spec §6.

**Tech Stack:** TypeScript (strict) · Next.js 15 (App Router) · Drizzle ORM + drizzle-kit · `postgres` (postgres.js) driver · `@electric-sql/pglite` (in-memory Postgres for tests) · Auth.js v5 (`next-auth@5`) + `@auth/drizzle-adapter` · Resend · Zod · Vitest · pnpm workspace.

**Source of truth:** functional-spec §5 (accounts/auth), §8 (pools), §10 (data model), §13 (authoritative time, privacy). technical-spec §2 (stack), §4 (vertical slices), §6 (data layer & authorization), §7 (auth), §11 (rate limiting), §14 (env vars). `/CLAUDE.md` (TDD, branded types, pure functions where possible, no `any`, parameterized queries, structured logging, clear errors, DoD).

**Conventions:**

- Conventional Commits. TDD strictly (red → green → refactor → commit).
- **Mock only at system boundaries** (Resend email send, the clock). Everything DB-related is tested against a **real in-memory Postgres (pglite)** — no DB mocks.
- The server is the only DB client. Repositories take a `Db` handle; authorization functions take an explicit `actor`.
- Branded ids from `@cup/engine` (`UserId` is new — add it there) are reused across the schema's typed surface.

---

## File structure

```
/
├── packages/db/                        # @cup/db — schema, client, migrations, repositories
│   ├── package.json                    # deps: drizzle-orm, postgres, @electric-sql/pglite, @cup/engine, zod
│   ├── drizzle.config.ts
│   ├── tsconfig.json
│   ├── migrations/                     # generated SQL (committed)
│   └── src/
│       ├── client.ts                   # createDb(connectionString) -> Db ; type Db
│       ├── schema/
│       │   ├── auth.ts                 # users, accounts, sessions, verificationTokens
│       │   ├── tournament.ts           # tournaments, teams, players, groups, matches, actual_*
│       │   ├── pools.ts                # pools, pool_members, pool_kicks
│       │   ├── predictions.ts          # predictions, prediction_*, prediction_edits
│       │   ├── scores.ts               # scores
│       │   ├── rate-limits.ts          # rate_limits
│       │   └── index.ts                # re-export all tables + relations
│       ├── repositories/
│       │   ├── users.ts  pools.ts  members.ts  kicks.ts  scores.ts  rate-limits.ts
│       │   └── index.ts
│       ├── testing/make-test-db.ts     # pglite + migrate -> Db (for integration tests)
│       └── index.ts                    # public barrel
├── apps/web/
│   ├── package.json  next.config.ts  tailwind.config.ts  postcss.config.mjs  tsconfig.json
│   └── src/
│       ├── app/
│       │   ├── layout.tsx  page.tsx                 # landing / dashboard
│       │   ├── api/auth/[...nextauth]/route.ts      # Auth.js handler
│       │   ├── auth/callback/route.ts (if needed)
│       │   └── settings/page.tsx                    # edit display name (minimal)
│       ├── shared/
│       │   ├── env.ts                # zod-validated server env
│       │   ├── db.ts                 # singleton Db from env (server-only)
│       │   ├── authz/                 # authorization policy layer (pure predicates + asserts)
│       │   └── observability/logger.ts   # pino
│       └── features/auth/
│           ├── auth.ts               # NextAuth() config (Email provider + Drizzle adapter + Resend)
│           ├── session.ts            # getCurrentActor() helper
│           ├── actions.ts            # updateDisplayName server action
│           └── index.ts
└── (root) update pnpm-workspace already includes apps/*; root tsconfig references
```

---

## Task 0: Scaffold `apps/web` (Next.js App Router)

**Files:** `apps/web/package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `src/app/{layout,page}.tsx`, `src/app/globals.css`; update root `tsconfig.json` references.

- [ ] **Step 1:** Create `apps/web/package.json` (name `@cup/web`, private, scripts `dev`/`build`/`start`/`typecheck`), deps: `next@^15`, `react`, `react-dom`; devDeps `@types/react`, `tailwindcss`, `postcss`, `autoprefixer`. Add `@cup/db: workspace:*` and `@cup/engine: workspace:*`.
- [ ] **Step 2:** `tsconfig.json` extends base; Next needs `jsx: preserve`, `moduleResolution: Bundler`, `noEmit`, `plugins: [{name: next}]`. Add `apps/web` to root tsconfig references. Configure Tailwind (content globs incl. `src/**/*.{ts,tsx}`).
- [ ] **Step 3:** Minimal `layout.tsx` + `page.tsx` ("Cup Prediction") + `globals.css` with Tailwind directives.
- [ ] **Step 4:** Verify `pnpm -C apps/web build` succeeds and `pnpm typecheck` (whole workspace) passes.
- [ ] **Step 5:** Commit `chore(web): scaffold Next.js App Router app with Tailwind`.

---

## Task 1: `@cup/db` package + client factory + env validation

**Files:** `packages/db/package.json`, `tsconfig.json`, `src/client.ts`, `src/client.test.ts`; add `UserId` brand to `packages/engine/src/brand.ts`.

- [ ] **Step 1:** Add `UserId` branded type + `userId()` constructor to `@cup/engine` `brand.ts` and barrel (TDD: extend `brand.test.ts`).
- [ ] **Step 2:** Create `packages/db/package.json` (`@cup/db`, type module, exports `./src/index.ts`), deps: `drizzle-orm`, `postgres`, `@electric-sql/pglite`, `@cup/engine: workspace:*`; devDep `drizzle-kit`. tsconfig extends base + references `../engine`; add to root references. `pnpm install`.
- [ ] **Step 3:** Write failing test `client.test.ts`: `createDb` against a pglite instance returns a usable Drizzle handle that can run `select 1`.
- [ ] **Step 4:** Implement `src/client.ts`: `export type Db = ...` (the drizzle type) and `createDb(connectionString: string): Db` using `drizzle(postgres(connectionString), { schema })`. Also export a pglite-backed factory used by tests (or keep that in `testing/`). Run test → pass.
- [ ] **Step 5:** Commit `feat(db): add @cup/db package, drizzle client factory`.

---

## Task 2: Auth schema tables

**Files:** `packages/db/src/schema/auth.ts`, `schema/index.ts`, `src/schema/auth.test.ts`

Implements the `@auth/drizzle-adapter` Postgres schema + the app's `display_name` (functional-spec §5).

- [ ] **Step 1:** Failing test: after migrating a pglite db (use the `make-test-db` harness once it exists — for now, push the schema with `drizzle-kit push` or a programmatic create), inserting a user with `email` + `display_name` round-trips; a second user with the same email violates the unique constraint.
- [ ] **Step 2:** Implement `auth.ts` with `pgTable`s: `users` (`id` uuid pk default, `email` text unique not null, `displayName` text not null, `emailVerified` timestamp), `accounts`, `sessions`, `verificationTokens` matching the Drizzle adapter's expected columns. Export from `schema/index.ts`.
- [ ] **Step 3:** Run test → pass. Commit `feat(db): auth schema (users, accounts, sessions, verification tokens)`.

---

## Task 3: Tournament/domain schema tables

**Files:** `packages/db/src/schema/tournament.ts` + test

Data-as-code targets (populated by the Plan 3 sync script), per functional-spec §10.

- [ ] **Step 1:** Failing test: insert a tournament + team + group + match row graph; FK from team→tournament enforced.
- [ ] **Step 2:** Implement tables: `tournaments` (`id` text pk, `name`, `first_kickoff` timestamptz, `scoring_config` jsonb, `status`), `teams`, `players`, `stage_groups`, `stage_group_teams` (`seed_order`), `matches` (stage enum incl. `bronze`, `decided_by` enum, nullable goals/winner), `actual_group_order` (`position` 1–4), `actual_answers` (`bet_key`, `value` jsonb). Use the engine `Tournament`/`Scoring` types for the jsonb column type via `.$type<>()`.
- [ ] **Step 3:** Run → pass. Commit `feat(db): tournament & results schema`.

---

## Task 4: Pools, predictions, scores, rate-limit schema

**Files:** `packages/db/src/schema/{pools,predictions,scores,rate-limits}.ts` + tests

Per functional-spec §10 (post per-pool-predictions + owner-edit model).

- [ ] **Step 1:** Failing tests for the key constraints:
  - `pools` (`id` uuid, `tournament_id` fk, `owner_id` fk→users, `name`, `invite_token_hash`, `token_expires_at?`, `created_at`).
  - `pool_members` unique `(pool_id, user_id)`; `pool_kicks` (`pool_id`,`user_id`,`kicked_at`).
  - `predictions` unique `(pool_id, user_id)`, `locked_at?`; child tables `prediction_group_scores`, `prediction_knockout_picks`, `prediction_finish_scores` (`match` final|bronze), `prediction_specials` (`bet_key`, `value` jsonb).
  - `prediction_edits` (`prediction_id`, `editor_user_id`, `field_path`, `old_value` jsonb, `new_value` jsonb, `reason?`, `source` manual|import, `edited_at`).
  - `scores` unique `(pool_id, user_id)`, `points_total`, `breakdown` jsonb (`ScoreBreakdown`), `updated_at`.
  - `rate_limits` (`key`, `window_start`, `count`).
    Tests assert the unique constraints actually reject duplicates (insert twice → throws).
- [ ] **Step 2:** Implement the tables with FKs + unique indexes + jsonb `.$type<>()` from engine types.
- [ ] **Step 3:** Run → pass. Commit `feat(db): pools, predictions, scores, rate-limit schema`.

---

## Task 5: Migrations + pglite test harness

**Files:** `packages/db/drizzle.config.ts`, `packages/db/migrations/*`, `src/testing/make-test-db.ts` + test

- [ ] **Step 1:** Add `drizzle.config.ts` (dialect postgres, schema glob `src/schema`, out `migrations`). Add `db:generate`/`db:migrate` scripts.
- [ ] **Step 2:** Generate the initial migration (`pnpm -C packages/db db:generate`); commit the SQL.
- [ ] **Step 3:** Implement `make-test-db.ts`: spin a fresh `PGlite()` in-memory instance, apply migrations (drizzle `migrate` with the pglite driver), return a `Db`. Each call = isolated db.
- [ ] **Step 4:** Test: `makeTestDb()` applies all migrations cleanly and every table is queryable (`select` from each returns []). Run → pass.
- [ ] **Step 5:** Refactor Tasks 2–4 tests to use `makeTestDb()` (real migrations, not ad-hoc create). Commit `feat(db): drizzle migrations + pglite test harness`.

---

## Task 6: Repositories (users, pools, members, kicks, scores)

**Files:** `packages/db/src/repositories/*.ts` + co-located integration tests (pglite)

Typed, parameterized data access. No business rules here (those live in authz/services) — just CRUD + queries.

- [ ] For each repository, TDD against `makeTestDb()`:
  - `users`: `createUser`, `getUserById`, `getUserByEmail`, `updateDisplayName`.
  - `pools`: `createPool`, `getPoolById`, `listPoolsForUser`, `rotateInviteTokenHash`, `deletePool`, `getPoolByInviteTokenHash`.
  - `members`: `addMember` (respects unique), `removeMember`, `listMembers`, `isMember`.
  - `kicks`: `recordKick`, `isKicked`, `clearKick`.
  - `scores`: `upsertScore`, `getLeaderboard(poolId)` (join members → scores, ordered desc, stable tiebreak by display name).
- [ ] Each repo: failing test → implement → pass → commit `feat(db): <name> repository`.
- [ ] Use Drizzle query builder only (parameterized). No raw string SQL.

---

## Task 7: Authorization policy layer

**Files:** `apps/web/src/shared/authz/policy.ts`, `actor.ts` + tests (pglite + repos)

Encodes functional-spec §6.5 (lock), §8.3 (owner edits), §8.5 (visibility), §10 (RLS-replacement). Server time is authoritative (inject a `now()` clock; mock only in tests).

- [ ] **Step 1:** Define `Actor` (`{ userId: UserId }` or `null` for anonymous) and a `Clock` boundary (`() => Date`).
- [ ] **Step 2:** TDD pure/repo-backed policy functions:
  - `assertCanEditOwnCard(actor, pool, prediction, now)` — allowed only before `firstKickoff`/`locked_at`; throws `ForbiddenError`/`LockedError` otherwise.
  - `assertCanOwnerEdit(actor, pool)` — actor is the pool owner; allowed any time (incl. post-lock).
  - `canViewCard(actor, pool, targetUserId, now)` — own card always; others only after lock; owner any time.
  - `assertIsMember` / `assertIsOwner`.
  - `auditVisibleTo(actor, pool)` — all members can read `prediction_edits`.
  - Tests cover: member pre/post lock, owner override post-lock, non-member denied, anonymous denied, kicked user denied.
- [ ] **Step 3:** Use a typed error hierarchy (`ForbiddenError`, `LockedError`, `NotFoundError`) with clear messages; never swallow. Commit `feat(web): authorization policy layer`.

---

## Task 8: Auth.js v5 magic-link wiring

**Files:** `apps/web/src/shared/env.ts`, `shared/db.ts`, `features/auth/{auth,session}.ts`, `app/api/auth/[...nextauth]/route.ts`, `middleware.ts`, `shared/observability/logger.ts`

- [ ] **Step 1:** `env.ts` — zod-validate `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `RESEND_API_KEY` (fail fast at startup with a clear message). Test the validator with good/bad inputs.
- [ ] **Step 2:** `shared/db.ts` — server-only singleton `Db` from `env.DATABASE_URL` (guard against client import).
- [ ] **Step 3:** `features/auth/auth.ts` — `NextAuth({ adapter: DrizzleAdapter(db, {...tables}), providers: [Email magic-link], session: { strategy: 'database' } })`. The Email provider's `sendVerificationRequest` sends via **Resend** (the only mocked boundary in tests). On first sign-in, set `displayName` default from email local-part.
- [ ] **Step 4:** Route handler `app/api/auth/[...nextauth]/route.ts` exporting `GET`/`POST`; `middleware.ts` refreshing/gating sessions; `session.ts` `getCurrentActor()` returning `Actor | null` from the session.
- [ ] **Step 5:** `logger.ts` — pino; log auth boundary events (sign-in requested/confirmed) without secrets/PII.
- [ ] **Step 6:** Integration test: the Resend sender is mocked; assert a sign-in request creates a verification token row and "sends" exactly one email; confirming the token creates a user with a derived display name + a session. Commit `feat(web): magic-link auth via Auth.js + Resend`.

---

## Task 9: Minimal sign-in + settings (functional placeholders)

**Files:** `app/page.tsx` (sign-in form when logged out; dashboard stub when logged in), `app/settings/page.tsx`, `features/auth/actions.ts`

- [ ] **Step 1:** `actions.ts` `updateDisplayName(name)` server action — validates (zod: non-empty, length), authorizes (must be the current actor), persists via `users` repo, `revalidatePath('/settings')`.
- [ ] **Step 2:** `/` shows an email sign-in form (posts to the Auth.js sign-in) when logged out, and a minimal "signed in as <displayName>" dashboard stub when logged in. `/settings` lets the signed-in user edit their display name. **Unstyled/minimal** — real design lands with the feature plans; mark with a `TODO(design)` comment.
- [ ] **Step 3:** Accessibility basics: labelled inputs, semantic form, keyboard-usable.
- [ ] **Step 4:** Commit `feat(web): minimal sign-in and display-name settings`.

---

## Task 10: Rate-limit helper

**Files:** `packages/db/src/repositories/rate-limits.ts` (if not in Task 6) + `apps/web/src/shared/authz/rate-limit.ts` + tests

functional-spec §9 / technical-spec §11. Postgres-backed sliding/fixed window counters.

- [ ] **Step 1:** TDD `checkRateLimit(db, { key, limit, windowMs, now })` → increments the window counter, returns allowed/denied; over-limit within the window denies; a new window resets. Clock injected.
- [ ] **Step 2:** Provide constants for the documented limits (create-pool, join, magic-link request) as config, not hard-coded in call sites.
- [ ] **Step 3:** Commit `feat(web): postgres-backed rate limiting`.

---

## Task 11: Quality gates, docs, finish

- [ ] **Step 1:** Full local gate: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`. Ensure the pglite integration suite runs in CI (it needs no external services). Update `.github/workflows/ci.yml` only if a step is missing.
- [ ] **Step 2:** Add `docs/features/persistence-and-auth.md` (schema overview/ERD notes, the authorization model, the env vars, the pglite test approach). Update technical-spec §6/§7 status notes.
- [ ] **Step 3:** Add a `.env.example` documenting required env vars (no secrets).
- [ ] **Step 4:** Commit `docs: persistence & auth design doc + .env.example`. Then finish via superpowers:finishing-a-development-branch.

---

## Definition of Done (this plan)

- [ ] `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` all green locally and in CI.
- [ ] Drizzle schema covers the entire functional-spec §10 data model; migrations generate and apply cleanly to a fresh DB.
- [ ] Integration tests run against in-memory Postgres (pglite) — repositories, authorization policies, rate limiting, and the auth flow (Resend mocked) all covered.
- [ ] A user can request a magic link, sign in, and edit their display name end-to-end (locally, against a real Postgres or pglite).
- [ ] Authorization rules (member/owner/lock/visibility/audit) are enforced server-side in TS and unit/integration-tested; no RLS, no `any`, parameterized queries only.
- [ ] No secrets/PII logged; env validated at startup; `.env.example` present.
- [ ] Design doc added; technical-spec status updated; runnable increment; branch finished.

---

## Notes / deferred

- **Tournament/results population** is the Plan 3 sync script; this plan only defines their tables.
- **Pool/prediction _services_** (create pool, join, submit card, owner edit, import, rescore-on-edit) land in the **Plans 4–5 feature slices**, built on these repositories + authz primitives. This plan deliberately stops at the data layer + policies so the feature slices can consume the UI designs as they arrive.
- **Styled UI** for auth/settings is intentionally minimal here; the design system arrives with the feature plans.
