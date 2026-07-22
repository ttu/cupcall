# Archive Pool Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three new pool-archive statistics (a blended prediction-accuracy percentage,
group-stage/knockout-stage point leaders) and fix "Biggest riser" to ignore noisy group-stage swings,
per `docs/superpowers/specs/2026-07-20-archive-pool-statistics-design.md`.

**Architecture:** Extend `packages/engine`'s scoring functions to expose `{hits, attempted}` detail
alongside the existing point totals (one comparison, two views — points and hit-counts can never
disagree). The pool-archive feature reuses that detail per member (assembling each member's
`CardInputs` the same way `rescoreCard` already does) to compute a pool-wide accuracy percentage, and
freezes it plus two new stage-leader fields into the existing `PoolArchiveRecap` jsonb blob at
archive time — no DB migration needed.

**Tech Stack:** TypeScript strict, Vitest, Drizzle + pglite (`@cup/db/testing`), Next.js/React
(pool-archive UI).

## Global Constraints

- **Commit at the end of every task** (overrides this repo's usual "one commit per feature" norm —
  explicitly decided for this execution pass so subagent-driven-development's standard per-task
  commit behavior applies cleanly; squashing to fewer commits, if desired, is a separate decision
  made later, during `finishing-a-development-branch`).
- TDD: write the failing test first, watch it fail, write minimal code, watch it pass, refactor if
  needed — for every new function in every task.
- Follow each file's existing test conventions exactly (the `miniTournament`/`miniScoring` fixtures,
  the `makeInputs`/`makeDerived`/`makeActual` helpers already declared at the top of each test file).
  Add to those files — do not redeclare the helpers.
- Run `npx vitest run <file>` after each step (this repo's root `vitest.config.ts` resolves `@cup/*`
  workspace aliases, so this works from the repo root without `cd`).
- Before each of the two commits: run `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`
  and confirm everything is green.
- No DB schema migration in this plan — `PoolArchiveRecap` is a `jsonb` column
  (`packages/db/src/schema/pool-archive.ts`), so new fields are just TypeScript type additions.
- After commit 2, the production WC2026 pool's frozen archive still needs re-archiving (owner-only
  UI action, idempotent) — that's a manual step for the user, not part of this plan.

---

## Task 1: Engine — `CategoryAccuracy`/`AccuracyBreakdown` types + `scoreGroupMatches` detail

**Files:**

- Modify: `packages/engine/src/types.ts` (add types, end of file)
- Modify: `packages/engine/src/scoring/group-matches.ts`
- Test: `packages/engine/src/scoring/group-matches.test.ts`

**Interfaces:**

- Produces: `CategoryAccuracy = { hits: number; attempted: number }`, exported from
  `packages/engine/src/types.ts`. `scoreGroupMatchesDetail(inputs: CardInputs, actual:
ActualResults): CategoryAccuracy`, exported from `packages/engine/src/scoring/group-matches.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/src/scoring/group-matches.test.ts` (add `scoreGroupMatchesDetail` to the
existing import line, then add a new `describe` block at the end of the file):

```ts
import { describe, it, expect } from 'vitest';
import { matchId } from '../brand.js';
import { miniScoring } from '../__fixtures__/mini-tournament.js';
import type { CardInputs, ActualResults } from '../types.js';
import { scoreGroupMatches, scoreGroupMatchesDetail } from './group-matches.js';
```

```ts
describe('scoreGroupMatchesDetail', () => {
  it('exact score → 1 hit of 1 attempted', () => {
    const inputs = makeInputs([{ matchId: matchId('mA1'), home: 2, away: 1 }]);
    const actual = makeActual([{ matchId: matchId('mA1'), home: 2, away: 1 }]);
    expect(scoreGroupMatchesDetail(inputs, actual)).toEqual({ hits: 1, attempted: 1 });
  });

  it('correct outcome only still counts as a hit (any credit counts as correct)', () => {
    const inputs = makeInputs([{ matchId: matchId('mA1'), home: 1, away: 0 }]);
    const actual = makeActual([{ matchId: matchId('mA1'), home: 3, away: 1 }]);
    expect(scoreGroupMatchesDetail(inputs, actual)).toEqual({ hits: 1, attempted: 1 });
  });

  it('wrong prediction → 0 hits of 1 attempted', () => {
    const inputs = makeInputs([{ matchId: matchId('mA1'), home: 2, away: 0 }]);
    const actual = makeActual([{ matchId: matchId('mA1'), home: 0, away: 1 }]);
    expect(scoreGroupMatchesDetail(inputs, actual)).toEqual({ hits: 0, attempted: 1 });
  });

  it('unpredicted match → not attempted', () => {
    const inputs = makeInputs([]);
    const actual = makeActual([{ matchId: matchId('mA1'), home: 2, away: 1 }]);
    expect(scoreGroupMatchesDetail(inputs, actual)).toEqual({ hits: 0, attempted: 0 });
  });

  it('multi-match: exact + outcome + wrong + unpredicted → 2 hits of 3 attempted', () => {
    const inputs = makeInputs([
      { matchId: matchId('mA1'), home: 2, away: 0 }, // exact
      { matchId: matchId('mA2'), home: 1, away: 0 }, // outcome only
      { matchId: matchId('mA3'), home: 2, away: 0 }, // wrong
      // mA4 not predicted
    ]);
    const actual = makeActual([
      { matchId: matchId('mA1'), home: 2, away: 0 },
      { matchId: matchId('mA2'), home: 3, away: 1 },
      { matchId: matchId('mA3'), home: 1, away: 1 },
      { matchId: matchId('mA4'), home: 1, away: 0 },
    ]);
    expect(scoreGroupMatchesDetail(inputs, actual)).toEqual({ hits: 2, attempted: 3 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/src/scoring/group-matches.test.ts`
Expected: FAIL — `scoreGroupMatchesDetail` is not exported from `./group-matches.js`.

- [ ] **Step 3: Add the types**

Append to the end of `packages/engine/src/types.ts`:

```ts
export interface CategoryAccuracy {
  hits: number;
  attempted: number;
}

export interface AccuracyBreakdown {
  groupMatches: CategoryAccuracy;
  groupOrder: CategoryAccuracy;
  bronze: CategoryAccuracy;
  final: CategoryAccuracy;
  roundOf16: CategoryAccuracy;
  roundOf8: CategoryAccuracy;
  topFourTeams: CategoryAccuracy;
  topFourPosition: CategoryAccuracy;
  specials: CategoryAccuracy;
  total: CategoryAccuracy;
}
```

- [ ] **Step 4: Refactor `group-matches.ts` to extract the shared classification + add the detail function**

Replace the full contents of `packages/engine/src/scoring/group-matches.ts` with:

```ts
import type { CardInputs, ActualResults, CategoryAccuracy, Scoring } from '../types.js';
import type { Points } from '../brand.js';
import { points } from '../brand.js';

function outcome(home: number, away: number): 'home' | 'draw' | 'away' {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'draw';
}

function classifyGroupMatch(
  predicted: { home: number; away: number },
  result: { home: number; away: number },
): 'exact' | 'outcome' | 'miss' {
  if (predicted.home === result.home && predicted.away === result.away) return 'exact';
  if (outcome(predicted.home, predicted.away) === outcome(result.home, result.away)) {
    return 'outcome';
  }
  return 'miss';
}

export function scoreGroupMatches(
  inputs: CardInputs,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  let total = 0;

  for (const result of actual.matchResults) {
    const predicted = inputs.groupScores.find((g) => g.matchId === result.matchId);
    if (predicted === undefined) continue;

    const classification = classifyGroupMatch(predicted, result);
    if (classification === 'exact') total += scoring.groupMatch.exactScore;
    else if (classification === 'outcome') total += scoring.groupMatch.correctOutcome;
  }

  return points(total);
}

export function scoreGroupMatchesDetail(
  inputs: CardInputs,
  actual: ActualResults,
): CategoryAccuracy {
  let hits = 0;
  let attempted = 0;

  for (const result of actual.matchResults) {
    const predicted = inputs.groupScores.find((g) => g.matchId === result.matchId);
    if (predicted === undefined) continue;

    attempted++;
    if (classifyGroupMatch(predicted, result) !== 'miss') hits++;
  }

  return { hits, attempted };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run packages/engine/src/scoring/group-matches.test.ts`
Expected: PASS, all tests (existing `scoreGroupMatches` tests + new `scoreGroupMatchesDetail` tests).

---

## Task 2: Engine — `scoreGroupOrder` detail

**Files:**

- Modify: `packages/engine/src/scoring/group-order.ts`
- Test: `packages/engine/src/scoring/group-order.test.ts`

**Interfaces:**

- Consumes: `CategoryAccuracy` from Task 1.
- Produces: `scoreGroupOrderDetail(derived: DerivedCard, actual: ActualResults): CategoryAccuracy`.

- [ ] **Step 1: Write the failing tests**

Add `scoreGroupOrderDetail` to the existing import in
`packages/engine/src/scoring/group-order.test.ts`:

```ts
import { scoreGroupOrder, scoreGroupOrderDetail } from './group-order.js';
```

Append a new `describe` block at the end of the file:

```ts
describe('scoreGroupOrderDetail', () => {
  it('all 4 positions correct → 4 hits of 4 attempted', () => {
    const derived = makeDerived({ [gA]: [A1, A2, A3, A4] });
    const actual = makeActual({ [gA]: [A1, A2, A3, A4] });
    expect(scoreGroupOrderDetail(derived, actual)).toEqual({ hits: 4, attempted: 4 });
  });

  it('2 positions correct → 2 hits of 4 attempted', () => {
    const derived = makeDerived({ [gA]: [A1, A2, A3, A4] });
    const actual = makeActual({ [gA]: [A1, A3, A2, A4] });
    expect(scoreGroupOrderDetail(derived, actual)).toEqual({ hits: 2, attempted: 4 });
  });

  it('group absent from actual → not attempted', () => {
    const derived = makeDerived({ [gA]: [A1, A2, A3, A4] });
    const actual = makeActual({});
    expect(scoreGroupOrderDetail(derived, actual)).toEqual({ hits: 0, attempted: 0 });
  });

  it('multi-group sums across groups', () => {
    const derived = makeDerived({
      [gA]: [A1, A2, A3, A4], // 4 correct
      [gB]: [B1, B2, B3, B4], // 2 correct (B1, B4)
    });
    const actual = makeActual({
      [gA]: [A1, A2, A3, A4],
      [gB]: [B1, B3, B2, B4],
    });
    expect(scoreGroupOrderDetail(derived, actual)).toEqual({ hits: 6, attempted: 8 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/src/scoring/group-order.test.ts`
