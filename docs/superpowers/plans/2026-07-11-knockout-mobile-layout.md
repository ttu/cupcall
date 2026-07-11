# Knockout Mobile Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile-specific vertical accordion rendering of the Results page's Knockout tab (summary pill + collapsible per-round tie lists), shown below the `md` breakpoint, leaving the existing desktop `KnockoutBracket` untouched above it.

**Architecture:** Two new pure derivation functions (`domain/knockout-mobile-view.ts`) compute round-played counts, the default-expanded round, and a ties-called ratio from data `getResultsView` already returns. Two new UI components (`KnockoutMobileSummary`, `KnockoutRoundAccordion`) consume that data; the accordion reuses the existing `BracketMatchCard`/`FinalResultCard` tie components, stacked vertically instead of connected by SVG. `ResultsPageClient`'s knockout tab branch is split into a `md:hidden` mobile block and a `hidden md:grid` desktop block.

**Tech Stack:** TypeScript strict, React (Next.js App Router client component), Vitest, Tailwind v4 (`@utility` classes already defined in `globals.css`).

## Global Constraints

- No `any`, no untyped casts — TypeScript strict throughout.
- No changes to `getResultsView`, `ResultsView`, or any DB/engine code — this is presentation-only, built entirely from data already computed today.
- New feature-owned UI components are **not** added to `apps/web/src/features/results/index.ts` — they're consumed only within `ResultsPageClient.tsx`, matching the existing pattern for `KnockoutBracket`, `BracketMatchCard`, `BracketHealthPanel`, etc. (none of which are barrel-exported either).
- No new RTL/component tests — this feature's existing `ui/` components have none; only the pure `domain/` helpers get unit tests, matching the sibling `bracket-health.ts` / `bracket-health.test.ts` pair.
- **No commits until the final task.** Per project convention, this whole feature lands as **one** commit containing the spec (`docs/superpowers/specs/2026-07-11-knockout-mobile-layout-design.md`, already written and staged), this plan file, and all implementation + test files. Do not run `git commit` in any task before the last one.
- Run a single test file with `pnpm test <path-fragment>` (Vitest, matches by filename substring). Full suite: `pnpm test` from repo root. Full gate: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm -C apps/web build`.

---

### Task 1: Domain helpers — `knockout-mobile-view.ts`

**Files:**

- Create: `apps/web/src/features/results/domain/knockout-mobile-view.ts`
- Create: `apps/web/src/features/results/domain/knockout-mobile-view.test.ts`

**Interfaces:**

- Consumes: `BracketRoundResultView`, `KnockoutMatchView` (from `../domain/types`, both already exist).
- Produces (used by Tasks 2–4):
  - `getRoundPlayedCount(round: BracketRoundResultView): { played: number; total: number }`
  - `isRoundInProgress(round: BracketRoundResultView): boolean`
  - `pickDefaultExpandedRound(rounds: BracketRoundResultView[]): string | null`
  - `getTiesCalledRatio(rounds: BracketRoundResultView[], bronzeMatch: KnockoutMatchView | null): { correct: number; decided: number }`

---

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/features/results/domain/knockout-mobile-view.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  getRoundPlayedCount,
  isRoundInProgress,
  pickDefaultExpandedRound,
  getTiesCalledRatio,
} from './knockout-mobile-view';
import type { BracketRoundResultView, KnockoutMatchView } from './types';

function match(overrides: Partial<KnockoutMatchView> = {}): KnockoutMatchView {
  return {
    bracketMatchKey: 'r32-1',
    round: 'R32',
    homeTeamId: 'A1',
    homeTeamName: 'Team A1',
    awayTeamId: 'B2',
    awayTeamName: 'Team B2',
    actualHome: null,
    actualAway: null,
    actualWinnerId: null,
    actualWinnerName: null,
    kickoff: null,
    status: 'scheduled',
    pickedWinnerId: null,
    pickedWinnerName: null,
    pickedOpponentId: null,
    pickedOpponentName: null,
    pickStatus: 'pending',
    pickedOpponentStatus: 'no-pick',
    predictedHome: null,
    predictedAway: null,
    hit: 'pending',
    projected: false,
    homeTeamConfirmed: true,
    awayTeamConfirmed: true,
    predictedHomeTeamId: null,
    predictedHomeTeamName: null,
    predictedAwayTeamId: null,
    predictedAwayTeamName: null,
    isEntryRound: false,
    homeTeamPredictedPct: null,
    awayTeamPredictedPct: null,
    homeTeamUserPredictedParticipant: false,
    awayTeamUserPredictedParticipant: false,
    poolPickHomePct: null,
    poolPickAwayPct: null,
    homeSlotFeederPickedId: null,
    awaySlotFeederPickedId: null,
    ...overrides,
  };
}

function decidedMatch(key: string, hit: KnockoutMatchView['hit']): KnockoutMatchView {
  return match({ bracketMatchKey: key, actualHome: 2, actualAway: 1, status: 'final', hit });
}

function round(label: string, matches: KnockoutMatchView[]): BracketRoundResultView {
  return { label, matches };
}

describe('getRoundPlayedCount', () => {
  it('counts decided matches out of all matches in the round', () => {
    const r = round('R32', [decidedMatch('m1', 'outcome'), match({ bracketMatchKey: 'm2' })]);
    expect(getRoundPlayedCount(r)).toEqual({ played: 1, total: 2 });
  });

  it('returns zero played for a round with nothing decided', () => {
    const r = round('R32', [match(), match({ bracketMatchKey: 'm2' })]);
    expect(getRoundPlayedCount(r)).toEqual({ played: 0, total: 2 });
  });
});

describe('isRoundInProgress', () => {
  it('is false when no matches are decided', () => {
    const r = round('R32', [match(), match({ bracketMatchKey: 'm2' })]);
    expect(isRoundInProgress(r)).toBe(false);
  });

  it('is true when some but not all matches are decided', () => {
    const r = round('R32', [decidedMatch('m1', 'outcome'), match({ bracketMatchKey: 'm2' })]);
    expect(isRoundInProgress(r)).toBe(true);
  });

  it('is false when all matches are decided', () => {
    const r = round('R32', [decidedMatch('m1', 'outcome'), decidedMatch('m2', 'missed')]);
    expect(isRoundInProgress(r)).toBe(false);
  });
});

describe('pickDefaultExpandedRound', () => {
  it('returns null for an empty bracket', () => {
    expect(pickDefaultExpandedRound([])).toBeNull();
  });

  it('returns the first round when nothing has been played yet', () => {
    const rounds = [round('R32', [match()]), round('R16', [match({ bracketMatchKey: 'm2' })])];
    expect(pickDefaultExpandedRound(rounds)).toBe('R32');
  });

  it('returns the in-progress round over a fully-completed earlier round', () => {
    const rounds = [
      round('R32', [decidedMatch('m1', 'outcome'), decidedMatch('m2', 'outcome')]),
      round('R16', [decidedMatch('m3', 'outcome'), match({ bracketMatchKey: 'm4' })]),
    ];
    expect(pickDefaultExpandedRound(rounds)).toBe('R16');
  });

  it('returns the most recently completed round when no round is in progress', () => {
    const rounds = [
      round('R32', [decidedMatch('m1', 'outcome')]),
      round('R16', [decidedMatch('m2', 'outcome')]),
      round('QF', [match({ bracketMatchKey: 'm3' })]),
    ];
    expect(pickDefaultExpandedRound(rounds)).toBe('R16');
  });
});

describe('getTiesCalledRatio', () => {
  it('counts correct picks out of decided matches, including the bronze match', () => {
    const rounds = [
      round('R32', [
        decidedMatch('m1', 'outcome'),
        decidedMatch('m2', 'missed'),
        match({ bracketMatchKey: 'm3' }),
      ]),
    ];
    const bronze = decidedMatch('bronze', 'exact');
    expect(getTiesCalledRatio(rounds, bronze)).toEqual({ correct: 2, decided: 3 });
  });

  it('handles a null bronze match', () => {
    const rounds = [round('R32', [decidedMatch('m1', 'outcome')])];
    expect(getTiesCalledRatio(rounds, null)).toEqual({ correct: 1, decided: 1 });
  });

  it('returns zero/zero when nothing is decided', () => {
    const rounds = [round('R32', [match()])];
    expect(getTiesCalledRatio(rounds, null)).toEqual({ correct: 0, decided: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test knockout-mobile-view
```

