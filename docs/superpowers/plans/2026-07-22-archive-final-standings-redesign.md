# Archive Final Standings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the pool archive's member list into a ranked "Final standings" list (medal-colored
rank, avatar, name, YOU badge, points) where clicking a row expands it in place into a score
breakdown with per-category progress bars, matching the two mockups the user supplied.

**Architecture:** Two new components in `features/pool-archive/ui/` (`ArchiveStandingsPanel`,
`ArchiveStandingRow`) replace `ArchiveMemberRow`. A new shared `AvatarNameBadge` (extracted from a
pattern duplicated 2x already in `results`) provides the avatar+name+YOU-chip building block. Bars
show earned points vs. each category's theoretical max, computed via the engine's existing
`computeRemainingMaxPoints(def, { finalMatchIds: new Set() })` (empty progress = absolute max). A
pre-existing bug in `Avatar`'s initials logic is fixed as part of this work since the mockup depends
on two-letter initials for multi-word names.

**Tech Stack:** Next.js App Router, React server + client components, Tailwind v4 `@utility` classes
(`lb-row`/`lb-rank`/`lb-pts`/`.bar`/`.chip.green`/`.divide`, all pre-existing), TypeScript strict,
Vitest for pure-function unit tests (this codebase has **no** DOM/component test tooling —
`@testing-library/react` is not installed anywhere in the repo — so UI components are verified via
manual browser check + Storybook, and only pure logic gets `.test.ts` files).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-22-archive-final-standings-redesign-design.md` — read it
  first; this plan implements it exactly.
- **One commit per feature** (CLAUDE.md): unlike the default writing-plans template, do **not**
  commit after each task below. Everything — implementation, tests, and the spec doc — lands in a
  single commit at the very end (Task 6). Tasks end with a verification step, not a commit step.
- TypeScript strict, no `any`, no unsafe casts.
- Format + lint after each step that touches a file (Prettier + ESLint via the repo's normal
  `pnpm lint` / editor integration) — don't wait until the end to discover style issues.
- `cn` (from `@/shared/ui`) is this repo's `clsx` wrapper for conditional class strings — use it
  instead of manual template-string concatenation for conditional classes.

---

### Task 1: Fix `Avatar`'s initials bug

**Files:**

- Modify: `apps/web/src/shared/ui/Avatar.tsx`
- Test: `apps/web/src/shared/ui/Avatar.test.ts` (new)

**Interfaces:**

- Produces: `initials(name: string): string`, now exported from `Avatar.tsx` (previously private),
  used only by this test — `Avatar` the component still calls it internally, unchanged call site.

**Context:** `initials()` currently reads:

```ts
function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  const first = words[0] ?? '';
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  const second = words[1] ?? '';
  return (first[0] ?? '' + (second[0] ?? '')).toUpperCase();
}
```

`+` binds tighter than `??`, so the last line evaluates as `first[0] ?? (second[0] ?? '')`. Since
`first[0]` is never nullish for a non-empty first word, the second word's initial is silently
dropped — every multi-word name renders a single-letter avatar ("Marko V." → "M" instead of "MV").
The mockup this whole feature is based on relies on two-letter initials for multi-word names, so this
is directly in scope.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/shared/ui/Avatar.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { initials } from './Avatar';

describe('initials', () => {
  it('takes the first two characters of a single-word name', () => {
    expect(initials('Sofia')).toBe('SO');
  });

  it('takes the first character of each of the first two words', () => {
    expect(initials('Marko V.')).toBe('MV');
    expect(initials('Sofia Lehto')).toBe('SL');
  });

  it('ignores extra words beyond the second', () => {
    expect(initials('Jan de Groot Vries')).toBe('JD');
  });

  it('uppercases lowercase input', () => {
    expect(initials('marko v.')).toBe('MV');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web vitest run src/shared/ui/Avatar.test.ts`
Expected: FAIL — `initials` is not exported from `./Avatar` (or, once exported, the two-word
assertions fail with `'M'`/`'S'` instead of `'MV'`/`'SL'`).

- [ ] **Step 3: Export `initials` and fix the precedence bug**

In `apps/web/src/shared/ui/Avatar.tsx`, change:

```ts
function initials(name: string): string {
```

