# Knockout Bracket Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add zoom controls (`−`/`+`/Reset) to the desktop knockout results bracket so the whole bracket can be shrunk to fit the viewport or zoomed in for readability.

**Architecture:** Wrap the existing bracket content (label row + bracket row) in `KnockoutBracket.tsx` in a new content div, apply `transform: scale()` to it, and size the wrapper explicitly so the surrounding `overflow-x-auto` container's scroll area matches the scaled size. A new `BracketZoomControls` component (built from the existing `Button` primitive) drives the scale via state owned by `KnockoutBracket`. All clamping/stepping/auto-fit math lives in a pure, unit-tested `bracket-zoom-utils.ts` file, per this codebase's convention of extracting UI-adjacent pure logic for testing (there are no component-render tests anywhere in this repo — no RTL, no jsdom).

**Tech Stack:** Next.js/React, TypeScript strict, Tailwind v4 (`@utility` classes in `globals.css`), vitest for unit tests.

## Global Constraints

- TypeScript strict — no `any`, no unsafe casts (CLAUDE.md).
- Zoom range: 50%–150%, 10-point steps (spec).
- Auto-fit (width-only) is the initial scale on mount and follows container resize until the user manually zooms; Reset restores auto-fit, not a hardcoded 100% (spec).
- No persistence of zoom level across page loads (spec).
- Desktop-only — `KnockoutBracket` is already gated behind `hidden md:grid` in `ResultsPageClient.tsx:190`; no mobile changes needed.
- One commit per feature (CLAUDE.md + project memory) — do **not** commit after each task below. All tasks accumulate into a single final commit that includes the spec, the plan, implementation, and tests.
- Format/lint/typecheck must pass before the final commit (CLAUDE.md quality gates).

---

### Task 1: `bracket-zoom-utils.ts` — pure zoom math

**Files:**

- Create: `apps/web/src/features/results/ui/bracket-zoom-utils.ts`
- Test: `apps/web/src/features/results/ui/bracket-zoom-utils.test.ts`

**Interfaces:**

- Consumes: nothing (pure functions, no dependencies).
- Produces (used by Task 2 and Task 3):
  - `MIN_ZOOM_PERCENT = 50`, `MAX_ZOOM_PERCENT = 150`, `ZOOM_STEP_PERCENT = 10` (exported constants)
  - `computeAutoFitScale(containerWidth: number, contentWidth: number): number` — returns a 0–1+ float (e.g. `0.8` for 80%), clamped to `[0.5, 1.5]`.
  - `stepZoomPercent(currentPercent: number, direction: 'in' | 'out'): number` — returns the next whole percentage (e.g. `80`), clamped to `[50, 150]`.
  - `canZoomOut(currentPercent: number): boolean`
  - `canZoomIn(currentPercent: number): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/features/results/ui/bracket-zoom-utils.test.ts
import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM_PERCENT,
  MIN_ZOOM_PERCENT,
  canZoomIn,
  canZoomOut,
  computeAutoFitScale,
  stepZoomPercent,
} from './bracket-zoom-utils';

describe('computeAutoFitScale', () => {
  it('returns 1 when content exactly fits the container', () => {
    expect(computeAutoFitScale(1000, 1000)).toBe(1);
  });

  it('returns a fraction less than 1 when content is wider than the container', () => {
    expect(computeAutoFitScale(800, 1600)).toBe(0.5);
  });

  it('returns a fraction greater than 1 when content is narrower than the container', () => {
    expect(computeAutoFitScale(1000, 500)).toBe(1.5);
  });

  it('clamps to 0.5 when the ideal scale is below the minimum', () => {
    expect(computeAutoFitScale(400, 2000)).toBe(0.5);
  });

  it('clamps to 1.5 when the ideal scale is above the maximum', () => {
    expect(computeAutoFitScale(1000, 100)).toBe(1.5);
  });

  it('does not divide by zero or return NaN/Infinity when contentWidth is 0', () => {
    const result = computeAutoFitScale(1000, 0);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBe(1.5);
  });

  it('does not divide by zero or return NaN/Infinity when containerWidth is 0', () => {
    const result = computeAutoFitScale(0, 1000);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBe(0.5);
  });
});

describe('stepZoomPercent', () => {
  it('steps up by 10 when zooming in', () => {
    expect(stepZoomPercent(80, 'in')).toBe(90);
  });

  it('steps down by 10 when zooming out', () => {
    expect(stepZoomPercent(80, 'out')).toBe(70);
  });

  it('clamps at the maximum when zooming in past 150', () => {
    expect(stepZoomPercent(150, 'in')).toBe(150);
    expect(stepZoomPercent(145, 'in')).toBe(150);
  });

  it('clamps at the minimum when zooming out past 50', () => {
    expect(stepZoomPercent(50, 'out')).toBe(50);
    expect(stepZoomPercent(55, 'out')).toBe(50);
  });

  it('snaps a non-multiple-of-10 current value to the nearest step before moving', () => {
    // 83 snaps to 80, then steps from there: in -> 90, out -> 70
    expect(stepZoomPercent(83, 'in')).toBe(90);
    expect(stepZoomPercent(83, 'out')).toBe(70);
  });
});

describe('canZoomOut / canZoomIn', () => {
  it('canZoomOut is true above the minimum and false at/below it', () => {
    expect(canZoomOut(60)).toBe(true);
    expect(canZoomOut(50)).toBe(false);
    expect(canZoomOut(40)).toBe(false);
  });

  it('canZoomIn is true below the maximum and false at/above it', () => {
    expect(canZoomIn(140)).toBe(true);
    expect(canZoomIn(150)).toBe(false);
    expect(canZoomIn(160)).toBe(false);
  });
});

describe('exported constants', () => {
  it('exposes the documented range and step', () => {
    expect(MIN_ZOOM_PERCENT).toBe(50);
    expect(MAX_ZOOM_PERCENT).toBe(150);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run apps/web/src/features/results/ui/bracket-zoom-utils.test.ts`
