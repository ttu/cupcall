# Points Race: Knockout Match Matrix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "By knockout" sub-tab to the Points Race tab showing a flat scrollable matrix of all knockout matches with per-player winner-pick results (hit / miss / no-pick / pending), and rename the existing "By match" sub-tab to "By group stage".

**Architecture:** New `getKnockoutPicksByPool` DB function mirrors `getGroupScoresByPool`; new `buildKnockoutMatrix` pure function builds the pool-wide matrix from bracket rounds + pool picks; new `KnockoutMatrix` UI component mirrors `MatchMatrix`. No new pages or routes — all changes are within the `results` feature and `@cup/db`.

**Tech Stack:** Drizzle ORM (Postgres via pglite in tests), TypeScript strict, React / Next.js 15, Tailwind CSS via design-system classes.

## Global Constraints

- TypeScript strict — no `any`, no unsafe casts.
- Branded types: `UserId`, `PoolId`, `BracketMatchKey` from `@cup/engine`.
- TDD: write the failing test first, then implement.
- All logic tested via integration (pglite) or unit tests; no mocks inside the system boundary.
- One commit for the whole feature at the end; include the spec doc in the same commit.
- Run `pnpm format && pnpm lint && pnpm typecheck && pnpm test` before committing.
- Spec: `docs/superpowers/specs/2026-06-28-points-race-knockout-view-design.md`

---

## File Map

| File                                                                    | Action | Responsibility                                              |
| ----------------------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| `packages/db/src/repositories/predictions.ts`                           | Modify | Add `PoolKnockoutPick` type + `getKnockoutPicksByPool`      |
| `packages/db/src/repositories/predictions.test.ts`                      | Modify | Integration test for `getKnockoutPicksByPool`               |
| `apps/web/src/features/results/domain/types.ts`                         | Modify | Add 4 new types + 2 fields on `PointsRaceView`              |
| `apps/web/src/features/results/application/build-race-view.ts`          | Modify | Add `buildKnockoutMatrix` + wire into `buildPointsRaceView` |
| `apps/web/src/features/results/application/get-results-view.ts`         | Modify | Fetch pool KO picks, pass to `buildPointsRaceView`          |
| `apps/web/src/features/results/application/get-results-view.test.ts`    | Modify | Extend integration test for knockout matrix in race view    |
| `apps/web/src/features/results/ui/KnockoutMatrix.tsx`                   | Create | Pool-wide knockout pick matrix component                    |
| `apps/web/src/features/results/ui/PointsRaceTab.tsx`                    | Modify | Add 3rd sub-tab + rename existing sub-tab                   |
| `docs/superpowers/specs/2026-06-28-points-race-knockout-view-design.md` | Commit | Included in final feature commit                            |

---

## Task 1: DB — `getKnockoutPicksByPool`

**Files:**

- Modify: `packages/db/src/repositories/predictions.ts`
- Modify: `packages/db/src/repositories/predictions.test.ts`

**Interfaces:**

- Produces: `PoolKnockoutPick` type and `getKnockoutPicksByPool(db, poolId)` exported from `@cup/db` (via the existing `export * from './repositories/predictions'` barrel)

- [ ] **Step 1: Write the failing test**

Add to the existing `describe('predictions repository', ...)` block in `packages/db/src/repositories/predictions.test.ts`:

```ts
import {
  listPredictionsForTournament,
  getPredictionInputs,
  clearPredictionInputs,
  getGroupScoresByPool,
  getKnockoutPicksByPool, // add this import
} from './predictions';
```

Add at the bottom of the `describe` block:

```ts
describe('getKnockoutPicksByPool', () => {
  it('returns empty array when no picks exist', async () => {
    const result = await getKnockoutPicksByPool(db, poolId);
    expect(result).toHaveLength(0);
  });

  it('returns knockout picks for pool members only', async () => {
    // Seed a second user in the same pool
    const user2 = await createUser(db, {
      email: `u2-${crypto.randomUUID()}@x.com`,
      displayName: 'Bob',
    });

    // Seed predictions
    const pred1 = await seedPrediction(
      db,
      poolId as string,
      userId1 as string,
      tournamentId as string,
    );
    const pred2 = await seedPrediction(
      db,
      poolId as string,
      user2.id as string,
      tournamentId as string,
    );

    // Insert knockout picks
    await db.insert(schema.predictionKnockoutPicks).values([
      { predictionId: pred1 as string, bracketMatchKey: 'qf1', winnerTeamId: 'A1' },
      { predictionId: pred2 as string, bracketMatchKey: 'qf1', winnerTeamId: 'B1' },
      { predictionId: pred2 as string, bracketMatchKey: 'sf1', winnerTeamId: 'A1' },
    ]);

    const result = await getKnockoutPicksByPool(db, poolId);
    expect(result).toHaveLength(3);

    const user1Pick = result.find((r) => r.userId === userId1 && r.bracketMatchKey === 'qf1');
    expect(user1Pick?.winnerTeamId).toBe('A1');

    const user2Picks = result.filter((r) => r.userId === user2.id);
    expect(user2Picks).toHaveLength(2);
  });

  it('does not return picks from a different pool', async () => {
    // Create second pool
    const owner2 = await createUser(db, {
      email: `owner2-${crypto.randomUUID()}@x.com`,
      displayName: 'Owner2',
    });
    const pool2 = await createPool(db, {
      tournamentId,
      ownerId: owner2.id,
      name: 'Other Pool',
      inviteTokenHash: `h2-${crypto.randomUUID()}`,
    });

    const pred1 = await seedPrediction(
      db,
      poolId as string,
      userId1 as string,
      tournamentId as string,
    );
    const pred2 = await seedPrediction(
      db,
      pool2.id as string,
      owner2.id as string,
      tournamentId as string,
    );

    await db.insert(schema.predictionKnockoutPicks).values([
      { predictionId: pred1 as string, bracketMatchKey: 'qf1', winnerTeamId: 'A1' },
      { predictionId: pred2 as string, bracketMatchKey: 'qf1', winnerTeamId: 'B1' },
    ]);

    const result = await getKnockoutPicksByPool(db, poolId);
    expect(result).toHaveLength(1);
    expect(result[0]?.winnerTeamId).toBe('A1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -C packages/db test -- --reporter=verbose predictions.test
```