to:

```ts
export function initials(name: string): string {
```

and change the buggy return line:

```ts
return (first[0] ?? '' + (second[0] ?? '')).toUpperCase();
```

to:

```ts
return ((first[0] ?? '') + (second[0] ?? '')).toUpperCase();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web vitest run src/shared/ui/Avatar.test.ts`
Expected: PASS, all 4 cases.

- [ ] **Step 5: Format and lint**

Run: `pnpm --filter web exec prettier --write src/shared/ui/Avatar.tsx src/shared/ui/Avatar.test.ts && pnpm --filter web exec eslint src/shared/ui/Avatar.tsx src/shared/ui/Avatar.test.ts`
Expected: no errors.

---

### Task 2: Extract `AvatarNameBadge` and refactor `PredictionIdentityCell`

**Files:**

- Create: `apps/web/src/shared/ui/AvatarNameBadge.tsx`
- Modify: `apps/web/src/shared/ui/index.ts` (add export)
- Modify: `apps/web/src/features/results/ui/PredictionIdentityCell.tsx` (delegate to it)

**Interfaces:**

- Produces: `AvatarNameBadge({ name, avatarIndex, isCurrentUser, size? }): ReactElement` — a
  `React.Fragment` (no wrapping element) containing `Avatar` + a name `<span>` with an optional
  `.chip.green` "YOU" badge. No wrapping div/flex container — callers own their own layout wrapper,
  exactly like `PredictionIdentityCell` owns its outer `<div className={className}>` today.
- Consumes: `Avatar` (already exported from `./Avatar`), `cn` (already exported from `./cn`).

**Context — current `PredictionIdentityCell.tsx`:**

```tsx
import type { ReactElement } from 'react';
import { Avatar } from '@/shared/ui';

type Props = {
  testId: string;
  displayName: string;
  index: number;
  isCurrentUser: boolean;
  className: string;
};

export function PredictionIdentityCell({
  testId,
  displayName,
  index,
  isCurrentUser,
  className,
}: Props): ReactElement {
  return (
    <div data-testid={testId} className={className}>
      <Avatar name={displayName} index={index} size={28} />
      <span className="text-[13px] font-bold text-ink truncate">
        {displayName}
        {isCurrentUser && (
          <span className="chip green h-4.5 ml-[7px] text-[9.5px] align-middle">YOU</span>
        )}
      </span>
    </div>
  );
}
```

This exact avatar+name+badge composition is duplicated a second time inline in
`apps/web/src/features/results/ui/MatrixTable.tsx` (around line 143–157) — that one splits the avatar
and name into separate sticky grid cells, so it is **not** a clean fit for this extraction and is
**left untouched**. `PredictionIdentityCell` has no test file today (`grep` confirms) and only two
callers (`GroupMatchSummarySheet.tsx`, `MatchSummarySheet.tsx`), both passing the same four props —
this refactor is behavior-preserving (identical rendered DOM) so no test changes are needed there.

- [ ] **Step 1: Create `AvatarNameBadge.tsx`**

Create `apps/web/src/shared/ui/AvatarNameBadge.tsx`:

```tsx
import type { ReactElement } from 'react';
import { Avatar } from './Avatar';
import { cn } from './cn';

type Props = {
  name: string;
  avatarIndex: number;
  isCurrentUser: boolean;
  size?: number;
};

export function AvatarNameBadge({
  name,
  avatarIndex,
  isCurrentUser,
  size = 28,
}: Props): ReactElement {
  return (
    <>
      <Avatar name={name} index={avatarIndex} size={size} />
      <span
        className={cn(
          'text-[13px] font-bold truncate',
          isCurrentUser ? 'text-green-700' : 'text-ink',
        )}
      >
        {name}
        {isCurrentUser && (
          <span className="chip green h-4.5 ml-[7px] text-[9.5px] align-middle">YOU</span>
        )}
      </span>
    </>
  );
}
```

- [ ] **Step 2: Export it from the shared UI barrel**

In `apps/web/src/shared/ui/index.ts`, add (alphabetically near `Avatar`):

```ts
export { AvatarNameBadge } from './AvatarNameBadge';
```

- [ ] **Step 3: Refactor `PredictionIdentityCell` to delegate**