Expected: FAIL — `bracket-zoom-utils.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/features/results/ui/bracket-zoom-utils.ts
export const MIN_ZOOM_PERCENT = 50;
export const MAX_ZOOM_PERCENT = 150;
export const ZOOM_STEP_PERCENT = 10;

function clampPercent(percent: number): number {
  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, percent));
}

export function computeAutoFitScale(containerWidth: number, contentWidth: number): number {
  if (contentWidth <= 0) return MAX_ZOOM_PERCENT / 100;
  if (containerWidth <= 0) return MIN_ZOOM_PERCENT / 100;

  const idealPercent = (containerWidth / contentWidth) * 100;
  return clampPercent(idealPercent) / 100;
}

export function stepZoomPercent(currentPercent: number, direction: 'in' | 'out'): number {
  const snapped = Math.round(currentPercent / ZOOM_STEP_PERCENT) * ZOOM_STEP_PERCENT;
  const next = direction === 'in' ? snapped + ZOOM_STEP_PERCENT : snapped - ZOOM_STEP_PERCENT;
  return clampPercent(next);
}

export function canZoomOut(currentPercent: number): boolean {
  return currentPercent > MIN_ZOOM_PERCENT;
}

export function canZoomIn(currentPercent: number): boolean {
  return currentPercent < MAX_ZOOM_PERCENT;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run apps/web/src/features/results/ui/bracket-zoom-utils.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Typecheck**

Run: `pnpm -C apps/web typecheck`
Expected: no new errors.

---

### Task 2: `BracketZoomControls` component

**Files:**

- Create: `apps/web/src/features/results/ui/BracketZoomControls.tsx`

**Interfaces:**

- Consumes: `Button` from `@/shared/ui` (existing primitive — `variant`, `size`, `disabled`, `onClick`, `aria-label` props); `canZoomIn`/`canZoomOut` are computed by the caller (Task 3) and passed in as booleans, not recomputed here.
- Produces (used by Task 3):

  ```ts
  type BracketZoomControlsProps = {
    zoomPercent: number;
    onZoomOut: () => void;
    onZoomIn: () => void;
    onReset: () => void;
    canZoomOut: boolean;
    canZoomIn: boolean;
  };
  export function BracketZoomControls(props: BracketZoomControlsProps): ReactElement;
  ```

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/features/results/ui/BracketZoomControls.tsx
import type { ReactElement } from 'react';
import { Button } from '@/shared/ui';

type Props = {
  zoomPercent: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onReset: () => void;
  canZoomOut: boolean;
  canZoomIn: boolean;
};

export function BracketZoomControls({
  zoomPercent,
  onZoomOut,
  onZoomIn,
  onReset,
  canZoomOut,
  canZoomIn,
}: Props): ReactElement {
  return (
    <div className="flex items-center gap-1.5" data-testid="bracket-zoom-controls">
      <Button
        variant="ghost"
        size="sm"
        onClick={onZoomOut}
        disabled={!canZoomOut}
        aria-label="Zoom out"
      >
        −
      </Button>
      <span className="min-w-10 text-center text-[13px] font-semibold text-ink-muted tabular-nums">
        {zoomPercent}%
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onZoomIn}
        disabled={!canZoomIn}
        aria-label="Zoom in"
      >
        +
      </Button>
      <Button variant="ghost" size="sm" onClick={onReset} aria-label="Reset zoom">
        Reset
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Confirm `Button` and other named exports are available from `@/shared/ui`**

Run: `grep -n "export { Button }" apps/web/src/shared/ui/index.ts`
Expected: a match. If `Button` is not re-exported from `shared/ui/index.ts`, import it directly from `@/shared/ui/Button` instead and note the direct path.

- [ ] **Step 3: Typecheck**

Run: `pnpm -C apps/web typecheck`
Expected: no new errors. (No unit test for this file — matches this codebase's convention of not writing render tests for components; the pure logic it depends on is already covered in Task 1.)

---

### Task 3: Wire zoom into `KnockoutBracket`

**Files:**

- Modify: `apps/web/src/features/results/ui/KnockoutBracket.tsx`

**Interfaces:**

- Consumes: `computeAutoFitScale`, `stepZoomPercent`, `canZoomIn`, `canZoomOut` from `./bracket-zoom-utils` (Task 1); `BracketZoomControls` from `./BracketZoomControls` (Task 2).
- Produces: no new exports — `KnockoutBracket`'s existing props/signature (`Props` type at line 71) are unchanged.

- [ ] **Step 1: Add `'use client'` and imports**

`KnockoutBracket.tsx` currently has no directive — check whether it's already a Client Component (it isn't marked, and `ResultsPageClient.tsx` that renders it is already `'use client'`, per its name). Since this task adds `useState`/`useEffect`/`useRef`, and the component tree is already client-rendered from `ResultsPageClient`, no new `'use client'` directive is needed on `KnockoutBracket.tsx` itself — Next.js only requires the directive at the boundary where server/client switches, which is already `ResultsPageClient.tsx`. Confirm this by running:

Run: `head -5 apps/web/src/features/results/ui/ResultsPageClient.tsx`
Expected: first non-empty line is `'use client';`

Then update the top of `KnockoutBracket.tsx`:

```tsx
import { Fragment, useEffect, useRef, useState, type ReactElement } from 'react';
import type { BracketRoundResultView, KnockoutMatchView } from '../domain/types';
import { BracketMatchCard } from './BracketMatchCard';
import { FinalResultCard } from './FinalResultCard';
import { BracketZoomControls } from './BracketZoomControls';
import { canZoomIn, canZoomOut, computeAutoFitScale, stepZoomPercent } from './bracket-zoom-utils';
```

- [ ] **Step 2: Add zoom state, refs, and auto-fit measurement inside `KnockoutBracket`**

Replace the function body's opening (right after the `rounds.length === 0` early return, before `const predictedQualifierIds = ...` at current line 141) by inserting the zoom state block. The full updated function becomes:

```tsx
export function KnockoutBracket({
  rounds,
  bronzeMatch,
  userPredictedKnockoutTeamIds,
  onOpenMatch,
}: Props): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [isManualZoom, setIsManualZoom] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const recomputeAutoFit = () => {
      if (isManualZoom) return;
      const containerWidth = container.clientWidth;
      const contentWidth = content.scrollWidth / (zoomPercent / 100 || 1);
      const nextScale = computeAutoFitScale(containerWidth, contentWidth);
      setZoomPercent(Math.round(nextScale * 100));
    };

    recomputeAutoFit();

    const observer = new ResizeObserver(recomputeAutoFit);
    observer.observe(container);
    return () => observer.disconnect();
    // zoomPercent is read (via the closure) but intentionally excluded from deps:
    // including it would re-subscribe the observer and re-run recomputeAutoFit on every
    // zoom change, including the setZoomPercent calls this same effect makes — an infinite
    // loop guarded only by the isManualZoom check. rounds/isManualZoom are the only inputs
    // that should trigger a fresh measurement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds, isManualZoom]);

  if (rounds.length === 0) {
    return (
      <div className="card p-[32px_24px] text-center">
        <p className="text-[13px] font-semibold text-ink-muted">
          Knockout stage bracket will appear here once teams are confirmed.
        </p>
      </div>
    );
  }

  const handleZoomOut = () => {
    setIsManualZoom(true);
    setZoomPercent((current) => stepZoomPercent(current, 'out'));
  };

  const handleZoomIn = () => {
    setIsManualZoom(true);
    setZoomPercent((current) => stepZoomPercent(current, 'in'));
  };

  const handleResetZoom = () => {
    setIsManualZoom(false);
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) {
      setZoomPercent(100);
      return;
    }
    const contentWidth = content.scrollWidth / (zoomPercent / 100 || 1);
    setZoomPercent(Math.round(computeAutoFitScale(container.clientWidth, contentWidth) * 100));
  };

  // Predicted group qualifiers — only highlighted in entry-round cards,
  // not in later rounds where the team may appear without the user having picked them.
  const predictedQualifierIds = new Set<string>(userPredictedKnockoutTeamIds ?? []);
