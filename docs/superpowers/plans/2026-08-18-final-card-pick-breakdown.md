# Final/Bronze Card Pick Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Final/Bronze result card's single "correct/wrong" checkmark with a breakdown that shows which of the user's two predicted finalists were actually right and whether the score was exact.

**Architecture:** A new pure domain function, `computeFinalPickBreakdown`, derives a four-tier verdict (`pending` / `zero` / `partial` / `full`) plus per-team correctness booleans from data `FinalResultCard.tsx` already has. `FinalResultCard.tsx` consumes it to render per-team check/x marks on the pick pill's team badges, color the score, and pick the pill's border color and corner badge. No other file changes.

**Tech Stack:** TypeScript, React (Next.js App Router), Tailwind, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-18-final-card-pick-breakdown-design.md`.
- **Scope:** touches only `apps/web/src/features/results/domain/` (new file) and
  `apps/web/src/features/results/ui/FinalResultCard.tsx`. Do not modify `computeKnockoutHit`,
  `build-race-view.ts`, `MatchHit`, `HitChip`, or `MatchSummarySheet` — those are shared with
  other knockout rounds and out of scope per the spec's non-goals.
- **No component-rendering tests:** this codebase has zero `.test.tsx` files under
  `apps/web/src/features/results` — all UI logic is tested as extracted pure functions
  (`*.test.ts` next to the pure function, e.g. `predicted-goals.ts` / `predicted-goals.test.ts`).
  Follow that pattern; do not introduce a new `.test.tsx` convention.
- **Test runner:** Vitest, run from repo root: `pnpm vitest run <path>`.
- **One commit for the whole feature.** Per this repo's working agreement, do NOT commit after
  each task below. Accumulate all changes (domain function + tests + `FinalResultCard.tsx` +
  the already-written, currently-uncommitted spec at
  `docs/superpowers/specs/2026-08-18-final-card-pick-breakdown-design.md`) and commit once at
  the very end, in Task 3.
- Colors: `border-green-300` / `border-red-300` already used in this file; `border-amber-300` is
  new for the `partial` tier — no other file needs updating for this (Tailwind utility, no config
  change required).

---

### Task 1: `computeFinalPickBreakdown` domain function

**Files:**

- Create: `apps/web/src/features/results/domain/final-pick-breakdown.ts`
- Create: `apps/web/src/features/results/domain/final-pick-breakdown.test.ts`

**Interfaces:**

- Produces (consumed by Task 2):

  ```ts
  export type FinalPickTier = 'pending' | 'zero' | 'partial' | 'full';

  export type FinalPickBreakdown = {
    leftCorrect: boolean;
    rightCorrect: boolean;
    scoreExact: boolean;
    isPending: boolean;
    tier: FinalPickTier;
  };

  export function computeFinalPickBreakdown(
    match: Pick<
      KnockoutMatchView,
      'homeTeamId' | 'awayTeamId' | 'actualHome' | 'actualAway' | 'hit'
    >,
    pickLeftId: string | null,
    pickRightId: string | null,
  ): FinalPickBreakdown;
  ```

  `KnockoutMatchView` is imported from `./types` (same barrel `FinalResultCard.tsx` already
  imports it from).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/features/results/domain/final-pick-breakdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeFinalPickBreakdown } from './final-pick-breakdown';
import type { KnockoutMatchView } from './types';

type MatchFixture = Pick<
  KnockoutMatchView,
  'homeTeamId' | 'awayTeamId' | 'actualHome' | 'actualAway' | 'hit'
>;

function match(overrides: Partial<MatchFixture>): MatchFixture {
  return {
    homeTeamId: 'ESP',
    awayTeamId: 'ARG',
    actualHome: 1,
    actualAway: 0,
    hit: 'outcome',
    ...overrides,
  };
}

describe('computeFinalPickBreakdown', () => {
  it('is pending when the actual score is not in yet', () => {
    const result = computeFinalPickBreakdown(
      match({ actualHome: null, actualAway: null }),
      'ESP',
      'POR',
    );
    expect(result).toEqual({
      leftCorrect: false,
      rightCorrect: false,
      scoreExact: false,
      isPending: true,
      tier: 'pending',
    });
  });

  it('is full when both teams and the exact score are correct', () => {
    const result = computeFinalPickBreakdown(match({ hit: 'exact' }), 'ESP', 'ARG');
    expect(result).toEqual({
      leftCorrect: true,
      rightCorrect: true,
      scoreExact: true,
      isPending: false,
      tier: 'full',
    });
  });

  it('is partial when only the winner is correct (the reported bug case)', () => {
    // User picked ESP 2-1 POR; actual final was ESP 1-0 ARG.
    const result = computeFinalPickBreakdown(match({ hit: 'outcome' }), 'ESP', 'POR');
    expect(result).toEqual({
      leftCorrect: true,
      rightCorrect: false,
      scoreExact: false,
      isPending: false,
      tier: 'partial',
    });
  });

  it('is partial when only the correct runner-up was picked, winner wrong', () => {
    // User picked POR 2-1 ARG; actual final was ESP 1-0 ARG. ARG (runner-up) is correct,
    // the predicted winner POR is not — this used to render as a full miss.
    const result = computeFinalPickBreakdown(match({ hit: 'missed' }), 'POR', 'ARG');
    expect(result).toEqual({
      leftCorrect: false,
      rightCorrect: true,
      scoreExact: false,
      isPending: false,
      tier: 'partial',
    });
  });

  it('is partial when both teams are correct but the score is wrong', () => {
    const result = computeFinalPickBreakdown(match({ hit: 'outcome' }), 'ESP', 'ARG');
    expect(result).toEqual({
      leftCorrect: true,
      rightCorrect: true,
      scoreExact: false,
      isPending: false,
      tier: 'partial',
    });
  });

  it('is zero when neither team is correct', () => {
    const result = computeFinalPickBreakdown(match({ hit: 'missed' }), 'POR', 'BRA');
    expect(result).toEqual({
      leftCorrect: false,
      rightCorrect: false,
      scoreExact: false,
      isPending: false,
      tier: 'zero',
    });
  });

  it('treats a null pick side as not correct', () => {
    const result = computeFinalPickBreakdown(match({ hit: 'missed' }), null, 'ARG');
    expect(result.leftCorrect).toBe(false);
    expect(result.rightCorrect).toBe(true);
    expect(result.tier).toBe('partial');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/web/src/features/results/domain/final-pick-breakdown.test.ts`