Replace the body of `apps/web/src/features/results/ui/PredictionIdentityCell.tsx` with:

```tsx
import type { ReactElement } from 'react';
import { AvatarNameBadge } from '@/shared/ui';

type Props = {
  testId: string;
  displayName: string;
  index: number;
  isCurrentUser: boolean;
  className: string;
};

/** Avatar + display name (+ "YOU" chip), the first cell of a match summary sheet's prediction row. */
export function PredictionIdentityCell({
  testId,
  displayName,
  index,
  isCurrentUser,
  className,
}: Props): ReactElement {
  return (
    <div data-testid={testId} className={className}>
      <AvatarNameBadge name={displayName} avatarIndex={index} isCurrentUser={isCurrentUser} />
    </div>
  );
}
```

Note this preserves the exact same rendered classes/DOM shape as before (`AvatarNameBadge`'s
`size` defaults to 28, matching the previous hardcoded `size={28}`).

- [ ] **Step 4: Typecheck, format, lint**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web exec prettier --write src/shared/ui/AvatarNameBadge.tsx src/shared/ui/index.ts src/features/results/ui/PredictionIdentityCell.tsx && pnpm --filter web exec eslint src/shared/ui/AvatarNameBadge.tsx src/features/results/ui/PredictionIdentityCell.tsx`
Expected: no type errors, no lint errors.

- [ ] **Step 5: Run the results feature's existing test suite as a regression check**

Run: `pnpm --filter web vitest run src/features/results`
Expected: PASS (no test exercises `PredictionIdentityCell` directly today, but this confirms nothing
else broke).

---

### Task 3: Build `ArchiveStandingRow` (collapsed row + expandable breakdown)

**Files:**

- Create: `apps/web/src/features/pool-archive/ui/ArchiveStandingRow.tsx`

**Interfaces:**

- Consumes: `PoolArchiveEntryView` (from `../domain/types`: `{ userId: UserId | null; displayName:
string; rank: number; pointsTotal: Points; breakdown: ScoreBreakdown; ... }`), `Scoring` and
  `ScoreBreakdown` types (from `@cup/engine`), `AvatarNameBadge` and `cn` (from `@/shared/ui`).
- Produces: `ArchiveStandingRow({ entry, rank, avatarIndex, isCurrentUser, scoring, categoryMax
}): ReactElement` — used only by `ArchiveStandingsPanel` (Task 4), not exported from the feature
  barrel.

**Context:** This is a client component (needs local `useState` for expand/collapse — each row is
independent, matching today's `ScoreBreakdownCard` behavior where multiple rows can be open at once).
Collapsed state uses the `lb-row`-style rank/avatar/points layout (medal-colored rank via
`lb-rank`/`.t1`/`.t2`/`.t3`, same CSS utilities the marketing homepage's decorative leaderboard demo
already uses in `apps/web/src/app/page.tsx`). Expanded state swaps the rank number for a collapse
chevron and shows one row per scoring category with a hint, a `.bar` progress bar, and points earned.
The 9-category list (label/key/hint) is duplicated locally here rather than imported from
`results/ui/ScoreBreakdownCard` because that file's `ROWS` constant isn't exported from the `results`
barrel (vertical-slice boundary) — this mirrors the precedent already set in
`pool-archive/domain/category-breakdown.ts`'s own local `CATEGORY_ROWS` (which has no hint text, so
it can't be reused here either — different row shape).

- [ ] **Step 1: Create the file**

Create `apps/web/src/features/pool-archive/ui/ArchiveStandingRow.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import type { Scoring, ScoreBreakdown } from '@cup/engine';
import type { PoolArchiveEntryView } from '../domain/types';
import { AvatarNameBadge, cn } from '@/shared/ui';

type Props = {
  entry: PoolArchiveEntryView;
  rank: number;
  avatarIndex: number;
  isCurrentUser: boolean;
  scoring: Scoring | null;
  categoryMax: ScoreBreakdown | null;
};

type CategoryRow = {
  label: string;
  key: keyof Omit<ScoreBreakdown, 'total'>;
  hint: (s: Scoring) => string;
};