```

Note: `content.scrollWidth` reflects the element's _unscaled_ layout box (CSS `transform` doesn't affect layout/scroll dimensions), so dividing by the currently-applied scale is defensive but should normally be a no-op — `scrollWidth` is already the natural width regardless of the current `transform: scale()`. Keep the division for correctness in case that assumption is ever violated by a future layout change, but do not remove the guard `|| 1` (avoids divide-by-zero on the very first render when `zoomPercent` could theoretically be `0`).

- [ ] **Step 3: Wrap the label row + bracket row in the scaled content div, and add the zoom controls header row**

Locate the return statement's JSX (originally lines 155–210). Replace the block from `<BracketInfoBanner />` down through the closing of the `overflow-x-auto` div with:

```tsx
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <BracketInfoBanner />
        <BracketZoomControls
          zoomPercent={zoomPercent}
          onZoomOut={handleZoomOut}
          onZoomIn={handleZoomIn}
          onReset={handleResetZoom}
          canZoomOut={canZoomOut(zoomPercent)}
          canZoomIn={canZoomIn(zoomPercent)}
        />
      </div>

      <div ref={containerRef} className="overflow-x-auto pb-2">
        <div
          ref={contentRef}
          style={{
            transform: `scale(${zoomPercent / 100})`,
            transformOrigin: 'top left',
            width: contentRef.current
              ? (contentRef.current.scrollWidth * zoomPercent) / 100
              : undefined,
          }}
        >
          {/* ── Label row ── */}
          <div className="flex min-w-max mb-2">
            {mainRounds.map((round, i) => (
              <Fragment key={round.label}>
                <div className="min-w-47.5 eyebrow text-ink-muted pl-0.5">{round.label}</div>
                {/* spacer matches the connector SVG width */}
                <div style={{ width: CONN_W, flexShrink: 0 }} />
              </Fragment>
            ))}
          </div>

          {/* ── Bracket row (match cards + connector SVGs, no labels) ── */}
          <div className="flex items-start min-w-max">
            {mainRounds.map((round, i) => (
              <Fragment key={round.label}>
                <div
                  data-testid={`bracket-round-${round.label}`}
                  className="min-w-47.5"
                  style={{ paddingTop: columnPaddingTop(i) }}
                >
                  <div className="flex flex-col" style={{ gap: columnItemGap(i) }}>
                    {round.matches.map((match) => (
                      <BracketMatchCard
                        key={match.bracketMatchKey}
                        match={match}
                        predictedQualifierIds={i === 0 ? predictedQualifierIds : new Set()}
                        onSelect={onOpenMatch ? () => onOpenMatch(match.bracketMatchKey) : undefined}
                      />
                    ))}
                  </div>
                </div>

                <BracketConnector
                  fromColIndex={i}
                  fromMatchCount={round.matches.length}
                  totalHeight={totalHeight}
                />
              </Fragment>
            ))}

            <FinalCards
              finalMatch={finalMatch}
              bronzeMatch={bronzeMatch}
              paddingTop={columnPaddingTop(finalColumnIndex)}
              onOpenMatch={onOpenMatch}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

