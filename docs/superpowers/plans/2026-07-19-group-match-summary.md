# Group Stage Match Summary Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping any group-stage match (completed, today, or upcoming) opens a detail sheet — the
user's predicted score, the pool's home/draw/away split, an insight line, and every member's
prediction — matching the existing knockout match summary sheet.

**Architecture:** Extend the existing `matchMatrix`/`matrixMatches` (already computed for the
Points Race tab) with the raw predicted score and group id, add a pure domain selector
(`buildGroupMatchDetail`) that transposes that matrix for one match, and a new presentational
`GroupMatchSummarySheet` component wired into `GroupMatchFeed`/`TodayMatchesFeed`/`ResultsPageClient`.
No new server calls or engine invocations — everything the sheet needs is already loaded.

**Tech Stack:** Next.js App Router, TypeScript (strict), Vitest + pglite for integration tests,
Playwright for E2E, Tailwind for styling — matches the existing `features/results` slice.

## Global Constraints

- **One commit for the whole feature** (CLAUDE.md: "one commit per feature... do not create
  intermediate or partial commits"). Do **not** commit after individual tasks below — every task
  after this one stages its changes but the actual `git commit` happens only in the final task.
  This deviates from this skill's usual per-task commit step; follow the plan's explicit commit
  placement instead.
- TypeScript strict, no `any`, no unsafe casts (CLAUDE.md).
- `data-testid` for any new E2E selector surface (CLAUDE.md).
- Design spec already written and approved: `docs/superpowers/specs/2026-07-19-group-match-summary-design.md`.
  This file is already on disk (untracked) — it gets added to git in the final commit, alongside
  this plan file.

---

### Task 1: Extend `MatchMatrixCell`/`MatrixMatch` with predicted score + groupId

**Files:**

- Modify: `apps/web/src/features/results/domain/types.ts:242-273`
- Modify: `apps/web/src/features/results/application/build-race-view.ts:1217-1283` (`buildMatchMatrix`)
- Test: `apps/web/src/features/results/application/get-results-view.test.ts:1066-1136`

**Interfaces:**

- Produces: `MatchMatrixCell.predictedHome: number | null`, `MatchMatrixCell.predictedAway: number | null`,
  `MatrixMatch.groupId: string` — consumed by Task 2's `buildGroupMatchDetail`.

- [ ] **Step 1: Add failing assertions to the existing integration tests**

In `get-results-view.test.ts`, inside the `'builds match matrix from all pool members group scores'`
test, add these lines right after the existing `expect(myUnplayedCell?.predictedOutcome).toBeNull();`
(around line 1116):

```ts
expect(myCell?.predictedHome).toBe(2);
expect(myCell?.predictedAway).toBe(0);
expect(myUnplayedCell?.predictedHome).toBeNull();
expect(myUnplayedCell?.predictedAway).toBeNull();

expect(finalizedMatch.groupId).toBe(groupId('A'));
```

And inside the `'shows predictedOutcome for upcoming matches when user has a prediction'` test,
add after the existing `expect(cell?.predictedOutcome).toBe('2');` (around line 1135):

```ts
expect(cell?.predictedHome).toBe(0);
expect(cell?.predictedAway).toBe(2);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web vitest run get-results-view -t "match matrix"`
Expected: FAIL — `predictedHome`/`predictedAway`/`groupId` are `undefined`, not the expected values.

- [ ] **Step 3: Extend the domain types**

In `apps/web/src/features/results/domain/types.ts`, replace:

```ts
export type MatchMatrixCell = {
  matchId: string;
  hit: MatchHit;
  points: number;
  /** The user's predicted outcome derived from their predicted score. Null when no prediction was made. */
  predictedOutcome: '1' | 'X' | '2' | null;
};
```

with:

```ts
export type MatchMatrixCell = {
  matchId: string;
  hit: MatchHit;
  points: number;
  /** The user's predicted outcome derived from their predicted score. Null when no prediction was made. */
  predictedOutcome: '1' | 'X' | '2' | null;
  /** The user's predicted score for this match. Null when they made no prediction. */
  predictedHome: number | null;
  predictedAway: number | null;
};
```

And replace:

```ts
export type MatrixMatch = {
  matchId: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  status: 'scheduled' | 'in_progress' | 'final' | 'cancelled';
  /** ISO-8601 string. Null when kickoff is not set. */
  kickoff: string | null;
  /** Null for unplayed matches. */
  actualHome: number | null;
  /** Null for unplayed matches. */
  actualAway: number | null;
};
```

with:

```ts
export type MatrixMatch = {
  matchId: string;
  /** The group this match belongs to, e.g. 'A'. */
  groupId: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  status: 'scheduled' | 'in_progress' | 'final' | 'cancelled';
  /** ISO-8601 string. Null when kickoff is not set. */
  kickoff: string | null;
  /** Null for unplayed matches. */
  actualHome: number | null;
  /** Null for unplayed matches. */
  actualAway: number | null;
};
```

- [ ] **Step 4: Populate the new fields in `buildMatchMatrix`**

In `apps/web/src/features/results/application/build-race-view.ts`, inside `buildMatchMatrix`,
replace:

```ts
const matrixMatches: MatrixMatch[] = allGroupMatches.map((m) => ({
  matchId: m.id,
  homeTeamId: m.homeTeamId ?? '',
  homeTeamName: teamMap.get(m.homeTeamId ?? '') ?? m.homeTeamId ?? '',
  awayTeamId: m.awayTeamId ?? '',
  awayTeamName: teamMap.get(m.awayTeamId ?? '') ?? m.awayTeamId ?? '',
  status: m.status,
  kickoff: m.kickoff?.toISOString() ?? null,
  actualHome: m.homeGoals ?? null,
  actualAway: m.awayGoals ?? null,
}));
```

with:

```ts
const matrixMatches: MatrixMatch[] = allGroupMatches.map((m) => ({
  matchId: m.id,
  groupId: m.groupId ?? '',
  homeTeamId: m.homeTeamId ?? '',
  homeTeamName: teamMap.get(m.homeTeamId ?? '') ?? m.homeTeamId ?? '',
  awayTeamId: m.awayTeamId ?? '',
  awayTeamName: teamMap.get(m.awayTeamId ?? '') ?? m.awayTeamId ?? '',
  status: m.status,
  kickoff: m.kickoff?.toISOString() ?? null,
  actualHome: m.homeGoals ?? null,
  actualAway: m.awayGoals ?? null,
}));
```

Then replace the cell-building block:

```ts
  const matchMatrix: MatchMatrixEntry[] = leaderboard.map((e) => {
    let matchPoints = 0;
    const cells: MatchMatrixCell[] = allGroupMatches.map((m) => {
      const pred = predMap.get(`${e.userId}::${m.id}`) ?? null;
      const predictedOutcome = toPredictedOutcome(pred?.home ?? null, pred?.away ?? null);

      if (m.status !== 'final') {
        return { matchId: m.id, hit: 'pending', points: 0, predictedOutcome };
      }

      const hit = computeHit(
        m.homeGoals!,
        m.awayGoals!,
        pred?.home ?? null,
        pred?.away ?? null,
        scoring,
      );
      matchPoints += hit.points;
      return { matchId: m.id, hit: hit.hit, points: hit.points, predictedOutcome };
    });
```

with:

```ts
  const matchMatrix: MatchMatrixEntry[] = leaderboard.map((e) => {
    let matchPoints = 0;
    const cells: MatchMatrixCell[] = allGroupMatches.map((m) => {
      const pred = predMap.get(`${e.userId}::${m.id}`) ?? null;
      const predictedOutcome = toPredictedOutcome(pred?.home ?? null, pred?.away ?? null);
      const predictedHome = pred?.home ?? null;
      const predictedAway = pred?.away ?? null;

      if (m.status !== 'final') {
        return {
          matchId: m.id,
          hit: 'pending',
          points: 0,
          predictedOutcome,
          predictedHome,
          predictedAway,
        };
      }

      const hit = computeHit(
        m.homeGoals!,
        m.awayGoals!,
        pred?.home ?? null,
        pred?.away ?? null,
        scoring,
      );
      matchPoints += hit.points;
      return {
        matchId: m.id,
        hit: hit.hit,
        points: hit.points,
        predictedOutcome,
        predictedHome,
        predictedAway,
      };
    });
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter web vitest run get-results-view`
Expected: PASS (all `get-results-view.test.ts` tests, including the two modified above).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors (this confirms nothing else destructures `MatchMatrixCell`/`MatrixMatch` with
an exact/exhaustive shape that the new fields would break — `MatchMatrix.tsx` only reads specific
properties, so it's unaffected).

---

### Task 2: `buildGroupMatchDetail` domain selector

**Files:**

- Modify: `apps/web/src/features/results/domain/types.ts` (add new types after `MatrixMatch`, i.e. after the block edited in Task 1, before the knockout-matrix section)
- Create: `apps/web/src/features/results/domain/group-match-detail.ts`
- Test: `apps/web/src/features/results/domain/group-match-detail.test.ts`

**Interfaces:**

- Consumes: `MatchMatrixEntry`, `MatchMatrixCell` (with `predictedHome`/`predictedAway` from Task 1),
  `MatrixMatch` (with `groupId` from Task 1), `MatchPredictionStats` (existing type).
- Produces: `GroupMatchDetailPrediction`, `GroupMatchDetail`, `buildGroupMatchDetail(match:
MatrixMatch, matchMatrix: MatchMatrixEntry[]): GroupMatchDetail` — consumed by Task 5's UI wiring.

- [ ] **Step 1: Add the new domain types**

In `apps/web/src/features/results/domain/types.ts`, immediately after the `MatrixMatch` type
(the block edited in Task 1), add:

```ts
export type GroupMatchDetailPrediction = {
  userId: string;
  displayName: string;
  isCurrentUser: boolean;
  predictedHome: number | null;
  predictedAway: number | null;
  hit: MatchHit;
  points: number;
};

export type GroupMatchDetail = {
  totalPredictions: number;
  /** Null when totalPredictions is 0. */
  poolStats: MatchPredictionStats | null;
  /** Null when totalPredictions is 0. */
  insight: string | null;
  /** Sorted: current user first (if present), then by points DESC, then displayName ASC. */
  predictions: GroupMatchDetailPrediction[];
};
```

- [ ] **Step 2: Write the failing test file**

Create `apps/web/src/features/results/domain/group-match-detail.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildGroupMatchDetail } from './group-match-detail';
import type { MatrixMatch, MatchMatrixEntry, MatchMatrixCell } from './types';

function match(overrides: Partial<MatrixMatch> = {}): MatrixMatch {
  return {
    matchId: 'g-a1',
    groupId: 'A',
    homeTeamId: 'ARG',
    homeTeamName: 'Argentina',
    awayTeamId: 'SEN',
    awayTeamName: 'Senegal',
    status: 'scheduled',
    kickoff: null,
    actualHome: null,
    actualAway: null,
    ...overrides,
  };
}

function cell(overrides: Partial<MatchMatrixCell> = {}): MatchMatrixCell {
  return {
    matchId: 'g-a1',
    hit: 'pending',
    points: 0,
    predictedOutcome: null,
    predictedHome: null,
    predictedAway: null,
    ...overrides,
  };
}

function entry(overrides: Partial<MatchMatrixEntry> = {}): MatchMatrixEntry {
  return {
    userId: 'u1',
    displayName: 'Alice',
    isCurrentUser: false,
    cells: [cell()],
    groupOrderPoints: 0,
    totalPoints: 0,
    ...overrides,
  };
}

describe('buildGroupMatchDetail', () => {
  it('computes pool stats from predicted scores', () => {
    const m = match();
    const entries = [
      entry({ userId: 'u1', cells: [cell({ predictedHome: 2, predictedAway: 0 })] }),
      entry({ userId: 'u2', cells: [cell({ predictedHome: 1, predictedAway: 0 })] }),
      entry({ userId: 'u3', cells: [cell({ predictedHome: 1, predictedAway: 1 })] }),
      entry({ userId: 'u4', cells: [cell({ predictedHome: 0, predictedAway: 2 })] }),
    ];

    const detail = buildGroupMatchDetail(m, entries);

    expect(detail.totalPredictions).toBe(4);
    expect(detail.poolStats).toEqual({
      homeWinPct: 50,
      drawPct: 25,
      awayWinPct: 25,
      avgHomeGoals: 1,
      avgAwayGoals: 0.8,
      totalPredictions: 4,
    });
  });

  it('returns null poolStats and insight when nobody has predicted yet', () => {
    const m = match();
    const entries = [
      entry({ userId: 'u1', cells: [cell({ predictedHome: null, predictedAway: null })] }),
    ];

    const detail = buildGroupMatchDetail(m, entries);

    expect(detail.totalPredictions).toBe(0);
    expect(detail.poolStats).toBeNull();
    expect(detail.insight).toBeNull();
  });

  it('builds a "so far" insight for an unplayed match', () => {
    const m = match({ status: 'scheduled' });
    const entries = [
      entry({ userId: 'u1', cells: [cell({ predictedHome: 2, predictedAway: 0 })] }),
      entry({ userId: 'u2', cells: [cell({ predictedHome: 1, predictedAway: 0 })] }),
      entry({ userId: 'u3', cells: [cell({ predictedHome: 0, predictedAway: 1 })] }),
    ];

    const detail = buildGroupMatchDetail(m, entries);

    expect(detail.insight).toBe('2 of 3 predicted a home win for Argentina so far.');
  });

  it('builds a "right" verdict insight when the pool majority matches the actual result', () => {
    const m = match({ status: 'final', actualHome: 2, actualAway: 0 });
    const entries = [
      entry({
        userId: 'u1',
        cells: [cell({ predictedHome: 2, predictedAway: 0, hit: 'exact', points: 6 })],
      }),
      entry({
        userId: 'u2',
        cells: [cell({ predictedHome: 1, predictedAway: 0, hit: 'outcome', points: 3 })],
      }),
      entry({
        userId: 'u3',
        cells: [cell({ predictedHome: 0, predictedAway: 1, hit: 'missed', points: 0 })],
      }),
    ];

    const detail = buildGroupMatchDetail(m, entries);

    expect(detail.insight).toBe(
      '2 of 3 predicted a home win for Argentina — the pool got it right. 1 nailed the exact score.',
    );
  });

  it('builds a "wrong" verdict insight when the pool majority differs from the actual result', () => {
    const m = match({ status: 'final', actualHome: 0, actualAway: 1 });
    const entries = [
      entry({
        userId: 'u1',
        cells: [cell({ predictedHome: 2, predictedAway: 0, hit: 'missed', points: 0 })],
      }),
      entry({
        userId: 'u2',
        cells: [cell({ predictedHome: 1, predictedAway: 0, hit: 'missed', points: 0 })],
      }),
      entry({
        userId: 'u3',
        cells: [cell({ predictedHome: 0, predictedAway: 1, hit: 'exact', points: 6 })],
      }),
    ];

    const detail = buildGroupMatchDetail(m, entries);

    expect(detail.insight).toBe(
      '2 of 3 predicted a home win for Argentina — the pool got it wrong. 1 nailed the exact score.',
    );
  });

  it('falls back to pending/no points when a row has no cell for this match', () => {
    const m = match({ matchId: 'g-a1' });
    const entries = [entry({ userId: 'u1', cells: [cell({ matchId: 'g-a2' })] })];

    const detail = buildGroupMatchDetail(m, entries);

    expect(detail.predictions[0]).toMatchObject({
      predictedHome: null,
      predictedAway: null,
      hit: 'pending',
      points: 0,
    });
  });

  it('sorts current user first, then by points desc, then displayName asc', () => {
    const m = match({ status: 'final', actualHome: 1, actualAway: 0 });
    const entries = [
      entry({
        userId: 'u1',
        displayName: 'Bob',
        isCurrentUser: false,
        cells: [cell({ predictedHome: 1, predictedAway: 0, hit: 'outcome', points: 3 })],
      }),
      entry({
        userId: 'u2',
        displayName: 'Zed',
        isCurrentUser: true,
        cells: [cell({ predictedHome: 1, predictedAway: 0, hit: 'exact', points: 6 })],
      }),
      entry({
        userId: 'u3',
        displayName: 'Amy',
        isCurrentUser: false,
        cells: [cell({ predictedHome: 1, predictedAway: 0, hit: 'outcome', points: 3 })],
      }),
    ];

    const detail = buildGroupMatchDetail(m, entries);

    expect(detail.predictions.map((p) => p.userId)).toEqual(['u2', 'u1', 'u3']);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter web vitest run group-match-detail`
Expected: FAIL with "Cannot find module './group-match-detail'".

- [ ] **Step 4: Implement `buildGroupMatchDetail`**

Create `apps/web/src/features/results/domain/group-match-detail.ts`:

```ts
import type {
  GroupMatchDetail,
  GroupMatchDetailPrediction,
  MatchMatrixEntry,
  MatchPredictionStats,
  MatrixMatch,
} from './types';

type ScoredPrediction = { predictedHome: number; predictedAway: number };

function hasScore(
  p: GroupMatchDetailPrediction,
): p is GroupMatchDetailPrediction & ScoredPrediction {
  return p.predictedHome !== null && p.predictedAway !== null;
}

function buildPoolStats(scored: ScoredPrediction[]): MatchPredictionStats | null {
  if (scored.length === 0) return null;

  const total = scored.length;
  const homeWins = scored.filter((p) => p.predictedHome > p.predictedAway).length;
  const draws = scored.filter((p) => p.predictedHome === p.predictedAway).length;
  const awayWins = scored.filter((p) => p.predictedHome < p.predictedAway).length;
  const avgHome = scored.reduce((sum, p) => sum + p.predictedHome, 0) / total;
  const avgAway = scored.reduce((sum, p) => sum + p.predictedAway, 0) / total;

  return {
    homeWinPct: Math.round((homeWins / total) * 100),
    drawPct: Math.round((draws / total) * 100),
    awayWinPct: Math.round((awayWins / total) * 100),
    avgHomeGoals: Math.round(avgHome * 10) / 10,
    avgAwayGoals: Math.round(avgAway * 10) / 10,
    totalPredictions: total,
  };
}

/** The actual outcome, or null when the match hasn't finished (or somehow has partial scores). */
function classifyResult(match: MatrixMatch): 'home' | 'draw' | 'away' | null {
  if (match.actualHome === null || match.actualAway === null) return null;
  if (match.actualHome > match.actualAway) return 'home';
  if (match.actualHome === match.actualAway) return 'draw';
  return 'away';
}

type MajorityOutcome = { count: number; label: string; matchesActual: boolean };

/** Picks the most-predicted outcome (home/draw/away) among the pool's scored predictions. */
function resolveMajorityOutcome(scored: ScoredPrediction[], match: MatrixMatch): MajorityOutcome {
  const homeWins = scored.filter((p) => p.predictedHome > p.predictedAway).length;
  const draws = scored.filter((p) => p.predictedHome === p.predictedAway).length;
  const awayWins = scored.filter((p) => p.predictedHome < p.predictedAway).length;
  const actual = classifyResult(match);

  const candidates: MajorityOutcome[] = [
    {
      count: homeWins,
      label: `a home win for ${match.homeTeamName}`,
      matchesActual: actual === 'home',
    },
    { count: draws, label: 'a draw', matchesActual: actual === 'draw' },
    {
      count: awayWins,
      label: `an away win for ${match.awayTeamName}`,
      matchesActual: actual === 'away',
    },
  ];

  return candidates.reduce((best, c) => (c.count > best.count ? c : best));
}

function buildInsight(
  match: MatrixMatch,
  scored: ScoredPrediction[],
  totalPredictions: number,
  exactScoreCount: number,
): string | null {
  if (totalPredictions === 0) return null;

  const majority = resolveMajorityOutcome(scored, match);
  const base = `${majority.count} of ${totalPredictions} predicted ${majority.label}`;

  if (match.status !== 'final') return `${base} so far.`;

  const verdict = `${base} — the pool got it ${majority.matchesActual ? 'right' : 'wrong'}.`;
  if (exactScoreCount === 0) return verdict;
  return `${verdict} ${exactScoreCount} nailed the exact score.`;
}

export function buildGroupMatchDetail(
  match: MatrixMatch,
  matchMatrix: MatchMatrixEntry[],
): GroupMatchDetail {
  const predictions: GroupMatchDetailPrediction[] = matchMatrix.map((row) => {
    const cell = row.cells.find((c) => c.matchId === match.matchId) ?? null;
    return {
      userId: row.userId,
      displayName: row.displayName,
      isCurrentUser: row.isCurrentUser,
      predictedHome: cell?.predictedHome ?? null,
      predictedAway: cell?.predictedAway ?? null,
      hit: cell?.hit ?? 'pending',
      points: cell?.points ?? 0,
    };
  });

  const scored = predictions.filter(hasScore);
  const poolStats = buildPoolStats(scored);
  const exactScoreCount = predictions.filter((p) => p.hit === 'exact').length;

  const sorted = predictions.toSorted((a, b) => {
    if (a.isCurrentUser !== b.isCurrentUser) return a.isCurrentUser ? -1 : 1;
    if (a.points !== b.points) return b.points - a.points;
    return a.displayName.localeCompare(b.displayName);
  });

  return {
    totalPredictions: scored.length,
    poolStats,
    insight: buildInsight(match, scored, scored.length, exactScoreCount),
    predictions: sorted,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter web vitest run group-match-detail`
Expected: PASS (all 7 tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

---

### Task 3: `resolveGroupPredictionHitDisplay` UI util

**Files:**

- Create: `apps/web/src/features/results/ui/group-match-summary-utils.ts`
- Test: `apps/web/src/features/results/ui/group-match-summary-utils.test.ts`

**Interfaces:**

- Consumes: `GroupMatchDetailPrediction` (Task 2), `PredictionHitDisplay` (existing type exported
  from `ui/match-summary-utils.ts`).
- Produces: `resolveGroupPredictionHitDisplay(prediction: GroupMatchDetailPrediction):
PredictionHitDisplay` — consumed by Task 5's `GroupMatchSummarySheet`.

- [ ] **Step 1: Write the failing test file**

Create `apps/web/src/features/results/ui/group-match-summary-utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveGroupPredictionHitDisplay } from './group-match-summary-utils';
import type { GroupMatchDetailPrediction } from '../domain/types';

function prediction(
  overrides: Partial<GroupMatchDetailPrediction> = {},
): GroupMatchDetailPrediction {
  return {
    userId: 'u1',
    displayName: 'Alice',
    isCurrentUser: false,
    predictedHome: 2,
    predictedAway: 0,
    hit: 'exact',
    points: 6,
    ...overrides,
  };
}

describe('resolveGroupPredictionHitDisplay', () => {
  it('maps an exact hit to the exact MatchHit chip', () => {
    expect(resolveGroupPredictionHitDisplay(prediction({ hit: 'exact' }))).toEqual({
      kind: 'matchHit',
      hit: 'exact',
    });
  });

  it('maps an outcome hit to the outcome MatchHit chip', () => {
    expect(resolveGroupPredictionHitDisplay(prediction({ hit: 'outcome' }))).toEqual({
      kind: 'matchHit',
      hit: 'outcome',
    });
  });

  it('maps a missed hit to the missed MatchHit chip', () => {
    expect(resolveGroupPredictionHitDisplay(prediction({ hit: 'missed' }))).toEqual({
      kind: 'matchHit',
      hit: 'missed',
    });
  });

  it('maps no prediction to a muted "No pick" chip, even if hit happens to be pending', () => {
    expect(
      resolveGroupPredictionHitDisplay(
        prediction({ predictedHome: null, predictedAway: null, hit: 'pending' }),
      ),
    ).toEqual({ kind: 'custom', label: 'No pick', tone: 'muted' });
  });

  it('maps a pending hit with a prediction to a muted "Pending" chip', () => {
    expect(
      resolveGroupPredictionHitDisplay(
        prediction({ predictedHome: 1, predictedAway: 1, hit: 'pending' }),
      ),
    ).toEqual({ kind: 'custom', label: 'Pending', tone: 'muted' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web vitest run group-match-summary-utils`
Expected: FAIL with "Cannot find module './group-match-summary-utils'".

- [ ] **Step 3: Implement the util**

Create `apps/web/src/features/results/ui/group-match-summary-utils.ts`:

```ts
import type { GroupMatchDetailPrediction } from '../domain/types';
import type { PredictionHitDisplay } from './match-summary-utils';

/**
 * Adapts a GroupMatchDetailPrediction into either a MatchHit (reusing HitChip for the
 * exact/outcome/missed cases) or a small custom chip for "no pick" and "still pending" — group
 * predictions carry no separate no-pick/impossible states like knockout picks do.
 */
export function resolveGroupPredictionHitDisplay(
  prediction: GroupMatchDetailPrediction,
): PredictionHitDisplay {
  if (prediction.predictedHome === null) {
    return { kind: 'custom', label: 'No pick', tone: 'muted' };
  }
  if (prediction.hit === 'pending') {
    return { kind: 'custom', label: 'Pending', tone: 'muted' };
  }
  return { kind: 'matchHit', hit: prediction.hit };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web vitest run group-match-summary-utils`
Expected: PASS (all 5 tests).

---

### Task 4: Extract shared `useDialogSheet` hook, refactor `MatchSummarySheet`

**Files:**

- Create: `apps/web/src/features/results/ui/use-dialog-sheet.ts`
- Modify: `apps/web/src/features/results/ui/MatchSummarySheet.tsx:1-31` (imports + component body)

**Interfaces:**

- Produces: `useDialogSheet(onClose: () => void): { dialogRef: RefObject<HTMLDialogElement |
null>; handleBackdropClick: (event: React.MouseEvent<HTMLDialogElement>) => void }` — consumed
  by `MatchSummarySheet` (this task) and Task 5's `GroupMatchSummarySheet`.

This is a pure refactor (no behavior change) — there's no dedicated unit test for it (no `.tsx`
component tests exist anywhere in this app; UI correctness for this feature is covered by the
existing `results.spec.ts` E2E flow for the knockout sheet, which must keep passing).

- [ ] **Step 1: Create the hook**

Create `apps/web/src/features/results/ui/use-dialog-sheet.ts`:

```ts
'use client';

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

type DialogSheet = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  handleBackdropClick: (event: React.MouseEvent<HTMLDialogElement>) => void;
};

/**
 * Shared open/close wiring for a native <dialog>-based bottom sheet: opens via showModal on
 * mount, calls onClose when the dialog closes (Escape or programmatic .close()), and closes on
 * a backdrop click (a click landing outside the dialog's content box).
 */
export function useDialogSheet(onClose: () => void): DialogSheet {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>): void {
    // event.target is the native click target; sonarjs can't see it narrows to the
    // dialog element itself when the click lands on the backdrop (outside <dialog>'s content).
    // eslint-disable-next-line sonarjs/different-types-comparison
    if (event.target === dialogRef.current) dialogRef.current?.close();
  }

  return { dialogRef, handleBackdropClick };
}
```

- [ ] **Step 2: Refactor `MatchSummarySheet` to use it**

In `apps/web/src/features/results/ui/MatchSummarySheet.tsx`, replace the import line:

```tsx
import { Fragment, useEffect, useRef } from 'react';
```

with:

```tsx
import { Fragment } from 'react';
```

Add a new import right after the other local imports (near `import { resolvePredictionHitDisplay, isPenaltyWinnerPick } from './match-summary-utils';`):

```tsx
import { useDialogSheet } from './use-dialog-sheet';
```

Then replace the start of the component body:

```tsx
export function MatchSummarySheet({ match, matchKey, detail, onClose }: Props): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isFinaleTie = matchKey === 'final' || matchKey === 'bronze';
  const yourPick = detail.predictions.find((p) => p.isCurrentUser) ?? null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>): void {
    // event.target is the native click target; sonarjs can't see it narrows to the
    // dialog element itself when the click lands on the backdrop (outside <dialog>'s content).
    // eslint-disable-next-line sonarjs/different-types-comparison
    if (event.target === dialogRef.current) dialogRef.current?.close();
  }

  return (
```

with:

```tsx
export function MatchSummarySheet({ match, matchKey, detail, onClose }: Props): ReactElement {
  const isFinaleTie = matchKey === 'final' || matchKey === 'bronze';
  const yourPick = detail.predictions.find((p) => p.isCurrentUser) ?? null;
  const { dialogRef, handleBackdropClick } = useDialogSheet(onClose);

  return (
```

- [ ] **Step 3: Typecheck and run the existing test suite**

Run: `pnpm typecheck && pnpm test`
Expected: no errors, all existing tests pass (this refactor touches no test-covered logic, but
confirms nothing else in the file referenced the removed local `handleBackdropClick`/`dialogRef`
declarations in a way that broke).

---

### Task 5: `GroupMatchSummarySheet` component

**Files:**

- Create: `apps/web/src/features/results/ui/GroupMatchSummarySheet.tsx`

**Interfaces:**

- Consumes: `MatrixMatch`, `GroupMatchDetail`, `GroupMatchDetailPrediction` (Task 1 & 2),
  `resolveGroupPredictionHitDisplay` (Task 3), `useDialogSheet` (Task 4), `HitChip` (existing),
  `PredictionStatsBar` (existing, exported from `ui/TodayMatchesFeed.tsx`), `Avatar`, `Icon`,
  `TeamBadge`, `cn` (existing, from `@/shared/ui`).
- Produces: `GroupMatchSummarySheet({ match, detail, onClose }: { match: MatrixMatch; detail:
GroupMatchDetail; onClose: () => void }): ReactElement` — consumed by Task 8's
  `ResultsPageClient` wiring.

No dedicated component test (no `.tsx` component tests exist in this app — see Task 4's note);
covered by Task 9's E2E flow.

- [ ] **Step 1: Implement the component**

Create `apps/web/src/features/results/ui/GroupMatchSummarySheet.tsx`:

```tsx
'use client';

import { Fragment } from 'react';
import type { ReactElement } from 'react';
import type { GroupMatchDetail, GroupMatchDetailPrediction, MatrixMatch } from '../domain/types';
import { resolveGroupPredictionHitDisplay } from './group-match-summary-utils';
import { HitChip } from './HitChip';
import { PredictionStatsBar } from './TodayMatchesFeed';
import { useDialogSheet } from './use-dialog-sheet';
import { Avatar, Icon, TeamBadge, cn } from '@/shared/ui';

type Props = {
  match: MatrixMatch;
  detail: GroupMatchDetail;
  onClose: () => void;
};

function formatDate(kickoff: string): string {
  return new Date(kickoff).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

function SheetHeader({
  match,
  onClose,
}: {
  match: MatrixMatch;
  onClose: () => void;
}): ReactElement {
  const hasScore = match.actualHome !== null && match.actualAway !== null;

  return (
    <div className="flex flex-col gap-2 p-[16px_18px_10px]">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-extrabold tracking-[0.1em] text-green-600 uppercase">
          Group {match.groupId}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          data-testid="group-match-summary-close"
          className="shrink-0 grid place-items-center w-8 h-8 rounded-full bg-surface-2 border-0 cursor-pointer"
        >
          <Icon name="close" size={15} color="var(--ink-muted)" />
        </button>
      </div>
      <div className="flex flex-col gap-2 min-w-0 w-fit mx-auto">
        <div className="flex items-center gap-2.5 flex-wrap justify-center">
          <span className="text-[14px] font-bold text-ink truncate">{match.homeTeamName}</span>
          <TeamBadge teamId={match.homeTeamId} size="md" />
          {hasScore ? (
            <span className="display tnum text-[32px] leading-none text-ink shrink-0">
              {match.actualHome}–{match.actualAway}
            </span>
          ) : (
            <span className="text-xs font-bold text-ink-muted shrink-0">vs</span>
          )}
          <TeamBadge teamId={match.awayTeamId} size="md" />
          <span className="text-[14px] font-bold text-ink truncate">{match.awayTeamName}</span>
        </div>
        {!hasScore && match.kickoff && (
          <span className="text-xs font-semibold text-ink-muted text-center">
            {formatDate(match.kickoff)}
          </span>
        )}
      </div>
    </div>
  );
}

function YourPickSection({ yourPick }: { yourPick: GroupMatchDetailPrediction }): ReactElement {
  const display = resolveGroupPredictionHitDisplay(yourPick);

  return (
    <div
      data-testid="group-match-summary-your-pick"
      className="mx-[18px] p-[12px_14px] rounded-[10px] bg-green-050 border border-green-300 flex items-center justify-between gap-2"
    >
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-[10.5px] font-extrabold tracking-[0.1em] text-green-700 uppercase">
          Your pick
        </span>
        <span className="text-[13px] font-bold text-ink tnum">
          {yourPick.predictedHome}–{yourPick.predictedAway}
        </span>
      </div>
      {display.kind === 'matchHit' ? (
        <HitChip hit={display.hit} points={yourPick.points} />
      ) : (
        <span className={cn('chip text-[11px] h-6', display.tone === 'red' && 'red')}>
          {display.label}
        </span>
      )}
    </div>
  );
}

function PoolPredictionSection({ detail }: { detail: GroupMatchDetail }): ReactElement {
  return (
    <div data-testid="group-match-summary-pool-bar" className="mx-[18px] flex flex-col gap-1.5">
      <span className="text-[10.5px] font-extrabold tracking-[0.1em] text-ink-muted uppercase">
        How the pool predicted it &middot; {detail.totalPredictions} picks
      </span>
      {detail.poolStats === null ? (
        <p className="text-[12.5px] text-ink-muted m-0">No picks yet.</p>
      ) : (
        <PredictionStatsBar stats={detail.poolStats} />
      )}
    </div>
  );
}

function PredictionRow({
  prediction,
  index,
}: {
  prediction: GroupMatchDetailPrediction;
  index: number;
}): ReactElement {
  const display = resolveGroupPredictionHitDisplay(prediction);
  const rowCellClass = cn(
    'flex items-center py-[10px]',
    index > 0 && 'border-t border-line-soft',
    prediction.isCurrentUser && 'bg-green-050',
  );

  return (
    <Fragment>
      <div
        data-testid={`group-match-summary-prediction-${prediction.userId}`}
        className={cn('gap-2.5 min-w-0 pl-[18px] pr-2', rowCellClass)}
      >
        <Avatar name={prediction.displayName} index={index} size={28} />
        <span className="text-[13px] font-bold text-ink truncate">
          {prediction.displayName}
          {prediction.isCurrentUser && (
            <span className="chip green h-4.5 ml-[7px] text-[9.5px] align-middle">YOU</span>
          )}
        </span>
      </div>
      <div
        className={cn(
          'gap-1.5 px-2 text-[12px] font-semibold text-ink-soft whitespace-nowrap tnum',
          rowCellClass,
        )}
      >
        {prediction.predictedHome !== null
          ? `${prediction.predictedHome}–${prediction.predictedAway}`
          : '—'}
      </div>
      <div className={cn('gap-2 justify-end pl-2 pr-[18px]', rowCellClass)}>
        {display.kind === 'matchHit' ? (
          <HitChip hit={display.hit} points={prediction.points} />
        ) : (
          <span className={cn('chip text-[11px] h-6', display.tone === 'red' && 'red')}>
            {display.label}
          </span>
        )}
      </div>
    </Fragment>
  );
}

export function GroupMatchSummarySheet({ match, detail, onClose }: Props): ReactElement {
  const yourPick = detail.predictions.find((p) => p.isCurrentUser) ?? null;
  const { dialogRef, handleBackdropClick } = useDialogSheet(onClose);

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      data-testid="group-match-summary-sheet"
      className={cn(
        'm-0 w-full max-w-none border-0 bg-transparent p-0 backdrop:bg-black/50',
        'fixed inset-x-0 top-auto bottom-0 max-h-[85vh]',
        'sm:inset-0 sm:top-1/2 sm:bottom-auto sm:m-auto sm:h-fit sm:max-w-[420px] sm:-translate-y-1/2',
      )}
    >
      <div className="rounded-t-cup-lg sm:rounded-cup-lg bg-surface overflow-y-auto max-h-[85vh] shadow-cup-sm flex flex-col gap-3.5 pb-4">
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden="true">
          <span className="w-9 h-1 rounded-full bg-line-strong" />
        </div>

        <SheetHeader match={match} onClose={() => dialogRef.current?.close()} />

        {yourPick !== null && yourPick.predictedHome !== null && (
          <YourPickSection yourPick={yourPick} />
        )}

        <PoolPredictionSection detail={detail} />

        {detail.insight !== null && (
          <p
            data-testid="group-match-summary-insight"
            className="mx-[18px] text-[12.5px] text-ink-soft m-0"
          >
            {detail.insight}
          </p>
        )}

        <div>
          <span className="block px-[18px] pb-1.5 text-[10.5px] font-extrabold tracking-[0.1em] text-ink-muted uppercase">
            All predictions
          </span>
          <div
            data-testid="group-match-summary-predictions"
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] border-t border-line-soft"
          >
            {detail.predictions.map((prediction, index) => (
              <PredictionRow key={prediction.userId} prediction={prediction} index={index} />
            ))}
          </div>
        </div>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

---

### Task 6: Wire `onOpenMatch` into `GroupMatchFeed`

**Files:**

- Modify: `apps/web/src/features/results/ui/GroupMatchFeed.tsx`

**Interfaces:**

- Consumes: nothing new (just adds a callback prop).
- Produces: `GroupMatchFeed` now requires `onOpenMatch: (matchId: string) => void` — consumed by
  Task 8's `ResultsPageClient`.

- [ ] **Step 1: Add the prop and wrap both match rows in buttons**

In `apps/web/src/features/results/ui/GroupMatchFeed.tsx`, replace:

```tsx
type Props = { group: GroupResultView };
```

with:

```tsx
type Props = { group: GroupResultView; onOpenMatch: (matchId: string) => void };
```

Replace the function signature and completed-matches block:

```tsx
export function GroupMatchFeed({ group }: Props): ReactElement {
```

with:

```tsx
export function GroupMatchFeed({ group, onOpenMatch }: Props): ReactElement {
```

Replace:

```tsx
{
  hasCompleted && (
    <div className="divide">
      {group.completedMatches.map((m) => (
        <div key={m.matchId}>
          <MatchScoreRow
            homeTeamId={m.homeTeamId}
            homeTeamName={m.homeTeamName}
            actualHome={m.actualHome}
            actualAway={m.actualAway}
            awayTeamId={m.awayTeamId}
            awayTeamName={m.awayTeamName}
          />
          <MatchFooter
            predictedHome={m.predictedHome}
            predictedAway={m.predictedAway}
            hit={m.hit}
            pointsAwarded={m.pointsAwarded}
            poolMatchStats={m.poolMatchStats}
          />
        </div>
      ))}
    </div>
  );
}
```

with:

```tsx
{
  hasCompleted && (
    <div className="divide">
      {group.completedMatches.map((m) => (
        <button
          key={m.matchId}
          type="button"
          onClick={() => onOpenMatch(m.matchId)}
          data-testid="group-match-row"
          className="w-full block text-left cursor-pointer bg-transparent border-0 p-0"
        >
          <MatchScoreRow
            homeTeamId={m.homeTeamId}
            homeTeamName={m.homeTeamName}
            actualHome={m.actualHome}
            actualAway={m.actualAway}
            awayTeamId={m.awayTeamId}
            awayTeamName={m.awayTeamName}
          />
          <MatchFooter
            predictedHome={m.predictedHome}
            predictedAway={m.predictedAway}
            hit={m.hit}
            pointsAwarded={m.pointsAwarded}
            poolMatchStats={m.poolMatchStats}
          />
        </button>
      ))}
    </div>
  );
}
```

Replace:

```tsx
{
  hasUpcoming && (
    <div className={cn('divide', hasCompleted && 'border-t border-line-soft')}>
      {allUpcoming.map((m) => (
        <UpcomingMatchRow key={m.matchId} match={m} />
      ))}
    </div>
  );
}
```

with:

```tsx
{
  hasUpcoming && (
    <div className={cn('divide', hasCompleted && 'border-t border-line-soft')}>
      {allUpcoming.map((m) => (
        <button
          key={m.matchId}
          type="button"
          onClick={() => onOpenMatch(m.matchId)}
          data-testid="group-match-row"
          className="w-full block text-left cursor-pointer bg-transparent border-0 p-0"
        >
          <UpcomingMatchRow match={m} />
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: errors at every call site that renders `<GroupMatchFeed>` without the new required
`onOpenMatch` prop (only `ResultsPageClient.tsx`, fixed in Task 8) — confirm the error is exactly
there and nowhere else.

---

### Task 7: Wire `onOpenMatch` into `TodayMatchesFeed`

**Files:**

- Modify: `apps/web/src/features/results/ui/TodayMatchesFeed.tsx`

**Interfaces:**

- Produces: `TodayMatchesFeed` now requires `onOpenMatch: (matchId: string) => void` — consumed by
  Task 8's `ResultsPageClient`.

- [ ] **Step 1: Add the prop and wrap the row in a button**

In `apps/web/src/features/results/ui/TodayMatchesFeed.tsx`, replace:

```tsx
type Props = { groups: GroupResultView[] };
```

with:

```tsx
type Props = { groups: GroupResultView[]; onOpenMatch: (matchId: string) => void };
```

Replace:

```tsx
export function TodayMatchesFeed({ groups }: Props): ReactElement | null {
```

with:

```tsx
export function TodayMatchesFeed({ groups, onOpenMatch }: Props): ReactElement | null {
```

Replace:

```tsx
<div className="divide">
  {allToday.map((m) => (
    <TodayMatchRow key={m.matchId} match={m} />
  ))}
</div>
```

with:

```tsx
<div className="divide">
  {allToday.map((m) => (
    <button
      key={m.matchId}
      type="button"
      onClick={() => onOpenMatch(m.matchId)}
      data-testid="today-match-row"
      className="w-full block text-left cursor-pointer bg-transparent border-0 p-0"
    >
      <TodayMatchRow match={m} />
    </button>
  ))}
</div>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: error at the `<TodayMatchesFeed>` call site in `ResultsPageClient.tsx` (missing
`onOpenMatch`), fixed in Task 8.

---

### Task 8: Wire everything together in `ResultsPageClient`

**Files:**

- Modify: `apps/web/src/features/results/ui/ResultsPageClient.tsx`

**Interfaces:**

- Consumes: `GroupMatchSummarySheet` (Task 5), `buildGroupMatchDetail` (Task 2), `MatrixMatch`
  (Task 1), `onOpenMatch` props on `GroupMatchFeed`/`TodayMatchesFeed` (Tasks 6 & 7).

- [ ] **Step 1: Add the imports**

In `apps/web/src/features/results/ui/ResultsPageClient.tsx`, replace:

```tsx
import { MatchSummarySheet } from './MatchSummarySheet';
import { buildKnockoutMatchDetail } from '../domain/knockout-match-detail';
```

with:

```tsx
import { MatchSummarySheet } from './MatchSummarySheet';
import { GroupMatchSummarySheet } from './GroupMatchSummarySheet';
import { buildKnockoutMatchDetail } from '../domain/knockout-match-detail';
import { buildGroupMatchDetail } from '../domain/group-match-detail';
```

- [ ] **Step 2: Add state and resolve the open group match**

Replace:

```tsx
const [activeTab, setActiveTab] = useState<Tab>(initialTab);
const [openMatchKey, setOpenMatchKey] = useState<string | null>(null);
```

with:

```tsx
const [activeTab, setActiveTab] = useState<Tab>(initialTab);
const [openMatchKey, setOpenMatchKey] = useState<string | null>(null);
const [openGroupMatchId, setOpenGroupMatchId] = useState<string | null>(null);
```

Add, right after the existing `openMatchType` computation block (after the `const openMatchType:
'final' | 'bronze' | null = ...` statement, before `function jumpToGroup`):

```tsx
const openGroupMatch =
  view.pointsRaceView.matrixMatches.find((m) => m.matchId === openGroupMatchId) ?? null;
```

- [ ] **Step 3: Pass `onOpenMatch` to the group-tab feeds**

Replace:

```tsx
<TodayMatchesFeed groups={view.groupResults} />
```

with:

```tsx
<TodayMatchesFeed groups={view.groupResults} onOpenMatch={setOpenGroupMatchId} />
```

Replace:

```tsx
<GroupMatchFeed group={group} />
```

with:

```tsx
<GroupMatchFeed group={group} onOpenMatch={setOpenGroupMatchId} />
```

- [ ] **Step 4: Render the sheet**

Replace:

```tsx
      {openMatch && (
        <MatchSummarySheet
          match={openMatch}
          matchKey={openMatchType}
          detail={buildKnockoutMatchDetail(openMatch, view.pointsRaceView.knockoutMatrix)}
          onClose={() => setOpenMatchKey(null)}
        />
      )}
    </div>
  );
}
```

with:

```tsx
      {openMatch && (
        <MatchSummarySheet
          match={openMatch}
          matchKey={openMatchType}
          detail={buildKnockoutMatchDetail(openMatch, view.pointsRaceView.knockoutMatrix)}
          onClose={() => setOpenMatchKey(null)}
        />
      )}

      {openGroupMatch && (
        <GroupMatchSummarySheet
          match={openGroupMatch}
          detail={buildGroupMatchDetail(openGroupMatch, view.pointsRaceView.matchMatrix)}
          onClose={() => setOpenGroupMatchId(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck and run the full test suite**

Run: `pnpm typecheck && pnpm test`
Expected: no errors, all tests pass.

---

### Task 9: E2E coverage for the group match summary flow

**Files:**

- Modify: `apps/web/e2e/results.spec.ts`

- [ ] **Step 1: Confirm the seeded fixture's default results tab**

The seeded e2e pool (`e2e-seeded-owner`) has a fully completed tournament, so
`ResultsPageClient`'s default tab resolves to `'knockout'`, not `'group'` (see
`apps/web/src/app/(authenticated)/pools/[id]/results/page.tsx`: `defaultTab = view.currentStage
!== 'group' ? 'knockout' : 'group'`). The new test must explicitly click the group tab first.

- [ ] **Step 2: Add the test**

In `apps/web/e2e/results.spec.ts`, add after the existing `'tapping the Final result card opens
the match summary sheet...'` test:

```ts
test('tapping a group match row opens the group match summary sheet with pool predictions', async ({
  page,
}) => {
  await page.goto('/login/e2e-seeded-owner');
  await page.waitForURL('**/pools');
  await page.goto(`/pools/${fixtureIds.seededPoolId}/results`);

  await page.locator('[data-testid="results-tab-group"]').click();
  const matchRow = page.locator('[data-testid="group-match-row"]').first();
  await matchRow.click();

  const sheet = page.locator('[data-testid="group-match-summary-sheet"]');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-testid="group-match-summary-pool-bar"]')).toBeVisible();
  await expect(sheet.locator('[data-testid="group-match-summary-predictions"]')).toBeVisible();

  await sheet.locator('[data-testid="group-match-summary-close"]').click();
  await expect(sheet).not.toBeVisible();
});
```

- [ ] **Step 3: Run the E2E suite**

Run: `pnpm e2e`
Expected: PASS, including the new test and the pre-existing ones (confirms the `MatchSummarySheet`
refactor in Task 4 didn't regress the knockout flow).

---

### Task 10: Final verification and the single feature commit

**Files:** none (verification + commit only)

- [ ] **Step 1: Full verification sweep**

Run, in order, fixing anything that fails before moving on:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm e2e
```

Expected: all four pass clean.

- [ ] **Step 2: Review the full diff**

Run: `git status` and `git diff` (plus `git diff --stat` for an overview). Confirm the changed
file set matches this plan: `domain/types.ts`, `application/build-race-view.ts`,
`domain/group-match-detail.ts` (+ test), `ui/group-match-summary-utils.ts` (+ test),
`ui/use-dialog-sheet.ts`, `ui/MatchSummarySheet.tsx`, `ui/GroupMatchSummarySheet.tsx`,
`ui/GroupMatchFeed.tsx`, `ui/TodayMatchesFeed.tsx`, `ui/ResultsPageClient.tsx`,
`application/get-results-view.test.ts`, `e2e/results.spec.ts`, plus the two new docs files
(`docs/superpowers/specs/2026-07-19-group-match-summary-design.md` and
`docs/superpowers/plans/2026-07-19-group-match-summary.md`).

- [ ] **Step 3: Single commit**

```bash
git add apps/web/src/features/results apps/web/e2e/results.spec.ts \
  docs/superpowers/specs/2026-07-19-group-match-summary-design.md \
  docs/superpowers/plans/2026-07-19-group-match-summary.md
git commit -m "$(cat <<'EOF'
feat(results): add group stage match summary sheet

Tapping any group-stage match (completed, today, or upcoming) now opens
the same kind of detail sheet the knockout tab already has — your
predicted score, the pool's home/draw/away split, an adaptive insight
line, and every member's prediction — reusing the existing matchMatrix
data client-side rather than adding new server/engine calls.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git status
```

Expected: clean working tree after commit, one new commit on top of `main`.

## Self-Review Notes

- **Spec coverage:** every section of `2026-07-19-group-match-summary-design.md` maps to a task —
  data model (Task 1), domain selector (Task 2), UI util (Task 3), shared dialog hook + sheet
  (Tasks 4–5), trigger wiring (Tasks 6–8), testing (Tasks 1–3 unit/integration, Task 9 E2E).
- **Type consistency checked:** `GroupMatchDetailPrediction`/`GroupMatchDetail` (Task 2) match
  the fields `GroupMatchSummarySheet` (Task 5) and `group-match-summary-utils.ts` (Task 3) read;
  `MatrixMatch.groupId` (Task 1) is what `SheetHeader` (Task 5) renders; `onOpenMatch` signature
  (`(matchId: string) => void`) is identical across `GroupMatchFeed`, `TodayMatchesFeed`, and
  `ResultsPageClient`.
- **One-commit constraint:** every task above stages files but only Task 10 runs `git commit`,
  per CLAUDE.md's "one commit per feature" rule — a deliberate deviation from this skill's usual
  per-task commit step.