Expected: FAIL — `getKnockoutPicksByPool is not a function`

- [ ] **Step 3: Implement**

In `packages/db/src/repositories/predictions.ts`, add after the existing `PoolSpecialBet` type and before the end of the file:

```ts
export type PoolKnockoutPick = {
  userId: UserId;
  bracketMatchKey: BracketMatchKey;
  winnerTeamId: string;
};

/**
 * Returns all knockout pick predictions for every member of a pool in a single
 * JOIN query. Used to build the per-match knockout matrix in the results view.
 */
export async function getKnockoutPicksByPool(
  db: Database,
  poolId: PoolId,
): Promise<PoolKnockoutPick[]> {
  const rows = await db
    .select({
      userId: schema.predictions.userId,
      bracketMatchKey: schema.predictionKnockoutPicks.bracketMatchKey,
      winnerTeamId: schema.predictionKnockoutPicks.winnerTeamId,
    })
    .from(schema.predictions)
    .innerJoin(
      schema.predictionKnockoutPicks,
      eq(schema.predictionKnockoutPicks.predictionId, schema.predictions.id),
    )
    .where(eq(schema.predictions.poolId, poolId));

  return rows.map((r) => ({
    userId: userId(r.userId),
    bracketMatchKey: bracketMatchKey(r.bracketMatchKey),
    winnerTeamId: r.winnerTeamId,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm -C packages/db test -- --reporter=verbose predictions.test
```

Expected: PASS — all `getKnockoutPicksByPool` tests green.

---

## Task 2: Domain types

**Files:**

- Modify: `apps/web/src/features/results/domain/types.ts`

**Interfaces:**

- Produces: `KnockoutMatchHit`, `KnockoutMatrixCell`, `KnockoutMatrixEntry`, `KnockoutMatrixMatch` types; `PointsRaceView.knockoutMatrix` and `PointsRaceView.knockoutMatrixMatches` fields.

- [ ] **Step 1: Add types**

In `apps/web/src/features/results/domain/types.ts`, add the following block immediately after the existing `MatrixMatch` type (around line 221):

```ts
// ---------------------------------------------------------------------------
// Knockout matrix
// ---------------------------------------------------------------------------

export type KnockoutMatchHit = 'hit' | 'miss' | 'no-pick' | 'pending';

export type KnockoutMatrixCell = {
  bracketMatchKey: string;
  hit: KnockoutMatchHit;
  /** Points earned from this pick. 0 for non-hits and for rounds with holistic scoring (e.g. QF topFour). */
  points: number;
  /** The team ID the player picked for this match. Null when no pick was made. Used to show abbreviation in pending cells. */
  pickedWinnerId: string | null;
};

export type KnockoutMatrixEntry = {
  userId: string;
  displayName: string;
  isCurrentUser: boolean;
  cells: KnockoutMatrixCell[];
  /** Sum of points across all hit cells. */
  totalPoints: number;
};

export type KnockoutMatrixMatch = {
  bracketMatchKey: string;
  round: string;
  homeTeamId: string | null;
  homeTeamName: string | null;
  awayTeamId: string | null;
  awayTeamName: string | null;
  actualWinnerId: string | null;
  kickoff: string | null;
  status: 'scheduled' | 'final';
};
```

- [ ] **Step 2: Extend `PointsRaceView`**

In the same file, find the `PointsRaceView` type and add two fields at the bottom:

```ts
export type PointsRaceView = {
  // ... existing fields unchanged ...
  matchMatrix: MatchMatrixEntry[];
  matrixMatches: MatrixMatch[];
  /** Rows of the per-knockout-match pick matrix, sorted by totalPoints DESC. */
  knockoutMatrix: KnockoutMatrixEntry[];
  /** All knockout matches as matrix columns, sorted flat by kickoff (nulls last). */
  knockoutMatrixMatches: KnockoutMatrixMatch[];
};
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS (no new usage yet, but types must be valid TS).

---

## Task 3: Application — `buildKnockoutMatrix`

**Files:**

- Modify: `apps/web/src/features/results/application/build-race-view.ts`

**Interfaces:**

- Consumes: `BracketRoundResultView[]`, `KnockoutMatchView | null`, `PoolKnockoutPick[]`, `LeaderboardEntry[]`, `string | null` (userId), `Tournament`
- Produces: `{ knockoutMatrix: KnockoutMatrixEntry[]; knockoutMatrixMatches: KnockoutMatrixMatch[] }` — returned as part of `PointsRaceView`

- [ ] **Step 1: Write the failing unit test**

Create (or add to) a test file — the existing `build-race-view` logic is tested indirectly via `get-results-view.test.ts`. Add a focused unit test to a new describe block at the top of `apps/web/src/features/results/application/get-results-view.test.ts` (it lives alongside the integration test; unit tests at the top, integration below):

Actually, add a dedicated test file to keep concerns separate:

Create `apps/web/src/features/results/application/build-race-view.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildKnockoutMatrix } from './build-race-view';
import { miniTournament } from '@cup/engine/testing';
import { bracketMatchKey, teamId, userId } from '@cup/engine';
import type { BracketRoundResultView, KnockoutMatchView } from '../domain/types';

// Helpers ----------------------------------------------------------------

function makeMatch(
  key: string,
  round: string,
  homeId: string | null,
  awayId: string | null,
  winnerId: string | null,
  status: 'scheduled' | 'final' = 'final',
): KnockoutMatchView {
  return {
    bracketMatchKey: key,
    round,
    homeTeamId: homeId,
    homeTeamName: homeId,
    awayTeamId: awayId,
    awayTeamName: awayId,
    actualHome: status === 'final' ? 1 : null,
    actualAway: status === 'final' ? 0 : null,
    actualWinnerId: winnerId,
    actualWinnerName: winnerId,
    kickoff: status === 'final' ? '2026-07-01T18:00:00Z' : null,
    status,
    pickedWinnerId: null,
    pickedWinnerName: null,
    pickedOpponentId: null,
    pickedOpponentName: null,
    pickStatus: 'no-pick',
    predictedHome: null,
    predictedAway: null,
    hit: 'pending',
    projected: false,
    homeTeamConfirmed: true,
    awayTeamConfirmed: true,
    isEntryRound: false,
    homeTeamR32Pct: null,
    awayTeamR32Pct: null,
    predictedHomeTeamId: null,
    predictedHomeTeamName: null,
    predictedAwayTeamId: null,
    predictedAwayTeamName: null,
  };
}

function makeLeaderboard(entries: { id: string; name: string }[]) {
  return entries.map((e) => ({
    userId: userId(e.id),
    displayName: e.name,
    pointsTotal: 0,
    breakdown: null,
  }));
}

// mini-tournament: QF (entry) → SF → Final + Bronze
// bracket.slots = [qf1, qf2, qf3, qf4] (all entry-round QF matches)
// scoring: roundOf8PerTeam=3, final.perTeam=5, bronze.perTeam=5