Everything between the original `finalRound`/`finalMatch`/`mainRounds`/`finalColumnIndex`/`totalHeight` `const` declarations (original lines 143–153, unchanged) and this return statement stays as-is — only the return JSX changes.

Width caveat: `contentRef.current` is `null` during the very first render (refs attach after the initial render), so `width` is `undefined` on that first pass — the browser falls back to the content's natural (unscaled) box, which is correct since `zoomPercent` starts at `100` before the auto-fit effect runs. The effect then updates `zoomPercent`, triggering a re-render where `contentRef.current` is populated and the width calculation applies. This self-corrects within one effect cycle and does not need a loading-state guard.

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm -C apps/web typecheck && pnpm lint`
Expected: no errors. Fix any TypeScript errors from the `useEffect`/ref typing before proceeding (e.g. `ResizeObserver` is a browser global — no import needed, but confirm `tsconfig.json`'s `lib` includes `dom`, which it already must since this is a Next.js web app).

- [ ] **Step 5: Manual verification in the browser**

Run: `pnpm -C apps/web dev` (or the repo's existing dev-server workflow), then open a results page with a knockout bracket (Round of 16 or later) at a desktop viewport width.

Check:

- On load, the bracket auto-shrinks so the whole bracket (all rounds + final/bronze) is visible without horizontal scrolling, when the viewport is narrower than the bracket's natural width.
- The `%` readout matches the applied scale.
- Clicking `+` grows the bracket in 10% steps up to 150%, `−` shrinks it down to 50%; buttons disable at those boundaries.
- Clicking `+`/`−` then resizing the browser window does _not_ silently override the manual zoom.
- Clicking `Reset` restores the auto-fit scale and re-enables auto-fit-follows-resize behavior.
- Match cards remain clickable (`onOpenMatch`) and legible at both the minimum and maximum zoom.
- Mobile viewport (`< md` breakpoint) is unaffected — the accordion view still renders with no zoom controls (already gated by the `hidden md:grid` wrapper in `ResultsPageClient.tsx:190`, untouched by this change).

Stop and fix before proceeding if any of these fail.

---

### Task 4: Final commit

**Files:** all files touched above, plus the spec and plan docs.

- [ ] **Step 1: Run the full local quality gate**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass. If `format:check` fails, run `pnpm format` and re-check.

- [ ] **Step 2: Stage and commit everything as one feature commit**

```bash
git add \
  docs/superpowers/specs/2026-07-23-knockout-bracket-zoom-design.md \
  docs/superpowers/plans/2026-07-23-knockout-bracket-zoom.md \
  apps/web/src/features/results/ui/bracket-zoom-utils.ts \
  apps/web/src/features/results/ui/bracket-zoom-utils.test.ts \
  apps/web/src/features/results/ui/BracketZoomControls.tsx \
  apps/web/src/features/results/ui/KnockoutBracket.tsx

git commit -m "$(cat <<'EOF'
feat(results): add zoom controls to the desktop knockout bracket

Lets the whole bracket be scaled down to fit the viewport (auto-fit on
load) or zoomed in for readability, via a transform-scale wrapper around
the existing bracket layout.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"

git status
```

Expected: working tree clean after commit; `git status` shows nothing to commit.