Expected: FAIL — `scoreGroupOrderDetail` is not exported.

- [ ] **Step 3: Refactor `group-order.ts`**

Replace the full contents of `packages/engine/src/scoring/group-order.ts` with:

```ts
import type { DerivedCard, ActualResults, CategoryAccuracy, Scoring } from '../types.js';
import type { Points, GroupId, TeamId } from '../brand.js';
import { points } from '../brand.js';

function groupOrderPoints(positionsCorrect: number, scoring: Scoring): number {
  switch (positionsCorrect) {
    case 4:
      return scoring.groupOrder.allCorrect;
    case 2:
      return scoring.groupOrder.twoCorrect;
    case 1:
      return scoring.groupOrder.oneCorrect;
    default:
      return 0;
  }
}

function countPositionsCorrect(derivedOrder: TeamId[], actualOrder: TeamId[]): number {
  let positionsCorrect = 0;
  for (let i = 0; i < derivedOrder.length; i++) {
    if (derivedOrder[i] === actualOrder[i]) positionsCorrect++;
  }
  return positionsCorrect;
}

export function scoreGroupOrder(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  let total = 0;

  for (const groupIdKey of Object.keys(derived.groupOrders) as GroupId[]) {
    const actualOrder = actual.groupOrder[groupIdKey];
    const derivedOrder = derived.groupOrders[groupIdKey];
    if (actualOrder === undefined || derivedOrder === undefined) continue;

    total += groupOrderPoints(countPositionsCorrect(derivedOrder, actualOrder), scoring);
  }

  return points(total);
}

export function scoreGroupOrderDetail(
  derived: DerivedCard,
  actual: ActualResults,
): CategoryAccuracy {
  let hits = 0;
  let attempted = 0;

  for (const groupIdKey of Object.keys(derived.groupOrders) as GroupId[]) {
    const actualOrder = actual.groupOrder[groupIdKey];
    const derivedOrder = derived.groupOrders[groupIdKey];
    if (actualOrder === undefined || derivedOrder === undefined) continue;

    attempted += derivedOrder.length;
    hits += countPositionsCorrect(derivedOrder, actualOrder);
  }

  return { hits, attempted };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/src/scoring/group-order.test.ts`
Expected: PASS, all tests.

---

## Task 3: Engine — `scoreBronze`/`scoreFinal` detail

**Files:**

- Modify: `packages/engine/src/scoring/finish-matches.ts`
- Test: `packages/engine/src/scoring/finish-matches.test.ts`

**Interfaces:**

- Consumes: `CategoryAccuracy` from Task 1.
- Produces: `scoreBronzeDetail(inputs: CardInputs, derived: DerivedCard, actual: ActualResults):
CategoryAccuracy`, `scoreFinalDetail(inputs: CardInputs, derived: DerivedCard, actual:
ActualResults): CategoryAccuracy`.

- [ ] **Step 1: Write the failing tests**

Add `scoreBronzeDetail, scoreFinalDetail` to the existing import in
`packages/engine/src/scoring/finish-matches.test.ts`:

```ts
import { scoreBronze, scoreFinal, scoreBronzeDetail, scoreFinalDetail } from './finish-matches.js';
```

Append a new `describe` block at the end of the file:

```ts
describe('scoreFinalDetail', () => {
  it('both teams correct + exact score → 3 hits of 3 attempted (2 team + 1 exact)', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs({ home: 3, away: 2, homeTeamId: A1, awayTeamId: A2 });
    const actual = makeActual({
      finalMatch: { home: A1, away: A2, homeGoals: 3, awayGoals: 2, winner: A1 },
    });
    expect(scoreFinalDetail(inputs, derived, actual)).toEqual({ hits: 3, attempted: 3 });
  });

  it('both teams correct, wrong score → 2 hits of 3 attempted', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs({ home: 1, away: 0, homeTeamId: A1, awayTeamId: A2 });
    const actual = makeActual({
      finalMatch: { home: A1, away: A2, homeGoals: 3, awayGoals: 2, winner: A1 },
    });
    expect(scoreFinalDetail(inputs, derived, actual)).toEqual({ hits: 2, attempted: 3 });
  });

  it('finishScores.final absent → exact score not attempted, teams still attempted', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs();
    const actual = makeActual({
      finalMatch: { home: A1, away: A2, homeGoals: 3, awayGoals: 2, winner: A1 },
    });
    expect(scoreFinalDetail(inputs, derived, actual)).toEqual({ hits: 2, attempted: 2 });
  });

  it('actual finalMatch absent, no SF confirmation → nothing attempted', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs({ home: 3, away: 2 });
    const actual = makeActual({});
    expect(scoreFinalDetail(inputs, derived, actual)).toEqual({ hits: 0, attempted: 0 });
  });

  it('one predicted finalist confirmed via SF completion, final unplayed → 1 hit of 2 attempted', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs();
    const actual = makeActual({ finalists: [A1] });
    expect(scoreFinalDetail(inputs, derived, actual)).toEqual({ hits: 1, attempted: 2 });
  });
});

describe('scoreBronzeDetail', () => {
  it('both teams correct + exact score → 3 hits of 3 attempted', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs(undefined, { home: 1, away: 0, homeTeamId: B1, awayTeamId: B2 });
    const actual = makeActual({
      bronzeMatch: { home: B1, away: B2, homeGoals: 1, awayGoals: 0, winner: B1 },
    });
    expect(scoreBronzeDetail(inputs, derived, actual)).toEqual({ hits: 3, attempted: 3 });
  });

  it('actual bronzeMatch absent → nothing attempted', () => {
    const derived = makeDerived([A1, A2], [B1, B2]);
    const inputs = makeInputs(undefined, { home: 1, away: 0, homeTeamId: B1, awayTeamId: B2 });
    const actual = makeActual({});
    expect(scoreBronzeDetail(inputs, derived, actual)).toEqual({ hits: 0, attempted: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/src/scoring/finish-matches.test.ts`
Expected: FAIL — `scoreBronzeDetail`/`scoreFinalDetail` not exported.

- [ ] **Step 3: Refactor `finish-matches.ts`**

Replace the full contents of `packages/engine/src/scoring/finish-matches.ts` with:

```ts
import type {
  CardInputs,
  DerivedCard,
  ActualResults,
  Scoring,
  ActualFinishMatch,
  FinishScore,
  CategoryAccuracy,
} from '../types.js';
import type { Points, TeamId } from '../brand.js';
import { points } from '../brand.js';

/**
 * Award exactScore iff finishScore has a team-id snapshot AND each team's predicted goals match
 * its actual goals. Without a snapshot (predicted finalists/bronze pair not yet resolved when
 * the score was saved) there's no way to know which team each goal count belongs to, so no
 * exact-score points are awarded.
 */
function exactScorePoints(
  finishScore: FinishScore | undefined,
  actualMatch: ActualFinishMatch | undefined,
  exactScore: number,
): number {
  if (
    finishScore === undefined ||
    actualMatch === undefined ||
    finishScore.homeTeamId == null ||
    finishScore.awayTeamId == null
  ) {
    return 0;
  }

  const predictedByTeam = new Map<TeamId, number>([
    [finishScore.homeTeamId, finishScore.home],
    [finishScore.awayTeamId, finishScore.away],
  ]);
  return predictedByTeam.get(actualMatch.home) === actualMatch.homeGoals &&
    predictedByTeam.get(actualMatch.away) === actualMatch.awayGoals
    ? exactScore
    : 0;
}

/** attempted=1 iff the user made this prediction and the match is decided; hit iff exact. */
function exactScoreDetail(
  finishScore: FinishScore | undefined,
  actualMatch: ActualFinishMatch | undefined,
): CategoryAccuracy {
  if (finishScore === undefined || actualMatch === undefined) return { hits: 0, attempted: 0 };
  return { hits: exactScorePoints(finishScore, actualMatch, 1), attempted: 1 };
}

function scoreFinishMatchDetail(
  derivedPair: TeamId[],
  actualMatch: ActualFinishMatch | undefined,
): CategoryAccuracy {
  if (actualMatch === undefined) return { hits: 0, attempted: 0 };
  const actualTeams = new Set<TeamId>([actualMatch.home, actualMatch.away]);
  return {
    hits: derivedPair.filter((t) => actualTeams.has(t)).length,
    attempted: derivedPair.length,
  };
}

function scoreFinalTeamDetail(derived: DerivedCard, actual: ActualResults): CategoryAccuracy {
  // Confirmed finalists = SF winners (banked as each SF completes) plus, once the final is
  // played, its two participants (defensive: covers explicit finalMatch without answers).
  const confirmed = new Set<TeamId>(actual.answers.finalists ?? []);
  if (actual.finalMatch !== undefined) {
    confirmed.add(actual.finalMatch.home);
    confirmed.add(actual.finalMatch.away);
  }
  if (confirmed.size === 0) return { hits: 0, attempted: 0 };
  return {
    hits: derived.finalists.filter((t) => confirmed.has(t)).length,
    attempted: derived.finalists.length,
  };
}

export function scoreBronze(
  inputs: CardInputs,
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  const team = scoreFinishMatchDetail(derived.bronzePair, actual.bronzeMatch);
  const exactPoints = exactScorePoints(
    inputs.finishScores.bronze,
    actual.bronzeMatch,
    scoring.bronze.exactScore,
  );
  return points(team.hits * scoring.bronze.perTeam + exactPoints);
}

export function scoreFinal(
  inputs: CardInputs,
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  const team = scoreFinalTeamDetail(derived, actual);
  const exactPoints = exactScorePoints(
    inputs.finishScores.final,
    actual.finalMatch,
    scoring.final.exactScore,
  );
  return points(team.hits * scoring.final.perTeam + exactPoints);
}

function sum(a: CategoryAccuracy, b: CategoryAccuracy): CategoryAccuracy {
  return { hits: a.hits + b.hits, attempted: a.attempted + b.attempted };
}

export function scoreBronzeDetail(
  inputs: CardInputs,
  derived: DerivedCard,
  actual: ActualResults,
): CategoryAccuracy {
  return sum(
    scoreFinishMatchDetail(derived.bronzePair, actual.bronzeMatch),
    exactScoreDetail(inputs.finishScores.bronze, actual.bronzeMatch),
  );
}

export function scoreFinalDetail(
  inputs: CardInputs,
  derived: DerivedCard,
  actual: ActualResults,
): CategoryAccuracy {
  return sum(
    scoreFinalTeamDetail(derived, actual),
    exactScoreDetail(inputs.finishScores.final, actual.finalMatch),
  );
}
```