describe('buildKnockoutMatrix', () => {
  const def = miniTournament;

  it('returns empty matrix when no matches and no picks', () => {
    const { knockoutMatrix, knockoutMatrixMatches } = buildKnockoutMatrix({
      bracketRounds: [],
      bronzeMatch: null,
      poolKnockoutPicks: [],
      leaderboard: makeLeaderboard([{ id: 'u1', name: 'Alice' }]),
      userId: 'u1',
      def,
    });
    expect(knockoutMatrixMatches).toHaveLength(0);
    expect(knockoutMatrix[0]?.cells).toHaveLength(0);
  });

  it('marks hit when player picked the actual winner', () => {
    const qf1Match = makeMatch('qf1', 'QF', 'A1', 'B1', 'A1', 'final');
    const rounds: BracketRoundResultView[] = [{ label: 'QF', matches: [qf1Match] }];

    const { knockoutMatrix } = buildKnockoutMatrix({
      bracketRounds: rounds,
      bronzeMatch: null,
      poolKnockoutPicks: [
        { userId: userId('u1'), bracketMatchKey: bracketMatchKey('qf1'), winnerTeamId: 'A1' },
      ],
      leaderboard: makeLeaderboard([{ id: 'u1', name: 'Alice' }]),
      userId: 'u1',
      def,
    });

    const cell = knockoutMatrix[0]?.cells[0];
    // QF (roundOf8 entry round in mini-tournament) → 0 pts (topFour is holistic)
    expect(cell?.hit).toBe('hit');
    expect(cell?.points).toBe(0);
  });

  it('marks miss when player picked the wrong winner', () => {
    const sf1Match = makeMatch('sf1', 'SF', 'A1', 'B1', 'A1', 'final');
    const rounds: BracketRoundResultView[] = [{ label: 'SF', matches: [sf1Match] }];

    const { knockoutMatrix } = buildKnockoutMatrix({
      bracketRounds: rounds,
      bronzeMatch: null,
      poolKnockoutPicks: [
        { userId: userId('u1'), bracketMatchKey: bracketMatchKey('sf1'), winnerTeamId: 'B1' },
      ],
      leaderboard: makeLeaderboard([{ id: 'u1', name: 'Alice' }]),
      userId: 'u1',
      def,
    });

    const cell = knockoutMatrix[0]?.cells[0];
    expect(cell?.hit).toBe('miss');
    expect(cell?.points).toBe(0);
  });

  it('marks no-pick when player made no pick for a played match', () => {
    const sf1Match = makeMatch('sf1', 'SF', 'A1', 'B1', 'A1', 'final');
    const rounds: BracketRoundResultView[] = [{ label: 'SF', matches: [sf1Match] }];

    const { knockoutMatrix } = buildKnockoutMatrix({
      bracketRounds: rounds,
      bronzeMatch: null,
      poolKnockoutPicks: [],
      leaderboard: makeLeaderboard([{ id: 'u1', name: 'Alice' }]),
      userId: 'u1',
      def,
    });

    const cell = knockoutMatrix[0]?.cells[0];
    expect(cell?.hit).toBe('no-pick');
    expect(cell?.points).toBe(0);
  });

  it('marks pending for unplayed matches', () => {
    const sf1Match = makeMatch('sf1', 'SF', 'A1', 'B1', null, 'scheduled');
    const rounds: BracketRoundResultView[] = [{ label: 'SF', matches: [sf1Match] }];

    const { knockoutMatrix } = buildKnockoutMatrix({
      bracketRounds: rounds,
      bronzeMatch: null,
      poolKnockoutPicks: [
        { userId: userId('u1'), bracketMatchKey: bracketMatchKey('sf1'), winnerTeamId: 'A1' },
      ],
      leaderboard: makeLeaderboard([{ id: 'u1', name: 'Alice' }]),
      userId: 'u1',
      def,
    });

    const cell = knockoutMatrix[0]?.cells[0];
    expect(cell?.hit).toBe('pending');
    expect(cell?.points).toBe(0);
  });

  it('awards final.perTeam points for correct SF pick', () => {
    const sf1Match = makeMatch('sf1', 'SF', 'A1', 'B1', 'A1', 'final');
    const rounds: BracketRoundResultView[] = [{ label: 'SF', matches: [sf1Match] }];

    const { knockoutMatrix } = buildKnockoutMatrix({
      bracketRounds: rounds,
      bronzeMatch: null,
      poolKnockoutPicks: [
        { userId: userId('u1'), bracketMatchKey: bracketMatchKey('sf1'), winnerTeamId: 'A1' },
      ],
      leaderboard: makeLeaderboard([{ id: 'u1', name: 'Alice' }]),
      userId: 'u1',
      def,
    });

    const cell = knockoutMatrix[0]?.cells[0];
    expect(cell?.hit).toBe('hit');
    // def.scoring.final.perTeam = 5 in mini-tournament
    expect(cell?.points).toBe(5);
    expect(knockoutMatrix[0]?.totalPoints).toBe(5);
  });

  it('sorts knockoutMatrix by totalPoints DESC', () => {
    const sf1Match = makeMatch('sf1', 'SF', 'A1', 'B1', 'A1', 'final');
    const rounds: BracketRoundResultView[] = [{ label: 'SF', matches: [sf1Match] }];

    const { knockoutMatrix } = buildKnockoutMatrix({
      bracketRounds: rounds,
      bronzeMatch: null,
      poolKnockoutPicks: [
        // Alice: wrong pick
        { userId: userId('u1'), bracketMatchKey: bracketMatchKey('sf1'), winnerTeamId: 'B1' },
        // Bob: correct pick
        { userId: userId('u2'), bracketMatchKey: bracketMatchKey('sf1'), winnerTeamId: 'A1' },
      ],
      leaderboard: makeLeaderboard([
        { id: 'u1', name: 'Alice' },
        { id: 'u2', name: 'Bob' },
      ]),
      userId: 'u1',
      def,
    });

    expect(knockoutMatrix[0]?.displayName).toBe('Bob');
    expect(knockoutMatrix[0]?.totalPoints).toBe(5);
    expect(knockoutMatrix[1]?.displayName).toBe('Alice');
    expect(knockoutMatrix[1]?.totalPoints).toBe(0);
  });

  it('sorts knockoutMatrixMatches by kickoff, nulls last', () => {
    const sf1 = makeMatch('sf1', 'SF', 'A1', 'B1', 'A1', 'final');
    sf1.kickoff = '2026-07-05T18:00:00Z';
    const sf2 = makeMatch('sf2', 'SF', 'C1', 'D1', 'C1', 'final');
    sf2.kickoff = '2026-07-04T18:00:00Z';
    const finalMatch = makeMatch('final', 'Final', 'A1', 'C1', null, 'scheduled');
    finalMatch.kickoff = null;

    const rounds: BracketRoundResultView[] = [
      { label: 'SF', matches: [sf1, sf2] },
      { label: 'Final', matches: [finalMatch] },
    ];

    const { knockoutMatrixMatches } = buildKnockoutMatrix({
      bracketRounds: rounds,
      bronzeMatch: null,
      poolKnockoutPicks: [],
      leaderboard: [],
      userId: null,
      def,
    });

    expect(knockoutMatrixMatches[0]?.bracketMatchKey).toBe('sf2');
    expect(knockoutMatrixMatches[1]?.bracketMatchKey).toBe('sf1');
    expect(knockoutMatrixMatches[2]?.bracketMatchKey).toBe('final');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -C apps/web test -- --reporter=verbose build-race-view.test
```

Expected: FAIL — `buildKnockoutMatrix is not a function`

- [ ] **Step 3: Implement `buildKnockoutMatrix` and wire into `buildPointsRaceView`**

In `apps/web/src/features/results/application/build-race-view.ts`:

**a) Update imports** — add the new types:

```ts
import type {
  PointsRaceView,
  RaceChartPlayer,
  ProjectedEntry,
  MatchMatrixEntry,
  MatrixMatch,
  MatchMatrixCell,
  KnockoutMatrixEntry,
  KnockoutMatrixMatch,
  KnockoutMatrixCell,
  KnockoutMatchHit,
  BracketRoundResultView,
  KnockoutMatchView,
} from '../domain/types';
import type { PoolKnockoutPick } from '@cup/db';
```

**b) Extend `RaceParams`** — add three new fields:

```ts
type RaceParams = {
  leaderboard: LeaderboardEntry[];
  userId: string | null;
  allMatches: MatchRow[];
  poolGroupScores: PoolGroupScore[];
  def: Tournament;
  myTotalCanStillGet: number;
  bracketRounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
  poolKnockoutPicks: PoolKnockoutPick[];
};
```

**c) Wire into `buildPointsRaceView`** — call `buildKnockoutMatrix` and include in return value:

```ts
export function buildPointsRaceView(params: RaceParams): PointsRaceView {
  const {
    leaderboard,
    userId,
    allMatches,
    poolGroupScores,
    def,
    myTotalCanStillGet,
    bracketRounds,
    bronzeMatch,
    poolKnockoutPicks,
  } = params;

  // ... existing code unchanged ...

  const { matchMatrix, matrixMatches } = buildMatchMatrix(
    leaderboard,
    userId,
    allMatches,
    poolGroupScores,
    def,
  );

  const { knockoutMatrix, knockoutMatrixMatches } = buildKnockoutMatrix({
    bracketRounds,
    bronzeMatch,
    poolKnockoutPicks,
    leaderboard,
    userId,
    def,
  });

  return {
    chartStages: stages,
    chartNowIndex: nowIndex,
    chartPlayers,
    myBanked,
    myStillLive,
    myProjected,
    myTotalCanStillGet,
    projectedEntries,
    matchMatrix,
    matrixMatches,
    knockoutMatrix,
    knockoutMatrixMatches,
  };
}
```

**d) Add `buildKnockoutMatrix` function** — add after `buildMatchMatrix`:

```ts
/**
 * Builds a per-match scoring map: bracketMatchKey → points per correct pick.
 *
 * - Rounds feeding into roundOf16Matches → roundOf16PerTeam (e.g. R32 in WC-48)
 * - Rounds feeding into roundOf8Matches → roundOf8PerTeam (e.g. R16 in WC-48)
 * - SF matches (feeding into Final) → final.perTeam (each SF winner is a finalist)
 * - Final → final.perTeam
 * - Bronze → bronze.perTeam
 * - All other rounds (e.g. QF in tournaments with topFourOrder holistic scoring) → 0
 */
function buildHitPointsMap(def: Tournament): Map<string, number> {
  const map = new Map<string, number>();
  const { bracket, scoring } = def;

  for (const prog of bracket.progression) {
    if ((bracket.roundOf16Matches as string[]).includes(prog.match as string)) {
      for (const fromKey of prog.from) map.set(fromKey as string, scoring.roundOf16PerTeam);
    }
    if ((bracket.roundOf8Matches as string[]).includes(prog.match as string)) {
      for (const fromKey of prog.from) map.set(fromKey as string, scoring.roundOf8PerTeam);
    }
  }

  const finalProg = bracket.progression.find((p) => p.match === bracket.finalMatch);
  if (finalProg) {
    for (const sfKey of finalProg.from) map.set(sfKey as string, scoring.final.perTeam);
  }

  map.set(bracket.finalMatch as string, scoring.final.perTeam);
  map.set(bracket.bronzeMatch as string, scoring.bronze.perTeam);

  return map;
}

export function buildKnockoutMatrix(params: {
  bracketRounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
  poolKnockoutPicks: PoolKnockoutPick[];
  leaderboard: LeaderboardEntry[];
  userId: string | null;
  def: Tournament;
}): { knockoutMatrix: KnockoutMatrixEntry[]; knockoutMatrixMatches: KnockoutMatrixMatch[] } {
  const { bracketRounds, bronzeMatch, poolKnockoutPicks, leaderboard, userId, def } = params;

  // Flatten all bracket match views (rounds first, bronze last)
  const allMatchViews: KnockoutMatchView[] = [
    ...bracketRounds.flatMap((r) => r.matches),
    ...(bronzeMatch ? [bronzeMatch] : []),
  ];

  // Build KnockoutMatrixMatch list sorted flat by kickoff (nulls last)
  const knockoutMatrixMatches: KnockoutMatrixMatch[] = allMatchViews
    .map((m) => ({
      bracketMatchKey: m.bracketMatchKey,
      round: m.round,
      homeTeamId: m.homeTeamId,
      homeTeamName: m.homeTeamName,
      awayTeamId: m.awayTeamId,
      awayTeamName: m.awayTeamName,
      actualWinnerId: m.actualWinnerId,
      kickoff: m.kickoff,
      status: m.status,
    }))
    .toSorted((a, b) => {
      if (!a.kickoff && !b.kickoff) return 0;
      if (!a.kickoff) return 1;
      if (!b.kickoff) return -1;
      return new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime();
    });

  const hitPointsMap = buildHitPointsMap(def);

  // Build a lookup: userId::bracketMatchKey → winnerTeamId
  const pickMap = new Map<string, string>();
  for (const pick of poolKnockoutPicks) {
    pickMap.set(`${pick.userId}::${pick.bracketMatchKey}`, pick.winnerTeamId);
  }

  const knockoutMatrix: KnockoutMatrixEntry[] = leaderboard.map((e) => {
    let totalPoints = 0;
    const cells: KnockoutMatrixCell[] = knockoutMatrixMatches.map((m) => {
      const pickedWinnerId = pickMap.get(`${e.userId}::${m.bracketMatchKey}`) ?? null;

      let hit: KnockoutMatchHit;
      let points = 0;

      if (m.status !== 'final' || m.actualWinnerId === null) {
        hit = 'pending';
      } else if (pickedWinnerId === null) {
        hit = 'no-pick';
      } else if (pickedWinnerId === m.actualWinnerId) {
        hit = 'hit';
        points = hitPointsMap.get(m.bracketMatchKey) ?? 0;
        totalPoints += points;
      } else {
        hit = 'miss';
      }

      return { bracketMatchKey: m.bracketMatchKey, hit, points, pickedWinnerId };
    });

    return {
      userId: e.userId as string,
      displayName: e.displayName,
      isCurrentUser: userId !== null && e.userId === userId,
      cells,
      totalPoints,
    };
  });

  return {
    knockoutMatrix: knockoutMatrix.toSorted((a, b) => b.totalPoints - a.totalPoints),
    knockoutMatrixMatches,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm -C apps/web test -- --reporter=verbose build-race-view.test
```

Expected: PASS — all `buildKnockoutMatrix` tests green.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

---

## Task 4: Wire `get-results-view.ts`

**Files:**

- Modify: `apps/web/src/features/results/application/get-results-view.ts`
- Modify: `apps/web/src/features/results/application/get-results-view.test.ts`

**Interfaces:**

- Consumes: `getKnockoutPicksByPool` from `@cup/db`
- Produces: `ResultsView.pointsRaceView` now includes `knockoutMatrix` and `knockoutMatrixMatches`

- [ ] **Step 1: Write the failing integration test**

Find the `getResultsView` describe block in `apps/web/src/features/results/application/get-results-view.test.ts`.

Locate the existing test that checks the points race view (look for `pointsRaceView`). Add a new assertion or a new `it` block that checks the knockout matrix is present:

```ts
it('includes knockoutMatrix and knockoutMatrixMatches in pointsRaceView', async () => {
  const view = await getResultsView({ db, poolId, userId: aliceId, now: new Date() });
  expect(view).not.toBeNull();
  expect(view!.pointsRaceView.knockoutMatrix).toBeDefined();
  expect(view!.pointsRaceView.knockoutMatrixMatches).toBeDefined();
  expect(Array.isArray(view!.pointsRaceView.knockoutMatrix)).toBe(true);
  expect(Array.isArray(view!.pointsRaceView.knockoutMatrixMatches)).toBe(true);
});
```

(If there is no `aliceId` or similar in the existing test setup, use whatever user variable the test already uses.)

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -C apps/web test -- --reporter=verbose get-results-view.test
```

Expected: FAIL — `knockoutMatrix` is undefined (not yet in the return value).

- [ ] **Step 3: Implement the wiring**

In `apps/web/src/features/results/application/get-results-view.ts`:

**a) Add import:**

```ts
import { getKnockoutPicksByPool } from '@cup/db';
```

**b) Add to the parallel `Promise.all` fetch** (add `getKnockoutPicksByPool(db, poolId)` as a new array entry):

```ts
const [
  leaderboard,
  prediction,
  allMatches,
  poolGroupScores,
  actualResults,
  poolSpecialBets,
  poolKnockoutPicks,
] = await Promise.all([
  getLeaderboard(db, poolId),
  userId !== undefined
    ? getPrediction(db, poolId, userId as import('@cup/engine').UserId)
    : Promise.resolve(null),
  getMatchesForTournament(db, pool.tournamentId),
  getGroupScoresByPool(db, poolId),
  getActualResults(db, pool.tournamentId),
  getSpecialBetsByPool(db, poolId),
  getKnockoutPicksByPool(db, poolId),
]);
```

**c) Pass new params to `buildPointsRaceView`:**

```ts
const pointsRaceView = buildPointsRaceView({
  leaderboard,
  userId: userId ?? null,
  allMatches,
  poolGroupScores,
  def,
  myTotalCanStillGet,
  bracketRounds,
  bronzeMatch,
  poolKnockoutPicks,
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm -C apps/web test -- --reporter=verbose get-results-view.test
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

---

## Task 5: UI — `KnockoutMatrix.tsx` and `PointsRaceTab.tsx`

**Files:**

- Create: `apps/web/src/features/results/ui/KnockoutMatrix.tsx`
- Modify: `apps/web/src/features/results/ui/PointsRaceTab.tsx`

**Interfaces:**

- Consumes: `KnockoutMatrixEntry[]`, `KnockoutMatrixMatch[]` from `PointsRaceView`
- Produces: Rendered knockout matrix; updated sub-tab labels and routing

- [ ] **Step 1: Create `KnockoutMatrix.tsx`**

Create `apps/web/src/features/results/ui/KnockoutMatrix.tsx`:

```tsx
import type { ReactElement } from 'react';
import type { KnockoutMatrixEntry, KnockoutMatrixMatch, KnockoutMatchHit } from '../domain/types';
import { Avatar, cn } from '@/shared/ui';

const MATCH_COL_W = 48;

function formatKickoff(isoString: string | null): string {
  if (!isoString) return '?';
  return new Date(isoString).toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function KnockoutMatrix({
  entries,
  matches,
}: {
  entries: KnockoutMatrixEntry[];
  matches: KnockoutMatrixMatch[];
}): ReactElement {
  if (matches.length === 0) {
    return (
      <div className="card p-[32px_24px] text-center">
        <p className="text-sm text-ink-muted m-0">No knockout matches yet.</p>
      </div>
    );
  }

  const topPlayer = entries[0];
  const colTemplate = `50px 150px repeat(${matches.length}, ${MATCH_COL_W}px) 64px`;

  return (
    <div>
      <div className="card overflow-x-auto">
        <div className="min-w-max">
          {/* Header row */}
          <div
            className="grid items-center gap-1 bg-surface-2 border-b border-line"
            style={{ gridTemplateColumns: colTemplate }}
          >
            <div className="sticky left-0 z-10 bg-surface-2 self-stretch" />
            <span className="eyebrow text-ink-muted text-[10px] py-3">Player</span>
            {matches.map((m) => (
              <div
                key={m.bracketMatchKey}
                className="flex flex-col items-center gap-0.5 text-[11px] py-3"
              >
                <span className="font-extrabold text-ink-muted text-[9px] uppercase tracking-wide">
                  {m.round}
                </span>
                {m.status === 'final' && m.homeTeamId && m.awayTeamId ? (
                  <span className="text-[9.5px] font-bold text-ink-muted">
                    {m.homeTeamId}·{m.awayTeamId}
                  </span>
                ) : (
                  <span className="text-[9px] font-bold text-ink-muted">
                    {formatKickoff(m.kickoff)}
                  </span>
                )}
              </div>
            ))}
            <span className="eyebrow text-ink-muted text-[10px] text-right py-3 pr-4">Total</span>
          </div>

          {/* Player rows */}
          <div className="divide">
            {entries.map((row, idx) => (
              <KnockoutMatrixRow
                key={row.userId}
                row={row}
                avatarIndex={idx}
                colTemplate={colTemplate}
              />
            ))}
          </div>
        </div>
      </div>

      {topPlayer && topPlayer.totalPoints > 0 && (
        <p className="text-[12.5px] text-ink-muted mt-3.5">
          {topPlayer.isCurrentUser ? (
            <>
              You lead the knockout matrix with{' '}
              <strong className="text-ink">{topPlayer.totalPoints} pts</strong>.
            </>
          ) : (
            <>
              <strong className="text-ink">{topPlayer.displayName.split(' ')[0]}</strong> leads the
              knockout matrix with {topPlayer.totalPoints} pts.
            </>
          )}
        </p>
      )}
    </div>
  );
}

function KnockoutMatrixRow({
  row,
  avatarIndex,
  colTemplate,
}: {
  row: KnockoutMatrixEntry;
  avatarIndex: number;
  colTemplate: string;
}): ReactElement {
  const stickyBg = row.isCurrentUser ? 'bg-green-050' : 'bg-surface';

  return (
    <div
      className={cn(
        'grid items-center gap-1',
        row.isCurrentUser ? 'bg-green-050' : 'bg-transparent',
      )}
      style={{ gridTemplateColumns: colTemplate }}
    >
      <div
        className={cn(
          'sticky left-0 z-10 flex items-center justify-center self-stretch py-[9px]',
          stickyBg,
        )}
      >
        <Avatar name={row.displayName} index={avatarIndex} size={30} />
      </div>

      <span className="flex items-center min-w-0 py-[9px]">
        <span
          className={cn(
            'font-bold text-[13px] truncate',
            row.isCurrentUser ? 'text-green-700' : 'text-ink',
          )}
        >
          {row.displayName}
          {row.isCurrentUser && (
            <span className="chip green h-4.5 ml-[7px] text-[9.5px] align-middle">YOU</span>
          )}
        </span>
      </span>

      {row.cells.map((cell) => (
        <span key={cell.bracketMatchKey} className="grid place-items-center py-[9px]">
          <KnockoutCell hit={cell.hit} points={cell.points} pickedWinnerId={cell.pickedWinnerId} />
        </span>
      ))}

      <span
        className={cn(
          'display tnum text-right text-[18px] py-[9px] pr-4',
          row.isCurrentUser ? 'text-green-600' : 'text-ink',
        )}
      >
        {row.totalPoints}
      </span>
    </div>
  );
}

function KnockoutCell({
  hit,
  points,
  pickedWinnerId,
}: {
  hit: KnockoutMatchHit;
  points: number;
  pickedWinnerId: string | null;
}): ReactElement {
  if (hit === 'pending') {
    return (
      <span className="w-9 h-8 rounded-lg grid place-items-center text-[11px] font-bold bg-surface text-[oklch(0.62_0_0)] shadow-[inset_0_0_0_1px_var(--line-strong)]">
        {pickedWinnerId ?? '·'}
      </span>
    );
  }
  if (hit === 'no-pick') {
    return (
      <span className="w-9 h-8 rounded-lg grid place-items-center text-[13px] font-bold bg-surface-2 text-ink-muted shadow-[inset_0_0_0_1px_var(--line)]">
        —
      </span>
    );
  }
  if (hit === 'miss') {
    return (
      <span className="w-9 h-8 rounded-lg grid place-items-center text-sm bg-surface-2 text-ink-muted">
        ·
      </span>
    );
  }
  // hit
  return (
    <span className="w-9 h-8 rounded-lg grid place-items-center text-[11px] font-extrabold bg-green-500 text-[oklch(0.2_0.02_160)]">
      {points > 0 ? `+${points}` : '✓'}
    </span>
  );
}
```

- [ ] **Step 2: Update `PointsRaceTab.tsx`**

Replace the file content with:

```tsx
'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import type { PointsRaceView, ScoreBreakdown, Scoring } from '../domain/types';
import { cn } from '@/shared/ui';
import { RaceView } from './RaceView';
import { MatchMatrix } from './MatchMatrix';
import { KnockoutMatrix } from './KnockoutMatrix';

type RaceSubTab = 'race' | 'by-group' | 'by-knockout';

const SUB_TABS: { id: RaceSubTab; label: string }[] = [
  { id: 'race', label: 'Race' },
  { id: 'by-group', label: 'By group stage' },
  { id: 'by-knockout', label: 'By knockout' },
];

type Props = {
  race: PointsRaceView;
  userBreakdown?: ScoreBreakdown | null;
  scoring?: Scoring | null;
  viewerMode?: boolean;
};

export function PointsRaceTab({
  race,
  userBreakdown = null,
  scoring = null,
  viewerMode = false,
}: Props): ReactElement {
  const [subTab, setSubTab] = useState<RaceSubTab>('race');

  return (
    <div>
      <div className="flex gap-2 mb-5">
        {SUB_TABS.map(({ id, label }) => {
          const active = subTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              data-testid={`points-race-subtab-${id}`}
              className={cn(
                'py-[7px] px-4 rounded-cup-sm border-0 cursor-pointer font-cup-ui text-[13px] font-extrabold transition-[background]',
                active
                  ? 'bg-ink-900 text-white shadow-none'
                  : 'bg-surface text-ink-muted shadow-[inset_0_0_0_1px_var(--line)]',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {subTab === 'race' && (
        <RaceView
          race={race}
          viewerMode={viewerMode}
          userBreakdown={userBreakdown}
          scoring={scoring}
        />
      )}
      {subTab === 'by-group' && (
        <MatchMatrix entries={race.matchMatrix} matches={race.matrixMatches} />
      )}
      {subTab === 'by-knockout' && (
        <KnockoutMatrix entries={race.knockoutMatrix} matches={race.knockoutMatrixMatches} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run full test suite and quality gates**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
```

Expected: PASS — all tests green, no lint/type errors.

---

## Task 6: Commit

- [ ] **Step 1: Stage all changed files plus spec doc**

```bash
git add \
  packages/db/src/repositories/predictions.ts \
  packages/db/src/repositories/predictions.test.ts \
  apps/web/src/features/results/domain/types.ts \
  apps/web/src/features/results/application/build-race-view.ts \
  apps/web/src/features/results/application/build-race-view.test.ts \
  apps/web/src/features/results/application/get-results-view.ts \
  apps/web/src/features/results/application/get-results-view.test.ts \
  apps/web/src/features/results/ui/KnockoutMatrix.tsx \
  apps/web/src/features/results/ui/PointsRaceTab.tsx \
  docs/superpowers/specs/2026-06-28-points-race-knockout-view-design.md
```

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(results): add knockout match matrix to points race tab

Adds a "By knockout" sub-tab to the Points Race view showing a flat
scrollable per-player matrix of all knockout matches. Cells indicate
hit (correct winner), miss (wrong pick), no-pick, or pending. Points
are shown per hit for rounds with simple per-pick scoring (R32, R16, SF,
Final, Bronze). Renames the existing "By match" sub-tab to "By group stage".

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

Expected: Commit succeeds, pre-commit hooks pass.
