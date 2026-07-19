# Pool Archive Recap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the plain `/pools/[id]/archive` standings page into a richer recap: a champion hero
card, four highlight stats, a points-race chart, a lead-changes timeline, and stat tiles — while
keeping the archive's core guarantee that everything derived from _member_ predictions survives a
future account deletion (tournament-level facts like the champion/final score are read live instead,
since they're never user-deletable).

**Architecture:** Extends the already-shipped `pool_archives`/`pool_archive_entries` tables with two
new nullable jsonb columns (`recap`, and per-entry `pointsHistory`/`stageReasons`), populated once at
archive time by reusing existing pool-wide query helpers (`getGroupScoresByPool`,
`getKnockoutPicksByPool`, etc.) and the existing `buildRaceChartData`. Two new pure, DB-free
computation modules do the aggregation (`build-highlights.ts`) and derive rank-history-based insights
at view time (`race-history.ts`). New UI components render the recap above the existing per-member
standings list.

**Tech Stack:** Same as the base feature — Next.js App Router, Drizzle ORM/PostgreSQL, Vitest + pglite
integration tests, plus a couple of new pure-function unit tests (no DB).

## Global Constraints

- **One commit per feature** (CLAUDE.md): do NOT commit after each task below. Every task ends with
  "run tests, confirm green" — not a commit. The final task stages everything and creates exactly one
  commit, including the already-written spec at
  `docs/superpowers/specs/2026-07-18-pool-archive-recap-design.md`.
- **Mock only at system boundaries** in tests: `@/shared/db`, `next/cache`, `@/features/auth` — never
  repository/application functions. Pure functions (`race-history.ts`, `build-highlights.ts`) need no
  mocks at all — they take plain data in, return plain data out.
- **Branded types**: `PoolId`/`UserId`/`TournamentId`/`TeamId`/`MatchId`/`Points`/`ScoreBreakdown` from
  `@cup/engine` at feature boundaries.
- **Cross-feature access only through a feature's `index.ts` barrel** — this plan needs several
  additions to `@/features/results`'s barrel (`resolveActualWinner`, `computeHit`,
  `buildRaceEventDates`, `RACE_COLORS`, `utcDateStr`) before `pool-archive` can use them.
- **No new DB transactions**: sequential `await`s only, matching the rest of this codebase.
- **Drizzle upsert footgun**: `onConflictDoUpdate.set` must use literal JS values already in scope (as
  the existing `upsertPoolArchive` already does) — never `schema.table.column`.
- **Nullable, not backfilled**: the two new jsonb columns are nullable. A pool archived before this
  feature (or the one already-shipped archive in this repo's dev history) simply shows "no recap yet"
  until re-archived — no migration backfill script.
- Full design context: `docs/superpowers/specs/2026-07-18-pool-archive-recap-design.md`.

---

### Task 1: Schema + repository extension (`recap`, `pointsHistory`, `stageReasons`)

**Files:**

- Modify: `packages/db/src/schema/pool-archive.ts`
- Modify: `packages/db/src/repositories/pool-archive.ts`
- Modify: `packages/db/src/repositories/pool-archive.test.ts`
- Create: `packages/db/migrations/0010_pool_archive_recap.sql` (generated)

**Interfaces:**

- Produces (used by every later task):
  - `export type ChampionPickHighlight = { teamId: TeamId; teamName: string; count: number; total: number }`
  - `export type BestSingleMatchHighlight = { matchId: MatchId; description: string; homeTeam: string; awayTeam: string; homeGoals: number; awayGoals: number; exactCount: number; total: number }`
  - `export type BiggestUpsetHighlight = { matchId: MatchId; round: string; winnerTeam: string; loserTeam: string; pickCount: number; total: number }`
  - `export type PoolArchiveRecap = { stages: string[]; championPick: ChampionPickHighlight | null; bestSingleMatch: BestSingleMatchHighlight | null; biggestUpset: BiggestUpsetHighlight | null; predictionsMade: number; exactScoreRatePercent: number }`
  - `PoolArchiveRow` gains `recap: PoolArchiveRecap | null`
  - `PoolArchiveEntryRow` gains `pointsHistory: number[] | null; stageReasons: (string | null)[] | null`
  - `PoolArchiveEntryInput` gains `pointsHistory: number[] | null; stageReasons: (string | null)[] | null`
  - `upsertPoolArchive`'s input gains `recap: PoolArchiveRecap | null`

- [ ] **Step 1: Write the failing test**

In `packages/db/src/repositories/pool-archive.test.ts`, add this test (alongside the existing three —
keep the existing tests as-is, just update their `upsertPoolArchive` calls to pass
`recap: null` and each entry's `pointsHistory: null, stageReasons: null`, since those become required
input fields):

```ts
it('stores and retrieves recap and per-entry points history / stage reasons', async () => {
  await upsertTournamentDef(db, miniTournament, FUTURE_KICKOFF, EMPTY_KICKOFFS);
  const tournamentId = asTournamentId(miniTournament.id);
  const owner = await createUser(db, { email: 'recap-owner@x.com', displayName: 'Owner' });
  const pool = await createPool(db, { tournamentId, ownerId: owner.id, name: 'Recap Pool' });

  const recap = {
    stages: ['Start', 'Jul 15', 'Jul 19'],
    championPick: { teamId: 'ARG', teamName: 'Argentina', count: 6, total: 10 },
    bestSingleMatch: {
      matchId: 'm1',
      description: 'ARG 3-0 SEN',
      homeTeam: 'Argentina',
      awayTeam: 'Senegal',
      homeGoals: 3,
      awayGoals: 0,
      exactCount: 9,
      total: 10,
    },
    biggestUpset: {
      matchId: 'r16-3',
      round: 'Round of 16',
      winnerTeam: 'Croatia',
      loserTeam: 'Spain',
      pickCount: 2,
      total: 10,
    },
    predictionsMade: 1456,
    exactScoreRatePercent: 18,
  };

  await upsertPoolArchive(db, {
    poolId: pool.id,
    poolName: pool.name,
    tournamentId,
    tournamentName: miniTournament.name,
    archivedBy: owner.id,
    recap,
    entries: [
      {
        userId: owner.id,
        displayName: 'Owner',
        rank: 1,
        pointsTotal: points(50),
        breakdown: fakeBreakdown(50),
        pointsHistory: [0, 20, 50],
        stageReasons: [null, '5 exact scores', 'Champion pick correct'],
      },
    ],
  });

  const fetched = await getPoolArchiveWithEntries(db, pool.id);
  expect(fetched?.archive.recap).toEqual(recap);
  expect(fetched?.entries[0]?.pointsHistory).toEqual([0, 20, 50]);
  expect(fetched?.entries[0]?.stageReasons).toEqual([
    null,
    '5 exact scores',
    'Champion pick correct',
  ]);
});

it('leaves recap and points history/stage reasons null when not provided (pre-recap-feature archives)', async () => {
  await upsertTournamentDef(db, miniTournament, FUTURE_KICKOFF, EMPTY_KICKOFFS);
  const tournamentId = asTournamentId(miniTournament.id);
  const owner = await createUser(db, { email: 'no-recap@x.com', displayName: 'Owner' });
  const pool = await createPool(db, { tournamentId, ownerId: owner.id, name: 'No Recap Pool' });

  await upsertPoolArchive(db, {
    poolId: pool.id,
    poolName: pool.name,
    tournamentId,
    tournamentName: miniTournament.name,
    archivedBy: owner.id,
    recap: null,
    entries: [
      {
        userId: owner.id,
        displayName: 'Owner',
        rank: 1,
        pointsTotal: points(10),
        breakdown: fakeBreakdown(10),
        pointsHistory: null,
        stageReasons: null,
      },
    ],
  });

  const fetched = await getPoolArchiveWithEntries(db, pool.id);
  expect(fetched?.archive.recap).toBeNull();
  expect(fetched?.entries[0]?.pointsHistory).toBeNull();
  expect(fetched?.entries[0]?.stageReasons).toBeNull();
});
```

Also update the existing 3 tests in this file: every `upsertPoolArchive(...)` call needs
`recap: null` added to the top-level input, and every entry object needs `pointsHistory: null,
stageReasons: null` added.

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm exec vitest run packages/db/src/repositories/pool-archive.test.ts`
Expected: FAIL — TS error (missing required `recap`/`pointsHistory`/`stageReasons` properties) once you
add the new tests referencing fields that don't exist on the types yet, or a runtime `undefined`
mismatch if TS isn't strict-checked by vitest's transform — either way, confirm the new assertions
fail before implementing.

- [ ] **Step 3: Extend the schema**

In `packages/db/src/schema/pool-archive.ts`, replace the full file with:

```ts
import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { pools } from './pools';
import { users } from './auth';
import type { ScoreBreakdown } from '@cup/engine';
import type { TeamId, MatchId } from '@cup/engine';

export type ChampionPickHighlight = {
  teamId: TeamId;
  teamName: string;
  count: number;
  total: number;
};

export type BestSingleMatchHighlight = {
  matchId: MatchId;
  description: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  exactCount: number;
  total: number;
};

export type BiggestUpsetHighlight = {
  matchId: MatchId;
  round: string;
  winnerTeam: string;
  loserTeam: string;
  pickCount: number;
  total: number;
};

export type PoolArchiveRecap = {
  stages: string[];
  championPick: ChampionPickHighlight | null;
  bestSingleMatch: BestSingleMatchHighlight | null;
  biggestUpset: BiggestUpsetHighlight | null;
  predictionsMade: number;
  exactScoreRatePercent: number;
};

export const poolArchives = pgTable(
  'pool_archives',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    poolId: text('pool_id')
      .notNull()
      .references(() => pools.id, { onDelete: 'cascade' }),
    poolName: text('pool_name').notNull(),
    tournamentId: text('tournament_id').notNull(),
    tournamentName: text('tournament_name').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }).notNull().defaultNow(),
    archivedBy: text('archived_by').references(() => users.id, { onDelete: 'set null' }),
    recap: jsonb('recap').$type<PoolArchiveRecap>(),
  },
  (t) => [uniqueIndex('pool_archives_pool_id_uniq').on(t.poolId)],
);