Note: `exactScorePoints(finishScore, actualMatch, 1)` returns `0 | 1`, reused directly as the `hits`
count in `exactScoreDetail` — same comparison, no duplication.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/src/scoring/finish-matches.test.ts`
Expected: PASS, all tests (existing `scoreBronze`/`scoreFinal` tests must still pass unchanged).

---

## Task 4: Engine — `scoreRoundOf16`/`scoreRoundOf8`/`scoreTopFourTeams`/`scoreTopFourPosition` detail

**Files:**

- Modify: `packages/engine/src/scoring/sets-rankings.ts`
- Test: `packages/engine/src/scoring/sets-rankings.test.ts`

**Interfaces:**

- Consumes: `CategoryAccuracy` from Task 1.
- Produces: `scoreRoundOf16Detail`, `scoreRoundOf8Detail`, `scoreTopFourTeamsDetail`,
  `scoreTopFourPositionDetail` — all `(derived: DerivedCard, actual: ActualResults) =>
CategoryAccuracy`.

- [ ] **Step 1: Write the failing tests**

Add the four detail functions to the existing import in
`packages/engine/src/scoring/sets-rankings.test.ts`:

```ts
import {
  scoreRoundOf16,
  scoreRoundOf8,
  scoreTopFour,
  scoreRoundOf16Detail,
  scoreRoundOf8Detail,
  scoreTopFourTeamsDetail,
  scoreTopFourPositionDetail,
} from './sets-rankings.js';
```

Append new `describe` blocks at the end of the file:

```ts
describe('scoreRoundOf16Detail', () => {
  it('12 of 16 correct → 12 hits of 16 attempted', () => {
    const r16 = [
      A1,
      A2,
      A3,
      A4,
      B1,
      B2,
      B3,
      B4,
      teamId('C1'),
      teamId('C2'),
      teamId('C3'),
      teamId('C4'),
      teamId('D1'),
      teamId('D2'),
      teamId('D3'),
      teamId('D4'),
    ];
    const actual16 = [
      A1,
      A2,
      A3,
      A4,
      B1,
      B2,
      B3,
      B4,
      teamId('C1'),
      teamId('C2'),
      teamId('C3'),
      teamId('C4'),
      teamId('E1'),
      teamId('E2'),
      teamId('E3'),
      teamId('E4'),
    ];
    const derived = makeDerived([], [], r16);
    const actual = makeActual({ roundOf16: actual16 });
    expect(scoreRoundOf16Detail(derived, actual)).toEqual({ hits: 12, attempted: 16 });
  });

  it('absent actual roundOf16 → not attempted', () => {
    const derived = makeDerived([], [], [A1, A2]);
    const actual = makeActual({});
    expect(scoreRoundOf16Detail(derived, actual)).toEqual({ hits: 0, attempted: 0 });
  });
});

describe('scoreRoundOf8Detail', () => {
  it('6 of 8 correct → 6 hits of 8 attempted', () => {
    const derived = makeDerived([A1, A2, A3, A4, B1, B2, B3, B4], []);
    const actual = makeActual({ roundOf8: [A1, A2, A3, A4, B1, B2, teamId('C1'), teamId('C2')] });
    expect(scoreRoundOf8Detail(derived, actual)).toEqual({ hits: 6, attempted: 8 });
  });
});

describe('scoreTopFourTeamsDetail', () => {
  it('2 of 4 predicted teams confirmed → 2 hits of 4 attempted', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const actual = makeActual({ roundOf4: [ARG, FRA, teamId('X1'), teamId('X2')] });
    expect(scoreTopFourTeamsDetail(derived, actual)).toEqual({ hits: 2, attempted: 4 });
  });

  it('absent actual roundOf4 → not attempted', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR]);
    const actual = makeActual({});
    expect(scoreTopFourTeamsDetail(derived, actual)).toEqual({ hits: 0, attempted: 0 });
  });
});