const CATEGORY_ROWS: CategoryRow[] = [
  {
    label: 'Group Matches',
    key: 'groupMatches',
    hint: (s) =>
      `exact score +${s.groupMatch.exactScore} · correct outcome +${s.groupMatch.correctOutcome}`,
  },
  {
    label: 'Group Order',
    key: 'groupOrder',
    hint: (s) =>
      `all 4 correct +${s.groupOrder.allCorrect} · 2 correct +${s.groupOrder.twoCorrect} · 1 correct +${s.groupOrder.oneCorrect}`,
  },
  {
    label: 'Round of 16',
    key: 'roundOf16',
    hint: (s) => `per correct team +${s.roundOf16PerTeam} (max +${s.roundOf16PerTeam * 16})`,
  },
  {
    label: 'QF',
    key: 'roundOf8',
    hint: (s) => `per correct team +${s.roundOf8PerTeam} (max +${s.roundOf8PerTeam * 8})`,
  },
  {
    label: 'SF · Teams',
    key: 'topFourTeams',
    hint: (s) => `per correct semifinalist +${s.roundOf4PerTeam} (max +${s.roundOf4PerTeam * 4})`,
  },
  {
    label: 'SF · Position',
    key: 'topFourPosition',
    hint: (s) =>
      `per correct final standing (1st–4th) +${s.topFourPositionBonus} (max +${s.topFourPositionBonus * 4})`,
  },
  {
    label: 'Final',
    key: 'final',
    hint: (s) => `correct team +${s.final.perTeam} (×2) · exact score +${s.final.exactScore}`,
  },
  {
    label: 'Bronze',
    key: 'bronze',
    hint: (s) => `correct team +${s.bronze.perTeam} (×2) · exact score +${s.bronze.exactScore}`,
  },
  {
    label: 'Special Bets',
    key: 'specials',
    hint: () => 'points vary per bet — see Specials tab',
  },
];

const RANK_TIER: Partial<Record<number, string>> = { 1: 't1', 2: 't2', 3: 't3' };

