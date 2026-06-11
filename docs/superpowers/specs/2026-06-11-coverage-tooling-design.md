# Coverage tooling — design

Status: draft (2026-06-11)
Scope: measurement only — wire up `@vitest/coverage-v8`, expose a `pnpm test:coverage`
script, and publish reports as CI artifacts. No new tests, no thresholds, no behavioral
changes to existing tests.

## Goal

Make the repo's actual test coverage measurable and reviewable so future decisions about
where to invest in tests are grounded in data rather than intuition.

## Non-goals

- Writing new tests to lift coverage numbers.
- Setting threshold gates that fail builds.
- Uploading reports to any third-party service (Codecov, Coveralls).
- Instrumenting Playwright E2E flows for coverage.
- Per-package coverage configuration.

## Approach

Single-config change centered on `vitest.config.ts`. One new dev dependency, one new npm
script, one CI step swap plus an artifact upload. No new files under `src/`. `.gitignore`
already excludes `coverage/`, so no change there.

### Provider

`@vitest/coverage-v8` — uses Node's built-in V8 coverage. Matches the existing ESM + TS
toolchain (no Babel transform, no additional config), and is the modern default for
Vitest. Istanbul is rejected because it requires source instrumentation that interacts
poorly with the workspace alias resolution already configured in `vitest.config.ts`.

### Reporters

- `text-summary` — single block at the end of the run; what humans and CI logs read first.
- `html` — browsable `coverage/index.html`; for local drill-down.
- `lcov` — `coverage/lcov.info`; uploaded as a CI artifact and consumed by editor
  extensions (e.g. VS Code "Coverage Gutters").

`text` (per-file table in the terminal) is intentionally omitted from the default reporter
list to keep CI logs short. Developers who want it can pass `--reporter=text` ad-hoc.

### Scope (what counts as "source")

The test diamond in `CLAUDE.md` puts the bulk of testing at the integration layer of
domain + application + API code. The coverage scope follows that: measure logic, do not
measure presentation or framework boilerplate.

**Include**

- `packages/engine/src/**/*.ts`
- `packages/schemas/src/**/*.ts`
- `packages/db/src/**/*.ts`
- `apps/web/src/shared/**/*.ts`
- `apps/web/src/features/*/domain/**/*.ts`
- `apps/web/src/features/*/application/**/*.ts`
- `apps/web/src/features/*/api/**/*.ts`
- `scripts/**/*.ts`

**Exclude**

- `**/*.test.ts`, `**/*.test.tsx` — tests themselves.
- `**/__fixtures__/**` — fixture data.
- `**/testing/**` — test harnesses (`makeTestDb`, `@cup/engine/testing`).
- `**/migrations/**` — Drizzle output.
- `**/index.ts` — barrel re-exports; including them double-counts re-exported symbols.
- `**/*.stories.{ts,tsx}` — Storybook stories.
- `apps/web/src/features/*/ui/**` — presentation; intentionally outside the unit-test
  surface per the test-diamond strategy.
- `apps/web/src/app/**` — Next.js page shells; exercised by Playwright, not Vitest.

### Thresholds

None. The point of this change is to surface the current number, not to gate on it.
Thresholds can be added in a follow-up once the baseline is known.

### Local UX

```
pnpm test            # unchanged — fast, no instrumentation
pnpm test:coverage   # new — runs vitest run --coverage, writes coverage/
```

Pre-push gates are unchanged; coverage is opt-in locally so iteration speed is not
affected.

### CI integration

In `.github/workflows/ci.yml`, inside the `quality` job:

1. Replace `- run: pnpm test` with `- run: pnpm test:coverage`. The instrumentation
   overhead is small with the v8 provider; running the suite twice would be worse.
2. Append an `actions/upload-artifact@v4` step with `if: always()` that uploads
   `coverage/lcov.info` and `coverage/index.html`. `if: always()` ensures the report is
   still published when tests fail, which is exactly when reviewers want it.

The `e2e` job is unchanged.

## File changes

| File                       | Change                                                                        |
| -------------------------- | ----------------------------------------------------------------------------- |
| `package.json`             | Add `@vitest/coverage-v8` to `devDependencies`; add `test:coverage` script.   |
| `vitest.config.ts`         | Add a `coverage` block with provider, reporters, include, exclude (above).    |
| `eslint.config.js`         | Add `**/coverage/**` to global `ignores` so generated reports are not linted. |
| `.github/workflows/ci.yml` | Swap `pnpm test` → `pnpm test:coverage`; append upload-artifact step.         |
| `docs/PROGRESS.md`         | One-line note under tooling: `pnpm test:coverage` + where the artifact lands. |

No source files are added or modified.

## Verification

Acceptance checks the implementation must pass:

- `pnpm install` succeeds with the new dev dep on the lockfile.
- `pnpm test` still passes and runs in roughly the same wall time as before.
- `pnpm test:coverage` runs the full suite, prints a `text-summary` block, and writes
  `coverage/index.html`, `coverage/lcov.info`, and the v8 raw output to `coverage/`.
- `coverage/` is git-ignored (`git status` shows nothing under it after a coverage run).
- The full quality gate still passes:
  `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm -C apps/web build`.
- A PR CI run produces a downloadable `coverage` artifact containing `lcov.info` and the
  HTML report; the artifact is uploaded even when tests fail.

## Open questions

None — all decisions resolved during the brainstorming session (2026-06-11).

## Out of scope (intentionally deferred)

- Choosing thresholds based on the baseline numbers.
- Writing tests to lift coverage of any specific package.
- Codecov / Coveralls integration.
- Per-package coverage reports.
- Including UI (`*.tsx`) or `app/` routes in the measured scope.