Expected: FAIL — `Cannot find module './knockout-mobile-view'` (file doesn't exist yet).

- [ ] **Step 3: Implement the helpers**

Create `apps/web/src/features/results/domain/knockout-mobile-view.ts`:

```typescript
import type { BracketRoundResultView, KnockoutMatchView } from './types';

function isMatchDecided(match: KnockoutMatchView): boolean {
  return match.actualHome !== null && match.actualAway !== null;
}

export function getRoundPlayedCount(round: BracketRoundResultView): {
  played: number;
  total: number;
} {
  return {
    played: round.matches.filter(isMatchDecided).length,
    total: round.matches.length,
  };
}

export function isRoundInProgress(round: BracketRoundResultView): boolean {
  const { played, total } = getRoundPlayedCount(round);
  return played > 0 && played < total;
}

/**
 * The round the mobile accordion should auto-expand: the round currently being
 * played, else the most recently completed round, else the first round (covers
 * the pre-tournament state where nothing has been decided yet).
 */
export function pickDefaultExpandedRound(rounds: BracketRoundResultView[]): string | null {
  if (rounds.length === 0) return null;

  const inProgress = rounds.find(isRoundInProgress);
  if (inProgress) return inProgress.label;

  const fullyPlayed = [...rounds]
    .reverse()
    .find((r) => getRoundPlayedCount(r).played === r.matches.length && r.matches.length > 0);
  if (fullyPlayed) return fullyPlayed.label;

  return rounds[0]!.label;
}

export function getTiesCalledRatio(
  rounds: BracketRoundResultView[],
  bronzeMatch: KnockoutMatchView | null,
): { correct: number; decided: number } {
  const allMatches = rounds.flatMap((r) => r.matches).concat(bronzeMatch ? [bronzeMatch] : []);
  const decidedMatches = allMatches.filter(isMatchDecided);
  const correct = decidedMatches.filter((m) => m.hit === 'exact' || m.hit === 'outcome').length;
  return { correct, decided: decidedMatches.length };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test knockout-mobile-view
```

Expected: all tests pass.

---

### Task 2: `KnockoutMobileSummary.tsx`

**Files:**

- Create: `apps/web/src/features/results/ui/KnockoutMobileSummary.tsx`

**Interfaces:**

- Consumes: `UserPointsSummary` (from `../domain/types`), the `{ correct, decided }` shape returned by `getTiesCalledRatio` (Task 1).
- Produces: `KnockoutMobileSummary` component, used by Task 4.

---

- [ ] **Step 1: Implement the component**

Create `apps/web/src/features/results/ui/KnockoutMobileSummary.tsx`:

```tsx
import type { ReactElement } from 'react';
import type { UserPointsSummary } from '../domain/types';
import { Chip } from '@/shared/ui';

type Props = {
  summary: UserPointsSummary;
  tiesCalled: { correct: number; decided: number };
};

export function KnockoutMobileSummary({ summary, tiesCalled }: Props): ReactElement {
  return (
    <div
      className="card flex items-center justify-between gap-3 p-[12px_14px]"
      data-testid="knockout-mobile-summary"
    >
      <div>
        <div className="eyebrow text-ink-muted">Knockout points</div>
        <div className="text-[12px] font-semibold text-ink-muted mt-0.5 tnum">
          {tiesCalled.correct}/{tiesCalled.decided} ties called
        </div>
      </div>
      <Chip variant="green">+{summary.earned}</Chip>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm -C apps/web typecheck
```

Expected: no errors.

---

### Task 3: `KnockoutRoundAccordion.tsx`

**Files:**

- Create: `apps/web/src/features/results/ui/KnockoutRoundAccordion.tsx`

**Interfaces:**

- Consumes: `BracketRoundResultView`, `KnockoutMatchView` (from `../domain/types`); `getRoundPlayedCount`, `pickDefaultExpandedRound` (from `../domain/knockout-mobile-view`, Task 1); `BracketMatchCard` (existing, `./BracketMatchCard`, props `{ match: KnockoutMatchView; predictedQualifierIds: Set<string> }`); `FinalResultCard` (existing, `./FinalResultCard`, props `{ match: KnockoutMatchView; matchKey: 'final' | 'bronze' }`); `Icon`, `cn` (from `@/shared/ui`).
- Produces: `KnockoutRoundAccordion` component, used by Task 4.

---

- [ ] **Step 1: Implement the component**

Create `apps/web/src/features/results/ui/KnockoutRoundAccordion.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { BracketRoundResultView, KnockoutMatchView } from '../domain/types';
import { getRoundPlayedCount, pickDefaultExpandedRound } from '../domain/knockout-mobile-view';
import { BracketMatchCard } from './BracketMatchCard';
import { FinalResultCard } from './FinalResultCard';
import { Icon, cn } from '@/shared/ui';

type Props = {
  rounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
  userPredictedKnockoutTeamIds: string[] | null;
};

function formatRoundDate(round: BracketRoundResultView): string | null {
  const kickoff = round.matches.find((m) => m.kickoff !== null)?.kickoff ?? null;
  if (!kickoff) return null;
  return new Date(kickoff).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

function RoundStatusChip({ round }: { round: BracketRoundResultView }): ReactElement {
  const { played, total } = getRoundPlayedCount(round);
  if (played > 0) {
    return (
      <span className="text-[11px] font-bold text-ink-muted tnum">
        {played}/{total} played
      </span>
    );
  }
  const date = formatRoundDate(round);
  return <span className="text-[11px] font-bold text-ink-muted">{date ?? round.label}</span>;
}

function AccordionSection({
  label,
  statusChip,
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  statusChip: ReactElement;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="card overflow-hidden" data-testid={`knockout-round-section-${label}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex items-center justify-between w-full p-[12px_14px] bg-none border-0 cursor-pointer"
      >
        <span className="eyebrow text-ink">{label}</span>
        <span className="flex items-center gap-2">
          {statusChip}
          <span className={cn('inline-flex transition-transform', isOpen && 'rotate-90')}>
            <Icon name="chevron" size={14} color="var(--ink-muted)" />
          </span>
        </span>
      </button>
      {isOpen && <div className="flex flex-col gap-2 p-[0_14px_14px]">{children}</div>}
    </div>
  );
}

