# Engineering practices — Cup Prediction

Working agreement for all code in this repo. These are **requirements**, not suggestions. Specs:
[`docs/functional-spec.md`](./docs/functional-spec.md) (what) and
[`docs/technical-spec.md`](./docs/technical-spec.md) (how — stack, architecture, testing).

> The tech stack is defined in technical-spec §2. The ubiquitous language is the functional-spec §2
> glossary — use those exact terms in code (types, functions, files).

## Architecture

- **Domain-Driven Design.** Model the domain explicitly; name everything from the **ubiquitous
  language** (functional-spec §2): `Pool`, `Card`, `GroupOrder`, `RoundOf8`, `TopFour`, `SpecialBet`,
  `Lock`, `OwnerEdit`, etc. Keep domain logic free of framework/IO concerns.
- **Vertical slice architecture.** Code is organized by **feature**, not by technical layer.
  - Each feature **owns its internals** (domain, application, infrastructure, ui, api).
  - Cross-feature access is allowed **only through a feature's explicit public interface** (its
    `index.ts` barrel). Never reach into another feature's internals.
  - **Shared code must be generic and reusable.** Do not put feature-specific logic in `shared/`.
  - Move code to `shared/` **only after multiple real use cases** justify it (not preemptively).
- Keep **hooks and side effects near feature/application boundaries**; keep the domain pure.
- See technical-spec §4 for the concrete folder layout and §6 for the authorization service layer.

## Code quality

- **Clean, readable, self-documenting.** Clear descriptive names; small functions with one
  responsibility. Comment **only** non-obvious intent, constraints, or trade-offs.
- **DRY, modular, composable.** Avoid duplication; make dependencies explicit.
- **Functional style.** Prefer pure functions (no side effects), composition over inheritance, and
  **separate data from logic**. Push impurity (IO, network, time, randomness) to the edges.
- **YAGNI.** Build only what's required; avoid speculative complexity.

## Type safety

- TypeScript **strict**. No `any`, no untyped dicts, no unsafe casts.
- Use **branded types** for domain identifiers and quantities (`UserId`, `PoolId`, `TeamId`,
  `PlayerId`, `MatchId`, `Points`, …) so values aren't interchangeable by accident.
- Leverage inference where it aids readability; be explicit at public boundaries.

## TDD (red → green → refactor)

- **Write tests before implementation by default.** Red (failing test) → green (minimal code) →
  refactor.
- **Mock only at system boundaries** (network, filesystem, time, randomness, third-party services).
  Prefer **real collaborators** inside the system over mocks.

## Testing — all behavior must be tested

- **Test diamond:** the bulk of tests are **integration** tests exercising real collaboration between
  modules; fewer pure-unit tests (the engine, value objects, schemas) and fewer end-to-end tests.
- **Prefer integration over mocks** when validating module collaboration.
- **Integration tests use an in-memory database** (pglite) — fast, isolated, provider-neutral.
- E2E (Playwright) covers the critical user flows only.
- See technical-spec §12 for the full strategy.

## UI

- **Small, composable, focused components**; prefer composition over monolithic components.
- **Storybook** for every reusable UI component (in `shared/ui`). Stories are part of "done".
- **Accessibility is required:** semantic HTML, full keyboard access, properly labelled inputs,
  sufficient contrast, accessible component patterns (Radix/shadcn).

## Errors

- Validate inputs and handle edge cases. Use appropriate mechanisms (try/catch, typed `Result`/error
  returns). Provide clear, actionable messages. **Never swallow errors silently.**

## Security

- **Never trust user input.** Validate and sanitize all external input with Zod at the boundary.
- Parameterized queries only (Drizzle) — no string-built SQL.
- Follow framework security best practices. Authorization is enforced server-side (technical-spec §6).

## Observability

- **Structured logging** (pino) at important boundaries (server actions, sync job, auth).
- Make failures debuggable; add metrics/tracing for critical flows where appropriate.
- **Never log secrets or sensitive user data.**

## Performance

- Profile before optimizing — no premature optimization. Use appropriate data structures/algorithms;
  cache expensive computations when justified; watch memory/leaks.

## Tooling & quality gates

- **Format + lint automatically after each step** (Prettier + ESLint).
- **Pre-commit** (husky + lint-staged): format, lint, typecheck staged files.
- **Pre-push:** run unit + integration tests. **Run most CI steps locally before pushing.**
- **CI** mirrors the gates (lint, typecheck, test, build) on every PR.

## Incremental delivery

- Deliver in **small, runnable increments**; the system stays in a working state after each step.
- Prefer early user-visible progress where applicable.

## Documentation

- Keep docs current. **Each main feature has its own design doc** (`docs/features/<feature>.md`).
- Maintain the architecture, data-model (functional-spec §10), and testing docs as they evolve.

## Definition of Done

A change is done only when **all** hold:

- [ ] Code implemented and follows the practices above.
- [ ] Relevant tests exist and pass (TDD; behavior covered per the test diamond).
- [ ] Formatting, linting, and type checks pass.
- [ ] Documentation updated when needed (design docs, specs).
- [ ] The increment is runnable; the system is in a working state.
- [ ] Error cases are handled.