export const poolArchiveEntries = pgTable('pool_archive_entries', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  archiveId: text('archive_id')
    .notNull()
    .references(() => poolArchives.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  displayName: text('display_name').notNull(),
  rank: integer('rank').notNull(),
  pointsTotal: integer('points_total').notNull(),
  breakdown: jsonb('breakdown').notNull().$type<ScoreBreakdown>(),
  pointsHistory: jsonb('points_history').$type<number[]>(),
  stageReasons: jsonb('stage_reasons').$type<(string | null)[]>(),
});
```

- [ ] **Step 4: Extend the repository**

In `packages/db/src/repositories/pool-archive.ts`, replace the full file with:

```ts
import { asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../client';
import * as schema from '../schema/index';
import {
  poolId as asPoolId,
  tournamentId as asTournamentId,
  userId as asUserId,
  points,
  type PoolId,
  type TournamentId,
  type UserId,
  type Points,
  type ScoreBreakdown,
} from '@cup/engine';
import type { PoolArchiveRecap } from '../schema/pool-archive';

export type {
  PoolArchiveRecap,
  ChampionPickHighlight,
  BestSingleMatchHighlight,
  BiggestUpsetHighlight,
} from '../schema/pool-archive';

type Database = Db<typeof schema>;

export type PoolArchiveRow = {
  id: string;
  poolId: PoolId;
  poolName: string;
  tournamentId: TournamentId;
  tournamentName: string;
  archivedAt: Date;
  archivedBy: UserId | null;
  recap: PoolArchiveRecap | null;
};

export type PoolArchiveEntryRow = {
  id: string;
  archiveId: string;
  userId: UserId | null;
  displayName: string;
  rank: number;
  pointsTotal: Points;
  breakdown: ScoreBreakdown;
  pointsHistory: number[] | null;
  stageReasons: (string | null)[] | null;
};

export type PoolArchiveEntryInput = {
  userId: UserId;
  displayName: string;
  rank: number;
  pointsTotal: Points;
  breakdown: ScoreBreakdown;
  pointsHistory: number[] | null;
  stageReasons: (string | null)[] | null;
};

function toPoolArchiveRow(raw: typeof schema.poolArchives.$inferSelect): PoolArchiveRow {
  return {
    ...raw,
    poolId: asPoolId(raw.poolId),
    tournamentId: asTournamentId(raw.tournamentId),
    archivedBy: raw.archivedBy ? asUserId(raw.archivedBy) : null,
    recap: raw.recap ?? null,
  };
}

function toPoolArchiveEntryRow(
  raw: typeof schema.poolArchiveEntries.$inferSelect,
): PoolArchiveEntryRow {
  return {
    ...raw,
    userId: raw.userId ? asUserId(raw.userId) : null,
    pointsTotal: points(raw.pointsTotal),
    pointsHistory: raw.pointsHistory ?? null,
    stageReasons: raw.stageReasons ?? null,
  };
}

/**
 * Creates or replaces the archive for a pool. Re-archiving deletes the previous
 * entries and inserts the new ones — `pool_archives.pool_id` is unique, so there
 * is always at most one archive per pool.
 */
export async function upsertPoolArchive(
  db: Database,
  input: {
    poolId: PoolId;
    poolName: string;
    tournamentId: TournamentId;
    tournamentName: string;
    archivedBy: UserId;
    recap: PoolArchiveRecap | null;
    entries: PoolArchiveEntryInput[];
  },
): Promise<PoolArchiveRow> {
  const [archive] = await db
    .insert(schema.poolArchives)
    .values({
      poolId: input.poolId,
      poolName: input.poolName,
      tournamentId: input.tournamentId,
      tournamentName: input.tournamentName,
      archivedBy: input.archivedBy,
      recap: input.recap,
    })
    .onConflictDoUpdate({
      target: schema.poolArchives.poolId,
      set: {
        poolName: input.poolName,
        tournamentId: input.tournamentId,
        tournamentName: input.tournamentName,
        archivedBy: input.archivedBy,
        archivedAt: sql`now()`,
        recap: input.recap,
      },
    })
    .returning();
  if (!archive) throw new Error('upsertPoolArchive: upsert did not return a row');

  await db
    .delete(schema.poolArchiveEntries)
    .where(eq(schema.poolArchiveEntries.archiveId, archive.id));

  if (input.entries.length > 0) {
    await db.insert(schema.poolArchiveEntries).values(
      input.entries.map((e) => ({
        archiveId: archive.id,
        userId: e.userId,
        displayName: e.displayName,
        rank: e.rank,
        pointsTotal: e.pointsTotal,
        breakdown: e.breakdown,
        pointsHistory: e.pointsHistory,
        stageReasons: e.stageReasons,
      })),
    );
  }

  return toPoolArchiveRow(archive);
}

export async function getPoolArchiveWithEntries(
  db: Database,
  poolId: PoolId,
): Promise<{ archive: PoolArchiveRow; entries: PoolArchiveEntryRow[] } | undefined> {
  const [archive] = await db
    .select()
    .from(schema.poolArchives)
    .where(eq(schema.poolArchives.poolId, poolId));
  if (!archive) return undefined;

  const entryRows = await db
    .select()
    .from(schema.poolArchiveEntries)
    .where(eq(schema.poolArchiveEntries.archiveId, archive.id))
    .orderBy(asc(schema.poolArchiveEntries.rank));

  return {
    archive: toPoolArchiveRow(archive),
    entries: entryRows.map(toPoolArchiveEntryRow),
  };
}
```

- [ ] **Step 5: Generate the migration**

Run: `pnpm --filter @cup/db db:generate`
Expected: since `0009_snapshot.json` (committed in the base feature) is a complete, correct full-schema
snapshot, this should generate a **clean** diff this time — just `ALTER TABLE "pool_archives" ADD
COLUMN "recap" jsonb;` and two `ALTER TABLE "pool_archive_entries" ADD COLUMN ...` statements for
`points_history`/`stage_reasons`. Verify the generated SQL contains ONLY these 3 statements — if it
contains anything else, STOP and report BLOCKED (that would mean the snapshot chain broke again).
Rename the generated file to `packages/db/migrations/0010_pool_archive_recap.sql` and update its `tag`
in `packages/db/migrations/meta/_journal.json` to match.

- [ ] **Step 6: Run the test to confirm it passes**

Run: `pnpm exec vitest run packages/db/src/repositories/pool-archive.test.ts`
Expected: PASS (5 tests — the 3 existing plus the 2 new ones).

- [ ] **Step 7: Run the full `@cup/db` suite**

Run: `pnpm exec vitest run packages/db`
Expected: PASS (all files — confirms the schema/repo change didn't break `users.test.ts`'s
anonymization test or anything else).

---

### Task 2: Domain types extension

**Files:**

- Modify: `apps/web/src/features/pool-archive/domain/types.ts`

**Interfaces:**

- Consumes: `PoolArchiveRecap`, `ChampionPickHighlight`, `BestSingleMatchHighlight`,
  `BiggestUpsetHighlight` from `@cup/db` (Task 1). `LeadChangeEvent`, `BiggestRiserEvent` from
  `../domain/race-history` (Task 3 — forward reference; this task just re-exports the type names, Task
  3 defines them).
- Produces (used by every later task): extended `PoolArchiveEntryView`, `PoolArchiveView`.

- [ ] **Step 1: Extend the types**

Replace `apps/web/src/features/pool-archive/domain/types.ts` in full with:

```ts
import type { PoolId, TournamentId, UserId, Points, ScoreBreakdown } from '@cup/engine';
import type { PoolArchiveRecap } from '@cup/db';
import type { LeadChangeEvent, BiggestRiserEvent } from './race-history';

export type {
  PoolArchiveRecap,
  ChampionPickHighlight,
  BestSingleMatchHighlight,
  BiggestUpsetHighlight,
} from '@cup/db';
export type { LeadChangeEvent, BiggestRiserEvent } from './race-history';

export type PoolArchiveEntryView = {
  userId: UserId | null;
  displayName: string;
  rank: number;
  pointsTotal: Points;
  breakdown: ScoreBreakdown;
  pointsHistory: number[] | null;
  stageReasons: (string | null)[] | null;
};

export type PoolArchiveView = {
  poolId: PoolId;
  poolName: string;
  tournamentId: TournamentId;
  tournamentName: string;
  archivedAt: Date;
  entries: PoolArchiveEntryView[];
  recap: PoolArchiveRecap | null;
  leadChanges: LeadChangeEvent[];
  biggestRiser: BiggestRiserEvent;
};
```

- [ ] **Step 2: Verify (will fail until Task 3 exists — that's expected)**

Run: `pnpm --filter web typecheck`
Expected: FAIL — `Cannot find module './race-history'`. This is the expected state between Task 2 and
Task 3; do not try to make this pass yet. Task 3 creates that file next.

---

### Task 3: `race-history.ts` — pure rank-history derivations

**Files:**

- Create: `apps/web/src/features/pool-archive/domain/race-history.ts`
- Create: `apps/web/src/features/pool-archive/domain/race-history.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks — pure functions, no DB, no `@cup/db`/`@cup/engine` imports
  needed beyond none at all (plain strings/numbers).
- Produces (used by Task 2's re-export and Task 6):
  - `export type LeadChangeEvent = { stageIndex: number; stageName: string; leaderDisplayName: string; reason: string | null; pointsAtStage: number }`
  - `export type BiggestRiserEvent = { displayName: string; fromRank: number; toRank: number; stageName: string; reason: string | null } | null`
  - `export type StageHistoryPlayer = { displayName: string; points: number[]; stageReasons: (string | null)[] | null }`
  - `export function computeLeadChanges(players: StageHistoryPlayer[], stages: string[]): LeadChangeEvent[]`
  - `export function computeBiggestRiser(players: StageHistoryPlayer[], stages: string[]): BiggestRiserEvent`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/features/pool-archive/domain/race-history.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeLeadChanges, computeBiggestRiser } from './race-history';
import type { StageHistoryPlayer } from './race-history';

const stages = ['Start', 'Jul 15', 'Jul 17', 'Jul 19'];

describe('computeLeadChanges', () => {
  it('returns one event when the leader never changes', () => {
    const players: StageHistoryPlayer[] = [
      { displayName: 'Alice', points: [0, 30, 40, 50], stageReasons: [null, 'a', 'b', 'c'] },
      { displayName: 'Bob', points: [0, 10, 20, 30], stageReasons: [null, null, null, null] },
    ];
    const events = computeLeadChanges(players, stages);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      stageIndex: 0,
      stageName: 'Start',
      leaderDisplayName: 'Alice',
      reason: null,
      pointsAtStage: 0,
    });
  });

  it('emits an event each time the #1 rank changes hands', () => {
    const players: StageHistoryPlayer[] = [
      { displayName: 'Alice', points: [0, 30, 30, 60], stageReasons: [null, 'A1', null, 'A3'] },
      { displayName: 'Bob', points: [0, 10, 40, 50], stageReasons: [null, null, 'B2', null] },
    ];
    const events = computeLeadChanges(players, stages);
    expect(events.map((e) => e.leaderDisplayName)).toEqual(['Alice', 'Bob', 'Alice']);
    expect(events[1]).toEqual({
      stageIndex: 2,
      stageName: 'Jul 17',
      leaderDisplayName: 'Bob',
      reason: 'B2',
      pointsAtStage: 40,
    });
  });

  it('breaks ties by displayName ascending, matching getLeaderboard convention', () => {
    const players: StageHistoryPlayer[] = [
      { displayName: 'Zed', points: [10], stageReasons: [null] },
      { displayName: 'Amy', points: [10], stageReasons: [null] },
    ];
    const events = computeLeadChanges(players, ['Start']);
    expect(events[0]?.leaderDisplayName).toBe('Amy');
  });

  it('returns an empty array for an empty pool or no stages', () => {
    expect(computeLeadChanges([], stages)).toEqual([]);
    expect(
      computeLeadChanges([{ displayName: 'Alice', points: [0], stageReasons: [null] }], []),
    ).toEqual([]);
  });
});

