# Knockout Upcoming Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Next Matches" feed card above the knockout bracket showing all scheduled knockout matches with the user's picked winner and pool pick percentages, mirroring the group stage's upcoming-match feed.

**Architecture:** Two-task sequence — first extend `KnockoutMatchView` with direct pool winner-pick percentages (data layer), then build the `KnockoutUpcomingFeed` UI component and wire it into the knockout tab. The data is already computed internally in `build-bracket-rounds.ts`; we just expose two new fields. The component is purely presentational — all logic lives in the data layer.

**Tech Stack:** TypeScript strict, React 19, Tailwind CSS, Vitest for tests. No new dependencies.

## Global Constraints

- TypeScript strict — no `any`, no unsafe casts
- All new UI follows existing Tailwind class patterns (see `GroupMatchFeed.tsx`, `TodayMatchesFeed.tsx`)
- No new queries — all required data already fetched
- One feature commit at the end covering all files (spec doc + types + logic + component + wiring + tests)
- Run `pnpm test` to verify tests pass; run `pnpm typecheck` to verify types

---

### Task 1: Extend `KnockoutMatchView` with pool pick pcts + populate in data layer

**Files:**

- Modify: `apps/web/src/features/results/domain/types.ts`
- Modify: `apps/web/src/features/results/application/build-bracket-rounds.ts`
- Test: `apps/web/src/features/results/application/build-bracket-rounds.test.ts`

**Interfaces:**

- Produces: `KnockoutMatchView.poolPickHomePct: number | null` and `KnockoutMatchView.poolPickAwayPct: number | null` — consumed by Task 2's component

---

- [ ] **Step 1: Write the failing tests**

Open `apps/web/src/features/results/application/build-bracket-rounds.test.ts`.

Add these imports at the top alongside the existing imports:

```ts
import { bracketMatchKey as bmk, userId } from '@cup/engine';
import type { PoolKnockoutPick } from '@cup/db';
```

Append a new `describe` block at the bottom of the file:

```ts
describe('buildBracketRounds — poolPickHomePct / poolPickAwayPct', () => {
  // qf1: A1 (home) vs B2 (away), not yet played
  const scheduledQf1 = makeMatch('qf1', 'QF', {
    homeTeamId: 'A1',
    awayTeamId: 'B2',
    status: 'scheduled',
  });

  it('populates poolPickHomePct and poolPickAwayPct from pool knockout picks', () => {
    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bmk('qf1'), winnerTeamId: 'A1' },
      { userId: userId('u2'), bracketMatchKey: bmk('qf1'), winnerTeamId: 'A1' },
      { userId: userId('u3'), bracketMatchKey: bmk('qf1'), winnerTeamId: 'B2' },
    ];
    const { bracketRounds } = buildBracketRounds(miniTournament, [scheduledQf1], null, [], picks);
    const qfRound = bracketRounds.find((r) => r.label === 'QF')!;
    const match = qfRound.matches.find((m) => m.bracketMatchKey === 'qf1')!;
    // 2 of 3 users picked A1 (home) → 67%; 1 of 3 picked B2 (away) → 33%
    expect(match.poolPickHomePct).toBe(67);
    expect(match.poolPickAwayPct).toBe(33);
  });

  it('returns null pcts when no pool picks exist', () => {
    const { bracketRounds } = buildBracketRounds(miniTournament, [scheduledQf1], null, [], []);
    const qfRound = bracketRounds.find((r) => r.label === 'QF')!;
    const match = qfRound.matches.find((m) => m.bracketMatchKey === 'qf1')!;
    expect(match.poolPickHomePct).toBeNull();
    expect(match.poolPickAwayPct).toBeNull();
  });

  it('returns null pcts when teams are TBD (homeTeamId or awayTeamId is null)', () => {
    // sf1 has no DB row yet — both slots are null until QFs resolve
    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bmk('sf1'), winnerTeamId: 'A1' },
    ];
    // Only pass the scheduled QF matches so group-stage data is missing → sf1 slots are null
    const { bracketRounds } = buildBracketRounds(miniTournament, [], null, [], picks);
    const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
    const sf1Match = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
    // Both team slots are null → pcts must be null
    expect(sf1Match.homeTeamId).toBeNull();
    expect(sf1Match.awayTeamId).toBeNull();
    expect(sf1Match.poolPickHomePct).toBeNull();
    expect(sf1Match.poolPickAwayPct).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- --reporter=verbose build-bracket-rounds.test
```

