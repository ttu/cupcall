# Cup Prediction — Technical Specification

**Status:** Draft v0.3
**Date:** 2026-06-06
**Companion to:** [`functional-spec.md`](./functional-spec.md) — read that first; this document describes _how_ to build it.

---

## 1. Purpose & scope

This spec turns the functional spec into concrete technical choices: stack, architecture, project
layout, the scoring/derivation engine, data access, auth, the data-as-code pipeline, validation,
testing, and deployment.

Engineering practices (TDD, clean code, type safety, error handling, security, observability, a11y,
quality gates, Definition of Done) are the standing working agreement in [`/CLAUDE.md`](../CLAUDE.md).
This spec covers the _architecture and stack_ that realize them.

Guiding constraints (functional spec §13 + this session's direction):

- **Vendor-neutral** — depend only on **standard PostgreSQL** and portable libraries. **No proprietary
  managed-platform features** (no Supabase Auth, no Postgres RLS as the security boundary). The app must
  run against any Postgres (Neon, Railway, Fly, RDS, a Supabase _database_, or local Docker) with only a
  connection-string change.
- **Most logic in TypeScript** — authorization, scoring/derivation, validation, and rate limiting all
  live in app-layer TS, not in the database or a vendor service.
- **Domain-Driven Design** with a shared **ubiquitous language** (functional-spec §2 glossary) — domain
  terms name the types, functions, and files.
- **Vertical slice architecture** — features own their internals; cross-feature access only via explicit
  public interfaces; `shared/` is generic-only (§4).
- **Deterministic & idempotent** scoring/derivation — identical inputs always produce identical output.
- **Authoritative server time** for locks; **audited** owner edits.
- **Read-on-load** — no realtime; pages fetch current state on each load (no live subscriptions).
- **TDD** and **test-diamond** coverage with **in-memory DB** integration tests (§12).
- **Free-tier friendly**, hobby-scale audience.
- **Data-as-code** for tournaments/results; in-app for predictions and owner edits.

---

## 2. Recommended tech stack

| Layer                    | Choice                                                         | Why                                                                            |
| ------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Language                 | **TypeScript** (strict)                                        | One language across web, server actions, engine, and sync.                     |
| Framework                | **Next.js 15 (App Router)**                                    | Server Actions + Route Handlers for mutations; RSC for fast reads.             |
| Runtime                  | **Node 20 LTS**                                                | Portable; runs the web app, sync script, and engine on any Node host.          |
| Database                 | **PostgreSQL (provider-agnostic)**                             | Standard Postgres only. Swap providers with a connection string.               |
| Data access              | **Drizzle ORM**                                                | Typed, lightweight, provider-agnostic; no client-side DB access — server only. |
| Migrations               | **Drizzle Kit**                                                | SQL migrations in the repo; portable across providers; runs in CI.             |
| Authorization            | **App-layer TS service/policy layer**                          | Single server-side gate enforces member/owner/lock/audit rules. Not RLS.       |
| Auth (identity)          | **Auth.js v5** — Email (magic link) provider + Drizzle adapter | Passwordless, portable, sessions in our own Postgres.                          |
| Email delivery           | **Resend** (or any SMTP)                                       | Sends magic-link emails (we no longer rely on a platform's built-in mailer).   |
| Validation               | **Zod**                                                        | One schema for `tournament.json`, `results.json`, import/export, and forms.    |
| Scoring/derivation       | **Pure TypeScript package** (`@cup/engine`, no IO)             | Keystone for determinism; reused by sync job, server actions, and tests.       |
| Styling/UI               | **Tailwind CSS** + **shadcn/ui** (Radix)                       | Fast, accessible, mobile-first; no heavy component runtime.                    |
| Forms                    | **React Hook Form** + Zod resolver                             | Large prediction card with partial save; shared client/server schemas.         |
| Sync trigger             | **GitHub Actions** on push to `data/**`                        | Runs the sync script; validates before the DB is touched.                      |
| Rate limiting            | **Postgres-backed counters** in TS                             | Stays on free tier; one DB, no extra service.                                  |
| Unit + integration tests | **Vitest** + **pglite** (in-memory Postgres)                   | Test-diamond; integration tests run against real in-memory Postgres, no mocks. |
| E2E tests                | **Playwright**                                                 | Critical flows (sign-in, predict, lock, owner edit, import).                   |
| UI workshop              | **Storybook**                                                  | Every reusable `shared/ui` component has stories.                              |
| Logging                  | **pino** (structured)                                          | Boundary logging; no secrets (§14).                                            |
| Lint/format              | **ESLint** + **Prettier**                                      | Auto-run after each step.                                                      |
| Git hooks                | **husky** + **lint-staged**                                    | Pre-commit format/lint/typecheck; pre-push tests.                              |
| Package mgmt             | **pnpm** workspace                                             | Isolates `@cup/engine` (domain) from the app slices.                           |

> **Stack confirmed.** (The original "Use this tech stack: xxx, yyy" was a placeholder; the table above
> is the agreed stack.) Hosting: **Vercel** (web) + **Neon** (Postgres); magic-link email via **Resend**.

### Notable alternatives considered

- **Auth library:** Auth.js v5 recommended; **Lucia** or **better-auth** are equally portable
  alternatives if more control over the session model is wanted. All store identity in our Postgres.
- **DB provider:** Neon (serverless Postgres, generous free tier, branch-per-PR) pairs well with Vercel;
  Railway/Fly/Supabase-Postgres/local all work unchanged. The code is agnostic.
- **Prisma** instead of Drizzle — heavier runtime/codegen; Drizzle preferred for a lean, SQL-close layer.

---

## 3. High-level architecture

```
                       git push to data/**
  maintainer ───────────────────────────────► GitHub Actions ──► sync script (Node)
                                                                     │ Drizzle + @cup/engine
                                                                     ▼
  browser ──► Next.js server (Vercel)                          PostgreSQL (any provider)
     ▲           │  RSC reads          │ Server Actions             ▲
     │           └─────────┬───────────┘  (mutations)               │
     │                     ▼                                         │
     │            TS service / policy layer  ──── Drizzle ───────────┘
     │             (authorization + audit)                │
     └─────────────────────────────────────────  @cup/engine (pure TS: derive + score)
```

- **The server is the only database client.** The browser never connects to Postgres directly; all
  reads/writes go through Next.js (RSC + Server Actions) → **TS service layer** → Drizzle. This is what
  replaces RLS: every query passes through functions that take the acting user and enforce the rules.
- **Reads** are RSC calling service functions (read-on-load; no subscriptions).
- **Writes** (predictions, pool actions, owner edits, import) are Server Actions that validate with Zod,
  enforce authorization, write via Drizzle, then call `@cup/engine` to re-derive + re-score the card.
- **Sync** is an out-of-band Node job that upserts tournament/results JSON and runs the same
  `@cup/engine` to recompute every card. The engine is the single source of scoring truth.

---

## 4. Repository structure — vertical slices + DDD (pnpm workspace)

Code is organized **by feature**, not by technical layer. Each feature is a self-contained slice that
owns its `domain` / `application` / `infrastructure` / `ui` / `api`, and exposes a **single public
interface** (`index.ts`). Other features import **only** from that barrel — never from internals.

```
/
├── apps/web/
│   ├── src/
│   │   ├── features/
│   │   │   ├── predictions/         # one vertical slice
│   │   │   │   ├── domain/          # entities, value objects, branded types, pure logic
│   │   │   │   ├── application/     # use-cases / services (orchestration), ports
│   │   │   │   ├── infrastructure/  # Drizzle repositories, adapters
│   │   │   │   ├── ui/              # components + hooks for this feature
│   │   │   │   ├── api/             # server actions / route handlers
│   │   │   │   ├── *.test.ts        # co-located tests (unit + integration)
│   │   │   │   └── index.ts         # PUBLIC interface — the only cross-feature entry
│   │   │   ├── pools/               # (owner edits, members, invites, leaderboard)
│   │   │   ├── tournaments/         # (definition + results read models)
│   │   │   └── auth/                # (Auth.js wiring, session, display name)
│   │   ├── shared/                  # GENERIC + reusable only — no feature logic
│   │   │   ├── ui/                  # design-system primitives (Storybook'd)
│   │   │   ├── lib/                 # Result type, branded-type helpers, generic utils
│   │   │   ├── db/                  # Drizzle client + migration runner (generic)
│   │   │   └── observability/       # pino logger
│   │   └── app/                     # Next.js routes — THIN; delegate into feature `api`/`ui`
│   └── .storybook/
├── packages/
│   ├── engine/                      # @cup/engine — pure domain: derivation + scoring (NO IO)
│   └── schemas/                     # @cup/schemas — Zod contracts (JSON files, import/export, forms)
├── data/tournaments/<id>/           # tournament.json, results.json (data-as-code)
├── scripts/sync.ts                  # pnpm sync -- <tournamentId>
├── drizzle/                         # migrations + meta
└── .github/workflows/               # sync-on-push, CI (lint/typecheck/test/build)
```

**Boundaries (enforced; lint rule recommended):**

- A feature may import from its own internals, from `shared/`, and from another feature's `index.ts`.
- A feature may **not** import another feature's internal paths.
- `shared/` and `@cup/*` may **not** import from `features/`.
- `@cup/engine` is domain code shared by the web app _and_ the sync script (two real consumers, so the
  package is justified per the "shared only when multiple use cases" rule); it stays pure (no IO).

---

## 5. The scoring & derivation engine (`@cup/engine`)

> **Status: implemented** (`packages/engine`, with `@cup/schemas` for validation). Design doc:
> [`docs/features/scoring-engine.md`](./features/scoring-engine.md).

The functional spec's correctness hinges on this. It is a **pure, dependency-free TypeScript module**:
deterministic, no IO, no clock, no DB.

```ts
deriveCard(input: CardInputs, tournament: Tournament): DerivedCard
//   -> group orders, qualifiers, bracket, Round-of-8, finalists, bronze pair, top-4
scoreCard(derived: DerivedCard, actual: ActualResults, scoring: Scoring): ScoreBreakdown
//   -> per-category points + total, matching functional-spec §7
```

- **`standingsTiebreak`** (points → GD → GF → seedOrder) implemented once; used for both predicted (per
  card) and actual standings (functional spec §4.1, §6.2).
- **Bracket builder** consumes `bracket.slots`/`progression` + qualifiers + winner picks (§6.3).
- **Scoring** reads every point value from the tournament JSON's `scoring` block — **no hard-coded
  numbers** (§7): group match, group order, bronze/final, Round-of-8, top-4 (non-additive `max`),
  special bets.
- Used identically in three places: the sync rescore job, the server action that re-scores after an
  owner edit/import, and Vitest — guaranteeing the same result everywhere (functional spec §13).

**Testing:** golden-fixture tests (sample cards → expected breakdown), the functional-spec §7.7 worked
example as a test, and property tests for determinism (same input → same output).

---

## 6. Data layer & authorization (replaces RLS)

- **Schema** per functional-spec §10, defined in **Drizzle** (`apps/web/lib/db`), migrated with Drizzle Kit.
- **Single access path:** no ORM calls scattered through components. All DB access goes through a
  **service layer** (`lib/services/*`) whose every function takes the **acting user** and enforces the
  functional-spec rules in TypeScript:
  - members read/write **their own card in a pool**; writes rejected at/after `locked_at` (server time).
  - pool **owner** reads/writes **every card in pools they own**, any time (the only post-lock writer);
    each write appends a `prediction_edits` row.
  - `prediction_edits` readable by **all members** of the pool.
  - other members' cards visible only after lock.
- Because authorization is centralized in TS (not DB RLS), it is unit-testable and provider-independent.
  The trade-off vs RLS — there is no second line of defense in the DB — is acceptable given the server is
  the _only_ client and all paths funnel through the service layer.
- **Connection:** a single pooled Postgres connection (e.g. `DATABASE_URL`) used by the server and the
  sync job. Use a serverless-friendly pooler (PgBouncer / provider pooling) for Vercel functions.
- **Re-scoring** lives in `@cup/engine` (TS), not Postgres functions; writes `scores.breakdown` (jsonb).

---

## 7. Auth (identity)

- **Auth.js v5** with the **Email (magic link) provider** and the **Drizzle adapter**, storing users and
  sessions in our Postgres (functional-spec §5, §12). Magic-link emails sent via **Resend** (or SMTP).
- One account per verified email (unique constraint on the users table — no platform dependency).
- Display name on first sign-in (default from email local-part), editable at `/settings`.
- Middleware validates the session and gates authenticated routes.

---

## 8. Data-as-code sync pipeline

1. Maintainer edits `data/tournaments/<id>/{tournament,results}.json`, commits, pushes.
2. **GitHub Action** (`sync-on-push`) runs `pnpm sync -- <id>` with `DATABASE_URL` from a repo secret.
3. `scripts/sync.ts`: **Zod-validates** the JSON → upserts tournament + results via Drizzle → calls
   `@cup/engine` to recompute every card in that tournament → updates `scores` + leaderboards. **Idempotent.**
4. Zod validation failures fail the Action (and a PR check), so bad data never reaches the DB.

`pnpm sync` also runs locally for setup/debugging against any `DATABASE_URL`.

---

## 9. Validation (`@cup/schemas`)

Single Zod source of truth for:

- `tournament.json` and `results.json` (sync script + PR checks).
- The **import/export** card format (functional-spec §6.6) — validates `tournamentId`, `version`, and
  that all team/player/match ids exist; partial imports allowed, unknown fields reported.
- Server-action payloads (prediction edits, pool actions) — the same schemas validate client and server.

---

## 10. Frontend

- App Router with RSC for **read-on-load** rendering; Server Actions for mutations. No realtime/subscriptions.
- Tailwind + shadcn/ui; **mobile-first** (functional-spec §13). The large prediction card uses React Hook
  Form with autosave + a completeness indicator (functional-spec §6.5).
- Leaderboard and member-card views are server-rendered; owner edit + import live on the member view.
- After a mutation, the affected route revalidates (`revalidatePath`) so the next load reflects new scores.

---

## 11. Rate limiting

- Postgres `rate_limits` counters (functional-spec §9/§10) wrapped in a TS helper, applied in server
  actions (per-user) and the magic-link request route (per-email + per-IP).
- Limits are config constants, tunable without touching business logic. No external rate-limit service.

---

## 12. Testing strategy

**TDD** (red → green → refactor) by default. **Test diamond:** the bulk of tests are **integration**
tests exercising real collaboration between modules against an **in-memory Postgres (pglite)** — no
mocks for in-system collaborators. **Mock only at system boundaries** (network, filesystem, time,
randomness, email/third-party). A thinner layer of pure-unit tests covers the engine, value objects,
and schemas; a thin E2E layer covers critical flows.

| Layer (diamond)        | Scope                                                | Tool                | What                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (thin)            | Engine, value objects, schemas                       | Vitest              | Derivation/scoring golden fixtures, §7.7 worked example, determinism property tests; branded-type/value-object invariants; valid/invalid JSON & import payloads. |
| **Integration (bulk)** | Feature slices end-to-end (application + infra + DB) | Vitest + **pglite** | Authorization (member vs owner vs lock), audit writes, owner edit/import re-score, sync idempotency (run twice → same scores).                                   |
| E2E (thin)             | Whole app via browser                                | Playwright          | Sign-in, fill card, lock enforcement, owner edit + audit, import, leaderboard.                                                                                   |

- In-memory pglite keeps DB integration tests fast, isolated per test, and provider-neutral (no Docker).
- **CI** (GitHub Actions): lint + typecheck + unit + integration + build on every PR; the same gates run
  locally via the pre-push hook so most CI is caught before pushing.

---

## 13. Deployment & environments

- **Web:** Vercel (preview deploys per PR, production on `main`). The app is a standard Node/Next app, so
  any Node host (Fly, Render, a container) works too.
- **Database:** any managed Postgres; **Neon** recommended for the free tier + branch-per-PR. Migrations
  applied via CI on `main` (Drizzle Kit).
- **Env vars:** `DATABASE_URL` (+ pooled URL for serverless), `AUTH_SECRET`, `AUTH_URL`,
  `RESEND_API_KEY` (or SMTP creds). The sync job/CI needs only `DATABASE_URL`. No client-exposed DB
  credentials — the browser never connects to Postgres.

---

## 14. Cross-cutting concerns (how `/CLAUDE.md` is realized)

The standing practices in [`/CLAUDE.md`](../CLAUDE.md) map to concrete tech here:

- **Type safety:** branded types for domain ids/quantities live in `shared/lib` and feature `domain`
  (`UserId`, `PoolId`, `TeamId`, `PlayerId`, `MatchId`, `Points`). `@cup/engine` keeps **data separate
  from logic** (plain input/output records, pure functions).
- **Error handling:** a shared `Result<T, E>` type for expected domain failures; thrown errors only for
  truly exceptional cases. Boundaries return clear, actionable messages; errors are never swallowed.
- **Security:** all external input validated/sanitized with Zod at the boundary; Drizzle uses
  **parameterized queries** only; authorization enforced in the service layer (§6).
- **Observability:** **pino** structured logs at boundaries (server actions, sync, auth) with request
  correlation; **never** log secrets or member PII.
- **Accessibility:** semantic HTML, keyboard support, labelled inputs, sufficient contrast, Radix/shadcn
  patterns; verified for each UI slice.
- **Quality gates:** Prettier + ESLint (incl. an import-boundary rule for slices), husky pre-commit
  (format/lint/typecheck) and pre-push (unit + integration), mirrored in CI. Definition of Done per
  `/CLAUDE.md`.
- **Documentation:** each feature slice gets a design doc under `docs/features/<feature>.md`; this spec
  and the functional spec stay current.

---

## 15. Open technical decisions

_(none currently open — the items below are locked.)_

### Resolved this session

- **Frontend hosting → Vercel.** Free tier, per-PR previews, first-class Neon integration. Portable: the
  app is a standard Node/Next app, so Fly/Render/Cloudflare/self-host remain options.
- **DB provider → Neon.** Serverless Postgres, free tier, branch-per-PR. Still just standard Postgres, so
  swappable via `DATABASE_URL`.
- **Auth → Auth.js v5**, Email (magic-link) provider + Drizzle adapter.
- **Email delivery → Resend** for magic-link emails (SMTP/SES/Postmark are drop-in fallbacks via Auth.js's
  `sendVerificationRequest` — no lock-in).
- **Monorepo → pnpm workspace** with `@cup/engine` as its own package.
- **Not tied to Supabase** — standard Postgres + Drizzle + Auth.js; no RLS, no Supabase Auth/SDK.
- **Most functionality in TS** — authorization, scoring, validation, rate limiting all app-layer TS.
- **Read-on-load** — no realtime; pages fetch on load and revalidate after mutations.

---

_End of technical specification — v0.3 draft._