Expected: FAIL — `final-pick-breakdown.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/features/results/domain/final-pick-breakdown.ts`:

```ts
import type { KnockoutMatchView } from './types';

export type FinalPickTier = 'pending' | 'zero' | 'partial' | 'full';

export type FinalPickBreakdown = {
  leftCorrect: boolean;
  rightCorrect: boolean;
  scoreExact: boolean;
  isPending: boolean;
  tier: FinalPickTier;
};

/**
 * Final/Bronze scoring credits each correctly-predicted team independently of which side won
 * (functional-spec §7.3), so this checks pick membership against the actual two participants
 * rather than reusing the winner-oriented `hit` field for team correctness.
 */
export function computeFinalPickBreakdown(
  match: Pick<KnockoutMatchView, 'homeTeamId' | 'awayTeamId' | 'actualHome' | 'actualAway' | 'hit'>,
  pickLeftId: string | null,
  pickRightId: string | null,
): FinalPickBreakdown {
  const isPending = match.actualHome === null || match.actualAway === null;
  if (isPending) {
    return {
      leftCorrect: false,
      rightCorrect: false,
      scoreExact: false,
      isPending: true,
      tier: 'pending',
    };
  }

  const actualParticipants = new Set(
    [match.homeTeamId, match.awayTeamId].filter((id): id is string => id !== null),
  );
  const leftCorrect = pickLeftId !== null && actualParticipants.has(pickLeftId);
  const rightCorrect = pickRightId !== null && actualParticipants.has(pickRightId);
  const scoreExact = match.hit === 'exact';

  const tier: FinalPickTier = scoreExact
    ? 'full'
    : leftCorrect || rightCorrect
      ? 'partial'
      : 'zero';

  return { leftCorrect, rightCorrect, scoreExact, isPending: false, tier };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run apps/web/src/features/results/domain/final-pick-breakdown.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Typecheck**

Run: `pnpm -C apps/web typecheck`
Expected: no errors.

Do NOT commit yet — see Global Constraints.

---

### Task 2: Wire the breakdown into `FinalResultCard.tsx`

**Files:**

- Modify: `apps/web/src/features/results/ui/FinalResultCard.tsx`

**Interfaces:**

- Consumes: `computeFinalPickBreakdown`, `FinalPickBreakdown`, `FinalPickTier` from
  `../domain/final-pick-breakdown` (Task 1).
- No new exports — this is a leaf UI component.

- [ ] **Step 1: Remove the now-unused `MatchHit`-based border/badge helpers and replace with tier-based ones**

In `apps/web/src/features/results/ui/FinalResultCard.tsx`, replace lines 105–127 (the
`borderClassForPickHit` and `PickBadge` functions) with:

```ts
function borderClassForTier(tier: FinalPickTier): string {
  if (tier === 'full') return 'border-green-300';
  if (tier === 'partial') return 'border-amber-300';
  if (tier === 'zero') return 'border-red-300';
  return 'border-line-soft';
}

