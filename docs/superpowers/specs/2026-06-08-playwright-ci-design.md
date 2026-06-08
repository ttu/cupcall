# Design: Add Playwright E2E Tests to CI

**Date:** 2026-06-08

## Goal

Run the existing Playwright E2E suite in GitHub Actions CI so that regressions in critical user flows are caught before merging.

## Current State

- `.github/workflows/ci.yml` has a single `quality` job: format → lint → typecheck → unit+integration tests → build.
- Playwright tests live in `apps/web/e2e/` and run locally via `pnpm e2e`.
- `apps/web/playwright.config.ts` already sets `forbidOnly: !!process.env.CI` and `reuseExistingServer: !process.env.CI` — CI-aware, no config changes needed.
- The app requires four env vars at startup: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `RESEND_API_KEY`.
- The global setup (`e2e/global-setup.ts`) runs `pnpm sync -- wc-2026` to seed tournament data.

## Design

### New `e2e` job in `ci.yml`

```yaml
e2e:
  needs: [quality]
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:16
      env:
        POSTGRES_DB: cup_prediction
        POSTGRES_USER: postgres
        POSTGRES_PASSWORD: postgres
      options: >-
        --health-cmd pg_isready
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
      ports:
        - 5432:5432
  env:
    DATABASE_URL: postgresql://postgres:postgres@localhost:5432/cup_prediction
    AUTH_SECRET: ci-only-secret-not-used-in-production-x
    AUTH_URL: http://localhost:3000
    RESEND_API_KEY: re_test_ci_placeholder
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - uses: actions/setup-node@v4
      with: { node-version: 20, cache: pnpm }
    - run: pnpm install --frozen-lockfile
    - run: pnpm db:migrate
    - run: pnpm exec playwright install --with-deps chromium
    - run: pnpm e2e
```

### Job ordering

`needs: [quality]` — E2E only runs if lint, types, unit/integration tests, and build all pass. Avoids spending browser-runner minutes on a broken build.

### Database

A `postgres:16` service container provides the database. The `pnpm db:migrate` step runs Drizzle migrations before the app starts. The Playwright global setup seeds `wc-2026` tournament data via `pnpm sync -- wc-2026`.

### Web server

`playwright.config.ts` starts `pnpm dev` and waits up to 180s for port 3000. No config change needed — `reuseExistingServer: !process.env.CI` ensures a fresh server is started in CI.

### Environment variables

| Var              | CI value                    | Notes                                                        |
| ---------------- | --------------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`   | points at service container | real Postgres                                                |
| `AUTH_SECRET`    | dummy 32-char string        | valid for Auth.js, not secret                                |
| `AUTH_URL`       | `http://localhost:3000`     | standard                                                     |
| `RESEND_API_KEY` | `re_test_ci_placeholder`    | satisfies non-empty check; guest auth flow never sends email |

## Files Changed

- `.github/workflows/ci.yml` — add `e2e` job
