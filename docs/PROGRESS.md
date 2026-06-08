# Build progress & roadmap

**Start here** if you're picking up this project. This is the single source of truth for _what's done_
and _what's next_. Keep it updated as plans complete.

Companion docs: [`functional-spec.md`](./functional-spec.md) (what), [`technical-spec.md`](./technical-spec.md)
(how), [`/CLAUDE.md`](../CLAUDE.md) (engineering practices), `docs/features/*.md` (per-feature design),
`docs/superpowers/plans/*.md` (the implementation plans).

## Status

| Plan | Scope                                                                             | Status                   | Commit                                |
| ---- | --------------------------------------------------------------------------------- | ------------------------ | ------------------------------------- |
| 1    | Foundation + scoring engine (`@cup/engine`, `@cup/schemas`, workspace/tooling/CI) | ✅ done                  | `feat: foundation and scoring engine` |
| 2    | Persistence + auth (`apps/web`, `@cup/db`, authz layer, Auth.js magic-link)       | ✅ done                  | `feat: persistence and auth`          |
| 3    | Data-as-code sync pipeline                                                        | ✅ done                  | (unpushed)                            |
| 4    | Predictions feature slice                                                         | ⬜ blocked on UI designs |
| 5    | Pools feature slice                                                               | ⬜ blocked on UI designs |

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

## What's next (the remaining-plan sequence)

Build the **design-independent** work first; the feature slices consume the UI designs as they land.

1. **Plan 4 — Predictions feature slice** (needs UI designs). Card CRUD, derived bracket, lock,
   export/import — built on the `@cup/db` repos + `shared/authz` primitives.
2. **Plan 5 — Pools feature slice** (needs UI designs). Create/join/kick/invite, leaderboard, owner
   edits + audit, import.

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
