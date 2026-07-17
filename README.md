# Cupcall

A website where friends predict the outcome of a football cup tournament (FIFA World Cup 2026 by
default) and compete in private leaderboards ("pools"). Each player fills in one prediction card
per pool — group-stage scores, knockout bracket picks, final/bronze scorelines, and tournament-wide
special bets — which locks at first kickoff. From those raw inputs the engine auto-derives group
order, qualifiers, the bracket, and the top-4 finish, then scores everything automatically as real
results come in.

Full product behavior: [`docs/functional-spec.md`](./docs/functional-spec.md). Architecture and
stack rationale: [`docs/technical-spec.md`](./docs/technical-spec.md). Engineering practices
(DDD, vertical slices, TDD, quality gates): [`CLAUDE.md`](./CLAUDE.md).

## Tech stack

TypeScript (strict) · Next.js 15 (App Router) · PostgreSQL + Drizzle ORM · Auth.js v5 (magic-link +
guest sessions) · Zod · Tailwind CSS + shadcn/ui · Vitest + pglite (in-memory Postgres) ·
Playwright · pnpm workspace.

See [`docs/technical-spec.md §2`](./docs/technical-spec.md#2-recommended-tech-stack) for the full
table and the reasoning behind each choice.

## Architecture at a glance

- **Domain-Driven Design**, vertical-slice organized: each feature under `apps/web/src/features/`
  owns its `domain` / `application` / `infrastructure` / `ui` / `api` and exposes a single public
  `index.ts`. Cross-feature access only goes through that barrel.
- **The server is the only database client.** Browser → Next.js (RSC reads / Server Action writes)
  → a TS authorization/service layer → Drizzle → Postgres. This replaces row-level security: every
  query passes through functions that take the acting user and enforce pool/lock/ownership rules.
- **`@cup/engine`** (`packages/engine`) is a pure, dependency-free TypeScript package that derives
  and scores every prediction card — the single source of scoring truth, reused by the web app, the
  data sync job, and the test suite.
- **Data-as-code:** tournament definitions and match results live in `data/tournaments/<id>/*.json`,
  validated with Zod and synced into Postgres by `scripts/sync.ts` (locally or via a GitHub Action).

Full diagrams and repo-layout breakdown: [`docs/technical-spec.md §3–4`](./docs/technical-spec.md#3-high-level-architecture).

## Repository layout

```
apps/web/               Next.js app — features/, shared/, app/ (routes)
packages/engine/         @cup/engine — pure derivation + scoring
packages/schemas/         @cup/schemas — Zod contracts (tournament/results/import-export)
packages/db/              @cup/db — Drizzle schema, migrations, repositories, pglite test harness
data/tournaments/<id>/    tournament.json + results.json (data-as-code)
scripts/                  sync, seed, dev, backfill, e2e-seed helpers
docs/                     specs, per-feature design docs, PROGRESS.md, deployment guide
```

## Quick start

Requirements: Node ≥20, pnpm 10.30.3 (see `.tool-versions`/`packageManager`), Docker (for the local
Postgres container — optional if you already have one running).

```bash
pnpm install
cp .env.example apps/web/.env.local   # fill in DATABASE_URL, AUTH_SECRET, AUTH_URL, RESEND_API_KEY
pnpm dev                              # starts Postgres (docker), runs migrations, starts Next.js
```

`pnpm dev` (`scripts/dev.sh`) brings up a local Postgres via `.devcontainer/docker-compose.yml` if
one isn't already reachable, runs Drizzle migrations, and starts the dev server on
`http://localhost:3010`. Pass `--sync <tournamentId>` to also load tournament data on startup, or
run it separately:

```bash
pnpm sync -- mini-2026     # or wc-2026, e2e-open, e2e-seed — see data/tournaments/
pnpm seed                  # seed a demo pool with users + predictions
```

See [`docs/deployment.md`](./docs/deployment.md) for deploying to Vercel + Neon + Resend.

## Scripts

| Command                                                    | Purpose                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm dev`                                                 | Start Postgres (if needed), run migrations, start the Next.js dev server |
| `pnpm test` / `pnpm test:watch` / `pnpm test:coverage`     | Vitest (unit + pglite integration)                                       |
| `pnpm e2e`                                                 | Playwright end-to-end tests                                              |
| `pnpm lint` / `pnpm format` / `pnpm typecheck`             | ESLint / Prettier / `tsc -b`                                             |
| `pnpm sync -- <tournamentId>`                              | Validate + upsert tournament/results JSON, rescore every card            |
| `pnpm seed` / `seed:ongoing` / `seed:current` / `seed:e2e` | Seed a demo/test pool (see `scripts/`)                                   |
| `pnpm db:migrate` / `pnpm db:reset`                        | Run Drizzle migrations / drop + re-migrate the local DB                  |

Full gate to run before pushing: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm -C apps/web build`.

## Testing

Test-diamond strategy: a thin layer of pure-unit tests (the engine, value objects, schemas), the
bulk as integration tests against an in-memory Postgres (pglite, no mocks for in-system
collaborators), and a thin Playwright layer for critical end-to-end flows. Details:
[`docs/technical-spec.md §12`](./docs/technical-spec.md#12-testing-strategy).

## Documentation

- [`docs/functional-spec.md`](./docs/functional-spec.md) — what the product does (glossary, scoring
  rules, flows).
- [`docs/technical-spec.md`](./docs/technical-spec.md) — how it's built (stack, architecture
  diagrams, testing strategy).
- [`docs/features/*.md`](./docs/features) — per-feature design docs.
- [`docs/PROGRESS.md`](./docs/PROGRESS.md) — cross-session handoff: what's done, what's next, how to
  continue.
- [`docs/deployment.md`](./docs/deployment.md) — Vercel + Neon + Resend deployment guide.
- [`CLAUDE.md`](./CLAUDE.md) — engineering practices and Definition of Done for this repo.