function PickBadge({ tier }: { tier: FinalPickTier }): ReactElement | null {
  if (tier === 'full') {
    return (
      <span className="absolute -right-1.5 -top-1.5 grid place-items-center w-5 h-5 rounded-full bg-green-500">
        <Icon name="check" size={11} color="var(--on-dark)" />
      </span>
    );
  }
  if (tier === 'zero') {
    return (
      <span className="absolute -right-1.5 -top-1.5 grid place-items-center w-5 h-5 rounded-full bg-red-600">
        <Icon name="close" size={11} color="var(--on-dark)" />
      </span>
    );
  }
  return null;
}

function TeamPickMark({ correct }: { correct: boolean }): ReactElement {
  return (
    <span
      className={cn(
        'absolute -right-1 -top-1 grid place-items-center w-3.5 h-3.5 rounded-full',
        correct ? 'bg-green-500' : 'bg-red-600',
      )}
    >
      <Icon name={correct ? 'check' : 'close'} size={8} color="var(--on-dark)" />
    </span>
  );
}
```

(`tier === 'partial'` intentionally renders no corner badge — the per-team marks and score color
carry that state; see spec's "Visual design" section.)

- [ ] **Step 2: Update `PickPill` to take a `breakdown` instead of `hit`, and render per-team marks + colored score**

Replace the `PickPill` function (original lines 129–159) with:

```tsx
function PickPill({
  leftId,
  rightId,
  leftGoals,
  rightGoals,
  breakdown,
}: {
  leftId: string | null;
  rightId: string | null;
  leftGoals: number | null;
  rightGoals: number | null;
  breakdown: FinalPickBreakdown;
}): ReactElement {
  return (
    <div
      data-testid="final-card-pick-pill"
      className={cn(
        'relative flex items-center gap-1.5 mt-2.5 p-[8px_14px] rounded-full border bg-surface w-fit mx-auto',
        borderClassForTier(breakdown.tier),
      )}
    >
      <span className="text-[11px] font-bold text-ink-muted">Your pick:</span>
      {leftId !== null && (
        <span className="relative inline-flex">
          <TeamBadge teamId={leftId} size="sm" />
          {!breakdown.isPending && <TeamPickMark correct={breakdown.leftCorrect} />}
        </span>
      )}
      <span
        className={cn(
          'tnum text-[12px] font-extrabold',
          breakdown.isPending
            ? 'text-ink'
            : breakdown.scoreExact
              ? 'text-green-600'
              : 'text-red-600',
        )}
      >
        {leftGoals}–{rightGoals}
      </span>
      {rightId !== null && (
        <span className="relative inline-flex">
          <TeamBadge teamId={rightId} size="sm" />
          {!breakdown.isPending && <TeamPickMark correct={breakdown.rightCorrect} />}
        </span>
      )}
      <PickBadge tier={breakdown.tier} />
    </div>
  );
}
```

- [ ] **Step 3: Compute the breakdown in `FinalResultCard` and pass it to `PickPill`**

In the `FinalResultCard` function body, after the existing `pickLeftGoals`/`pickRightGoals`
computation (original lines 200–207) and before the `isTappable` line, add:

```ts
const breakdown = computeFinalPickBreakdown(match, pickRowLeftId, pickRowRightId);
```

Then update the `<PickPill>` usage at the bottom of the component (original lines 244–252) to
pass `breakdown` instead of `hit`:

```tsx
{
  pickLeftGoals !== null && pickRightGoals !== null && (
    <PickPill
      leftId={pickRowLeftId}
      rightId={pickRowRightId}
      leftGoals={pickLeftGoals}
      rightGoals={pickRightGoals}
      breakdown={breakdown}
    />
  );
}
```

- [ ] **Step 4: Fix imports**

At the top of the file:

- Add: `import { computeFinalPickBreakdown } from '../domain/final-pick-breakdown';`
- Add: `import type { FinalPickBreakdown, FinalPickTier } from '../domain/final-pick-breakdown';`
- Remove `MatchHit` from the `import type { KnockoutMatchView, MatchHit } from '../domain/types';`
  line (it becomes `import type { KnockoutMatchView } from '../domain/types';`) — `MatchHit` is
  no longer referenced directly in this file now that `PickBadge`/`borderClassForPickHit` are
  tier-based instead.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm -C apps/web typecheck`