describe('scoreTopFourPositionDetail', () => {
  it('all 4 slots correct when Final and Bronze both resolve as predicted → 4 hits of 4 attempted', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR], [], [ARG, FRA, NED, POR]);
    const actual = makeActual({
      roundOf4: [ARG, FRA, NED, POR],
      finalMatch: { home: ARG, away: FRA, homeGoals: 2, awayGoals: 1, winner: ARG },
      bronzeMatch: { home: NED, away: POR, homeGoals: 1, awayGoals: 0, winner: NED },
    });
    expect(scoreTopFourPositionDetail(derived, actual)).toEqual({ hits: 4, attempted: 4 });
  });

  it('Final slots swapped → 0 hits of 2 attempted (Bronze not played)', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR], [], [ARG, FRA, NED, POR]);
    const actual = makeActual({
      roundOf4: [ARG, FRA, NED, POR],
      finalMatch: { home: ARG, away: FRA, homeGoals: 1, awayGoals: 2, winner: FRA },
    });
    expect(scoreTopFourPositionDetail(derived, actual)).toEqual({ hits: 0, attempted: 2 });
  });

  it('no Final/Bronze picks made → not attempted even once both matches resolve', () => {
    const derived = makeDerived([], [ARG, FRA, NED, POR], [], []); // no topFour picks
    const actual = makeActual({
      roundOf4: [ARG, FRA, NED, POR],
      finalMatch: { home: ARG, away: FRA, homeGoals: 2, awayGoals: 1, winner: ARG },
      bronzeMatch: { home: NED, away: POR, homeGoals: 1, awayGoals: 0, winner: NED },
    });
    expect(scoreTopFourPositionDetail(derived, actual)).toEqual({ hits: 0, attempted: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/src/scoring/sets-rankings.test.ts`
Expected: FAIL — the four detail functions are not exported.

- [ ] **Step 3: Refactor `sets-rankings.ts`**

Replace the full contents of `packages/engine/src/scoring/sets-rankings.ts` with:

```ts
import type { DerivedCard, ActualResults, CategoryAccuracy, Scoring } from '../types.js';
import type { Points, TeamId } from '../brand.js';
import { points } from '../brand.js';

function setMembershipDetail(
  predicted: TeamId[],
  actualSet: TeamId[] | undefined,
): CategoryAccuracy {
  if (actualSet === undefined) return { hits: 0, attempted: 0 };
  const set = new Set(actualSet);
  return { hits: predicted.filter((t) => set.has(t)).length, attempted: predicted.length };
}

export function scoreRoundOf16Detail(
  derived: DerivedCard,
  actual: ActualResults,
): CategoryAccuracy {
  return setMembershipDetail(derived.roundOf16, actual.answers.roundOf16);
}

export function scoreRoundOf8Detail(derived: DerivedCard, actual: ActualResults): CategoryAccuracy {
  return setMembershipDetail(derived.roundOf8, actual.answers.roundOf8);
}

export function scoreTopFourTeamsDetail(
  derived: DerivedCard,
  actual: ActualResults,
): CategoryAccuracy {
  return setMembershipDetail(derived.roundOf4, actual.answers.roundOf4);
}

/**
 * 4 independent atomic predictions (final winner/loser slot, bronze winner/loser slot), each
 * attempted only once the player has made Final/Bronze picks (derived.topFour fully populated —
 * it's all 4 or none, see DerivedCard.topFour) AND that match is decided.
 */
export function scoreTopFourPositionDetail(
  derived: DerivedCard,
  actual: ActualResults,
): CategoryAccuracy {
  const hasPicks = derived.topFour.length === 4;
  const [predictedFinalWinner, predictedFinalLoser, predictedBronzeWinner, predictedBronzeLoser] =
    derived.topFour;
  let hits = 0;
  let attempted = 0;

  if (hasPicks && actual.finalMatch !== undefined) {
    const { home, away, winner } = actual.finalMatch;
    const loser = winner === home ? away : home;
    attempted += 2;
    if (predictedFinalWinner === winner) hits++;
    if (predictedFinalLoser === loser) hits++;
  }

  if (hasPicks && actual.bronzeMatch !== undefined) {
    const { home, away, winner } = actual.bronzeMatch;
    const loser = winner === home ? away : home;
    attempted += 2;
    if (predictedBronzeWinner === winner) hits++;
    if (predictedBronzeLoser === loser) hits++;
  }

  return { hits, attempted };
}

export function scoreRoundOf16(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  return points(scoreRoundOf16Detail(derived, actual).hits * scoring.roundOf16PerTeam);
}

export function scoreRoundOf8(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  return points(scoreRoundOf8Detail(derived, actual).hits * scoring.roundOf8PerTeam);
}

export function scoreTopFour(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  return points(
    scoreTopFourTeams(derived, actual, scoring) + scoreTopFourPosition(derived, actual, scoring),
  );
}

/** Correct top-4 (semifinalist) team predictions, set membership only — order never matters. */
export function scoreTopFourTeams(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  return points(scoreTopFourTeamsDetail(derived, actual).hits * scoring.roundOf4PerTeam);
}

/**
 * +topFourPositionBonus per team whose predicted final-standing slot (1st/2nd from the Final,
 * 3rd/4th from Bronze) exactly matches the actual slot. See scoreTopFourPositionDetail.
 */
export function scoreTopFourPosition(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  return points(scoreTopFourPositionDetail(derived, actual).hits * scoring.topFourPositionBonus);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/src/scoring/sets-rankings.test.ts`
Expected: PASS, all tests (existing `scoreRoundOf16`/`scoreRoundOf8`/`scoreTopFour` tests unchanged).

---

## Task 5: Engine — `scoreSpecials` detail

**Files:**

- Modify: `packages/engine/src/scoring/specials.ts`
- Test: `packages/engine/src/scoring/specials.test.ts`

**Interfaces:**

- Consumes: `CategoryAccuracy` from Task 1.
- Produces: `scoreSpecialsDetail(inputs: CardInputs, actual: ActualResults): CategoryAccuracy`.

- [ ] **Step 1: Write the failing tests**

Add `scoreSpecialsDetail` to the existing import in
`packages/engine/src/scoring/specials.test.ts`:

```ts
import { scoreSpecials, scoreSpecialsDetail } from './specials.js';
```

Append a new `describe` block at the end of the file:

```ts
describe('scoreSpecialsDetail', () => {
  it('one correct pick among several attempted → counts hits and attempted separately', () => {
    const inputs = makeInputs({ topScorerPlayer: SCORER, groupTopScoringTeam: ARG });
    const actual = makeActual({ topScorerPlayer: [SCORER], groupTopScoringTeam: [ESP] });
    // topScorerPlayer: hit; groupTopScoringTeam: attempted but wrong
    expect(scoreSpecialsDetail(inputs, actual)).toEqual({ hits: 1, attempted: 2 });
  });

  it('unattempted bets (no prediction) are excluded from the denominator', () => {
    const inputs = makeInputs({ topScorerPlayer: SCORER });
    const actual = makeActual({ topScorerPlayer: [SCORER], groupTopScoringTeam: [ESP] });
    // groupTopScoringTeam has an actual answer but the user never picked it → not attempted
    expect(scoreSpecialsDetail(inputs, actual)).toEqual({ hits: 1, attempted: 1 });
  });

  it('unresolved bets (no actual answer yet) are excluded from the denominator', () => {
    const inputs = makeInputs({ topScorerPlayer: SCORER, groupTopScoringTeam: ESP });
    const actual = makeActual({ topScorerPlayer: [SCORER] }); // groupTopScoringTeam unresolved
    expect(scoreSpecialsDetail(inputs, actual)).toEqual({ hits: 1, attempted: 1 });
  });

  it('all 11 bets correct → 11 hits of 11 attempted', () => {
    const inputs = makeInputs({
      topScorerPlayer: SCORER,
      groupTopScoringTeam: ESP,
      groupTopConcedingTeam: RSA,
      tournamentTopScoringTeam: ARG,
      tournamentTopConcedingTeam: RSA,
      highestMatchGoals: 7,
      mostYellowCardsTeam: CRO,
      firstRedCardPlayer: RED_CARD,
      penaltyShootoutCount: 5,
      finalDecidedByPenalties: true,
      finalDecisiveGoalPlayer: GOAL_SCORER,
    });
    const actual = makeActual(
      {
        topScorerPlayer: [SCORER],
        groupTopScoringTeam: [ESP],
        groupTopConcedingTeam: [RSA],
        tournamentTopScoringTeam: [ARG],
        tournamentTopConcedingTeam: [RSA],
        highestMatchGoals: 7,
        mostYellowCardsTeam: [CRO],
        firstRedCardPlayer: RED_CARD,
        penaltyShootoutCount: 5,
      },
      {
        home: ARG,
        away: teamId('FRA'),
        homeGoals: 3,
        awayGoals: 2,
        winner: ARG,
        decidedBy: 'penalties',
        decisiveGoalPlayer: GOAL_SCORER,
      },
    );
    expect(scoreSpecialsDetail(inputs, actual)).toEqual({ hits: 11, attempted: 11 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/engine/src/scoring/specials.test.ts`
Expected: FAIL — `scoreSpecialsDetail` is not exported.

- [ ] **Step 3: Refactor `specials.ts`**

Replace the full contents of `packages/engine/src/scoring/specials.ts` with:

```ts
import type { CardInputs, ActualResults, CategoryAccuracy, Scoring } from '../types.js';
import type { Points } from '../brand.js';
import { points } from '../brand.js';

function detailIfMatch<T>(predicted: T | undefined, actual: T | undefined): CategoryAccuracy {
  if (predicted === undefined || actual === undefined) return { hits: 0, attempted: 0 };
  return { hits: predicted === actual ? 1 : 0, attempted: 1 };
}

function detailIfInSet<T>(predicted: T | undefined, actuals: T[] | undefined): CategoryAccuracy {
  if (predicted === undefined || actuals === undefined || actuals.length === 0) {
    return { hits: 0, attempted: 0 };
  }
  return { hits: actuals.includes(predicted) ? 1 : 0, attempted: 1 };
}

function scoreIfMatch<T>(predicted: T | undefined, actual: T | undefined, pts: number): number {
  return detailIfMatch(predicted, actual).hits * pts;
}

function scoreIfInSet<T>(predicted: T | undefined, actuals: T[] | undefined, pts: number): number {
  return detailIfInSet(predicted, actuals).hits * pts;
}

function sum(parts: CategoryAccuracy[]): CategoryAccuracy {
  return parts.reduce(
    (acc, p) => ({ hits: acc.hits + p.hits, attempted: acc.attempted + p.attempted }),
    { hits: 0, attempted: 0 },
  );
}

export function scoreSpecialsDetail(inputs: CardInputs, actual: ActualResults): CategoryAccuracy {
  const { specials } = inputs;
  const { answers, finalMatch } = actual;

  const finalDecidedByPenaltiesPredicted =
    specials.finalDecidedByPenalties !== undefined && finalMatch !== undefined
      ? specials.finalDecidedByPenalties
      : undefined;
  const finalDecidedByPenaltiesActual =
    finalMatch !== undefined ? finalMatch.decidedBy === 'penalties' : undefined;

  return sum([
    detailIfInSet(specials.topScorerPlayer, answers.topScorerPlayer),
    detailIfInSet(specials.groupTopScoringTeam, answers.groupTopScoringTeam),
    detailIfInSet(specials.groupTopConcedingTeam, answers.groupTopConcedingTeam),
    detailIfInSet(specials.tournamentTopScoringTeam, answers.tournamentTopScoringTeam),
    detailIfInSet(specials.tournamentTopConcedingTeam, answers.tournamentTopConcedingTeam),
    detailIfMatch(specials.highestMatchGoals, answers.highestMatchGoals),
    detailIfInSet(specials.mostYellowCardsTeam, answers.mostYellowCardsTeam),
    detailIfMatch(specials.firstRedCardPlayer, answers.firstRedCardPlayer),
    detailIfMatch(specials.penaltyShootoutCount, answers.penaltyShootoutCount),
    detailIfMatch(finalDecidedByPenaltiesPredicted, finalDecidedByPenaltiesActual),
    detailIfMatch(specials.finalDecisiveGoalPlayer, finalMatch?.decisiveGoalPlayer),
  ]);
}

export function scoreSpecials(inputs: CardInputs, actual: ActualResults, scoring: Scoring): Points {
  const { specials } = inputs;
  const { answers, finalMatch } = actual;

  let total = 0;

  total += scoreIfInSet(specials.topScorerPlayer, answers.topScorerPlayer, scoring.topScorerPlayer);
  total += scoreIfInSet(
    specials.groupTopScoringTeam,
    answers.groupTopScoringTeam,
    scoring.groupTopScoringTeam,
  );
  total += scoreIfInSet(
    specials.groupTopConcedingTeam,
    answers.groupTopConcedingTeam,
    scoring.groupTopConcedingTeam,
  );
  total += scoreIfInSet(
    specials.tournamentTopScoringTeam,
    answers.tournamentTopScoringTeam,
    scoring.tournamentTopScoringTeam,
  );
  total += scoreIfInSet(
    specials.tournamentTopConcedingTeam,
    answers.tournamentTopConcedingTeam,
    scoring.tournamentTopConcedingTeam,
  );
  total += scoreIfMatch(
    specials.highestMatchGoals,
    answers.highestMatchGoals,
    scoring.highestMatchGoals,
  );
  total += scoreIfInSet(
    specials.mostYellowCardsTeam,
    answers.mostYellowCardsTeam,
    scoring.mostYellowCardsTeam,
  );
  total += scoreIfMatch(
    specials.firstRedCardPlayer,
    answers.firstRedCardPlayer,
    scoring.firstRedCardPlayer,
  );
  total += scoreIfMatch(
    specials.penaltyShootoutCount,
    answers.penaltyShootoutCount,
    scoring.penaltyShootoutCount,
  );

  if (specials.finalDecidedByPenalties !== undefined && finalMatch !== undefined) {
    const actualByPenalties = finalMatch.decidedBy === 'penalties';
    if (specials.finalDecidedByPenalties === actualByPenalties) {
      total += scoring.finalDecidedByPenalties;
    }
  }

  total += scoreIfMatch(
    specials.finalDecisiveGoalPlayer,
    finalMatch?.decisiveGoalPlayer,
    scoring.finalDecisiveGoalPlayer,
  );

  return points(total);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/engine/src/scoring/specials.test.ts`
Expected: PASS, all tests (existing `scoreSpecials` tests unchanged).

---

## Task 6: Engine — `scoreCardAccuracy` aggregate, exports, full engine gate, commit 1

**Files:**

- Modify: `packages/engine/src/score.ts`
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/src/score.test.ts`

**Interfaces:**

- Consumes: all `scoreXxxDetail` functions from Tasks 1–5.
- Produces: `scoreCardAccuracy(derived: DerivedCard, inputs: CardInputs, actual: ActualResults):
AccuracyBreakdown`, exported from `@cup/engine`.

- [ ] **Step 1: Write the failing test**

Add a new `describe` block at the end of `packages/engine/src/score.test.ts` (the file already
imports `deriveCard`/`scoreCard`/`miniTournament`/`miniScoring` and has the §7.7 worked-example
fixtures `derived77`/`inputs77`/`actual77` in scope):

```ts
import { scoreCard, scoreCardAccuracy } from './score.js';
```

```ts
describe('scoreCardAccuracy — §7.7 worked example', () => {
  it('total.attempted matches the number of resolved categories, total.hits matches earned credit', () => {
    const accuracy = scoreCardAccuracy(derived77, inputs77, actual77);

    // groupMatches: 2 attempted (1 outcome hit + 1 exact hit) → 2 hits, 2 attempted
    expect(accuracy.groupMatches).toEqual({ hits: 2, attempted: 2 });
    // groupOrder: group A, 4 slots attempted, 2 correct
    expect(accuracy.groupOrder).toEqual({ hits: 2, attempted: 4 });
    // roundOf8: 6 of 8 attempted correct
    expect(accuracy.roundOf8).toEqual({ hits: 6, attempted: 8 });
    // topFourTeams: all 4 predicted semifinalists confirmed
    expect(accuracy.topFourTeams).toEqual({ hits: 4, attempted: 4 });
    // topFourPosition: Final played (2 slots attempted), Bronze not played; ARG/FRA both correct
    expect(accuracy.topFourPosition).toEqual({ hits: 2, attempted: 2 });
    // final: 2 teams + 1 exact, all correct
    expect(accuracy.final).toEqual({ hits: 3, attempted: 3 });
    // bronze: no bronzeMatch in actual → nothing attempted
    expect(accuracy.bronze).toEqual({ hits: 0, attempted: 0 });
    // specials: topScorerPlayer + finalDecidedByPenalties, both correct
    expect(accuracy.specials).toEqual({ hits: 2, attempted: 2 });

    const expectedTotalHits =
      accuracy.groupMatches.hits +
      accuracy.groupOrder.hits +
      accuracy.roundOf8.hits +
      accuracy.topFourTeams.hits +
      accuracy.topFourPosition.hits +
      accuracy.final.hits +
      accuracy.bronze.hits +
      accuracy.specials.hits;
    const expectedTotalAttempted =
      accuracy.groupMatches.attempted +
      accuracy.groupOrder.attempted +
      accuracy.roundOf8.attempted +
      accuracy.topFourTeams.attempted +
      accuracy.topFourPosition.attempted +
      accuracy.final.attempted +
      accuracy.bronze.attempted +
      accuracy.specials.attempted;
    expect(accuracy.total).toEqual({ hits: expectedTotalHits, attempted: expectedTotalAttempted });
  });

  it('a fully unfilled card has 0 attempted, not NaN', () => {
    const emptyInputs: CardInputs = {
      groupScores: [],
      knockoutPicks: [],
      finishScores: {},
      specials: {},
    };
    const emptyActual: ActualResults = { matchResults: [], groupOrder: {}, answers: {} };
    const derived = deriveCard(emptyInputs, miniTournament);

    const accuracy = scoreCardAccuracy(derived, emptyInputs, emptyActual);

    expect(accuracy.total).toEqual({ hits: 0, attempted: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/engine/src/score.test.ts`
Expected: FAIL — `scoreCardAccuracy` is not exported from `./score.js`.

- [ ] **Step 3: Implement `scoreCardAccuracy`**

Modify `packages/engine/src/score.ts` — add these imports and the new function at the end of the
file (the existing `scoreCard` function and its imports stay unchanged, just extend the import
lines to also pull in the `*Detail` functions):

```ts
import type {
  CardInputs,
  DerivedCard,
  ActualResults,
  Scoring,
  ScoreBreakdown,
  AccuracyBreakdown,
  CategoryAccuracy,
} from './types.js';
import { points } from './brand.js';
import { scoreGroupMatches, scoreGroupMatchesDetail } from './scoring/group-matches.js';
import { scoreGroupOrder, scoreGroupOrderDetail } from './scoring/group-order.js';
import {
  scoreBronze,
  scoreFinal,
  scoreBronzeDetail,
  scoreFinalDetail,
} from './scoring/finish-matches.js';
import {
  scoreRoundOf16,
  scoreRoundOf8,
  scoreTopFour,
  scoreTopFourTeams,
  scoreTopFourPosition,
  scoreRoundOf16Detail,
  scoreRoundOf8Detail,
  scoreTopFourTeamsDetail,
  scoreTopFourPositionDetail,
} from './scoring/sets-rankings.js';
import { scoreSpecials, scoreSpecialsDetail } from './scoring/specials.js';

// ...existing scoreCard function unchanged...

function sumAccuracy(parts: CategoryAccuracy[]): CategoryAccuracy {
  return parts.reduce(
    (acc, p) => ({ hits: acc.hits + p.hits, attempted: acc.attempted + p.attempted }),
    { hits: 0, attempted: 0 },
  );
}

export function scoreCardAccuracy(
  derived: DerivedCard,
  inputs: CardInputs,
  actual: ActualResults,
): AccuracyBreakdown {
  const groupMatches = scoreGroupMatchesDetail(inputs, actual);
  const groupOrder = scoreGroupOrderDetail(derived, actual);
  const bronze = scoreBronzeDetail(inputs, derived, actual);
  const final = scoreFinalDetail(inputs, derived, actual);
  const roundOf16 = scoreRoundOf16Detail(derived, actual);
  const roundOf8 = scoreRoundOf8Detail(derived, actual);
  const topFourTeams = scoreTopFourTeamsDetail(derived, actual);
  const topFourPosition = scoreTopFourPositionDetail(derived, actual);
  const specials = scoreSpecialsDetail(inputs, actual);

  return {
    groupMatches,
    groupOrder,
    bronze,
    final,
    roundOf16,
    roundOf8,
    topFourTeams,
    topFourPosition,
    specials,
    total: sumAccuracy([
      groupMatches,
      groupOrder,
      bronze,
      final,
      roundOf16,
      roundOf8,
      topFourTeams,
      topFourPosition,
      specials,
    ]),
  };
}
```

- [ ] **Step 4: Export from the package barrel**

In `packages/engine/src/index.ts`, extend the "Public types" export block to include the two new
types, and the "Core engine functions" block to include `scoreCardAccuracy`:

```ts
export type {
  Tournament,
  CardInputs,
  DerivedCard,
  ActualResults,
  Scoring,
  ScoreBreakdown,
  AccuracyBreakdown,
  CategoryAccuracy,
  // Input sub-types
  GroupScore,
  KnockoutPick,
  FinishScore,
  SpecialBets,
} from './types.js';
```

```ts
export { deriveCard } from './derive.js';
export { scoreCard, scoreCardAccuracy } from './score.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/engine/src/score.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full engine gate**

Run: `npx vitest run packages/engine`
Expected: PASS, all engine tests (existing + new).

Run: `pnpm --filter @cup/engine typecheck`
Expected: no errors.

Run: `pnpm format:check && pnpm lint`
Expected: no errors. If Prettier/ESLint reformats anything, that's fine — re-run to confirm clean.

- [ ] **Step 7: Commit this task's changes**

```bash
git add packages/engine/src/types.ts packages/engine/src/index.ts packages/engine/src/score.ts \
  packages/engine/src/score.test.ts packages/engine/src/scoring/*.ts packages/engine/src/scoring/*.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): add scoreCardAccuracy aggregate over per-category hit/attempted detail

Each scoring category gained a scoreXxxDetail sibling (previous tasks
on this branch) reporting {hits, attempted} derived from the same
comparison that produces its point total — never a parallel
calculation. scoreCardAccuracy(derived, inputs, actual) sums every
category into one AccuracyBreakdown, the foundation for a pool-wide
"percentage of predictions correct" archive stat that can never
disagree with the real scoring, unlike re-deriving correctness outside
the engine (see the R32/SF-position/champion-pick bug postmortems in
docs/PROGRESS.md).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Pool-archive — `PoolArchiveRecap` type extension + `overallAccuracyPercent`

**Files:**

- Modify: `packages/db/src/schema/pool-archive.ts`
- Modify: `apps/web/src/features/pool-archive/application/build-recap.ts`
- Test: `apps/web/src/features/pool-archive/application/build-recap.test.ts`

**Interfaces:**

- Consumes: `scoreCardAccuracy`, `deriveCard` from `@cup/engine`; `getActualResults`, `getPrediction`,
  `getPredictionInputs` from `@cup/db`.
- Produces: `PoolArchiveRecap.overallAccuracyPercent: number`. `buildPoolArchiveRecap` (existing)
  now populates it.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/features/pool-archive/application/build-recap.test.ts`, inside the existing
`describe('buildPoolArchiveRecap', ...)` block (the file already imports `upsertKnockoutPick`,
`getOrCreatePrediction`, has `db`/`poolId`/`tournamentId`/`ownerId` set up in `beforeEach`). Add
`upsertGroupScore` to the existing `@cup/db` import:

```ts
import {
  createUser,
  createPool as dbCreatePool,
  upsertTournamentDef,
  addMember,
  upsertKnockoutPick,
  upsertGroupScore,
  upsertFinishScore,
  upsertKnockoutMatch,
  finalizeMatch,
  getOrCreatePrediction,
} from '@cup/db';
```

```ts
it("computes overallAccuracyPercent from every member's predictions vs actual results", async () => {
  // owner predicts group match mA1 (A1 vs A2) as 2-1 exact, matching the actual result.
  const prediction = await getOrCreatePrediction(db, { poolId, userId: ownerId, tournamentId });
  await upsertGroupScore(db, prediction.id, 'mA1', 2, 1);

  // Sync an actual result for mA1: exact match with the prediction above.
  await finalizeMatch(db, tournamentId, 'mA1', 2, 1);

  const { recap } = await buildPoolArchiveRecap(db, {
    poolId,
    tournamentId,
    def: miniTournament,
    scoring: miniTournament.scoring,
  });

  // 1 of 1 attempted group-match prediction is correct → 100%.
  expect(recap.overallAccuracyPercent).toBe(100);
});

it('overallAccuracyPercent is 0, not NaN, when nobody has predicted anything', async () => {
  const { recap } = await buildPoolArchiveRecap(db, {
    poolId,
    tournamentId,
    def: miniTournament,
    scoring: miniTournament.scoring,
  });

  expect(recap.overallAccuracyPercent).toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/web/src/features/pool-archive/application/build-recap.test.ts`
Expected: FAIL — `recap.overallAccuracyPercent` is `undefined`, not `100`/`0`
(`toBe(100)`/`toBe(0)` fails).

- [ ] **Step 3: Extend `PoolArchiveRecap`**

In `packages/db/src/schema/pool-archive.ts`, add the field to the existing type (leave everything
else in the file unchanged):

```ts
export type PoolArchiveRecap = {
  stages: string[];
  championPick: ChampionPickHighlight | null;
  bestSingleMatch: BestSingleMatchHighlight | null;
  biggestUpset: BiggestUpsetHighlight | null;
  predictionsMade: number;
  exactScoreRatePercent: number;
  overallAccuracyPercent: number;
};
```

- [ ] **Step 4: Implement the per-member accuracy aggregation in `build-recap.ts`**

Modify `apps/web/src/features/pool-archive/application/build-recap.ts`:

Add to the top-level imports (extend the existing `@cup/db` and `@cup/engine` import lines):

```ts
import {
  getMatchesForTournament,
  getGroupScoresByPool,
  getKnockoutPicksByPool,
  getFinishScoresByPool,
  getSpecialBetsByPool,
  getLeaderboard,
  getActualResults,
  getPrediction,
  getPredictionInputs,
} from '@cup/db';
```

```ts
import { deriveCard, scoreCardAccuracy } from '@cup/engine';
import type {
  PoolId,
  TournamentId,
  Tournament,
  Scoring,
  UserId,
  CardInputs,
  ActualResults,
} from '@cup/engine';
```

Add a new pure-ish helper function (it makes DB calls, so it's not pure, but it has one clear
responsibility) above `buildPoolArchiveRecap`:

```ts
async function buildMemberCardInputs(
  db: Db<AppSchema>,
  poolId: PoolId,
  userId: UserId,
): Promise<CardInputs> {
  const prediction = await getPrediction(db, poolId, userId);
  if (!prediction) {
    return { groupScores: [], knockoutPicks: [], finishScores: {}, specials: {} };
  }
  return getPredictionInputs(db, prediction.id);
}

/**
 * Sums hit/attempted accuracy across every pool member's predictions. Mirrors
 * `@/shared/card-scoring`'s `rescoreCard` augmentation exactly (fills in actual results for any
 * match a member didn't predict) so this can't diverge from what real scoring already computes.
 */
async function computeOverallAccuracyPercent(
  db: Db<AppSchema>,
  poolId: PoolId,
  leaderboard: { userId: UserId }[],
  def: Tournament,
  actual: ActualResults,
): Promise<number> {
  const memberInputs = await Promise.all(
    leaderboard.map((entry) => buildMemberCardInputs(db, poolId, entry.userId)),
  );

  let totalHits = 0;
  let totalAttempted = 0;

  for (const inputs of memberInputs) {
    const savedMatchIds = new Set(inputs.groupScores.map((gs) => gs.matchId as string));
    const augmentedGroupScores = [
      ...inputs.groupScores,
      ...actual.matchResults.filter((r) => !savedMatchIds.has(r.matchId as string)),
    ];
    const derived = deriveCard({ ...inputs, groupScores: augmentedGroupScores }, def);
    const accuracy = scoreCardAccuracy(derived, inputs, actual);
    totalHits += accuracy.total.hits;
    totalAttempted += accuracy.total.attempted;
  }

  return totalAttempted > 0 ? Math.round((totalHits / totalAttempted) * 100) : 0;
}
```

In `buildPoolArchiveRecap`, fetch `actual` alongside the existing `Promise.all` fetch, and call the
new function when building `recap`:

```ts
const [leaderboard, allMatches, groupScores, knockoutPicks, finishScores, specialBets, actual] =
  await Promise.all([
    getLeaderboard(db, poolId),
    getMatchesForTournament(db, tournamentId),
    getGroupScoresByPool(db, poolId),
    getKnockoutPicksByPool(db, poolId),
    getFinishScoresByPool(db, poolId),
    getSpecialBetsByPool(db, poolId),
    getActualResults(db, tournamentId),
  ]);
```

```ts
const recap: PoolArchiveRecap = {
  stages: raceChart.chartStages,
  championPick: computeChampionPick(knockoutPicks, finishScores, def, totalMembers),
  bestSingleMatch: computeBestSingleMatch(
    groupScores,
    allMatches,
    def,
    scoring.groupMatch,
    totalMembers,
  ),
  biggestUpset: computeBiggestUpset(knockoutPicks, allMatches, def, totalMembers),
  predictionsMade: computePredictionsMade({
    groupScores: groupScores.length,
    knockoutPicks: knockoutPicks.length,
    finishScores: finishScores.length,
    specialBets: specialBets.length,
  }),
  exactScoreRatePercent: computeExactScoreRatePercent(groupScores, allMatches, scoring.groupMatch),
  overallAccuracyPercent: await computeOverallAccuracyPercent(db, poolId, leaderboard, def, actual),
};
```

(Keep the rest of the existing `predictionsMade`/`exactScoreRatePercent` lines exactly as they are —
only the new `overallAccuracyPercent` line is added.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run apps/web/src/features/pool-archive/application/build-recap.test.ts`
Expected: PASS, all tests including the two new ones.

- [ ] **Step 6: Run the pool-archive suite to check for regressions**

Run: `npx vitest run apps/web/src/features/pool-archive`
Expected: PASS.

---

## Task 8: Pool-archive — `groupCompletionStageIndex` + `computeStageLeaders`

**Files:**

- Modify: `apps/web/src/shared/race-chart.ts`
- Modify: `packages/db/src/schema/pool-archive.ts`
- Modify: `apps/web/src/features/pool-archive/application/build-highlights.ts`
- Modify: `apps/web/src/features/pool-archive/application/build-recap.ts`
- Test: `apps/web/src/shared/race-chart.test.ts` (or the file this repo's `shared/race-chart.ts`
  already has tests in — check with `ls apps/web/src/shared/*.test.ts` first; if it's a different
  filename, add the test there instead)
- Test: `apps/web/src/features/pool-archive/application/build-highlights.test.ts`
- Test: `apps/web/src/features/pool-archive/application/build-recap.test.ts`

**Interfaces:**

- Consumes: `MatchRow`, `Tournament` types (already imported in `race-chart.ts`).
- Produces: `findOverallGroupCompletionDate(allMatches: MatchRow[], def: Tournament): string |
null`, exported from `apps/web/src/shared/race-chart.ts`.
  `computeStageLeaders(entries: { userId: UserId; displayName: string; pointsTotal: number
}[], pointsHistory: Map<UserId, number[]>, groupCompletionStageIndex: number): { groupStageLeader:
{userId: UserId; displayName: string; points: number} | null; knockoutStageLeader: {userId: UserId;
displayName: string; points: number} | null }`, exported from
  `apps/web/src/features/pool-archive/application/build-highlights.ts`.
  `PoolArchiveRecap.groupCompletionStageIndex: number`, `PoolArchiveRecap.groupStageLeader`,
  `PoolArchiveRecap.knockoutStageLeader`.

- [ ] **Step 1: Check for an existing race-chart test file**

Run: `ls apps/web/src/shared/*.test.ts`

If `race-chart.test.ts` exists, add to it. If not, create
`apps/web/src/shared/race-chart.test.ts` with these imports at the top (matching the fixture style
already used elsewhere in this repo — `miniTournament` from `@cup/engine/testing`, `MatchRow` type
from `@cup/db`):

```ts
import { describe, it, expect } from 'vitest';
import { miniTournament } from '@cup/engine/testing';
import { tournamentId as asTournamentId } from '@cup/engine';
import type { MatchRow } from '@cup/db';
import { findOverallGroupCompletionDate } from './race-chart';

function groupMatch(id: string, groupId: string, kickoff: string, final: boolean): MatchRow {
  return {
    id,
    tournamentId: asTournamentId(miniTournament.id),
    stage: 'group',
    groupId,
    homeTeamId: `${groupId}1`,
    awayTeamId: `${groupId}2`,
    kickoff: new Date(kickoff),
    homeGoals: final ? 1 : null,
    awayGoals: final ? 0 : null,
    homeConduct: null,
    awayConduct: null,
    winnerTeamId: null,
    decidedBy: null,
    status: final ? 'final' : 'scheduled',
  };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
describe('findOverallGroupCompletionDate', () => {
  it('returns the latest completion date across all groups', () => {
    const allMatches: MatchRow[] = [
      groupMatch('mA1', 'A', '2026-07-01T18:00:00Z', true),
      groupMatch('mB1', 'B', '2026-07-03T18:00:00Z', true), // group B finishes later
    ];
    expect(findOverallGroupCompletionDate(allMatches, miniTournament)).toBe('2026-07-03');
  });

  it('returns null when any group is not yet fully final', () => {
    const allMatches: MatchRow[] = [
      groupMatch('mA1', 'A', '2026-07-01T18:00:00Z', true),
      groupMatch('mB1', 'B', '2026-07-03T18:00:00Z', false), // group B not final
    ];
    expect(findOverallGroupCompletionDate(allMatches, miniTournament)).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run apps/web/src/shared/race-chart.test.ts`
Expected: FAIL — `findOverallGroupCompletionDate` is not exported.

- [ ] **Step 4: Export `findGroupCompletionDate` and add `findOverallGroupCompletionDate`**

In `apps/web/src/shared/race-chart.ts`, change the existing private function's declaration (around
line 241) from:

```ts
function findGroupCompletionDate(groupMatches: MatchRow[]): string | null {
```

to:

```ts
export function findGroupCompletionDate(groupMatches: MatchRow[]): string | null {
```

Then add a new exported function right after it:

```ts
/**
 * The date the group stage as a whole completed — the latest of every individual group's own
 * completion date. Returns null if any group isn't fully final yet (shouldn't happen once a pool
 * is archived, since archiving only happens for a finished tournament).
 */
export function findOverallGroupCompletionDate(
  allMatches: MatchRow[],
  def: Tournament,
): string | null {
  const dates: string[] = [];
  for (const group of def.groups) {
    const groupMatches = allMatches.filter((m) => m.stage === 'group' && m.groupId === group.id);
    const date = findGroupCompletionDate(groupMatches);
    if (date === null) return null;
    dates.push(date);
  }
  if (dates.length === 0) return null;
  return dates.reduce((max, d) => (d > max ? d : max));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run apps/web/src/shared/race-chart.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing tests for `computeStageLeaders`**

Add to `apps/web/src/features/pool-archive/application/build-highlights.test.ts` (extend the
existing import from `./build-highlights` and add `userId` to the existing `@cup/engine` import if
not already there — it already is, per the file's current imports):

```ts
import {
  computeChampionPick,
  computeBestSingleMatch,
  computeBiggestUpset,
  computePredictionsMade,
  computeExactScoreRatePercent,
  computeStageLeaders,
} from './build-highlights';
```

```ts
describe('computeStageLeaders', () => {
  it('finds the group-stage leader from pointsHistory at the completion index, and the knockout leader from final totals', () => {
    const entries = [
      { userId: asUserId('u1'), displayName: 'Alice', pointsTotal: 50 },
      { userId: asUserId('u2'), displayName: 'Bob', pointsTotal: 80 },
    ];
    const pointsHistory = new Map([
      [asUserId('u1'), [0, 42, 50]], // leads at index 1 (group stage complete)
      [asUserId('u2'), [0, 20, 80]], // overtakes by the end
    ]);

    const result = computeStageLeaders(entries, pointsHistory, 1);

    expect(result.groupStageLeader).toEqual({
      userId: asUserId('u1'),
      displayName: 'Alice',
      points: 42,
    });
    expect(result.knockoutStageLeader).toEqual({
      userId: asUserId('u2'),
      displayName: 'Bob',
      points: 80,
    });
  });

  it('shows the same person for both leaders when there is no lead change', () => {
    const entries = [
      { userId: asUserId('u1'), displayName: 'Alice', pointsTotal: 90 },
      { userId: asUserId('u2'), displayName: 'Bob', pointsTotal: 60 },
    ];
    const pointsHistory = new Map([
      [asUserId('u1'), [0, 42, 90]],
      [asUserId('u2'), [0, 20, 60]],
    ]);

    const result = computeStageLeaders(entries, pointsHistory, 1);

    expect(result.groupStageLeader?.displayName).toBe('Alice');
    expect(result.knockoutStageLeader?.displayName).toBe('Alice');
  });

  it('returns null leaders when there are no entries', () => {
    const result = computeStageLeaders([], new Map(), 1);
    expect(result.groupStageLeader).toBeNull();
    expect(result.knockoutStageLeader).toBeNull();
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `npx vitest run apps/web/src/features/pool-archive/application/build-highlights.test.ts`
Expected: FAIL — `computeStageLeaders` is not exported.

- [ ] **Step 8: Extend `PoolArchiveRecap` with `StageLeader` and the three new fields**

Do this before implementing `computeStageLeaders` so that function can import the canonical
`StageLeader` type from `@cup/db` instead of declaring its own duplicate.

In `packages/db/src/schema/pool-archive.ts`, add `UserId` to the existing `@cup/engine` type
import:

```ts
import type { TeamId, MatchId, UserId } from '@cup/engine';
```

Extend the file with a new exported `StageLeader` type and the three new `PoolArchiveRecap` fields:

```ts
export type StageLeader = { userId: UserId; displayName: string; points: number };

export type PoolArchiveRecap = {
  stages: string[];
  championPick: ChampionPickHighlight | null;
  bestSingleMatch: BestSingleMatchHighlight | null;
  biggestUpset: BiggestUpsetHighlight | null;
  predictionsMade: number;
  exactScoreRatePercent: number;
  overallAccuracyPercent: number;
  groupCompletionStageIndex: number;
  groupStageLeader: StageLeader | null;
  knockoutStageLeader: StageLeader | null;
};
```

- [ ] **Step 9: Implement `computeStageLeaders`**

Add to `apps/web/src/features/pool-archive/application/build-highlights.ts`. Add `UserId` to the
existing `@cup/engine` type import, and import the `StageLeader` type from `@cup/db` (extend
whichever `@cup/db` import already exists at the top of the file with `type { StageLeader }`):

```ts
import type { Tournament, TeamId, UserId } from '@cup/engine';
import type { StageLeader } from '@cup/db';
```

Add this new exported function (anywhere after the existing imports, e.g. right before
`computeChampionPick`):

```ts
export function computeStageLeaders(
  entries: { userId: UserId; displayName: string; pointsTotal: number }[],
  pointsHistory: Map<UserId, number[]>,
  groupCompletionStageIndex: number,
): { groupStageLeader: StageLeader | null; knockoutStageLeader: StageLeader | null } {
  if (entries.length === 0) {
    return { groupStageLeader: null, knockoutStageLeader: null };
  }

  let groupStageLeader: StageLeader | null = null;
  let bestGroupPoints = -Infinity;
  for (const entry of entries) {
    const points = pointsHistory.get(entry.userId)?.[groupCompletionStageIndex] ?? 0;
    if (points > bestGroupPoints) {
      bestGroupPoints = points;
      groupStageLeader = { userId: entry.userId, displayName: entry.displayName, points };
    }
  }

  let knockoutStageLeader: StageLeader | null = null;
  let bestFinalPoints = -Infinity;
  for (const entry of entries) {
    if (entry.pointsTotal > bestFinalPoints) {
      bestFinalPoints = entry.pointsTotal;
      knockoutStageLeader = {
        userId: entry.userId,
        displayName: entry.displayName,
        points: entry.pointsTotal,
      };
    }
  }

  return { groupStageLeader, knockoutStageLeader };
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `npx vitest run apps/web/src/features/pool-archive/application/build-highlights.test.ts`
Expected: PASS.

- [ ] **Step 11: Write the failing integration test for `build-recap.ts` wiring**

Add to `apps/web/src/features/pool-archive/application/build-recap.test.ts`:

```ts
it('freezes groupCompletionStageIndex and stage leaders into the recap', async () => {
  const finalKickoff = new Date('2026-07-19T18:00:00Z');
  await upsertKnockoutMatch(db, {
    id: miniTournament.bracket.finalMatch,
    tournamentId,
    stage: 'Final',
    homeTeamId: 'A1',
    awayTeamId: 'B1',
    homeGoals: 2,
    awayGoals: 1,
    kickoff: finalKickoff,
    status: 'final',
  });

  const { recap } = await buildPoolArchiveRecap(db, {
    poolId,
    tournamentId,
    def: miniTournament,
    scoring: miniTournament.scoring,
  });

  expect(typeof recap.groupCompletionStageIndex).toBe('number');
  // Single-member pool: the only member is both leaders by definition.
  expect(recap.groupStageLeader?.userId).toBe(ownerId);
  expect(recap.knockoutStageLeader?.userId).toBe(ownerId);
});
```

- [ ] **Step 12: Run test to verify it fails**

Run: `npx vitest run apps/web/src/features/pool-archive/application/build-recap.test.ts`
Expected: FAIL — `recap.groupCompletionStageIndex` is `undefined`.

- [ ] **Step 13: Wire `groupCompletionStageIndex` and stage leaders into `build-recap.ts`**

In `apps/web/src/features/pool-archive/application/build-recap.ts`, add the new import:

```ts
import { findOverallGroupCompletionDate } from '@/shared/race-chart';
```

Add `computeStageLeaders` to the existing `./build-highlights` import:

```ts
import {
  computeChampionPick,
  computeBestSingleMatch,
  computeBiggestUpset,
  computePredictionsMade,
  computeExactScoreRatePercent,
  computeStageLeaders,
  resolveEffectiveFinalePick,
} from './build-highlights';
```

In `buildPoolArchiveRecap`, after the `entryExtras` loop (which already builds `pointsHistory` per
member) and before constructing `recap`, add:

```ts
const groupCompletionDate = findOverallGroupCompletionDate(allMatches, def);
const eventDates = buildRaceEventDates(allMatches);
const groupCompletionStageIndex = groupCompletionDate
  ? eventDates.indexOf(groupCompletionDate) + 1
  : 0;

const pointsHistoryByUser = new Map(
  [...entryExtras.entries()].map(([uid, extras]) => [uid, extras.pointsHistory]),
);
const { groupStageLeader, knockoutStageLeader } = computeStageLeaders(
  leaderboard,
  pointsHistoryByUser,
  groupCompletionStageIndex,
);
```

Add the three fields to the `recap` object literal:

```ts
const recap: PoolArchiveRecap = {
  stages: raceChart.chartStages,
  championPick: computeChampionPick(knockoutPicks, finishScores, def, totalMembers),
  bestSingleMatch: computeBestSingleMatch(
    groupScores,
    allMatches,
    def,
    scoring.groupMatch,
    totalMembers,
  ),
  biggestUpset: computeBiggestUpset(knockoutPicks, allMatches, def, totalMembers),
  predictionsMade: computePredictionsMade({
    groupScores: groupScores.length,
    knockoutPicks: knockoutPicks.length,
    finishScores: finishScores.length,
    specialBets: specialBets.length,
  }),
  exactScoreRatePercent: computeExactScoreRatePercent(groupScores, allMatches, scoring.groupMatch),
  overallAccuracyPercent: await computeOverallAccuracyPercent(db, poolId, leaderboard, def, actual),
  groupCompletionStageIndex,
  groupStageLeader,
  knockoutStageLeader,
};
```

- [ ] **Step 14: Run tests to verify they pass**

Run: `npx vitest run apps/web/src/features/pool-archive/application/build-recap.test.ts`
Expected: PASS, all tests.

---

## Task 9: Pool-archive — restrict `computeBiggestRiser` to the knockout stage

**Files:**

- Modify: `apps/web/src/features/pool-archive/domain/race-history.ts`
- Modify: `apps/web/src/features/pool-archive/application/get-pool-archive.ts`
- Test: `apps/web/src/features/pool-archive/domain/race-history.test.ts`

**Interfaces:**

- Consumes: `PoolArchiveRecap.groupCompletionStageIndex` (Task 8).
- Produces: `computeBiggestRiser(players, stages, knockoutStartIndex: number)` — new required
  third parameter.

- [ ] **Step 1: Read the existing test file to match its fixture style**

Run: `cat apps/web/src/features/pool-archive/domain/race-history.test.ts` and note how
`StageHistoryPlayer` fixtures are built there (this file already exists — do not guess its shape,
read it first, then add to it using the exact same helper style already present).

- [ ] **Step 2: Write the failing tests**

Add to `apps/web/src/features/pool-archive/domain/race-history.test.ts`, in the existing
`describe('computeBiggestRiser', ...)` block (or a new one if the existing tests don't already pass
a third argument — update every existing call site in this file to pass `1` as the third argument
first, confirming those still pass unchanged, then add the new knockout-restriction tests):

```ts
// Shared 3-player fixture: a big rank jump happens entirely within the group stage (index 1→2),
// and a smaller, genuine rank jump happens in the knockout stage (index 2→3).
//
//            Start  Day1  Day2  Day3
// Alice        0      1   200   200   → rank:  -    3rd   1st   1st   (jumps 3rd→1st in 1→2, group-stage-only)
// Bob          0    100   100   100   → rank:  -    1st   2nd   3rd
// Carol        0     50    90   150   → rank:  -    2nd   3rd   2nd   (rises 3rd→2nd in 2→3, knockout-stage)
const groupCompletionIndex = 2;
const threePlayerFixture: StageHistoryPlayer[] = [
  { displayName: 'Alice', points: [0, 1, 200, 200], stageReasons: [null, null, null, null] },
  { displayName: 'Bob', points: [0, 100, 100, 100], stageReasons: [null, null, null, null] },
  {
    displayName: 'Carol',
    points: [0, 50, 90, 150],
    stageReasons: [null, null, null, 'exact score'],
  },
];
const fourStages = ['Start', 'Day 1', 'Day 2', 'Day 3'];

it("with no restriction, picks up Alice's bigger group-stage-only jump (sanity check on the fixture)", () => {
  const result = computeBiggestRiser(threePlayerFixture, fourStages, 1);
  expect(result?.displayName).toBe('Alice');
  expect(result?.fromRank).toBe(3);
  expect(result?.toRank).toBe(1);
});

it("restricted to the knockout stage, ignores the bigger group-stage jump and finds Carol's smaller genuine one", () => {
  const result = computeBiggestRiser(threePlayerFixture, fourStages, groupCompletionIndex + 1);
  expect(result?.displayName).toBe('Carol');
  expect(result?.fromRank).toBe(3);
  expect(result?.toRank).toBe(2);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run apps/web/src/features/pool-archive/domain/race-history.test.ts`
Expected: FAIL — `computeBiggestRiser` doesn't accept a third argument yet (existing calls with 2
args still typecheck since the new param isn't added yet; the new tests fail because the knockout
restriction doesn't exist, so the first new test gets a non-null result instead of `null`).

- [ ] **Step 4: Update `computeBiggestRiser`'s signature and scan range**

In `apps/web/src/features/pool-archive/domain/race-history.ts`, change:

```ts
export function computeBiggestRiser(
  players: StageHistoryPlayer[],
  stages: string[],
): BiggestRiserEvent {
  if (players.length < 2 || stages.length < 2) return null;

  let best: BiggestRiserEvent = null;
  let bestImprovement = 0;

  for (let stageIndex = 1; stageIndex < stages.length; stageIndex++) {
```

to:

```ts
export function computeBiggestRiser(
  players: StageHistoryPlayer[],
  stages: string[],
  knockoutStartIndex: number,
): BiggestRiserEvent {
  if (players.length < 2 || stages.length < 2) return null;

  let best: BiggestRiserEvent = null;
  let bestImprovement = 0;

  for (let stageIndex = Math.max(1, knockoutStartIndex); stageIndex < stages.length; stageIndex++) {
```

(The rest of the function body is unchanged.)

- [ ] **Step 5: Update the existing test file's other calls to `computeBiggestRiser`**

Every other existing call to `computeBiggestRiser(players, stages)` in this test file now needs a
third argument. Since those tests exercise the full history including group-stage transitions, pass
`1` (the original starting index) so their existing assertions keep passing unchanged: find every
remaining `computeBiggestRiser(` call in the file and add `, 1` before the closing paren.

- [ ] **Step 6: Update the production call site in `get-pool-archive.ts`**

In `apps/web/src/features/pool-archive/application/get-pool-archive.ts`, change:

```ts
biggestRiser: archive.recap ? computeBiggestRiser(historyPlayers, stages) : null,
```

to:

```ts
biggestRiser: archive.recap
  ? computeBiggestRiser(historyPlayers, stages, archive.recap.groupCompletionStageIndex + 1)
  : null,
```

(Per Task 8, `groupCompletionStageIndex` is the stage index of the group-stage-end day itself; the
first eligible riser transition is the one _arriving at_ the next stage, i.e.
`groupCompletionStageIndex + 1`, matching the spec's "first eligible transition is rank at
group-stage-end → rank after the first knockout day.")

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run apps/web/src/features/pool-archive/domain/race-history.test.ts`
Expected: PASS, all tests.

Run: `npx vitest run apps/web/src/features/pool-archive`
Expected: PASS (checks `get-pool-archive.ts`'s own tests, if any, still pass with the updated call
site — run `ls apps/web/src/features/pool-archive/application/get-pool-archive.test.ts` first; if
it exists and asserts on `biggestRiser`, it will need `archive.recap.groupCompletionStageIndex` to
be present in its fixtures, which Task 8 already guarantees since it's a required field on
`PoolArchiveRecap`).

---

## Task 10: Pool-archive — `ArchivePoolStatsPanel` UI + archive-page wiring

**Files:**

- Create: `apps/web/src/features/pool-archive/ui/ArchivePoolStatsPanel.tsx`
- Modify: `apps/web/src/features/pool-archive/index.ts`
- Modify: `apps/web/src/app/(authenticated)/pools/[id]/archive/page.tsx`

**Interfaces:**

- Consumes: `PoolArchiveRecap` (now with `overallAccuracyPercent`, `groupStageLeader`,
  `knockoutStageLeader`).

- [ ] **Step 1: Create the component**

Create `apps/web/src/features/pool-archive/ui/ArchivePoolStatsPanel.tsx`:

```tsx
import type { ReactElement } from 'react';
import type { PoolArchiveRecap } from '../domain/types';

type Props = { recap: PoolArchiveRecap | null };

function StatRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="font-bold text-sm">{value}</span>
    </li>
  );
}

export function ArchivePoolStatsPanel({ recap }: Props): ReactElement {
  if (!recap) {
    return (
      <div className="card p-4">
        <span className="section-label">Pool statistics</span>
        <p className="text-xs text-ink-muted mt-2">
          Statistics aren&apos;t available for this archive yet — re-archive to generate them.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4" data-testid="archive-pool-stats-panel">
      <span className="section-label">Pool statistics</span>
      <ul className="mt-3 space-y-2">
        <StatRow label="Overall prediction accuracy" value={`${recap.overallAccuracyPercent}%`} />
        <StatRow
          label="Group stage leader"
          value={
            recap.groupStageLeader
              ? `${recap.groupStageLeader.displayName} (${recap.groupStageLeader.points} pts)`
              : '—'
          }
        />
        <StatRow
          label="Knockout stage leader"
          value={
            recap.knockoutStageLeader
              ? `${recap.knockoutStageLeader.displayName} (${recap.knockoutStageLeader.points} pts)`
              : '—'
          }
        />
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Export it from the feature barrel**

In `apps/web/src/features/pool-archive/index.ts`, add:

```ts
export { ArchivePoolStatsPanel } from './ui/ArchivePoolStatsPanel';
```

- [ ] **Step 3: Wire it into the archive page**

In `apps/web/src/app/(authenticated)/pools/[id]/archive/page.tsx`, add `ArchivePoolStatsPanel` to
the existing import from `@/features/pool-archive`:

```ts
import {
  getPoolArchiveView,
  ArchivePoolCard,
  ArchiveMemberRow,
  ArchiveHeroCard,
  ArchiveHighlightsPanel,
  ArchiveLeadChangesPanel,
  ArchiveStatTiles,
  ArchivePoolStatsPanel,
  toRaceChartData,
} from '@/features/pool-archive';
```

Render it in the left column, right after `ArchiveStatTiles`:

```tsx
<div className="flex flex-col gap-4 min-w-0">
  {raceChartData && raceChartData.chartPlayers.length > 0 && (
    <div className="card p-4">
      <span className="section-label">The race, start to finish</span>
      <RaceChart
        stages={raceChartData.chartStages}
        nowIndex={raceChartData.chartNowIndex}
        players={raceChartData.chartPlayers}
      />
    </div>
  )}
  <ArchiveStatTiles matchesPlayed={matchesPlayed} recap={archive.recap} />
  <ArchivePoolStatsPanel recap={archive.recap} />
</div>
```

- [ ] **Step 4: Manually verify in the browser**

Run: `pnpm -C apps/web dev`, sign in, navigate to an archived pool's `/pools/[id]/archive` page.
Confirm the new "Pool statistics" card renders below "Matches played"/etc. with a percentage and
two leader rows (or the empty-state message if the pool isn't archived, or hasn't been re-archived
since this change landed).

- [ ] **Step 5: Run the full web test suite for regressions**

Run: `npx vitest run apps/web/src/features/pool-archive`
Expected: PASS.

---

## Task 11: Docs + final gate + commit 2

**Files:**

- Modify: `docs/features/pool-archive.md`
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: Update `docs/features/pool-archive.md`**

In the "Recap" section (where `championPick`/`bestSingleMatch`/`biggestUpset` are documented), add
a paragraph:

```markdown
- **Pool statistics** (`overallAccuracyPercent`, `groupStageLeader`, `knockoutStageLeader`,
  `groupCompletionStageIndex`) — frozen at archive time alongside the other recap fields.
  `overallAccuracyPercent` sums hit/attempted accuracy detail (`AccuracyBreakdown`, from
  `@cup/engine`'s `scoreCardAccuracy`) across every member's full `CardInputs`, assembled and
  augmented the same way `rescoreCard` already does for real scoring — so it can never disagree
  with the actual points. `groupStageLeader`/`knockoutStageLeader` read `pointsHistory` at the
  group-completion stage index and at tournament end. `groupCompletionStageIndex` is also used to
  restrict `computeBiggestRiser` to knockout-stage-onward transitions (see below), since
  group-stage rank swings are mostly noise (many matches resolve per day across a large pool).
```

In the "Biggest riser / Lead changes" bullet, replace the existing text with:

```markdown
- **Biggest riser** / **Lead changes** — derived (not stored) from the frozen per-member
  `points_history` at _view_ time, via `race-history.ts`'s pure `computeBiggestRiser`/
  `computeLeadChanges`. `computeBiggestRiser` only scans transitions from the group-stage-complete
  point onward (`recap.groupCompletionStageIndex + 1`), since group-stage rank jumps are mostly
  noise; `computeLeadChanges` still scans the full tournament. Both use `displayName`-ascending
  tiebreaks for equal points, matching `getLeaderboard`'s existing convention.
```

- [ ] **Step 2: Update `docs/PROGRESS.md`**

Add a new section right before `## What's next (the remaining-plan sequence)`:

```markdown
## Archive pool statistics (2026-07-20)

Added three new pool-archive stats: a blended `overallAccuracyPercent` (any-credit-counts, across
every prediction category), and `groupStageLeader`/`knockoutStageLeader` (points-leader callouts at
group-stage-end and tournament-end). Also restricted `computeBiggestRiser` to knockout-stage-onward
transitions — group-stage rank swings were mostly noise (many matches resolve per day across an
11-member pool), making a "biggest riser" pulled from the group stage a misleading highlight.

- **`packages/engine`** — every scoring category function now has a `scoreXxxDetail` sibling
  reporting `{hits, attempted}`, derived from the exact same comparison used for points (never a
  parallel calculation). New `scoreCardAccuracy(derived, inputs, actual): AccuracyBreakdown`
  aggregates all categories. This is what makes `overallAccuracyPercent` unable to drift out of
  sync with real scoring — the same bug class fixed in the R32/SF-position/champion-pick incidents
  above was "correctness logic living outside the engine."
- **`apps/web/src/features/pool-archive/application/build-recap.ts`** — assembles each member's
  `CardInputs` via `getPrediction`/`getPredictionInputs` (mirroring `rescoreCard`'s late-joiner
  augmentation exactly), sums `scoreCardAccuracy` across the pool for `overallAccuracyPercent`.
  `groupCompletionStageIndex` computed via the new `findOverallGroupCompletionDate`
  (`apps/web/src/shared/race-chart.ts`) resolved to a `stages` index.
- **`apps/web/src/features/pool-archive/domain/race-history.ts`** — `computeBiggestRiser` gained a
  required `knockoutStartIndex` parameter.
- **`ArchivePoolStatsPanel`** (new) — renders the three stats on `/pools/[id]/archive`, below
  `ArchiveStatTiles`.
- No DB migration — `PoolArchiveRecap` is a `jsonb` column; new fields are TS-type-only.
- **Rollout:** the prod WC2026 pool's frozen archive still has the old shape (missing these
  fields) until the owner re-archives via the existing UI action (idempotent).
- **Design/plan:** `docs/superpowers/specs/2026-07-20-archive-pool-statistics-design.md`,
  `docs/superpowers/plans/2026-07-20-archive-pool-statistics.md`.
```

- [ ] **Step 3: Run the full quality gate**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`
Expected: everything passes. Fix anything that doesn't before proceeding.

- [ ] **Step 4: Commit this task's changes**

```bash
git add docs/features/pool-archive.md \
  docs/PROGRESS.md \
  docs/superpowers/specs/2026-07-20-archive-pool-statistics-design.md \
  docs/superpowers/plans/2026-07-20-archive-pool-statistics.md
git commit -m "$(cat <<'EOF'
docs(pool-archive): document the new pool-statistics feature

Updates docs/features/pool-archive.md (recap fields, biggest-riser
restriction) and docs/PROGRESS.md with the archive-statistics feature
completed across the preceding tasks on this branch, plus the spec and
plan docs that describe it.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Verify the final state**

Run: `git log --oneline -3` and confirm two new commits (this task's, plus Task 6's engine commit)
sit on top of the existing history. Run: `git status --short` and confirm the working tree is clean.