export function ArchiveStandingRow({
  entry,
  rank,
  avatarIndex,
  isCurrentUser,
  scoring,
  categoryMax,
}: Props): ReactElement {
  const [expanded, setExpanded] = useState(false);

  return (
    <div data-testid="archive-standing-row" className={cn(isCurrentUser && 'bg-green-050')}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="grid grid-cols-[34px_1fr_auto] items-center gap-3 w-full px-4 py-2.5 cursor-pointer bg-transparent border-0 text-left"
      >
        {expanded ? (
          <>
            <span />
            <span className="flex items-center gap-2.5 min-w-0">
              <AvatarNameBadge
                name={entry.displayName}
                avatarIndex={avatarIndex}
                isCurrentUser={isCurrentUser}
              />
            </span>
            <span className="flex items-center gap-2">
              <span className="lb-pts">{entry.pointsTotal}</span>
              <ChevronIcon expanded />
            </span>
          </>
        ) : (
          <>
            <span className={cn('lb-rank', RANK_TIER[rank])}>{rank}</span>
            <span className="flex items-center gap-2.5 min-w-0">
              <AvatarNameBadge
                name={entry.displayName}
                avatarIndex={avatarIndex}
                isCurrentUser={isCurrentUser}
              />
            </span>
            <span className="lb-pts">{entry.pointsTotal}</span>
          </>
        )}
      </button>

      {expanded && (
        <ul className="list-none m-0 p-0 border-t border-line-soft" role="list">
          {CATEGORY_ROWS.map(({ label, key, hint }) => {
            const pts = entry.breakdown[key];
            const max = categoryMax?.[key] ?? 0;
            const pct = max > 0 ? Math.min(100, Math.round((pts / max) * 100)) : 0;
            return (
              <li key={key} className="px-4 py-[10px] border-b border-line-soft last:border-0">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span
                      className={cn(
                        'text-[12.5px] font-bold leading-tight',
                        pts > 0 ? 'text-ink' : 'text-ink-muted',
                      )}
                    >
                      {label}
                    </span>
                    {scoring && (
                      <span className="text-[11px] text-ink-muted font-medium leading-tight">
                        {hint(scoring)}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'text-[12.5px] font-bold tnum shrink-0 pt-px',
                      pts > 0 ? 'text-ink' : 'text-ink-muted',
                    )}
                  >
                    +{pts}
                  </span>
                </div>
                {categoryMax && (
                  <div
                    className="bar thin mt-1.5"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <i style={{ width: `${pct}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }): ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={cn('text-ink-muted transition-transform', expanded && 'rotate-180')}
      aria-hidden="true"
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Typecheck, format, lint**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web exec prettier --write src/features/pool-archive/ui/ArchiveStandingRow.tsx && pnpm --filter web exec eslint src/features/pool-archive/ui/ArchiveStandingRow.tsx`
Expected: no errors. (Typecheck will fail until Task 2's `AvatarNameBadge` export exists — Task 2
must run first, which it does per this plan's ordering.)

---

### Task 4: Build `ArchiveStandingsPanel` and update the feature barrel

**Files:**

- Create: `apps/web/src/features/pool-archive/ui/ArchiveStandingsPanel.tsx`
- Delete: `apps/web/src/features/pool-archive/ui/ArchiveMemberRow.tsx`
- Modify: `apps/web/src/features/pool-archive/index.ts`

**Interfaces:**

- Consumes: `ArchiveStandingRow` (Task 3, same directory, not barrel-exported), `PoolArchiveEntryView`
  (`../domain/types`), `Scoring`/`ScoreBreakdown`/`UserId` (`@cup/engine`).
- Produces: `ArchiveStandingsPanel({ entries, currentUserId, scoring, categoryMax }): ReactElement`,
  exported from the feature barrel (`ArchiveMemberRow`'s export is removed).

**Context:** Mirrors the existing `card` + eyebrow-header + `.divide`-separated-rows structure already
used by the live pool `Leaderboard` (`features/pools/ui/Leaderboard.tsx`) for its ranked-4-plus
section — same `.divide` utility, same idea of a header row sharing the body rows' grid template.

- [ ] **Step 1: Create the panel**

Create `apps/web/src/features/pool-archive/ui/ArchiveStandingsPanel.tsx`:

```tsx
import type { ReactElement } from 'react';
import type { Scoring, ScoreBreakdown, UserId } from '@cup/engine';
import type { PoolArchiveEntryView } from '../domain/types';
import { ArchiveStandingRow } from './ArchiveStandingRow';

type Props = {
  entries: PoolArchiveEntryView[];
  currentUserId: UserId | null;
  scoring: Scoring | null;
  categoryMax: ScoreBreakdown | null;
};

export function ArchiveStandingsPanel({
  entries,
  currentUserId,
  scoring,
  categoryMax,
}: Props): ReactElement {
  return (
    <div className="card" data-testid="archive-standings-panel">
      <div className="grid grid-cols-[34px_1fr_auto] gap-3 px-4 pt-3 pb-2 border-b border-line-soft">
        <span />
        <span className="section-label">Final standings</span>
        <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wide">Points</span>
      </div>
      <div className="divide">
        {entries.map((entry, i) => (
          <ArchiveStandingRow
            key={entry.userId ?? entry.displayName}
            entry={entry}
            rank={entry.rank}
            avatarIndex={i}
            isCurrentUser={currentUserId !== null && entry.userId === currentUserId}
            scoring={scoring}
            categoryMax={categoryMax}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete the old row component**

Run: `rm apps/web/src/features/pool-archive/ui/ArchiveMemberRow.tsx`

- [ ] **Step 3: Update the feature barrel**

In `apps/web/src/features/pool-archive/index.ts`, replace:

```ts
export { ArchiveMemberRow } from './ui/ArchiveMemberRow';
```

with:

```ts
export { ArchiveStandingsPanel } from './ui/ArchiveStandingsPanel';
```

(Leave every other export in that file untouched — `ArchiveCategoryBreakdownPanel`,
`buildCategoryBreakdown`, etc. are unrelated to this change.)

- [ ] **Step 4: Typecheck, format, lint**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web exec prettier --write src/features/pool-archive/ui/ArchiveStandingsPanel.tsx src/features/pool-archive/index.ts && pnpm --filter web exec eslint src/features/pool-archive/ui/ArchiveStandingsPanel.tsx src/features/pool-archive/index.ts`
Expected: `tsc` will currently fail because `archive/page.tsx` (Task 5) still imports the now-removed
`ArchiveMemberRow` — that's expected and fixed in the next task. If you want a clean typecheck at
this checkpoint, proceed straight to Task 5 before running `tsc`.

---

### Task 5: Wire it into the archive page

**Files:**

- Modify: `apps/web/src/app/(authenticated)/pools/[id]/archive/page.tsx`

**Interfaces:**

- Consumes: `ArchiveStandingsPanel` (Task 4, from `@/features/pool-archive`),
  `computeRemainingMaxPoints` (from `@cup/engine`, already used elsewhere in this codebase the same
  way — see `features/results/application/build-race-view.ts:108`).

**Context — current relevant slice of `page.tsx`:**

```tsx
import {
  getPoolArchiveView,
  ArchivePoolCard,
  ArchiveMemberRow,
  ArchiveHeroCard,
  ArchiveHighlightsPanel,
  ArchiveLeadChangesPanel,
  ArchiveCategoryBreakdownPanel,
  ArchiveStatTiles,
  ArchivePoolStatsPanel,
  buildCategoryBreakdown,
  toRaceChartData,
} from '@/features/pool-archive';
...
  const scoring = tournament?.scoringConfig ?? null;
  const def = tournament?.definition ?? null;
...
          <div className="flex flex-col gap-3">
            <p className="text-xs text-ink-muted">
              Archived on {archive.archivedAt.toLocaleDateString()} — {archive.tournamentName}
            </p>
            {archive.entries.map((entry) => (
              <ArchiveMemberRow
                key={entry.userId ?? entry.displayName}
                entry={entry}
                scoring={scoring}
              />
            ))}
          </div>
```

- [ ] **Step 1: Swap the import**

Replace `ArchiveMemberRow,` with `ArchiveStandingsPanel,` in the `@/features/pool-archive` import
block (keep alphabetical-ish ordering consistent with the rest of that block — insert where
`ArchiveMemberRow` was).

Also add the engine import at the top of the file:

```ts
import { poolId as asPoolId, computeRemainingMaxPoints } from '@cup/engine';
```

(This replaces the existing `import { poolId as asPoolId } from '@cup/engine';` line — just add
`computeRemainingMaxPoints` to that same import.)

- [ ] **Step 2: Compute `categoryMax`**

Immediately after the existing `const def = tournament?.definition ?? null;` line, add:

```ts
const categoryMax = def ? computeRemainingMaxPoints(def, { finalMatchIds: new Set() }) : null;
```

- [ ] **Step 3: Replace the entries list with the new panel**

Replace:

```tsx
<div className="flex flex-col gap-3">
  <p className="text-xs text-ink-muted">
    Archived on {archive.archivedAt.toLocaleDateString()} — {archive.tournamentName}
  </p>
  {archive.entries.map((entry) => (
    <ArchiveMemberRow key={entry.userId ?? entry.displayName} entry={entry} scoring={scoring} />
  ))}
</div>
```

with:

```tsx
<div className="flex flex-col gap-3">
  <p className="text-xs text-ink-muted">
    Archived on {archive.archivedAt.toLocaleDateString()} — {archive.tournamentName}
  </p>
  <ArchiveStandingsPanel
    entries={archive.entries}
    currentUserId={actor.userId}
    scoring={scoring}
    categoryMax={categoryMax}
  />
</div>
```

- [ ] **Step 4: Typecheck, format, lint**

Run: `pnpm --filter web exec tsc --noEmit && pnpm --filter web exec prettier --write "src/app/(authenticated)/pools/[id]/archive/page.tsx" && pnpm --filter web exec eslint "src/app/(authenticated)/pools/[id]/archive/page.tsx"`
Expected: no errors. This is the point where the whole chain (Tasks 1–5) should typecheck cleanly
end to end.

- [ ] **Step 5: Run the pool-archive feature's test suite as a regression check**

Run: `pnpm --filter web vitest run src/features/pool-archive`
Expected: PASS — no existing pool-archive test touches `ArchiveMemberRow` or the page component
directly, so this should be unaffected; it's a safety net for the barrel/type changes.

---

### Task 6: Manual verification, full quality gate, and the single feature commit

**Files:** none new — this task verifies and commits everything from Tasks 1–5 plus the spec docs.

- [ ] **Step 1: Start the dev server**

Run (background): `pnpm --filter web dev`

- [ ] **Step 2: Open the archive page for a pool that has been archived, in a browser**

Navigate to `/pools/<id>/archive` for a pool you know is archived (check
`docs/PROGRESS.md` or ask the user which pool ID to use if none is obvious locally). Verify:

- The standings list shows rank (gold/silver/bronze for 1–3, grey for 4+), avatar with correct
  two-letter (or one-letter for single-word names) initials, name, and a "YOU" badge + light-green
  row background on the current user's row.
- Clicking a row expands it in place: header shows avatar/name/badge/total + a chevron that flips on
  toggle; below it, all 9 categories show a label, hint text, a progress bar, and points earned.
  Multiple rows can be expanded independently.
- Clicking an expanded row's header collapses it back to the compact rank/avatar/points row.
- The `computeRemainingMaxPoints`-derived bars look proportionally sane (e.g. a category where the
  member scored the max shows a full bar; a zero-point category shows an empty bar).

If anything looks wrong, fix it before proceeding — do not report this task done without having
actually looked at it in a browser, per this repo's UI verification requirement.

- [ ] **Step 3: Run the full quality gate**

Run: `pnpm lint && pnpm --filter web exec tsc --noEmit && pnpm test && pnpm --filter web build`
Expected: all four pass. (`pnpm test` runs the full Vitest suite across the monorepo — this is the
project's pre-push gate; run it locally before committing, per CLAUDE.md.)

- [ ] **Step 4: Stage and commit everything as one feature commit**

```bash
git add \
  apps/web/src/shared/ui/Avatar.tsx \
  apps/web/src/shared/ui/Avatar.test.ts \
  apps/web/src/shared/ui/AvatarNameBadge.tsx \
  apps/web/src/shared/ui/index.ts \
  apps/web/src/features/results/ui/PredictionIdentityCell.tsx \
  apps/web/src/features/pool-archive/ui/ArchiveStandingRow.tsx \
  apps/web/src/features/pool-archive/ui/ArchiveStandingsPanel.tsx \
  apps/web/src/features/pool-archive/index.ts \
  "apps/web/src/app/(authenticated)/pools/[id]/archive/page.tsx" \
  docs/superpowers/specs/2026-07-22-archive-final-standings-redesign-design.md \
  docs/superpowers/specs/2026-07-22-archive-category-breakdown-design.md

git status
# Confirm apps/web/src/features/pool-archive/ui/ArchiveMemberRow.tsx shows as deleted in the diff;
# `git add` on the paths above won't stage a deletion outside that list, so also run:
git add apps/web/src/features/pool-archive/ui/ArchiveMemberRow.tsx

git commit -m "$(cat <<'EOF'
feat(pool-archive): redesign final standings as an expandable ranked list

Replace the stacked rank/name/accordion member rows with a single ranked
list (medal-colored rank, avatar, YOU badge, points) that expands in place
into a per-category score breakdown with progress bars against each
category's theoretical max. Fixes a pre-existing Avatar initials bug
(operator-precedence bug dropped the second word's initial) that the new
design surfaces. Extracts AvatarNameBadge to shared/ui, deduplicating a
pattern already repeated in the results feature.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"

git status
```

- [ ] **Step 5: Update `docs/PROGRESS.md`**

Add a line noting this feature landed (what/where), per CLAUDE.md's cross-session continuity
requirement. Check the file's existing format and match it — do not restructure it.

## Self-Review Notes (for whoever executes this plan)

- **Spec coverage:** every section of the design doc (bug fix, `AvatarNameBadge` extraction, two new
  pool-archive components, page wiring, testing approach, out-of-scope items) maps to a task above.
- **Type consistency check:** `ArchiveStandingRow`'s `Props.categoryMax: ScoreBreakdown | null` and
  `ArchiveStandingsPanel`'s `Props.categoryMax: ScoreBreakdown | null` match; `entry.breakdown[key]`
  and `categoryMax?.[key]` both index with the same `keyof Omit<ScoreBreakdown, 'total'>` union, so
  there's no key mismatch between the two.
- **No placeholders:** every step above has literal, complete code — nothing deferred to "handle
  appropriately."