export function KnockoutRoundAccordion({
  rounds,
  bronzeMatch,
  userPredictedKnockoutTeamIds,
}: Props): ReactElement {
  const [openLabels, setOpenLabels] = useState<Set<string>>(() => {
    const defaultLabel = pickDefaultExpandedRound(rounds);
    return new Set(defaultLabel ? [defaultLabel] : []);
  });

  if (rounds.length === 0) {
    return (
      <div className="card p-[32px_24px] text-center">
        <p className="text-[13px] font-semibold text-ink-muted">
          Knockout stage bracket will appear here once teams are confirmed.
        </p>
      </div>
    );
  }

  const predictedQualifierIds = new Set<string>(userPredictedKnockoutTeamIds ?? []);

  function toggle(label: string): void {
    setOpenLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {rounds.map((round, i) => (
        <AccordionSection
          key={round.label}
          label={round.label}
          statusChip={<RoundStatusChip round={round} />}
          isOpen={openLabels.has(round.label)}
          onToggle={() => toggle(round.label)}
        >
          {round.label === 'Final' ? (
            <FinalResultCard match={round.matches[0]!} matchKey="final" />
          ) : (
            round.matches.map((match) => (
              <BracketMatchCard
                key={match.bracketMatchKey}
                match={match}
                predictedQualifierIds={i === 0 ? predictedQualifierIds : new Set()}
              />
            ))
          )}
        </AccordionSection>
      ))}

      {bronzeMatch && (
        <AccordionSection
          label="3rd Place"
          statusChip={<RoundStatusChip round={{ label: '3rd Place', matches: [bronzeMatch] }} />}
          isOpen={openLabels.has('3rd Place')}
          onToggle={() => toggle('3rd Place')}
        >
          <FinalResultCard match={bronzeMatch} matchKey="bronze" />
        </AccordionSection>
      )}
    </div>
  );
}
```

Note: `rounds[0]!` in `pickDefaultExpandedRound` (Task 1) and `round.matches[0]!` above are safe non-null assertions — both are only reached after an explicit `.length === 0` / array-non-empty guard on the same array.

- [ ] **Step 2: Typecheck**

```bash
pnpm -C apps/web typecheck
```

Expected: no errors.

---

### Task 4: Wire into `ResultsPageClient.tsx`

**Files:**

- Modify: `apps/web/src/features/results/ui/ResultsPageClient.tsx`

**Interfaces:**

- Consumes: `KnockoutMobileSummary` (Task 2), `KnockoutRoundAccordion` (Task 3), `getTiesCalledRatio` (Task 1) — all imported by relative path within the same feature.

**Context:** The current knockout tab branch (lines ~135–169) renders `PointsSummaryPanel`, then a `grid md:grid-cols-[minmax(0,1fr)_240px]` containing `KnockoutBracket` + the right-rail panels, then a legend row. This task keeps the desktop grid exactly as-is (wrapped in `hidden md:grid`) and adds a new `md:hidden` block above it with the mobile summary pill, the accordion, and the same right-rail panels stacked full-width. The legend stays visible at all widths since it explains badges (`?` / `✓`) that `BracketMatchCard` renders on mobile too.

---

- [ ] **Step 1: Add imports**

In `apps/web/src/features/results/ui/ResultsPageClient.tsx`, add alongside the existing `KnockoutBracket` import:

```typescript
import { KnockoutMobileSummary } from './KnockoutMobileSummary';
import { KnockoutRoundAccordion } from './KnockoutRoundAccordion';
import { getTiesCalledRatio } from '../domain/knockout-mobile-view';
```

- [ ] **Step 2: Replace the knockout tab branch**

Replace this block:

```tsx
{
  activeTab === 'knockout' && (
    <div className="flex flex-col gap-6">
      {view.userKnockoutSummary && <PointsSummaryPanel summary={view.userKnockoutSummary} />}
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_240px]">
        <KnockoutBracket
          rounds={view.bracketRounds}
          bronzeMatch={view.bronzeMatch}
          userPredictedKnockoutTeamIds={view.userPredictedKnockoutTeamIds}
        />
        {!viewerMode && (
          <div className="flex flex-col gap-4">
            <BracketHealthPanel
              health={view.bracketHealth}
              championPick={finalMatch}
              bronzeMatch={view.bronzeMatch}
            />
            <KnockoutPointsPanel rows={view.userKnockoutRoundBreakdown} />
          </div>
        )}
      </div>
      <div className="flex gap-4 flex-wrap text-[11px] text-ink-muted">
        <span>
          <span className="font-bold text-green-600">✓</span> Confirmed qualifier
        </span>
        <span>
          <span className="font-bold text-yellow-500">?</span> Projected from live standings (not
          yet official)
        </span>
        <span>
          <span className="font-bold">42%</span> Share of pool members whose live scores project
          this team into the Round of 32
        </span>
      </div>
    </div>
  );
}
```

with:

```tsx
{
  activeTab === 'knockout' && (
    <div className="flex flex-col gap-6">
      {view.userKnockoutSummary && (
        <div className="hidden md:block">
          <PointsSummaryPanel summary={view.userKnockoutSummary} />
        </div>
      )}

      <div className="md:hidden flex flex-col gap-4">
        {view.userKnockoutSummary && (
          <KnockoutMobileSummary
            summary={view.userKnockoutSummary}
            tiesCalled={getTiesCalledRatio(view.bracketRounds, view.bronzeMatch)}
          />
        )}
        <KnockoutRoundAccordion
          rounds={view.bracketRounds}
          bronzeMatch={view.bronzeMatch}
          userPredictedKnockoutTeamIds={view.userPredictedKnockoutTeamIds}
        />
        {!viewerMode && (
          <>
            <BracketHealthPanel
              health={view.bracketHealth}
              championPick={finalMatch}
              bronzeMatch={view.bronzeMatch}
            />
            <KnockoutPointsPanel rows={view.userKnockoutRoundBreakdown} />
          </>
        )}
      </div>

      <div className="hidden md:grid gap-6 md:grid-cols-[minmax(0,1fr)_240px]">
        <KnockoutBracket
          rounds={view.bracketRounds}
          bronzeMatch={view.bronzeMatch}
          userPredictedKnockoutTeamIds={view.userPredictedKnockoutTeamIds}
        />
        {!viewerMode && (
          <div className="flex flex-col gap-4">
            <BracketHealthPanel
              health={view.bracketHealth}
              championPick={finalMatch}
              bronzeMatch={view.bronzeMatch}
            />
            <KnockoutPointsPanel rows={view.userKnockoutRoundBreakdown} />
          </div>
        )}
      </div>

      <div className="flex gap-4 flex-wrap text-[11px] text-ink-muted">
        <span>
          <span className="font-bold text-green-600">✓</span> Confirmed qualifier
        </span>
        <span>
          <span className="font-bold text-yellow-500">?</span> Projected from live standings (not
          yet official)
        </span>
        <span>
          <span className="font-bold">42%</span> Share of pool members whose live scores project
          this team into the Round of 32
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

```bash
pnpm -C apps/web typecheck
pnpm lint
```

Expected: no errors.

- [ ] **Step 4: Run the full test suite**

```bash
pnpm test
```

Expected: all tests pass (no regressions).

---

### Task 5: Manual verification, full gate, and the single feature commit

**Files:** none new — verification + commit only.

- [ ] **Step 1: Start the dev server**

Check whether a dev server is already running (e.g. `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000`); if not:

```bash
pnpm dev
```

Run in the background — this is a long-lived process.

- [ ] **Step 2: Ensure there's seeded data with knockout progress**

```bash
pnpm seed:fresh
```

This resets the dev DB and seeds a pool with full predictions for `test-wc-2026`, logged in at `/login/dev-creator-login`.

- [ ] **Step 3: Advance the tournament to a mid-knockout checkpoint**

Sign in at `http://localhost:3000/login/dev-creator-login`, then go to `http://localhost:3000/dev` and use the Cup Simulator to apply the `qf-done` checkpoint (R32 + R16 + QF complete, SF upcoming) — this reproduces the reference mockup's state (an in-progress/just-finished round with earlier rounds collapsed behind "played" counts).

- [ ] **Step 4: Verify the mobile layout in a browser**

Navigate to the pool's `/results` page, select the Knockout tab, and resize the browser (or use a device viewport, e.g. 390×844) to below 768px wide. Confirm:

- The compact "Knockout points" summary pill appears with a ties-called ratio and a `+N` chip.
- Round sections are collapsed except the QF round, which is open by default.
- Tapping any round header toggles it open/closed independently of the others.
- `BracketHealthPanel` and `KnockoutPointsPanel` appear stacked below the accordion.
- Resizing back above 768px shows the original desktop bracket (grid layout, SVG connectors) with the mobile block hidden.

- [ ] **Step 5: Run the full gate**

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm -C apps/web build
```

Expected: all green.

- [ ] **Step 6: Commit the whole feature — spec, plan, and implementation together**

```bash
git add docs/superpowers/specs/2026-07-11-knockout-mobile-layout-design.md \
        docs/superpowers/plans/2026-07-11-knockout-mobile-layout.md \
        apps/web/src/features/results/domain/knockout-mobile-view.ts \
        apps/web/src/features/results/domain/knockout-mobile-view.test.ts \
        apps/web/src/features/results/ui/KnockoutMobileSummary.tsx \
        apps/web/src/features/results/ui/KnockoutRoundAccordion.tsx \
        apps/web/src/features/results/ui/ResultsPageClient.tsx
git commit -m "$(cat <<'EOF'
feat(results): mobile accordion layout for the Knockout tab

KnockoutBracket is a horizontally-scrolling SVG-connected bracket built
for wide screens — a poor fit on a phone. Below the md breakpoint, the
Knockout tab now renders a vertical accordion instead: a compact points
summary pill, then one collapsible section per round showing "N/M
played" (or the round's date before it starts). The round currently in
progress (or the most recently completed one) auto-expands; tapping a
header toggles it independently.

Reuses the existing BracketMatchCard/FinalResultCard tie components and
all of getResultsView's existing data — no data-model or query changes.
Desktop rendering (KnockoutBracket + right rail) is unchanged, just
wrapped in `hidden md:grid`.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git status
```

Expected: `git status` shows a clean tree (all changes committed), one new commit on top of the existing history.

## Self-Review Notes

- **Spec coverage:** summary pill (Task 2) ✓, round accordion with auto-expand (Tasks 1, 3) ✓, reused `BracketMatchCard`/`FinalResultCard` (Task 3) ✓, `BracketHealthPanel`/`KnockoutPointsPanel` stacked on mobile (Task 4) ✓, `md:hidden`/`hidden md:grid` split (Task 4) ✓, ties-called ratio semantics matching desktop's `hit`-based accuracy data (Task 1) ✓, out-of-scope items (Advanced/you-called-it toggles, per-team score columns) correctly omitted ✓.
- **Type consistency checked:** `getRoundPlayedCount`/`isRoundInProgress`/`pickDefaultExpandedRound`/`getTiesCalledRatio` signatures match between Task 1's definition and their call sites in Tasks 2–4. `KnockoutMobileSummary`'s `tiesCalled` prop shape (`{ correct: number; decided: number }`) matches `getTiesCalledRatio`'s return type exactly.
- **No placeholders:** every step has complete, concrete code.