Expected: no errors (in particular, no unused-import error for `MatchHit`).

Run: `pnpm lint apps/web/src/features/results/ui/FinalResultCard.tsx` (or `pnpm lint` from repo
root if the package script doesn't accept a path — check `package.json`'s `lint` script; it runs
`eslint .` from root, so scope with `pnpm eslint apps/web/src/features/results/ui/FinalResultCard.tsx`)
Expected: no errors.

- [ ] **Step 6: Run the full domain test suite for this feature to confirm nothing else broke**

Run: `pnpm vitest run apps/web/src/features/results`
Expected: PASS — all existing tests plus the new `final-pick-breakdown.test.ts` still green.

Do NOT commit yet — see Global Constraints.

---

### Task 3: Manual verification and commit

**Files:** none (verification + commit only).

- [ ] **Step 1: Start the dev server**

Run: `pnpm -C apps/web dev` (background — leave it running; it serves on port 3010 per the
`dev` script)

- [ ] **Step 2: Log in as the seeded E2E owner and open the results page**

The E2E fixture at `apps/web/e2e/.e2e-fixture-ids.json` has a `seededPoolId` whose Final is
France vs Argentina (Argentina champion), per the existing `results.spec.ts` assertions. In a
browser (or via the `playwright` MCP tools if available), navigate to
`http://localhost:3010/login/e2e-seeded-owner`, then to
`http://localhost:3010/pools/<seededPoolId>/results`, click the "Knockout" results tab, and
locate the Final card (`[data-testid="final-result-card"]`).

- [ ] **Step 3: Verify the new breakdown renders**

Confirm:

- The "Your pick" pill shows a small check or x mark on each team badge individually (not just
  one combined mark).
- The score digits are green when the exact score was predicted correctly, red-tinted otherwise.
- The pill's border is green for a fully-correct pick, amber for a partial pick (e.g. winner
  right, runner-up/score wrong — reproduce this by checking a pool member other than the exact
  winner if the seeded owner's pick happens to be fully correct), and red for a fully wrong pick.
- No console errors in the browser dev tools.

If the seeded fixture's Final pick happens to land on only one tier, that's fine — the Task 1
unit tests already cover all four tiers directly; this step is a sanity check that the wiring
renders without runtime errors, not exhaustive tier coverage.

- [ ] **Step 4: Stop the dev server**

Stop the background dev server process.

- [ ] **Step 5: Run the full test suite and typecheck one more time**

Run: `pnpm test` (from repo root)
Expected: PASS

Run: `pnpm typecheck` (from repo root)
Expected: no errors

- [ ] **Step 6: Commit everything as one feature commit**

```bash
git add docs/superpowers/specs/2026-08-18-final-card-pick-breakdown-design.md \
        docs/superpowers/plans/2026-08-18-final-card-pick-breakdown.md \
        apps/web/src/features/results/domain/final-pick-breakdown.ts \
        apps/web/src/features/results/domain/final-pick-breakdown.test.ts \
        apps/web/src/features/results/ui/FinalResultCard.tsx
git commit -m "$(cat <<'EOF'
feat(results): show per-team pick breakdown on Final/Bronze card

The Final/Bronze card collapsed correct-winner and fully-correct picks into
the same green checkmark, and misclassified a correct runner-up with a wrong
predicted winner as a full miss. Now each team badge in the pick pill shows
its own correctness, the score is colored by exactness, and the pill border
has a new amber "partial credit" tier — matching the functional-spec §7.3
per-team scoring rule instead of the winner-oriented `hit` field.
EOF
)"
git status
```

Expected: commit succeeds; `git status` shows a clean tree (aside from anything pre-existing and
unrelated, e.g. the `skills-lock.json` / `.claude/agents/` seen in the original session's
`git status` — do not touch those).