describe('computeBiggestRiser', () => {
  it('finds the single largest rank-improvement transition', () => {
    const players: StageHistoryPlayer[] = [
      { displayName: 'Alice', points: [0, 50, 55], stageReasons: [null, null, null] },
      { displayName: 'Bob', points: [0, 40, 45], stageReasons: [null, null, null] },
      { displayName: 'Carol', points: [0, 10, 60], stageReasons: [null, null, '5 exact scores'] },
    ];
    // Stage 0->1: Alice(1st) Bob(2nd) Carol(3rd) - no change.
    // Stage 1->2: Carol jumps from 3rd to 1st - biggest riser, +2 ranks.
    const result = computeBiggestRiser(players, ['Start', 'Jul 15', 'Jul 19']);
    expect(result).toEqual({
      displayName: 'Carol',
      fromRank: 3,
      toRank: 1,
      stageName: 'Jul 19',
      reason: '5 exact scores',
    });
  });

  it('returns null when no rank ever improves (fewer than 2 members, or ranks only worsen/hold)', () => {
    expect(
      computeBiggestRiser(
        [{ displayName: 'Alice', points: [0, 10], stageReasons: [null, null] }],
        ['Start', 'Jul 15'],
      ),
    ).toBeNull();
    const noImprovement: StageHistoryPlayer[] = [
      { displayName: 'Alice', points: [10, 20], stageReasons: [null, null] },
      { displayName: 'Bob', points: [0, 5], stageReasons: [null, null] },
    ];
    expect(computeBiggestRiser(noImprovement, ['Start', 'Jul 15'])).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm exec vitest run apps/web/src/features/pool-archive/domain/race-history.test.ts`
Expected: FAIL — `Cannot find module './race-history'`.

- [ ] **Step 3: Implement `race-history.ts`**

Create `apps/web/src/features/pool-archive/domain/race-history.ts`:

```ts
export type StageHistoryPlayer = {
  displayName: string;
  points: number[];
  stageReasons: (string | null)[] | null;
};

export type LeadChangeEvent = {
  stageIndex: number;
  stageName: string;
  leaderDisplayName: string;
  reason: string | null;
  pointsAtStage: number;
};

export type BiggestRiserEvent = {
  displayName: string;
  fromRank: number;
  toRank: number;
  stageName: string;
  reason: string | null;
} | null;

function rankAtStage(players: StageHistoryPlayer[], stageIndex: number): Map<string, number> {
  const sorted = players
    .map((p) => ({ displayName: p.displayName, points: p.points[stageIndex] ?? 0 }))
    .toSorted((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName));
  const ranks = new Map<string, number>();
  sorted.forEach((p, i) => ranks.set(p.displayName, i + 1));
  return ranks;
}

export function computeLeadChanges(
  players: StageHistoryPlayer[],
  stages: string[],
): LeadChangeEvent[] {
  if (players.length === 0 || stages.length === 0) return [];

  const events: LeadChangeEvent[] = [];
  let currentLeader: string | null = null;

  for (let i = 0; i < stages.length; i++) {
    const ranks = rankAtStage(players, i);
    const leaderEntry = [...ranks.entries()].find(([, rank]) => rank === 1);
    if (!leaderEntry) continue;
    const [leaderName] = leaderEntry;

    if (leaderName !== currentLeader) {
      const player = players.find((p) => p.displayName === leaderName);
      events.push({
        stageIndex: i,
        stageName: stages[i] ?? '',
        leaderDisplayName: leaderName,
        reason: player?.stageReasons?.[i] ?? null,
        pointsAtStage: player?.points[i] ?? 0,
      });
      currentLeader = leaderName;
    }
  }

  return events;
}

export function computeBiggestRiser(
  players: StageHistoryPlayer[],
  stages: string[],
): BiggestRiserEvent {
  if (players.length < 2 || stages.length < 2) return null;

  let best: BiggestRiserEvent = null;
  let bestImprovement = 0;

  for (let i = 1; i < stages.length; i++) {
    const prevRanks = rankAtStage(players, i - 1);
    const currRanks = rankAtStage(players, i);

    for (const player of players) {
      const prevRank = prevRanks.get(player.displayName);
      const currRank = currRanks.get(player.displayName);
      if (prevRank === undefined || currRank === undefined) continue;

      const improvement = prevRank - currRank; // positive = moved up in rank
      if (improvement > bestImprovement) {
        bestImprovement = improvement;
        best = {
          displayName: player.displayName,
          fromRank: prevRank,
          toRank: currRank,
          stageName: stages[i] ?? '',
          reason: player.stageReasons?.[i] ?? null,
        };
      }
    }
  }

  return best;
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `pnpm exec vitest run apps/web/src/features/pool-archive/domain/race-history.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Verify Task 2's types now compile**

Run: `pnpm --filter web typecheck`
Expected: PASS (the `Cannot find module './race-history'` error from Task 2 is now resolved).

---

### Task 4: Export additional helpers from the `results` barrel

**Files:**

- Modify: `apps/web/src/features/results/index.ts`

**Interfaces:**

- Produces: `resolveActualWinner`, `computeHit`, `buildRaceEventDates`, `RACE_COLORS`, `utcDateStr`
  become importable from `@/features/results` (needed by Task 5's `build-highlights.ts`, Task 6's
  `build-recap.ts`, and Task 8's race-chart adapter).

- [ ] **Step 1: Add the exports**

In `apps/web/src/features/results/index.ts`, add:

```ts
export { resolveActualWinner } from './domain/knockout-match-winner';
export { buildRaceEventDates, RACE_COLORS, utcDateStr } from './domain/race-chart';
```

and add `computeHit` to the existing `buildRaceChartData` export line, changing:

```ts
export { buildRaceChartData } from './domain/race-chart';
```

to:

```ts
export { buildRaceChartData, computeHit } from './domain/race-chart';
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter web typecheck`
Expected: PASS (pure export additions, nothing consumes them yet).

---

### Task 5: `build-highlights.ts` — champion pick / best single match / biggest upset / rate stats

**Files:**

- Create: `apps/web/src/features/pool-archive/application/build-highlights.ts`
- Create: `apps/web/src/features/pool-archive/application/build-highlights.test.ts`

**Interfaces:**

- Consumes: `resolveActualWinner`, `computeHit` from `@/features/results` (Task 4); `MatchRow`,
  `PoolGroupScore`, `PoolKnockoutPick` types from `@cup/db`; `Tournament` from `@cup/engine`;
  `ChampionPickHighlight`/`BestSingleMatchHighlight`/`BiggestUpsetHighlight` from `@cup/db` (Task 1).
- Produces (used by Task 6):
  - `export function computeChampionPick(knockoutPicks: PoolKnockoutPick[], def: Tournament, totalMembers: number): ChampionPickHighlight | null`
  - `export function computeBestSingleMatch(groupScores: PoolGroupScore[], allMatches: MatchRow[], def: Tournament, groupScoring: { exactScore: number; correctOutcome: number }, totalMembers: number): BestSingleMatchHighlight | null`
  - `export function computeBiggestUpset(knockoutPicks: PoolKnockoutPick[], allMatches: MatchRow[], def: Tournament, totalMembers: number): BiggestUpsetHighlight | null`
  - `export function computePredictionsMade(counts: { groupScores: number; knockoutPicks: number; finishScores: number; specialBets: number }): number`
  - `export function computeExactScoreRatePercent(groupScores: PoolGroupScore[], allMatches: MatchRow[], groupScoring: { exactScore: number; correctOutcome: number }): number`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/features/pool-archive/application/build-highlights.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { miniTournament } from '@cup/engine/testing';
import type { MatchRow, PoolGroupScore, PoolKnockoutPick } from '@cup/db';
import {
  tournamentId as asTournamentId,
  matchId as asMatchId,
  userId as asUserId,
  bracketMatchKey as asBracketMatchKey,
} from '@cup/engine';
import {
  computeChampionPick,
  computeBestSingleMatch,
  computeBiggestUpset,
  computePredictionsMade,
  computeExactScoreRatePercent,
} from './build-highlights';

const GROUP_SCORING = { exactScore: 6, correctOutcome: 3 };

function groupMatch(
  id: string,
  home: string,
  away: string,
  homeGoals: number,
  awayGoals: number,
  kickoff: string,
): MatchRow {
  return {
    id,
    tournamentId: asTournamentId(miniTournament.id),
    stage: 'group',
    groupId: 'A',
    homeTeamId: home,
    awayTeamId: away,
    kickoff: new Date(kickoff),
    homeGoals,
    awayGoals,
    homeConduct: null,
    awayConduct: null,
    winnerTeamId: null,
    decidedBy: null,
    status: 'final',
  };
}

function knockoutMatch(
  id: string,
  stage: MatchRow['stage'],
  home: string,
  away: string,
  homeGoals: number,
  awayGoals: number,
  kickoff: string,
): MatchRow {
  return {
    id,
    tournamentId: asTournamentId(miniTournament.id),
    stage,
    groupId: null,
    homeTeamId: home,
    awayTeamId: away,
    kickoff: new Date(kickoff),
    homeGoals,
    awayGoals,
    homeConduct: null,
    awayConduct: null,
    winnerTeamId: null,
    decidedBy: null,
    status: 'final',
  };
}

describe('computeChampionPick', () => {
  it('finds the most-picked final winner', () => {
    const finalKey = miniTournament.bracket.finalMatch;
    const picks: PoolKnockoutPick[] = [
      { userId: asUserId('u1'), bracketMatchKey: finalKey, winnerTeamId: 'A1' },
      { userId: asUserId('u2'), bracketMatchKey: finalKey, winnerTeamId: 'A1' },
      { userId: asUserId('u3'), bracketMatchKey: finalKey, winnerTeamId: 'B1' },
    ];
    const result = computeChampionPick(picks, miniTournament, 10);
    expect(result).toEqual({ teamId: 'A1', teamName: 'Team A1', count: 2, total: 10 });
  });

  it('returns null when there are no final-winner picks', () => {
    expect(computeChampionPick([], miniTournament, 10)).toBeNull();
  });

  it('breaks ties by Tournament.teams order', () => {
    const finalKey = miniTournament.bracket.finalMatch;
    const picks: PoolKnockoutPick[] = [
      { userId: asUserId('u1'), bracketMatchKey: finalKey, winnerTeamId: 'D4' },
      { userId: asUserId('u2'), bracketMatchKey: finalKey, winnerTeamId: 'A1' },
    ];
    // A1 appears before D4 in miniTournament.teams, and both have count 1.
    const result = computeChampionPick(picks, miniTournament, 10);
    expect(result?.teamId).toBe('A1');
  });
});

describe('computeBestSingleMatch', () => {
  it('picks the group match with the most exact-score guesses', () => {
    const allMatches = [
      groupMatch('m1', 'A1', 'A2', 2, 1, '2026-06-01'),
      groupMatch('m2', 'A3', 'A4', 1, 1, '2026-06-02'),
    ];
    const groupScores: PoolGroupScore[] = [
      { userId: asUserId('u1'), matchId: 'm1', home: 2, away: 1 },
      { userId: asUserId('u2'), matchId: 'm1', home: 2, away: 1 },
      { userId: asUserId('u3'), matchId: 'm1', home: 0, away: 0 },
      { userId: asUserId('u1'), matchId: 'm2', home: 1, away: 1 },
    ];
    const result = computeBestSingleMatch(
      groupScores,
      allMatches,
      miniTournament,
      GROUP_SCORING,
      3,
    );
    expect(result?.matchId).toBe(asMatchId('m1'));
    expect(result?.exactCount).toBe(2);
    expect(result?.description).toBe('Team A1 2-1 Team A2');
  });

  it('returns null when no group match has any exact guesses', () => {
    const allMatches = [groupMatch('m1', 'A1', 'A2', 2, 1, '2026-06-01')];
    const groupScores: PoolGroupScore[] = [
      { userId: asUserId('u1'), matchId: 'm1', home: 0, away: 0 },
    ];
    expect(
      computeBestSingleMatch(groupScores, allMatches, miniTournament, GROUP_SCORING, 1),
    ).toBeNull();
  });

  it('breaks ties by earliest kickoff', () => {
    const allMatches = [
      groupMatch('m1', 'A1', 'A2', 2, 1, '2026-06-02'),
      groupMatch('m2', 'A3', 'A4', 1, 1, '2026-06-01'),
    ];
    const groupScores: PoolGroupScore[] = [
      { userId: asUserId('u1'), matchId: 'm1', home: 2, away: 1 },
      { userId: asUserId('u1'), matchId: 'm2', home: 1, away: 1 },
    ];
    const result = computeBestSingleMatch(
      groupScores,
      allMatches,
      miniTournament,
      GROUP_SCORING,
      1,
    );
    expect(result?.matchId).toBe(asMatchId('m2')); // earlier kickoff, same exactCount (1)
  });
});

describe('computeBiggestUpset', () => {
  it('finds the resolved knockout tie with the fewest correct picks', () => {
    const allMatches = [
      knockoutMatch('qf1', 'QF', 'A1', 'B2', 2, 1, '2026-06-10'),
      knockoutMatch('qf2', 'QF', 'C1', 'D2', 0, 3, '2026-06-11'),
    ];
    const picks: PoolKnockoutPick[] = [
      { userId: asUserId('u1'), bracketMatchKey: asBracketMatchKey('qf1'), winnerTeamId: 'A1' },
      { userId: asUserId('u2'), bracketMatchKey: asBracketMatchKey('qf1'), winnerTeamId: 'A1' },
      { userId: asUserId('u1'), bracketMatchKey: asBracketMatchKey('qf2'), winnerTeamId: 'D2' },
    ];
    const result = computeBiggestUpset(picks, allMatches, miniTournament, 3);
    expect(result?.matchId).toBe(asMatchId('qf2'));
    expect(result?.pickCount).toBe(1);
    expect(result?.winnerTeam).toBe('Team D2');
    expect(result?.loserTeam).toBe('Team C1');
    expect(result?.round).toBe('Quarterfinal');
  });

  it('returns null when there are no resolved knockout ties', () => {
    expect(computeBiggestUpset([], [], miniTournament, 3)).toBeNull();
  });

  it('returns null when every resolved tie has zero correct picks', () => {
    const allMatches = [knockoutMatch('qf1', 'QF', 'A1', 'B2', 2, 1, '2026-06-10')];
    expect(computeBiggestUpset([], allMatches, miniTournament, 3)).toBeNull();
  });
});

describe('computePredictionsMade', () => {
  it('sums all four counts', () => {
    expect(
      computePredictionsMade({
        groupScores: 24,
        knockoutPicks: 7,
        finishScores: 2,
        specialBets: 11,
      }),
    ).toBe(44);
  });
});

describe('computeExactScoreRatePercent', () => {
  it('computes the percentage of exact group-match guesses', () => {
    const allMatches = [
      groupMatch('m1', 'A1', 'A2', 2, 1, '2026-06-01'),
      groupMatch('m2', 'A3', 'A4', 1, 1, '2026-06-02'),
    ];
    const groupScores: PoolGroupScore[] = [
      { userId: asUserId('u1'), matchId: 'm1', home: 2, away: 1 }, // exact
      { userId: asUserId('u1'), matchId: 'm2', home: 0, away: 0 }, // outcome only
    ];
    expect(computeExactScoreRatePercent(groupScores, allMatches, GROUP_SCORING)).toBe(50);
  });

  it('returns 0 when there are no group guesses on final matches', () => {
    expect(computeExactScoreRatePercent([], [], GROUP_SCORING)).toBe(0);
  });
});
```

Note: `miniTournament`'s teams are named `"Team A1"`, `"Team A2"`, etc. with ids `"A1"`, `"A2"`, etc. —
confirm this against `packages/engine/src/__fixtures__/mini-tournament.ts` before trusting the exact
`teamName`/`description` assertions above; adjust the expected strings to match the fixture's actual
`Team.name` values if they differ (the test's _intent_ — matching the fixture's real names — is what
matters, not these exact literals if the fixture text differs slightly).

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm exec vitest run apps/web/src/features/pool-archive/application/build-highlights.test.ts`
Expected: FAIL — `Cannot find module './build-highlights'`.

- [ ] **Step 3: Implement `build-highlights.ts`**

Create `apps/web/src/features/pool-archive/application/build-highlights.ts`:

```ts
import type { MatchRow, PoolGroupScore, PoolKnockoutPick } from '@cup/db';
import type {
  ChampionPickHighlight,
  BestSingleMatchHighlight,
  BiggestUpsetHighlight,
} from '@cup/db';
import type { Tournament, TeamId } from '@cup/engine';
import { matchId as asMatchId } from '@cup/engine';
import { resolveActualWinner, computeHit } from '@/features/results';

const STAGE_LABELS: Record<string, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarterfinal',
  SF: 'Semifinal',
  Final: 'Final',
  bronze: 'Bronze Match',
};

function teamName(def: Tournament, id: string): string {
  return def.teams.find((t) => t.id === id)?.name ?? id;
}

export function computeChampionPick(
  knockoutPicks: PoolKnockoutPick[],
  def: Tournament,
  totalMembers: number,
): ChampionPickHighlight | null {
  const finalKey = def.bracket.finalMatch;
  const picks = knockoutPicks.filter((p) => p.bracketMatchKey === finalKey);
  if (picks.length === 0) return null;

  const counts = new Map<string, number>();
  for (const p of picks) counts.set(p.winnerTeamId, (counts.get(p.winnerTeamId) ?? 0) + 1);

  let bestTeamId: TeamId | null = null;
  let bestCount = 0;
  for (const team of def.teams) {
    const c = counts.get(team.id) ?? 0;
    if (c > bestCount) {
      bestCount = c;
      bestTeamId = team.id;
    }
  }
  if (!bestTeamId) return null;

  return {
    teamId: bestTeamId,
    teamName: teamName(def, bestTeamId),
    count: bestCount,
    total: totalMembers,
  };
}

export function computeBestSingleMatch(
  groupScores: PoolGroupScore[],
  allMatches: MatchRow[],
  def: Tournament,
  groupScoring: { exactScore: number; correctOutcome: number },
  totalMembers: number,
): BestSingleMatchHighlight | null {
  const groupMatches = allMatches
    .filter(
      (m) =>
        m.stage === 'group' && m.status === 'final' && m.homeGoals !== null && m.awayGoals !== null,
    )
    .toSorted((a, b) => (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0));

  let best: BestSingleMatchHighlight | null = null;
  let bestCount = 0;

  for (const match of groupMatches) {
    let exactCount = 0;
    for (const gs of groupScores) {
      if (gs.matchId !== match.id) continue;
      const { hit } = computeHit(
        match.homeGoals!,
        match.awayGoals!,
        gs.home,
        gs.away,
        groupScoring,
      );
      if (hit === 'exact') exactCount++;
    }
    if (exactCount > bestCount) {
      bestCount = exactCount;
      const home = teamName(def, match.homeTeamId ?? '?');
      const away = teamName(def, match.awayTeamId ?? '?');
      best = {
        matchId: asMatchId(match.id),
        description: `${home} ${match.homeGoals}-${match.awayGoals} ${away}`,
        homeTeam: home,
        awayTeam: away,
        homeGoals: match.homeGoals!,
        awayGoals: match.awayGoals!,
        exactCount,
        total: totalMembers,
      };
    }
  }

  return bestCount > 0 ? best : null;
}

export function computeBiggestUpset(
  knockoutPicks: PoolKnockoutPick[],
  allMatches: MatchRow[],
  def: Tournament,
  totalMembers: number,
): BiggestUpsetHighlight | null {
  const knockoutMatches = allMatches
    .filter((m) => m.stage !== 'group' && m.status === 'final')
    .toSorted((a, b) => (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0));

  let best: BiggestUpsetHighlight | null = null;
  let bestCount = Infinity;

  for (const match of knockoutMatches) {
    const winner = resolveActualWinner(match);
    if (!winner) continue;
    const loser = winner === match.homeTeamId ? match.awayTeamId : match.homeTeamId;

    let pickCount = 0;
    for (const pick of knockoutPicks) {
      if (pick.bracketMatchKey !== match.id) continue;
      if (pick.winnerTeamId === winner) pickCount++;
    }

    if (pickCount > 0 && pickCount < bestCount) {
      bestCount = pickCount;
      best = {
        matchId: asMatchId(match.id),
        round: STAGE_LABELS[match.stage] ?? match.stage,
        winnerTeam: teamName(def, winner),
        loserTeam: teamName(def, loser ?? '?'),
        pickCount,
        total: totalMembers,
      };
    }
  }

  return best;
}

export function computePredictionsMade(counts: {
  groupScores: number;
  knockoutPicks: number;
  finishScores: number;
  specialBets: number;
}): number {
  return counts.groupScores + counts.knockoutPicks + counts.finishScores + counts.specialBets;
}

export function computeExactScoreRatePercent(
  groupScores: PoolGroupScore[],
  allMatches: MatchRow[],
  groupScoring: { exactScore: number; correctOutcome: number },
): number {
  const matchById = new Map(allMatches.map((m) => [m.id, m]));
  let exact = 0;
  let total = 0;

  for (const gs of groupScores) {
    const match = matchById.get(gs.matchId);
    if (
      !match ||
      match.status !== 'final' ||
      match.homeGoals === null ||
      match.awayGoals === null
    ) {
      continue;
    }
    total++;
    const { hit } = computeHit(match.homeGoals, match.awayGoals, gs.home, gs.away, groupScoring);
    if (hit === 'exact') exact++;
  }

  return total > 0 ? Math.round((exact / total) * 100) : 0;
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `pnpm exec vitest run apps/web/src/features/pool-archive/application/build-highlights.test.ts`
Expected: PASS (adjust any `teamName`/`description` literal mismatches found in Step 1 against the
real `miniTournament` fixture, then re-run until green).

---

### Task 6: `build-recap.ts` — orchestration + extend `archivePool` and `archivePoolAction`

**Files:**

- Create: `apps/web/src/features/pool-archive/application/build-recap.ts`
- Create: `apps/web/src/features/pool-archive/application/build-recap.test.ts`
- Modify: `apps/web/src/features/pool-archive/application/archive-pool.ts`
- Modify: `apps/web/src/features/pool-archive/application/archive-pool.test.ts`
- Modify: `apps/web/src/features/pool-archive/api/actions.ts`
- Modify: `apps/web/src/features/pool-archive/api/actions.test.ts`

**Interfaces:**

- Consumes: `computeChampionPick`, `computeBestSingleMatch`, `computeBiggestUpset`,
  `computePredictionsMade`, `computeExactScoreRatePercent` from `./build-highlights` (Task 5);
  `buildRaceChartData`, `buildRaceEventDates`, `resolveActualWinner`, `computeHit` from
  `@/features/results` (Task 4); `getMatchesForTournament`, `getGroupScoresByPool`,
  `getKnockoutPicksByPool`, `getFinishScoresByPool`, `getSpecialBetsByPool`, `getLeaderboard` from
  `@cup/db` (all pre-existing).
- Produces (used by this same task's `archivePool` extension):
  - `export type EntryRecapExtras = { pointsHistory: number[]; stageReasons: (string | null)[] }`
  - `export async function buildPoolArchiveRecap(db: Db<AppSchema>, params: { poolId: PoolId; tournamentId: TournamentId; def: Tournament; scoring: Scoring }): Promise<{ recap: PoolArchiveRecap; entryExtras: Map<UserId, EntryRecapExtras> }>`
  - `archivePool`'s signature changes: input gains `def: Tournament; scoring: Scoring`.
  - `archivePoolAction` now passes `tournament.definition`/`tournament.scoringConfig` through.

- [ ] **Step 1: Write the failing test for `build-recap.ts`**

Create `apps/web/src/features/pool-archive/application/build-recap.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import {
  createUser,
  createPool as dbCreatePool,
  upsertTournamentDef,
  addMember,
  upsertKnockoutMatch,
  upsertKnockoutPick,
  getOrCreatePrediction,
} from '@cup/db';
import { miniTournament } from '@cup/engine/testing';
import { tournamentId as asTournamentId } from '@cup/engine';
import type { PoolId, TournamentId, UserId } from '@cup/engine';
import { buildPoolArchiveRecap } from './build-recap';

type Db = Awaited<ReturnType<typeof makeTestDb>>;

const FUTURE_KICKOFF = new Date('2099-06-11T18:00:00Z');

describe('buildPoolArchiveRecap', () => {
  let db: Db;
  let poolId: PoolId;
  let tournamentId: TournamentId;
  let ownerId: UserId;

  beforeEach(async () => {
    db = await makeTestDb();
    await upsertTournamentDef(db, miniTournament, FUTURE_KICKOFF, new Map());
    tournamentId = asTournamentId(miniTournament.id);
    const owner = await createUser(db, { email: 'owner@x.com', displayName: 'Owner' });
    ownerId = owner.id;
    const pool = await dbCreatePool(db, { tournamentId, ownerId, name: 'Test Pool' });
    poolId = pool.id;
    await addMember(db, poolId, ownerId);
  });

  it('returns a recap with stages and null highlights when nobody has predicted anything', async () => {
    const { recap, entryExtras } = await buildPoolArchiveRecap(db, {
      poolId,
      tournamentId,
      def: miniTournament,
      scoring: miniTournament.scoring,
    });

    expect(recap.championPick).toBeNull();
    expect(recap.bestSingleMatch).toBeNull();
    expect(recap.biggestUpset).toBeNull();
    expect(recap.predictionsMade).toBe(0);
    expect(recap.exactScoreRatePercent).toBe(0);
    expect(Array.isArray(recap.stages)).toBe(true);
    // The owner has no predictions, but is still a pool member — getLeaderboard/buildRaceChartData
    // still produces a (flat, zero) points history entry for them.
    expect(entryExtras.get(ownerId)?.pointsHistory.every((p) => p === 0)).toBe(true);
  });

  it('populates championPick once a final-winner pick exists', async () => {
    const prediction = await getOrCreatePrediction(db, { poolId, userId: ownerId, tournamentId });
    await upsertKnockoutPick(db, prediction.id, miniTournament.bracket.finalMatch, 'A1');

    const { recap } = await buildPoolArchiveRecap(db, {
      poolId,
      tournamentId,
      def: miniTournament,
      scoring: miniTournament.scoring,
    });

    expect(recap.championPick).toEqual({ teamId: 'A1', teamName: 'Team A1', count: 1, total: 1 });
  });
});
```

Note: confirm `upsertKnockoutPick`'s exact signature (`db, predictionId, bracketMatchKey, winnerTeamId`)
and `getOrCreatePrediction`'s signature against `packages/db/src/repositories/predictions.ts` before
running this — adjust argument order/shape if it differs from what's shown (these are pre-existing
functions from the predictions feature, used here only to seed test data).

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm exec vitest run apps/web/src/features/pool-archive/application/build-recap.test.ts`
Expected: FAIL — `Cannot find module './build-recap'`.

- [ ] **Step 3: Implement `build-recap.ts`**

Create `apps/web/src/features/pool-archive/application/build-recap.ts`:

```ts
import type { Db } from '@cup/db';
import {
  getMatchesForTournament,
  getGroupScoresByPool,
  getKnockoutPicksByPool,
  getFinishScoresByPool,
  getSpecialBetsByPool,
  getLeaderboard,
} from '@cup/db';
import type { MatchRow, PoolGroupScore, PoolKnockoutPick, PoolArchiveRecap } from '@cup/db';
import {
  buildRaceChartData,
  buildRaceEventDates,
  resolveActualWinner,
  computeHit,
} from '@/features/results';
import type { PoolId, TournamentId, Tournament, Scoring, UserId } from '@cup/engine';
import { userId as asUserId } from '@cup/engine';
import type { AppSchema } from '@/shared/db';
import {
  computeChampionPick,
  computeBestSingleMatch,
  computeBiggestUpset,
  computePredictionsMade,
  computeExactScoreRatePercent,
} from './build-highlights';

export type EntryRecapExtras = {
  pointsHistory: number[];
  stageReasons: (string | null)[];
};

function buildStageReasons(
  userId: UserId,
  stages: string[],
  ctx: {
    allMatches: MatchRow[];
    groupScores: PoolGroupScore[];
    knockoutPicks: PoolKnockoutPick[];
    def: Tournament;
    scoring: Scoring;
  },
): (string | null)[] {
  const eventDates = buildRaceEventDates(ctx.allMatches);
  // stages = ['Start', ...eventDates-as-labels(, 'Projected')] — index 0 ('Start') has no reason.
  const reasons: (string | null)[] = [null];

  for (const dateStr of eventDates) {
    const matchesThisDate = ctx.allMatches.filter(
      (m) => m.status === 'final' && m.kickoff && m.kickoff.toISOString().slice(0, 10) === dateStr,
    );

    const groupMatchesToday = matchesThisDate.filter((m) => m.stage === 'group');
    let exactCount = 0;
    for (const m of groupMatchesToday) {
      const guess = ctx.groupScores.find((gs) => gs.userId === userId && gs.matchId === m.id);
      if (!guess || m.homeGoals === null || m.awayGoals === null) continue;
      const { hit } = computeHit(
        m.homeGoals,
        m.awayGoals,
        guess.home,
        guess.away,
        ctx.scoring.groupMatch,
      );
      if (hit === 'exact') exactCount++;
    }
    if (exactCount > 0) {
      reasons.push(`${exactCount} exact score${exactCount > 1 ? 's' : ''}`);
      continue;
    }

    const knockoutMatchesToday = matchesThisDate.filter((m) => m.stage !== 'group');
    const finalKey = ctx.def.bracket.finalMatch;
    const correctTeams: string[] = [];
    let championPickCorrect = false;
    for (const m of knockoutMatchesToday) {
      const winner = resolveActualWinner(m);
      if (!winner) continue;
      const pick = ctx.knockoutPicks.find((p) => p.userId === userId && p.bracketMatchKey === m.id);
      if (pick?.winnerTeamId === winner) {
        if (m.id === finalKey) championPickCorrect = true;
        else correctTeams.push(winner);
      }
    }

    if (championPickCorrect) {
      reasons.push('Champion pick correct');
    } else if (correctTeams.length > 0) {
      reasons.push(`${correctTeams.join(', ')} advance as picked`);
    } else {
      reasons.push(null);
    }
  }

  // buildRaceEventDates never produces a 'Projected' stage for a finished (fully-archived)
  // tournament, so `reasons.length === stages.length` here; if it's ever short, pad with null.
  while (reasons.length < stages.length) reasons.push(null);

  return reasons;
}

export async function buildPoolArchiveRecap(
  db: Db<AppSchema>,
  params: { poolId: PoolId; tournamentId: TournamentId; def: Tournament; scoring: Scoring },
): Promise<{ recap: PoolArchiveRecap; entryExtras: Map<UserId, EntryRecapExtras> }> {
  const { poolId, tournamentId, def, scoring } = params;

  const [leaderboard, allMatches, groupScores, knockoutPicks, finishScores, specialBets] =
    await Promise.all([
      getLeaderboard(db, poolId),
      getMatchesForTournament(db, tournamentId),
      getGroupScoresByPool(db, poolId),
      getKnockoutPicksByPool(db, poolId),
      getFinishScoresByPool(db, poolId),
      getSpecialBetsByPool(db, poolId),
    ]);

  const totalMembers = leaderboard.length;

  const raceChart = buildRaceChartData(leaderboard, null, {
    allMatches,
    poolGroupScores: groupScores,
    def,
    knockoutPicks,
  });

  const entryExtras = new Map<UserId, EntryRecapExtras>();
  for (const player of raceChart.chartPlayers) {
    const uid = asUserId(player.userId);
    entryExtras.set(uid, {
      pointsHistory: player.points,
      stageReasons: buildStageReasons(uid, raceChart.chartStages, {
        allMatches,
        groupScores,
        knockoutPicks,
        def,
        scoring,
      }),
    });
  }

  const recap: PoolArchiveRecap = {
    stages: raceChart.chartStages,
    championPick: computeChampionPick(knockoutPicks, def, totalMembers),
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
    exactScoreRatePercent: computeExactScoreRatePercent(
      groupScores,
      allMatches,
      scoring.groupMatch,
    ),
  };

  return { recap, entryExtras };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm exec vitest run apps/web/src/features/pool-archive/application/build-recap.test.ts`
Expected: PASS (2 tests). If `upsertKnockoutPick`/`getOrCreatePrediction` signatures needed adjusting
in Step 1, fix the test now.

- [ ] **Step 5: Extend `archivePool` to call `buildPoolArchiveRecap`**

Replace `apps/web/src/features/pool-archive/application/archive-pool.ts` in full with:

```ts
import type { Db } from '@cup/db';
import { getLeaderboard, upsertPoolArchive } from '@cup/db';
import { points } from '@cup/engine';
import type {
  PoolId,
  TournamentId,
  UserId,
  ScoreBreakdown,
  Tournament,
  Scoring,
} from '@cup/engine';
import type { AppSchema } from '@/shared/db';
import { buildPoolArchiveRecap } from './build-recap';

function emptyBreakdown(): ScoreBreakdown {
  return {
    groupMatches: points(0),
    groupOrder: points(0),
    bronze: points(0),
    final: points(0),
    roundOf16: points(0),
    roundOf8: points(0),
    topFour: points(0),
    topFourTeams: points(0),
    topFourPosition: points(0),
    specials: points(0),
    total: points(0),
  };
}

/**
 * Snapshots a pool's current leaderboard, plus a computed recap (race chart,
 * highlights, per-member stage history), into the archive tables. Re-running
 * for the same pool replaces the previous snapshot (see `upsertPoolArchive`).
 */
export async function archivePool(
  db: Db<AppSchema>,
  input: {
    poolId: PoolId;
    poolName: string;
    tournamentId: TournamentId;
    tournamentName: string;
    archivedBy: UserId;
    def: Tournament;
    scoring: Scoring;
  },
): Promise<void> {
  const leaderboard = await getLeaderboard(db, input.poolId);

  const { recap, entryExtras } = await buildPoolArchiveRecap(db, {
    poolId: input.poolId,
    tournamentId: input.tournamentId,
    def: input.def,
    scoring: input.scoring,
  });

  const entries = leaderboard.map((entry, index) => {
    const extras = entryExtras.get(entry.userId);
    return {
      userId: entry.userId,
      displayName: entry.displayName,
      rank: index + 1,
      pointsTotal: entry.pointsTotal,
      breakdown: entry.breakdown ?? emptyBreakdown(),
      pointsHistory: extras?.pointsHistory ?? null,
      stageReasons: extras?.stageReasons ?? null,
    };
  });

  await upsertPoolArchive(db, {
    poolId: input.poolId,
    poolName: input.poolName,
    tournamentId: input.tournamentId,
    tournamentName: input.tournamentName,
    archivedBy: input.archivedBy,
    recap,
    entries,
  });
}
```

- [ ] **Step 6: Update `archive-pool.test.ts`'s existing calls**

In `apps/web/src/features/pool-archive/application/archive-pool.test.ts`, every existing call to
`archivePool(db, {...})` needs `def: miniTournament, scoring: miniTournament.scoring` added to its
input object (all 3 existing tests). Run:

Run: `pnpm exec vitest run apps/web/src/features/pool-archive/application/archive-pool.test.ts`
Expected: PASS (3 tests, updated).

- [ ] **Step 7: Update `archivePoolAction` to pass `def`/`scoring` through**

In `apps/web/src/features/pool-archive/api/actions.ts`, find the `archivePool(db, {...})` call and add
`def` and `scoring`, sourced from the `tournament` row already being fetched:

```ts
const tournament = await getTournamentById(db, pool.tournamentId);
if (!tournament) throw new Error(`Tournament ${pool.tournamentId} not found`);
if (!tournament.definition) throw new Error(`Tournament ${pool.tournamentId} has no definition`);

await archivePool(db, {
  poolId,
  poolName: pool.name,
  tournamentId: pool.tournamentId,
  tournamentName: tournament.name,
  archivedBy: actor.userId,
  def: tournament.definition,
  scoring: tournament.scoringConfig,
});
```

(The `if (!tournament.definition) throw ...` guard is new — `TournamentRow.definition` is
`Tournament | null`; every tournament synced via `pnpm sync` always has one, but the type allows
`null`, so this is a real check, not defensive noise.)

- [ ] **Step 8: Update `actions.test.ts`'s existing calls**

In `apps/web/src/features/pool-archive/api/actions.test.ts`, the pool/tournament setup already calls
`upsertTournamentDef(testDb, miniTournament, ...)` — no test changes should be needed here since
`getTournamentById` will already return a `definition`/`scoringConfig` populated from that call. Run:

Run: `pnpm exec vitest run apps/web/src/features/pool-archive/api/actions.test.ts`
Expected: PASS (3 tests, unchanged).

- [ ] **Step 9: Run the full pool-archive test suite**

Run: `pnpm exec vitest run apps/web/src/features/pool-archive`
Expected: PASS (all files).

---

### Task 7: Extend `getPoolArchiveView` with recap + derived insights

**Files:**

- Modify: `apps/web/src/features/pool-archive/application/get-pool-archive.ts`
- Modify: `apps/web/src/features/pool-archive/application/get-pool-archive.test.ts`

**Interfaces:**

- Consumes: `computeLeadChanges`, `computeBiggestRiser` from `../domain/race-history` (Task 3).
- Produces: `getPoolArchiveView`'s return value now includes `recap`, `leadChanges`, `biggestRiser`
  (used by Task 8's UI).

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/features/pool-archive/application/get-pool-archive.test.ts` (the existing
`archivePool` call in the second test needs `def`/`scoring` added per Task 6's signature change —
fix that first, then add this new test):

```ts
it('returns recap and derived leadChanges/biggestRiser when the archive has race history', async () => {
  const tournamentId = asTournamentId(miniTournament.id);
  const owner = await getPoolById(db, poolId);

  const member = await createUser(db, { email: 'member2@x.com', displayName: 'Bob' });
  await addMember(db, poolId, member.id);

  await archivePool(db, {
    poolId,
    poolName: 'Test Pool',
    tournamentId,
    tournamentName: miniTournament.name,
    archivedBy: owner!.ownerId,
    def: miniTournament,
    scoring: miniTournament.scoring,
  });

  const view = await getPoolArchiveView(db, poolId);
  expect(view?.recap).not.toBeNull();
  expect(Array.isArray(view?.leadChanges)).toBe(true);
  // With no predictions made, every member sits at 0 points throughout — no rank ever improves.
  expect(view?.biggestRiser).toBeNull();
});

it('returns recap: null, leadChanges: [], biggestRiser: null for a pre-recap-feature archive', async () => {
  // Simulates an archive written before this feature (recap/pointsHistory/stageReasons all null).
  const { upsertPoolArchive } = await import('@cup/db');
  const { points } = await import('@cup/engine');
  const pool = await getPoolById(db, poolId);

  await upsertPoolArchive(db, {
    poolId,
    poolName: 'Test Pool',
    tournamentId: asTournamentId(miniTournament.id),
    tournamentName: miniTournament.name,
    archivedBy: pool!.ownerId,
    recap: null,
    entries: [
      {
        userId: pool!.ownerId,
        displayName: 'Owner',
        rank: 1,
        pointsTotal: points(0),
        breakdown: {
          groupMatches: points(0),
          groupOrder: points(0),
          bronze: points(0),
          final: points(0),
          roundOf16: points(0),
          roundOf8: points(0),
          topFour: points(0),
          topFourTeams: points(0),
          topFourPosition: points(0),
          specials: points(0),
          total: points(0),
        },
        pointsHistory: null,
        stageReasons: null,
      },
    ],
  });

  const view = await getPoolArchiveView(db, poolId);
  expect(view?.recap).toBeNull();
  expect(view?.leadChanges).toEqual([]);
  expect(view?.biggestRiser).toBeNull();
});
```

Simplify the dynamic `await import(...)` calls above by adding `upsertPoolArchive` and `points` to this
test file's top-level imports instead (`import { ..., upsertPoolArchive } from '@cup/db';` and
`import { ..., points } from '@cup/engine';`), matching this repo's normal import style — the dynamic
form above exists only to show which functions are needed inline; use static top-level imports in the
real file.

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm exec vitest run apps/web/src/features/pool-archive/application/get-pool-archive.test.ts`
Expected: FAIL — `view?.recap` is `undefined`, not matching `not.toBeNull()`/`toBeNull()` assertions
(the function doesn't return these fields yet).

- [ ] **Step 3: Implement the extension**

Replace `apps/web/src/features/pool-archive/application/get-pool-archive.ts` in full with:

```ts
import type { Db } from '@cup/db';
import { getPoolArchiveWithEntries } from '@cup/db';
import type { PoolId } from '@cup/engine';
import type { AppSchema } from '@/shared/db';
import type { PoolArchiveView } from '../domain/types';
import { computeLeadChanges, computeBiggestRiser } from '../domain/race-history';
import type { StageHistoryPlayer } from '../domain/race-history';

export async function getPoolArchiveView(
  db: Db<AppSchema>,
  poolId: PoolId,
): Promise<PoolArchiveView | undefined> {
  const result = await getPoolArchiveWithEntries(db, poolId);
  if (!result) return undefined;

  const { archive, entries } = result;

  const entryViews = entries.map((e) => ({
    userId: e.userId,
    displayName: e.displayName,
    rank: e.rank,
    pointsTotal: e.pointsTotal,
    breakdown: e.breakdown,
    pointsHistory: e.pointsHistory,
    stageReasons: e.stageReasons,
  }));

  const stages = archive.recap?.stages ?? [];
  const historyPlayers: StageHistoryPlayer[] = entryViews
    .filter((e): e is typeof e & { pointsHistory: number[] } => e.pointsHistory !== null)
    .map((e) => ({
      displayName: e.displayName,
      points: e.pointsHistory,
      stageReasons: e.stageReasons,
    }));

  return {
    poolId: archive.poolId,
    poolName: archive.poolName,
    tournamentId: archive.tournamentId,
    tournamentName: archive.tournamentName,
    archivedAt: archive.archivedAt,
    entries: entryViews,
    recap: archive.recap,
    leadChanges: archive.recap ? computeLeadChanges(historyPlayers, stages) : [],
    biggestRiser: archive.recap ? computeBiggestRiser(historyPlayers, stages) : null,
  };
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `pnpm exec vitest run apps/web/src/features/pool-archive/application/get-pool-archive.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full pool-archive test suite**

Run: `pnpm exec vitest run apps/web/src/features/pool-archive`
Expected: PASS (all files).

---

### Task 8: UI components — hero card, highlights, lead changes, stat tiles, race-chart adapter

**Files:**

- Create: `apps/web/src/features/pool-archive/domain/race-chart-adapter.ts`
- Create: `apps/web/src/features/pool-archive/ui/ArchiveHeroCard.tsx`
- Create: `apps/web/src/features/pool-archive/ui/ArchiveHighlightsPanel.tsx`
- Create: `apps/web/src/features/pool-archive/ui/ArchiveLeadChangesPanel.tsx`
- Create: `apps/web/src/features/pool-archive/ui/ArchiveStatTiles.tsx`
- Modify: `apps/web/src/features/pool-archive/ui/ArchivePoolCard.tsx` (copy fix)
- Modify: `apps/web/src/features/pool-archive/index.ts`

**Interfaces:**

- Consumes: `RaceChart`, `RaceChartData`, `RACE_COLORS` from `@/features/results`; `TeamBadge` from
  `@/shared/ui`; `PoolArchiveView`, `LeadChangeEvent`, `BiggestRiserEvent` from `../domain/types`.
- Produces (used by Task 9's page):
  - `export function toRaceChartData(view: PoolArchiveView, viewerUserId: UserId | null): RaceChartData | null`
  - `export function ArchiveHeroCard(props: { poolName: string; tournamentName: string; archivedAt: Date; final: { homeTeamId: string; homeTeamName: string; awayTeamId: string; awayTeamName: string; homeGoals: number; awayGoals: number; winnerTeamId: string } | null }): ReactElement`
  - `export function ArchiveHighlightsPanel(props: { recap: PoolArchiveRecap | null; biggestRiser: BiggestRiserEvent }): ReactElement`
  - `export function ArchiveLeadChangesPanel(props: { leadChanges: LeadChangeEvent[] }): ReactElement`
  - `export function ArchiveStatTiles(props: { matchesPlayed: number; recap: PoolArchiveRecap | null }): ReactElement`

No unit tests for these — consistent with this repo's convention of not unit-testing feature-internal
UI components (see the base pool-archive feature's `ArchivePoolCard`/`ArchiveMemberRow`, neither of
which have test files). `race-chart-adapter.ts` is a pure function with no React/DOM dependency, but
is simple enough (a map + a color-cycling loop, directly mirroring the already-tested
`buildRaceChartData`'s own color-assignment logic) that a dedicated test isn't required — verified via
typecheck + manual reasoning instead.

- [ ] **Step 1: Create the race-chart adapter**

Create `apps/web/src/features/pool-archive/domain/race-chart-adapter.ts`:

```ts
import type { RaceChartData, RaceChartPlayer } from '@/features/results';
import { RACE_COLORS } from '@/features/results';
import type { UserId } from '@cup/engine';
import type { PoolArchiveView } from './types';

/** Adapts a frozen archive's recap + per-entry points history into the shape `RaceChart` expects. */
export function toRaceChartData(
  view: PoolArchiveView,
  viewerUserId: UserId | null,
): RaceChartData | null {
  if (!view.recap) return null;

  const stages = view.recap.stages;
  let colorIdx = 0;

  const chartPlayers: RaceChartPlayer[] = view.entries
    .filter((e): e is typeof e & { pointsHistory: number[] } => e.pointsHistory !== null)
    .map((e) => {
      const isCurrentUser = viewerUserId !== null && e.userId === viewerUserId;
      const color = isCurrentUser
        ? 'var(--green-500)'
        : (RACE_COLORS[colorIdx++] ?? 'var(--ink-muted)');
      return {
        userId: e.userId ?? e.displayName,
        displayName: e.displayName,
        isCurrentUser,
        color,
        points: e.pointsHistory,
      };
    });

  return { chartStages: stages, chartNowIndex: stages.length - 1, chartPlayers };
}
```

- [ ] **Step 2: Create `ArchiveHeroCard`**

Create `apps/web/src/features/pool-archive/ui/ArchiveHeroCard.tsx`:

```tsx
import type { ReactElement } from 'react';
import { TeamBadge, Icon } from '@/shared/ui';

type FinalResult = {
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  homeGoals: number;
  awayGoals: number;
  winnerTeamId: string;
};

type Props = {
  poolName: string;
  tournamentName: string;
  archivedAt: Date;
  final: FinalResult | null;
};

export function ArchiveHeroCard({
  poolName,
  tournamentName,
  archivedAt,
  final,
}: Props): ReactElement {
  const champion =
    final && final.winnerTeamId === final.homeTeamId
      ? { teamId: final.homeTeamId, name: final.homeTeamName, goals: final.homeGoals }
      : final
        ? { teamId: final.awayTeamId, name: final.awayTeamName, goals: final.awayGoals }
        : null;
  const runnerUp =
    final && final.winnerTeamId === final.homeTeamId
      ? { teamId: final.awayTeamId, name: final.awayTeamName, goals: final.awayGoals }
      : final
        ? { teamId: final.homeTeamId, name: final.homeTeamName, goals: final.homeGoals }
        : null;

  return (
    <div className="rounded-cup turf p-6 text-on-dark" data-testid="archive-hero-card">
      <div className="flex items-center justify-between text-xs text-on-dark/70 mb-4">
        <span>
          Archived · {archivedAt.toLocaleDateString()} · {poolName}
        </span>
        <span>{tournamentName}</span>
      </div>

      {champion && runnerUp ? (
        <div className="flex flex-col items-center gap-2 py-4">
          <Icon name="trophy" size={32} color="var(--orange-500)" />
          <span className="eyebrow text-orange-400">Champion</span>
          <div className="flex items-center gap-2.5">
            <TeamBadge teamId={champion.teamId} size="lg" />
            <span className="display text-[28px]">{champion.name}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-on-dark/80">
            <TeamBadge teamId={champion.teamId} size="sm" />
            <span className="tnum">{champion.goals}</span>
            <span>–</span>
            <span className="tnum">{runnerUp.goals}</span>
            <TeamBadge teamId={runnerUp.teamId} size="sm" />
            <span>{runnerUp.name}</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-on-dark/70 py-4 text-center">Final result not yet available.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `ArchiveHighlightsPanel`**

Create `apps/web/src/features/pool-archive/ui/ArchiveHighlightsPanel.tsx`:

```tsx
import type { ReactElement } from 'react';
import type { PoolArchiveRecap, BiggestRiserEvent } from '../domain/types';

type Props = { recap: PoolArchiveRecap | null; biggestRiser: BiggestRiserEvent };

export function ArchiveHighlightsPanel({ recap, biggestRiser }: Props): ReactElement {
  if (!recap) {
    return (
      <div className="card p-4">
        <span className="section-label">Tournament highlights</span>
        <p className="text-xs text-ink-muted mt-2">
          Highlights aren&apos;t available for this archive yet — re-archive to generate them.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4" data-testid="archive-highlights-panel">
      <span className="section-label">Tournament highlights</span>
      <ul className="mt-3 space-y-3">
        {recap.championPick && (
          <li>
            <div className="font-bold text-sm">Champion pick</div>
            <p className="text-xs text-ink-muted">
              {recap.championPick.count} of {recap.championPick.total} players backed{' '}
              {recap.championPick.teamName} before the final — the pool&apos;s most popular winner
              call.
            </p>
          </li>
        )}
        {biggestRiser && (
          <li>
            <div className="font-bold text-sm">Biggest riser</div>
            <p className="text-xs text-ink-muted">
              {biggestRiser.displayName} climbed from {biggestRiser.fromRank} to{' '}
              {biggestRiser.toRank}
              {biggestRiser.reason
                ? ` after ${biggestRiser.reason}`
                : ` at ${biggestRiser.stageName}`}
              .
            </p>
          </li>
        )}
        {recap.bestSingleMatch && (
          <li>
            <div className="font-bold text-sm">Best single match</div>
            <p className="text-xs text-ink-muted">
              {recap.bestSingleMatch.exactCount} of {recap.bestSingleMatch.total} players called{' '}
              {recap.bestSingleMatch.description} exactly — the pool&apos;s highest-agreement
              result.
            </p>
          </li>
        )}
        {recap.biggestUpset && (
          <li>
            <div className="font-bold text-sm">Biggest upset called</div>
            <p className="text-xs text-ink-muted">
              Only {recap.biggestUpset.pickCount} of {recap.biggestUpset.total} players backed{' '}
              {recap.biggestUpset.winnerTeam} over {recap.biggestUpset.loserTeam} in the{' '}
              {recap.biggestUpset.round} — and it paid off.
            </p>
          </li>
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Create `ArchiveLeadChangesPanel`**

Create `apps/web/src/features/pool-archive/ui/ArchiveLeadChangesPanel.tsx`:

```tsx
import type { ReactElement } from 'react';
import type { LeadChangeEvent } from '../domain/types';

type Props = { leadChanges: LeadChangeEvent[] };

export function ArchiveLeadChangesPanel({ leadChanges }: Props): ReactElement | null {
  if (leadChanges.length === 0) return null;

  return (
    <div className="card p-4" data-testid="archive-lead-changes-panel">
      <span className="section-label">Lead changes</span>
      <ul className="mt-3 space-y-3">
        {leadChanges.map((event) => (
          <li key={event.stageIndex} className="flex gap-3">
            <span className="chip shrink-0">{event.stageName}</span>
            <div>
              <div className="font-bold text-sm">{event.leaderDisplayName} takes the lead</div>
              <p className="text-xs text-ink-muted">
                {event.reason ?? `${event.pointsAtStage} pts at ${event.stageName}`}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Create `ArchiveStatTiles`**

Create `apps/web/src/features/pool-archive/ui/ArchiveStatTiles.tsx`:

```tsx
import type { ReactElement } from 'react';
import type { PoolArchiveRecap } from '../domain/types';

type Props = { matchesPlayed: number; recap: PoolArchiveRecap | null };

function Tile({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="card p-4">
      <div className="eyebrow text-ink-muted">{label}</div>
      <div className="display text-[20px] mt-1">{value}</div>
    </div>
  );
}

export function ArchiveStatTiles({ matchesPlayed, recap }: Props): ReactElement {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="archive-stat-tiles">
      <Tile label="Matches played" value={String(matchesPlayed)} />
      <Tile label="Predictions made" value={recap ? recap.predictionsMade.toLocaleString() : '—'} />
      <Tile label="Pool exact-score rate" value={recap ? `${recap.exactScoreRatePercent}%` : '—'} />
      <Tile
        label="Biggest upset called"
        value={
          recap?.biggestUpset
            ? `${recap.biggestUpset.winnerTeam} over ${recap.biggestUpset.loserTeam}`
            : '—'
        }
      />
    </div>
  );
}
```

- [ ] **Step 6: Fix `ArchivePoolCard`'s owner-facing copy**

In `apps/web/src/features/pool-archive/ui/ArchivePoolCard.tsx`, replace:

```tsx
{
  archivedAt
    ? `Archived on ${archivedAt.toLocaleDateString()}. This snapshot survives future name changes or account deletions.`
    : 'Freeze a permanent snapshot of the final standings once the cup is finished.';
}
```

with:

```tsx
{
  archivedAt
    ? isOwner
      ? `Archived on ${archivedAt.toLocaleDateString()}. Survives members' future name changes or account deletions — not your own; deleting your account removes the whole pool.`
      : `Archived on ${archivedAt.toLocaleDateString()}. This snapshot survives future name changes or account deletions.`
    : 'Freeze a permanent snapshot of the final standings once the cup is finished.';
}
```

(`isOwner` is already a prop on this component — no signature change needed.)

- [ ] **Step 7: Update the feature barrel**

Replace `apps/web/src/features/pool-archive/index.ts` in full with:

```ts
export type {
  PoolArchiveView,
  PoolArchiveEntryView,
  PoolArchiveRecap,
  ChampionPickHighlight,
  BestSingleMatchHighlight,
  BiggestUpsetHighlight,
  LeadChangeEvent,
  BiggestRiserEvent,
} from './domain/types';
export { toRaceChartData } from './domain/race-chart-adapter';
export { archivePool } from './application/archive-pool';
export { getPoolArchiveView } from './application/get-pool-archive';
export { archivePoolAction } from './api/actions';
export { ArchivePoolCard } from './ui/ArchivePoolCard';
export { ArchiveMemberRow } from './ui/ArchiveMemberRow';
export { ArchiveHeroCard } from './ui/ArchiveHeroCard';
export { ArchiveHighlightsPanel } from './ui/ArchiveHighlightsPanel';
export { ArchiveLeadChangesPanel } from './ui/ArchiveLeadChangesPanel';
export { ArchiveStatTiles } from './ui/ArchiveStatTiles';
```

- [ ] **Step 8: Verify**

Run: `pnpm --filter web typecheck && pnpm --filter web exec eslint src/features/pool-archive`
Expected: PASS, clean.

---

### Task 9: Wire the recap into `archive/page.tsx`

**Files:**

- Modify: `apps/web/src/app/(authenticated)/pools/[id]/archive/page.tsx`

**Interfaces:**

- Consumes: `ArchiveHeroCard`, `ArchiveHighlightsPanel`, `ArchiveLeadChangesPanel`, `ArchiveStatTiles`,
  `toRaceChartData` from `@/features/pool-archive` (Task 8); `RaceChart` from `@/features/results`;
  `getActualResults`, `getMatchesForTournament` from `@cup/db` (both pre-existing, not yet used on this
  page).
- Produces: the finished route. No other task depends on this.

- [ ] **Step 1: Rewrite the page**

Replace `apps/web/src/app/(authenticated)/pools/[id]/archive/page.tsx` in full with:

```tsx
import type { ReactElement } from 'react';
import { redirect, notFound } from 'next/navigation';
import {
  isMember,
  getPoolById,
  getTournamentById,
  getActualResults,
  getMatchesForTournament,
} from '@cup/db';
import { getCurrentActor } from '@/features/auth';
import { db } from '@/shared/db';
import {
  getPoolArchiveView,
  ArchivePoolCard,
  ArchiveMemberRow,
  ArchiveHeroCard,
  ArchiveHighlightsPanel,
  ArchiveLeadChangesPanel,
  ArchiveStatTiles,
  toRaceChartData,
} from '@/features/pool-archive';
import { RaceChart } from '@/features/results';
import { BackLink } from '@/shared/ui';
import { poolId as asPoolId } from '@cup/engine';

type Props = { params: Promise<{ id: string }> };

export default async function PoolArchivePage({ params }: Props): Promise<ReactElement> {
  const { id } = await params;
  const poolId = asPoolId(id);

  const actor = await getCurrentActor();
  if (!actor) redirect('/');
  if (!(await isMember(db, poolId, actor.userId))) notFound();

  const pool = await getPoolById(db, poolId);
  if (!pool) notFound();

  const [archive, tournament, actualResults, allMatches] = await Promise.all([
    getPoolArchiveView(db, poolId),
    getTournamentById(db, pool.tournamentId),
    getActualResults(db, pool.tournamentId),
    getMatchesForTournament(db, pool.tournamentId),
  ]);

  const isOwner = actor.userId === pool.ownerId;
  const scoring = tournament?.scoringConfig ?? null;
  const def = tournament?.definition ?? null;

  const finalMatch = actualResults.finalMatch;
  const final =
    finalMatch && def
      ? {
          homeTeamId: finalMatch.home,
          homeTeamName: def.teams.find((t) => t.id === finalMatch.home)?.name ?? finalMatch.home,
          awayTeamId: finalMatch.away,
          awayTeamName: def.teams.find((t) => t.id === finalMatch.away)?.name ?? finalMatch.away,
          homeGoals: finalMatch.homeGoals,
          awayGoals: finalMatch.awayGoals,
          winnerTeamId: finalMatch.winner,
        }
      : null;

  const matchesPlayed = allMatches.filter((m) => m.status === 'final').length;
  const raceChartData = archive ? toRaceChartData(archive, actor.userId) : null;

  return (
    <div className="max-w-275 mx-auto p-[28px_20px]">
      <div className="eyebrow text-ink-muted mb-2 flex items-center gap-1.5">
        <BackLink href={`/pools/${poolId}`}>{pool.name}</BackLink>
        <span>· Archive</span>
      </div>
      <h1 className="display text-[34px] mb-5">Final standings</h1>

      <div className="mb-5">
        <ArchivePoolCard
          poolId={poolId}
          isOwner={isOwner}
          archivedAt={archive?.archivedAt ?? null}
        />
      </div>

      {!archive ? (
        <p className="text-sm text-ink-muted">This pool hasn&apos;t been archived yet.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <ArchiveHeroCard
            poolName={archive.poolName}
            tournamentName={archive.tournamentName}
            archivedAt={archive.archivedAt}
            final={final}
          />

          <div className="grid gap-5 items-start md:grid-cols-[1fr_320px]">
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
            </div>

            <div className="flex flex-col gap-4 min-w-0">
              <ArchiveHighlightsPanel recap={archive.recap} biggestRiser={archive.biggestRiser} />
              <ArchiveLeadChangesPanel leadChanges={archive.leadChanges} />
            </div>
          </div>

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
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter web typecheck && pnpm --filter web exec eslint "src/app/(authenticated)/pools/[id]/archive/page.tsx"`
Expected: PASS, clean.

- [ ] **Step 3: Run the full pool-archive test suite once more**

Run: `pnpm exec vitest run apps/web/src/features/pool-archive`
Expected: PASS (confirms nothing in the page rewrite broke the application-layer tests it depends on
— page components themselves have no test file, consistent with this repo's convention).

- [ ] **Step 4: Manual verification (same environment limitation as the base feature)**

If a live dev server + reachable Postgres is available in your environment, walk through: archive a
completed pool, confirm the hero card shows the correct champion/score, highlights panel shows
whichever of the 4 stats have data, race chart renders with a line per member (colored, "you"
highlighted in green if you're a member), lead-changes timeline appears if the lead changed hands, and
the stat tiles show real numbers. If no live Postgres is reachable (as was the case for the base
feature — no docker, only a read-only production connection that must never be used for testing), skip
this step and say so explicitly rather than claiming it was verified — rely on the typecheck/lint/test
verification above instead.

---

### Task 10: Docs, full verification, and the single commit

**Files:**

- Modify: `docs/features/pool-archive.md`
- Modify: `docs/PROGRESS.md`
- Everything created/modified in Tasks 1–9
- The already-written `docs/superpowers/specs/2026-07-18-pool-archive-recap-design.md`

**Interfaces:** none — docs + verification + commit only.

- [ ] **Step 1: Update the feature design doc**

In `docs/features/pool-archive.md`, add a new `## Recap (hero card, highlights, race chart, lead
changes)` section (after the existing "UI" section) summarizing: the two new jsonb columns
(`pool_archives.recap`, `pool_archive_entries.pointsHistory`/`stageReasons`), what gets computed once
at archive time vs. read live (champion/final score/matches-played are live; everything else is
frozen), the 4 highlight stats and their tie-break rules, the lead-changes/biggest-riser derivations,
and the two accepted simplifications (date-based race-chart labels instead of named milestones;
template-filled stage reasons instead of free-text generation). Update the "File layout" section to
list the new files from this plan.

- [ ] **Step 2: Update `docs/PROGRESS.md`**

Add a new `## Pool archive recap (2026-07-18)` section (following the existing dated-section
convention) summarizing the same points as Step 1, more briefly, and linking to
`docs/features/pool-archive.md`.

- [ ] **Step 3: Run the full verification suite**

Run, in order, confirming each passes before moving to the next:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter web build
```

- [ ] **Step 4: Stage everything and create the single commit**

```bash
git add packages/db/src/schema/pool-archive.ts \
  packages/db/src/repositories/pool-archive.ts \
  packages/db/src/repositories/pool-archive.test.ts \
  packages/db/migrations/0010_pool_archive_recap.sql \
  packages/db/migrations/meta/ \
  apps/web/src/features/pool-archive/ \
  apps/web/src/features/results/index.ts \
  "apps/web/src/app/(authenticated)/pools/[id]/archive/page.tsx" \
  docs/features/pool-archive.md \
  docs/PROGRESS.md \
  docs/superpowers/specs/2026-07-18-pool-archive-recap-design.md \
  docs/superpowers/plans/2026-07-18-pool-archive-recap.md

git status
```

Review the `git status` output, then commit:

```bash
git commit -m "$(cat <<'EOF'
feat: pool archive recap

Upgrades the plain archive standings page into a recap: a champion hero
card (read live from tournament results, never deleted), four highlight
stats, a points-race chart, and a lead-changes timeline — all computed
once at archive time from that pool's predictions so they survive a
member's later account deletion, same guarantee as the base archive
feature.
EOF
)"

git status
```

- [ ] **Step 5: Report completion**

Confirm to the user: migration filename, and that `pnpm test`/`pnpm typecheck`/`pnpm lint`/`pnpm
--filter web build` all passed. Note explicitly whether live browser verification was or wasn't
possible (per Task 9 Step 4). Do not push.