Expected: 3 new tests FAIL — `poolPickHomePct` and `poolPickAwayPct` do not exist on the type.

- [ ] **Step 3: Add fields to `KnockoutMatchView`**

Open `apps/web/src/features/results/domain/types.ts`.

Find the `KnockoutMatchView` type (look for `homeTeamUserPredictedParticipant`). Add these two fields immediately after `awayTeamUserPredictedParticipant`:

```ts
/** % of pool members who directly picked the home team to win this match.
 *  Null when either team slot is TBD (unknown) or no picks exist. */
poolPickHomePct: number | null;
/** % of pool members who directly picked the away team to win this match.
 *  Null when either team slot is TBD (unknown) or no picks exist. */
poolPickAwayPct: number | null;
```

- [ ] **Step 4: Populate the fields in `buildMatchView`**

Open `apps/web/src/features/results/application/build-bracket-rounds.ts`.

Inside `buildMatchView`, find the return object. Locate the last two fields currently there — `homeTeamUserPredictedParticipant` and `awayTeamUserPredictedParticipant`. Add the two new fields after them:

```ts
      poolPickHomePct:
        homeId !== null && awayId !== null
          ? (knockoutRoundPcts.get(key)?.get(homeId) ?? null)
          : null,
      poolPickAwayPct:
        homeId !== null && awayId !== null
          ? (knockoutRoundPcts.get(key)?.get(awayId) ?? null)
          : null,
```

`knockoutRoundPcts` is already in scope (it is declared at the top of `buildBracketRounds` and `buildMatchView` is a closure over it). `homeId` and `awayId` are also already computed earlier in `buildMatchView`.

- [ ] **Step 5: Fix existing test fixtures that construct `KnockoutMatchView` literals**

Three test helper functions return a complete `KnockoutMatchView` object and must be updated to include the two new fields (add `poolPickHomePct: null, poolPickAwayPct: null` to the return object in each):

- `apps/web/src/features/results/application/build-race-view.test.ts` — the `makeKnockoutMatch` factory function
- `apps/web/src/features/results/domain/bracket-health.test.ts` — the `match` factory function
- `apps/web/src/features/results/domain/top-four-picks.test.ts` — the `match` factory function (base object before `...overrides`)

In each file, add these two lines anywhere inside the return object:

```ts
poolPickHomePct: null,
poolPickAwayPct: null,
```

- [ ] **Step 6: Run tests and typecheck**

```bash
pnpm test -- --reporter=verbose build-bracket-rounds.test
pnpm typecheck
```

Expected: All 3 new tests PASS. Typecheck passes.

---

### Task 2: `KnockoutUpcomingFeed` component + wire into knockout tab

**Files:**

- Create: `apps/web/src/features/results/ui/KnockoutUpcomingFeed.tsx`
- Modify: `apps/web/src/features/results/ui/ResultsPageClient.tsx`

**Interfaces:**

- Consumes: `KnockoutMatchView.poolPickHomePct`, `KnockoutMatchView.poolPickAwayPct` (from Task 1), `KnockoutMatchView.pickedWinnerId`, `KnockoutMatchView.pickedWinnerName`, `KnockoutMatchView.predictedHome`, `KnockoutMatchView.predictedAway`, `KnockoutMatchView.kickoff`, `KnockoutMatchView.status`, `BracketRoundResultView` — all from `'../domain/types'`

---

- [ ] **Step 1: Create `KnockoutUpcomingFeed.tsx`**

Create `apps/web/src/features/results/ui/KnockoutUpcomingFeed.tsx` with this content:

```tsx
import type { ReactElement } from 'react';
import type { BracketRoundResultView, KnockoutMatchView } from '../domain/types';
import { TeamBadge, cn } from '@/shared/ui';

type Props = {
  rounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
};

function formatKickoff(kickoff: string): string {
  const d = new Date(kickoff);
  const date = d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

function KnockoutPickBar({ homePct, awayPct }: { homePct: number; awayPct: number }): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex rounded-[3px] overflow-hidden h-2 gap-px">
        {homePct > 0 && (
          <div className="rounded-[3px] bg-[oklch(0.55_0.13_250)]" style={{ flex: homePct }} />
        )}
        {awayPct > 0 && (
          <div className="rounded-[3px] bg-[oklch(0.64_0.12_30)]" style={{ flex: awayPct }} />
        )}
      </div>
      <div className="flex justify-between text-[10px] text-ink-muted">
        <span className="text-[oklch(0.55_0.13_250)] font-semibold">{homePct}%</span>
        <span className="text-[oklch(0.64_0.12_30)] font-semibold">{awayPct}%</span>
      </div>
    </div>
  );
}

function KnockoutUpcomingRow({ match }: { match: KnockoutMatchView }): ReactElement {
  const homeId = match.homeTeamId ?? match.predictedHomeTeamId;
  const homeName = match.homeTeamName ?? match.predictedHomeTeamName ?? 'TBD';
  const awayId = match.awayTeamId ?? match.predictedAwayTeamId;
  const awayName = match.awayTeamName ?? match.predictedAwayTeamName ?? 'TBD';

  const hasPool = match.poolPickHomePct !== null && match.poolPickAwayPct !== null;

  // For Final/Bronze, predictedHome/Away are set — show score alongside pick.
  const pickLabel =
    match.pickedWinnerName !== null
      ? match.predictedHome !== null
        ? `you → ${match.pickedWinnerName} · ${match.predictedHome}–${match.predictedAway}`
        : `you → ${match.pickedWinnerName}`
      : null;

  return (
    <div>
      <div
        className={cn(
          'grid grid-cols-[1fr_auto_1fr] items-center gap-2',
          hasPool ? 'p-[10px_14px_6px]' : 'p-[10px_14px]',
        )}
      >
        <div className="flex items-center justify-end gap-1.5 min-w-0">
          <span className="text-[13px] font-bold truncate text-ink">{homeName}</span>
          <TeamBadge teamId={homeId} size="sm" />
        </div>

        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <span className="text-xs text-ink-muted text-center whitespace-nowrap">
            {match.kickoff ? formatKickoff(match.kickoff) : '–'}
          </span>
          {pickLabel !== null && (
            <span className="text-[10px] font-semibold text-ink-soft whitespace-nowrap">
              {pickLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 min-w-0">
          <TeamBadge teamId={awayId} size="sm" />
          <span className="text-[13px] font-bold truncate text-ink">{awayName}</span>
        </div>
      </div>

      {hasPool && (
        <div className="px-3.5 pb-2.5">
          <KnockoutPickBar homePct={match.poolPickHomePct!} awayPct={match.poolPickAwayPct!} />
        </div>
      )}
    </div>
  );
}

export function KnockoutUpcomingFeed({ rounds, bronzeMatch }: Props): ReactElement | null {
  const allScheduled = [
    ...rounds.flatMap((r) => r.matches),
    ...(bronzeMatch !== null ? [bronzeMatch] : []),
  ]
    .filter((m) => m.status === 'scheduled')
    .sort((a, b) => {
      if (!a.kickoff) return 1;
      if (!b.kickoff) return -1;
      return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
    });

  if (allScheduled.length === 0) return null;

  return (
    <div className="card overflow-hidden">
      <div className="turf p-[10px_16px]">
        <span className="display text-xl text-on-dark">Next Matches</span>
      </div>
      <div className="divide">
        {allScheduled.map((m) => (
          <KnockoutUpcomingRow key={m.bracketMatchKey} match={m} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire `KnockoutUpcomingFeed` into the knockout tab**

Open `apps/web/src/features/results/ui/ResultsPageClient.tsx`.

Add the import after the existing knockout-related imports:

```ts
import { KnockoutUpcomingFeed } from './KnockoutUpcomingFeed';
```

Inside the `{activeTab === 'knockout' && (...)}` block, insert `<KnockoutUpcomingFeed>` as the first child, before `<div className="grid gap-6 ...">`:

```tsx
{activeTab === 'knockout' && (
  <div className="flex flex-col gap-6">
    {view.userKnockoutSummary && <PointsSummaryPanel summary={view.userKnockoutSummary} />}
    <KnockoutUpcomingFeed rounds={view.bracketRounds} bronzeMatch={view.bronzeMatch} />
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_240px]">
      ...rest unchanged...
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 4: Run all tests**

```bash
pnpm test
```

Expected: All tests pass, including the 3 new ones from Task 1.

- [ ] **Step 5: Commit**

```bash
git add \
  docs/superpowers/specs/2026-07-01-knockout-upcoming-feed-design.md \
  apps/web/src/features/results/domain/types.ts \
  apps/web/src/features/results/application/build-bracket-rounds.ts \
  apps/web/src/features/results/application/build-bracket-rounds.test.ts \
  apps/web/src/features/results/ui/KnockoutUpcomingFeed.tsx \
  apps/web/src/features/results/ui/ResultsPageClient.tsx
git commit -m "feat(results): show upcoming knockout matches feed with user picks and pool stats"
```
