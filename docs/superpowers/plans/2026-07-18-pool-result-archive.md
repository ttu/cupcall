# Pool Result Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a pool owner freeze a permanent snapshot ("archive") of a pool's final standings and
per-member score breakdown, decoupled from live `users`/`pools` data so it survives later display-name
changes, and survives account deletion except that the deleted user's name is scrubbed to "Deleted
user" in any archive they appear in.

**Architecture:** New DB tables (`pool_archives`, `pool_archive_entries`) hold a frozen copy of what
`getLeaderboard` already computes today (points + `ScoreBreakdown` per member), plus frozen pool/
tournament names. A new vertical slice `apps/web/src/features/pool-archive/` provides the create
(`archivePool`) and read (`getPoolArchiveView`) use-cases, an owner-only server action, and UI. A small
change to the existing `deleteUser` repository function anonymizes matching archive entries before
deleting the user row.

**Tech Stack:** Next.js App Router server actions, Drizzle ORM / PostgreSQL, Zod validation, Vitest +
pglite integration tests (`makeTestDb`) — same stack as every other feature in this repo.

## Global Constraints

- **One commit per feature** (CLAUDE.md): do NOT commit after each task below. Every task ends with
  "run tests, confirm green" — not a commit. The final task stages everything (schema, migration,
  repositories, application code, UI, tests, docs, and the already-written spec file at
  `docs/superpowers/specs/2026-07-18-pool-result-archive-design.md`) and creates exactly one commit.
- **TDD red → green**: write the failing test first, confirm it fails for the expected reason, then
  write the minimal code to pass it.
- **Mock only at system boundaries**: `@/shared/db` (its `server-only` import throws in Vitest),
  `next/cache`, and `@/features/auth` are the only things ever mocked in this repo's action tests — the
  DB itself is always a real pglite instance via `makeTestDb`/`@cup/db/testing`. Never mock repository
  or application functions.
- **Branded types**: use `@cup/engine`'s `poolId()`, `userId()`, `tournamentId()`, `points()`
  constructors and `PoolId`/`UserId`/`TournamentId`/`Points`/`ScoreBreakdown` types — never raw
  `string`/`number` at feature boundaries.
- **Drizzle upsert footgun**: any `onConflictDoUpdate` must reference `sql`excluded.column_name``, never
`schema.table.column`(the latter is a silent no-op — see`packages/db/src/repositories/tournament.ts`
  for the precedent this bit the team on 2026-07-11).
- **No new DB transactions**: this codebase has zero `.transaction()` calls anywhere (verified) — every
  multi-step write is sequential `await`s. Follow that convention; do not introduce `.transaction()`.
- **Cross-feature access only through a feature's `index.ts` barrel** — e.g. the archive UI must import
  `ScoreBreakdownCard` from `@/features/results`, never from `@/features/results/ui/ScoreBreakdownCard`
  directly.
- Full design context: `docs/superpowers/specs/2026-07-18-pool-result-archive-design.md`.

---

### Task 1: `pool_archives` / `pool_archive_entries` schema, migration, and repository

**Files:**

- Create: `packages/db/src/schema/pool-archive.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/migrations/0009_pool_archives.sql` (generated, not hand-written — see Step 5)
- Create: `packages/db/src/repositories/pool-archive.ts`
- Create: `packages/db/src/repositories/pool-archive.test.ts`
- Modify: `packages/db/src/repositories/index.ts`

**Interfaces:**

- Produces (used by Task 2, and by `apps/web/src/features/pool-archive/*` in Tasks 3–4):
  - `export type PoolArchiveRow = { id: string; poolId: PoolId; poolName: string; tournamentId: TournamentId; tournamentName: string; archivedAt: Date; archivedBy: UserId | null }`
  - `export type PoolArchiveEntryRow = { id: string; archiveId: string; userId: UserId | null; displayName: string; rank: number; pointsTotal: Points; breakdown: ScoreBreakdown }`
  - `export type PoolArchiveEntryInput = { userId: UserId; displayName: string; rank: number; pointsTotal: Points; breakdown: ScoreBreakdown }`
  - `export async function upsertPoolArchive(db: Database, input: { poolId: PoolId; poolName: string; tournamentId: TournamentId; tournamentName: string; archivedBy: UserId; entries: PoolArchiveEntryInput[] }): Promise<PoolArchiveRow>`
  - `export async function getPoolArchiveWithEntries(db: Database, poolId: PoolId): Promise<{ archive: PoolArchiveRow; entries: PoolArchiveEntryRow[] } | undefined>`
  - Both exported from `@cup/db` (root package export) via `repositories/index.ts` → `packages/db/src/index.ts` (already does `export * from './repositories/index'`, no change needed there).

- [ ] **Step 1: Write the failing repository test**

Create `packages/db/src/repositories/pool-archive.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../testing/make-test-db';
import type { Db } from '../client';
import * as schema from '../schema/index';
import { createUser } from './users';
import { createPool } from './pools';
import { upsertTournamentDef } from './tournament';
import { upsertPoolArchive, getPoolArchiveWithEntries } from './pool-archive';
import { miniTournament } from '@cup/engine/testing';
import { tournamentId as asTournamentId, points } from '@cup/engine';
import type { ScoreBreakdown } from '@cup/engine';

const FUTURE_KICKOFF = new Date('2099-06-11T18:00:00Z');
const EMPTY_KICKOFFS = new Map<string, Date | null>();

function fakeBreakdown(total: number): ScoreBreakdown {
  return {
    groupMatches: points(total),
    groupOrder: points(0),
    bronze: points(0),
    final: points(0),
    roundOf16: points(0),
    roundOf8: points(0),
    topFour: points(0),
    topFourTeams: points(0),
    topFourPosition: points(0),
    specials: points(0),
    total: points(total),
  };
}

describe('pool-archive repository', () => {
  let db: Db<typeof schema>;

  beforeEach(async () => {
    db = await makeTestDb();
  });

  it('creates an archive with entries and reads them back sorted by rank', async () => {
    await upsertTournamentDef(db, miniTournament, FUTURE_KICKOFF, EMPTY_KICKOFFS);
    const tournamentId = asTournamentId(miniTournament.id);
    const owner = await createUser(db, { email: 'owner@x.com', displayName: 'Owner' });
    const pool = await createPool(db, { tournamentId, ownerId: owner.id, name: 'Test Pool' });
    const member = await createUser(db, { email: 'member@x.com', displayName: 'Alice' });

    const result = await upsertPoolArchive(db, {
      poolId: pool.id,
      poolName: pool.name,
      tournamentId,
      tournamentName: miniTournament.name,
      archivedBy: owner.id,
      entries: [
        {
          userId: owner.id,
          displayName: 'Owner',
          rank: 1,
          pointsTotal: points(50),
          breakdown: fakeBreakdown(50),
        },
        {
          userId: member.id,
          displayName: 'Alice',
          rank: 2,
          pointsTotal: points(30),
          breakdown: fakeBreakdown(30),
        },
      ],
    });

    expect(result.poolId).toBe(pool.id);
    expect(result.poolName).toBe('Test Pool');

    const fetched = await getPoolArchiveWithEntries(db, pool.id);
    expect(fetched).toBeDefined();
    expect(fetched?.archive.poolName).toBe('Test Pool');
    expect(fetched?.entries.map((e) => e.displayName)).toEqual(['Owner', 'Alice']);
    expect(fetched?.entries[0]?.rank).toBe(1);
    expect(fetched?.entries[0]?.pointsTotal).toBe(50);
    expect(fetched?.entries[0]?.breakdown.total).toBe(50);
  });

  it('returns undefined for a pool with no archive', async () => {
    await upsertTournamentDef(db, miniTournament, FUTURE_KICKOFF, EMPTY_KICKOFFS);
    const tournamentId = asTournamentId(miniTournament.id);
    const owner = await createUser(db, { email: 'o2@x.com', displayName: 'Owner2' });
    const pool = await createPool(db, { tournamentId, ownerId: owner.id, name: 'Empty Pool' });

    const fetched = await getPoolArchiveWithEntries(db, pool.id);
    expect(fetched).toBeUndefined();
  });

  it('replaces entries when archiving the same pool twice', async () => {
    await upsertTournamentDef(db, miniTournament, FUTURE_KICKOFF, EMPTY_KICKOFFS);
    const tournamentId = asTournamentId(miniTournament.id);
    const owner = await createUser(db, { email: 'o3@x.com', displayName: 'Owner3' });
    const pool = await createPool(db, { tournamentId, ownerId: owner.id, name: 'Re-archive Pool' });

    await upsertPoolArchive(db, {
      poolId: pool.id,
      poolName: pool.name,
      tournamentId,
      tournamentName: miniTournament.name,
      archivedBy: owner.id,
      entries: [
        {
          userId: owner.id,
          displayName: 'Owner3',
          rank: 1,
          pointsTotal: points(10),
          breakdown: fakeBreakdown(10),
        },
      ],
    });

    await upsertPoolArchive(db, {
      poolId: pool.id,
      poolName: pool.name,
      tournamentId,
      tournamentName: miniTournament.name,
      archivedBy: owner.id,
      entries: [
        {
          userId: owner.id,
          displayName: 'Owner3',
          rank: 1,
          pointsTotal: points(99),
          breakdown: fakeBreakdown(99),
        },
      ],
    });

    const fetched = await getPoolArchiveWithEntries(db, pool.id);
    expect(fetched?.entries).toHaveLength(1);
    expect(fetched?.entries[0]?.pointsTotal).toBe(99);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm --filter @cup/db exec vitest run src/repositories/pool-archive.test.ts`
Expected: FAIL — `Cannot find module './pool-archive'` (file doesn't exist yet).

- [ ] **Step 3: Add the schema**

Create `packages/db/src/schema/pool-archive.ts`:

```ts
import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { pools } from './pools';
import { users } from './auth';
import type { ScoreBreakdown } from '@cup/engine';

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
});
```

Modify `packages/db/src/schema/index.ts` — add one line:

```ts
export * from './pool-archive';
```

- [ ] **Step 4: Write the repository implementation**

Create `packages/db/src/repositories/pool-archive.ts`:

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

type Database = Db<typeof schema>;

export type PoolArchiveRow = {
  id: string;
  poolId: PoolId;
  poolName: string;
  tournamentId: TournamentId;
  tournamentName: string;
  archivedAt: Date;
  archivedBy: UserId | null;
};

export type PoolArchiveEntryRow = {
  id: string;
  archiveId: string;
  userId: UserId | null;
  displayName: string;
  rank: number;
  pointsTotal: Points;
  breakdown: ScoreBreakdown;
};

export type PoolArchiveEntryInput = {
  userId: UserId;
  displayName: string;
  rank: number;
  pointsTotal: Points;
  breakdown: ScoreBreakdown;
};

function toPoolArchiveRow(raw: typeof schema.poolArchives.$inferSelect): PoolArchiveRow {
  return {
    ...raw,
    poolId: asPoolId(raw.poolId),
    tournamentId: asTournamentId(raw.tournamentId),
    archivedBy: raw.archivedBy ? asUserId(raw.archivedBy) : null,
  };
}

function toPoolArchiveEntryRow(
  raw: typeof schema.poolArchiveEntries.$inferSelect,
): PoolArchiveEntryRow {
  return {
    ...raw,
    userId: raw.userId ? asUserId(raw.userId) : null,
    pointsTotal: points(raw.pointsTotal),
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
    })
    .onConflictDoUpdate({
      target: schema.poolArchives.poolId,
      set: {
        poolName: input.poolName,
        tournamentId: input.tournamentId,
        tournamentName: input.tournamentName,
        archivedBy: input.archivedBy,
        archivedAt: sql`now()`,
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

Modify `packages/db/src/repositories/index.ts` — add one line:

```ts
export * from './pool-archive';
```

- [ ] **Step 5: Generate the migration**

Run: `pnpm --filter @cup/db db:generate`
Expected: a new `packages/db/migrations/000N_<random-name>.sql` appears containing `CREATE TABLE
"pool_archives"` and `CREATE TABLE "pool_archive_entries"` with the FKs/unique index above. Rename the
file to `packages/db/migrations/0009_pool_archives.sql` for a predictable name (adjust the number if
another migration landed first — check `ls packages/db/migrations/*.sql` for the current max) and
correct the corresponding entry in `packages/db/migrations/meta/_journal.json` (drizzle-kit writes the
journal entry with the auto-generated name — update its `tag` field to match the renamed file).

- [ ] **Step 6: Run the test to confirm it passes**

Run: `pnpm --filter @cup/db exec vitest run src/repositories/pool-archive.test.ts`
Expected: PASS (3 tests).

---

### Task 2: Anonymize archive entries on account deletion

**Files:**

- Modify: `packages/db/src/repositories/users.ts` (the `deleteUser` function)
- Modify: `packages/db/src/repositories/users.test.ts`

**Interfaces:**

- Consumes: `upsertPoolArchive`, `getPoolArchiveWithEntries` from Task 1 (`./pool-archive`); `createPool`
  from `./pools`; `upsertTournamentDef` from `./tournament`; `miniTournament` from `@cup/engine/testing`.
- Produces: `deleteUser`'s signature is unchanged (`(db: Database, id: UserId) => Promise<void>`) — only
  its behavior changes, so no other task depends on a new interface here.

- [ ] **Step 1: Write the failing test**

In `packages/db/src/repositories/users.test.ts`, add these imports at the top (alongside the existing
ones):

```ts
import { createPool } from './pools';
import { upsertTournamentDef } from './tournament';
import { upsertPoolArchive, getPoolArchiveWithEntries } from './pool-archive';
import { miniTournament } from '@cup/engine/testing';
import { tournamentId as asTournamentId, points } from '@cup/engine';
import type { ScoreBreakdown } from '@cup/engine';
```

Add this test inside the existing `describe('deleteUser', ...)` block. **Important — use a non-owner
member as the deleted user, not the pool owner.** `pools.ownerId` references `users.id` with
`onDelete: 'cascade'` (pre-existing, unrelated to this feature) and `pool_archives.poolId` references
`pools.id` with `onDelete: 'cascade'` (Task 1). Chained together, deleting the pool's _owner_ cascades
away the pool, and with it the entire archive — there is nothing left to anonymize. This is an accepted
limitation (confirmed with the user during implementation): if an archived pool's owner deletes their
account, the whole pool and its archive disappear, same as any other pool deletion. Anonymization only
has something to act on when the deleted user is a non-owner member of the archived pool:

```ts
it("anonymizes a non-owner member's pool archive entry but keeps rank/points/breakdown", async () => {
  const FUTURE_KICKOFF = new Date('2099-06-11T18:00:00Z');
  await upsertTournamentDef(db, miniTournament, FUTURE_KICKOFF, new Map());
  const tournamentId = asTournamentId(miniTournament.id);

  const owner = await createUser(db, { email: 'owner@x.com', displayName: 'Owner' });
  const pool = await createPool(db, { tournamentId, ownerId: owner.id, name: 'Archived Pool' });
  const member = await createUser(db, { email: 'member@x.com', displayName: 'Member' });

  const breakdown: ScoreBreakdown = {
    groupMatches: points(42),
    groupOrder: points(0),
    bronze: points(0),
    final: points(0),
    roundOf16: points(0),
    roundOf8: points(0),
    topFour: points(0),
    topFourTeams: points(0),
    topFourPosition: points(0),
    specials: points(0),
    total: points(42),
  };

  await upsertPoolArchive(db, {
    poolId: pool.id,
    poolName: pool.name,
    tournamentId,
    tournamentName: miniTournament.name,
    archivedBy: owner.id,
    entries: [
      { userId: owner.id, displayName: 'Owner', rank: 1, pointsTotal: points(50), breakdown },
      { userId: member.id, displayName: 'Member', rank: 2, pointsTotal: points(42), breakdown },
    ],
  });

  await deleteUser(db, member.id);

  const fetched = await getPoolArchiveWithEntries(db, pool.id);
  expect(fetched?.entries).toHaveLength(2);
  const memberEntry = fetched?.entries.find((e) => e.rank === 2);
  expect(memberEntry?.displayName).toBe('Deleted user');
  expect(memberEntry?.userId).toBeNull();
  expect(memberEntry?.pointsTotal).toBe(42);
  expect(memberEntry?.breakdown.total).toBe(42);
  const ownerEntry = fetched?.entries.find((e) => e.rank === 1);
  expect(ownerEntry?.displayName).toBe('Owner'); // untouched
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm --filter @cup/db exec vitest run src/repositories/users.test.ts`
Expected: FAIL — `displayName` is still `'Archive Owner'`, not `'Deleted user'` (current `deleteUser`
does nothing to `pool_archive_entries`).

- [ ] **Step 3: Implement the anonymization**

In `packages/db/src/repositories/users.ts`, replace:

```ts
export async function deleteUser(db: Database, id: UserId): Promise<void> {
  await db.delete(schema.users).where(eq(schema.users.id, id));
}
```

with:

```ts
export async function deleteUser(db: Database, id: UserId): Promise<void> {
  await db
    .update(schema.poolArchiveEntries)
    .set({ displayName: 'Deleted user' })
    .where(eq(schema.poolArchiveEntries.userId, id));
  await db.delete(schema.users).where(eq(schema.users.id, id));
}
```

(No new import needed — `schema` is already imported as `* as schema from '../schema/index'` in this
file, and `pool-archive.ts`'s tables are re-exported through that same `schema/index.ts` from Task 1.)

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter @cup/db exec vitest run src/repositories/users.test.ts`
Expected: PASS (all `users.test.ts` tests, including the new one).

---

### Task 3: `archivePool` application function

**Files:**

- Create: `apps/web/src/features/pool-archive/domain/types.ts`
- Create: `apps/web/src/features/pool-archive/application/archive-pool.ts`
- Create: `apps/web/src/features/pool-archive/application/archive-pool.test.ts`

**Interfaces:**

- Consumes: `getLeaderboard` (from `@cup/db`, already exists — returns
  `{ userId: UserId; displayName: string; pointsTotal: Points; breakdown: ScoreBreakdown | null;
completionPercent: number | null }[]`, sorted `pointsTotal DESC NULLS LAST, displayName ASC`, see
  `packages/db/src/repositories/scores.ts`); `upsertPoolArchive` from Task 1.
- Produces (used by Task 5's server action):
  - `export async function archivePool(db: Db<AppSchema>, input: { poolId: PoolId; poolName: string; tournamentId: TournamentId; tournamentName: string; archivedBy: UserId }): Promise<void>`

- [ ] **Step 1: Write the domain types**

Create `apps/web/src/features/pool-archive/domain/types.ts`:

```ts
import type { PoolId, TournamentId, UserId, Points, ScoreBreakdown } from '@cup/engine';

export type PoolArchiveEntryView = {
  userId: UserId | null;
  displayName: string;
  rank: number;
  pointsTotal: Points;
  breakdown: ScoreBreakdown;
};

export type PoolArchiveView = {
  poolId: PoolId;
  poolName: string;
  tournamentId: TournamentId;
  tournamentName: string;
  archivedAt: Date;
  entries: PoolArchiveEntryView[];
};
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/features/pool-archive/application/archive-pool.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import {
  createUser,
  createPool as dbCreatePool,
  upsertTournamentDef,
  getPoolArchiveWithEntries,
  addMember,
  upsertScore,
} from '@cup/db';
import { miniTournament } from '@cup/engine/testing';
import { tournamentId as asTournamentId, points } from '@cup/engine';
import type { PoolId, TournamentId, UserId, ScoreBreakdown } from '@cup/engine';
import { archivePool } from './archive-pool';

type Db = Awaited<ReturnType<typeof makeTestDb>>;

const FUTURE_KICKOFF = new Date('2099-06-11T18:00:00Z');

function fakeBreakdown(total: number): ScoreBreakdown {
  return {
    groupMatches: points(total),
    groupOrder: points(0),
    bronze: points(0),
    final: points(0),
    roundOf16: points(0),
    roundOf8: points(0),
    topFour: points(0),
    topFourTeams: points(0),
    topFourPosition: points(0),
    specials: points(0),
    total: points(total),
  };
}

describe('archivePool', () => {
  let db: Db;
  let tournamentId: TournamentId;
  let ownerId: UserId;
  let poolId: PoolId;

  beforeEach(async () => {
    db = await makeTestDb();
    await upsertTournamentDef(db, miniTournament, FUTURE_KICKOFF, new Map());
    tournamentId = asTournamentId(miniTournament.id);
    const owner = await createUser(db, { email: 'owner@x.com', displayName: 'Owner' });
    ownerId = owner.id;
    const pool = await dbCreatePool(db, { tournamentId, ownerId, name: 'Test Pool' });
    poolId = pool.id;
  });

  it('archives a pool with no members yet as zero entries', async () => {
    // Nobody has joined via addMember, so getLeaderboard has nothing to report.
    await archivePool(db, {
      poolId,
      poolName: 'Test Pool',
      tournamentId,
      tournamentName: miniTournament.name,
      archivedBy: ownerId,
    });

    const fetched = await getPoolArchiveWithEntries(db, poolId);
    expect(fetched).toBeDefined();
    expect(fetched?.archive.poolName).toBe('Test Pool');
    expect(fetched?.entries).toHaveLength(0);
  });

  it('ranks members by points descending, defaulting a missing score row to 0 and a zeroed breakdown', async () => {
    await addMember(db, poolId, ownerId);
    const member = await createUser(db, { email: 'member@x.com', displayName: 'Alice' });
    await addMember(db, poolId, member.id);

    // Only Alice has a `scores` row; the owner never got one (e.g. never made a prediction).
    await upsertScore(db, {
      poolId,
      userId: member.id,
      pointsTotal: points(90),
      breakdown: fakeBreakdown(10),
    });

    await archivePool(db, {
      poolId,
      poolName: 'Test Pool',
      tournamentId,
      tournamentName: miniTournament.name,
      archivedBy: ownerId,
    });

    const fetched = await getPoolArchiveWithEntries(db, poolId);
    expect(fetched?.entries).toHaveLength(2);
    expect(fetched?.entries[0]?.displayName).toBe('Alice'); // 90 pts, ranked first
    expect(fetched?.entries[0]?.rank).toBe(1);
    expect(fetched?.entries[0]?.pointsTotal).toBe(90);
    expect(fetched?.entries[0]?.breakdown.total).toBe(10);
    expect(fetched?.entries[1]?.displayName).toBe('Owner'); // no score row -> 0 pts
    expect(fetched?.entries[1]?.rank).toBe(2);
    expect(fetched?.entries[1]?.pointsTotal).toBe(0);
    expect(fetched?.entries[1]?.breakdown.total).toBe(0);
  });

  it('re-archiving replaces the previous snapshot', async () => {
    await addMember(db, poolId, ownerId);

    await archivePool(db, {
      poolId,
      poolName: 'Test Pool',
      tournamentId,
      tournamentName: miniTournament.name,
      archivedBy: ownerId,
    });
    let fetched = await getPoolArchiveWithEntries(db, poolId);
    expect(fetched?.entries[0]?.pointsTotal).toBe(0);

    await upsertScore(db, {
      poolId,
      userId: ownerId,
      pointsTotal: points(5),
      breakdown: fakeBreakdown(5),
    });

    await archivePool(db, {
      poolId,
      poolName: 'Test Pool',
      tournamentId,
      tournamentName: miniTournament.name,
      archivedBy: ownerId,
    });
    fetched = await getPoolArchiveWithEntries(db, poolId);
    expect(fetched?.entries).toHaveLength(1);
    expect(fetched?.entries[0]?.pointsTotal).toBe(5);
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `pnpm --filter web exec vitest run src/features/pool-archive/application/archive-pool.test.ts`
Expected: FAIL — `Cannot find module './archive-pool'`.

- [ ] **Step 4: Implement `archivePool`**

Create `apps/web/src/features/pool-archive/application/archive-pool.ts`:

```ts
import type { Db } from '@cup/db';
import { getLeaderboard, upsertPoolArchive } from '@cup/db';
import { points } from '@cup/engine';
import type { PoolId, TournamentId, UserId, ScoreBreakdown } from '@cup/engine';
import type { AppSchema } from '@/shared/db';

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

export async function archivePool(
  db: Db<AppSchema>,
  input: {
    poolId: PoolId;
    poolName: string;
    tournamentId: TournamentId;
    tournamentName: string;
    archivedBy: UserId;
  },
): Promise<void> {
  const leaderboard = await getLeaderboard(db, input.poolId);

  const entries = leaderboard.map((entry, index) => ({
    userId: entry.userId,
    displayName: entry.displayName,
    rank: index + 1,
    pointsTotal: entry.pointsTotal,
    breakdown: entry.breakdown ?? emptyBreakdown(),
  }));

  await upsertPoolArchive(db, {
    poolId: input.poolId,
    poolName: input.poolName,
    tournamentId: input.tournamentId,
    tournamentName: input.tournamentName,
    archivedBy: input.archivedBy,
    entries,
  });
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `pnpm --filter web exec vitest run src/features/pool-archive/application/archive-pool.test.ts`
Expected: PASS (3 tests).

---

### Task 4: `getPoolArchiveView` application function

**Files:**

- Create: `apps/web/src/features/pool-archive/application/get-pool-archive.ts`
- Create: `apps/web/src/features/pool-archive/application/get-pool-archive.test.ts`

**Interfaces:**

- Consumes: `getPoolArchiveWithEntries` from `@cup/db` (Task 1); `PoolArchiveView` from
  `../domain/types` (Task 3).
- Produces (used by Task 6's server action and Task 8's page):
  - `export async function getPoolArchiveView(db: Db<AppSchema>, poolId: PoolId): Promise<PoolArchiveView | undefined>`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/pool-archive/application/get-pool-archive.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import {
  createUser,
  createPool as dbCreatePool,
  upsertTournamentDef,
  addMember,
  getPoolById,
} from '@cup/db';
import { miniTournament } from '@cup/engine/testing';
import { tournamentId as asTournamentId } from '@cup/engine';
import type { PoolId } from '@cup/engine';
import { archivePool } from './archive-pool';
import { getPoolArchiveView } from './get-pool-archive';

type Db = Awaited<ReturnType<typeof makeTestDb>>;

const FUTURE_KICKOFF = new Date('2099-06-11T18:00:00Z');

describe('getPoolArchiveView', () => {
  let db: Db;
  let poolId: PoolId;

  beforeEach(async () => {
    db = await makeTestDb();
    await upsertTournamentDef(db, miniTournament, FUTURE_KICKOFF, new Map());
    const tournamentId = asTournamentId(miniTournament.id);
    const owner = await createUser(db, { email: 'owner@x.com', displayName: 'Owner' });
    const pool = await dbCreatePool(db, { tournamentId, ownerId: owner.id, name: 'Test Pool' });
    poolId = pool.id;
    await addMember(db, poolId, owner.id);
  });

  it('returns undefined for a pool that was never archived', async () => {
    const view = await getPoolArchiveView(db, poolId);
    expect(view).toBeUndefined();
  });

  it('returns the archive view with entries sorted by rank', async () => {
    const tournamentId = asTournamentId(miniTournament.id);
    const pool = await getPoolById(db, poolId);

    await archivePool(db, {
      poolId,
      poolName: 'Test Pool',
      tournamentId,
      tournamentName: miniTournament.name,
      archivedBy: pool!.ownerId,
    });

    const view = await getPoolArchiveView(db, poolId);
    expect(view).toBeDefined();
    expect(view?.poolName).toBe('Test Pool');
    expect(view?.tournamentName).toBe(miniTournament.name);
    expect(view?.entries).toHaveLength(1);
    expect(view?.entries[0]?.rank).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm --filter web exec vitest run src/features/pool-archive/application/get-pool-archive.test.ts`
Expected: FAIL — `Cannot find module './get-pool-archive'`.

- [ ] **Step 3: Implement `getPoolArchiveView`**

Create `apps/web/src/features/pool-archive/application/get-pool-archive.ts`:

```ts
import type { Db } from '@cup/db';
import { getPoolArchiveWithEntries } from '@cup/db';
import type { PoolId } from '@cup/engine';
import type { AppSchema } from '@/shared/db';
import type { PoolArchiveView } from '../domain/types';

export async function getPoolArchiveView(
  db: Db<AppSchema>,
  poolId: PoolId,
): Promise<PoolArchiveView | undefined> {
  const result = await getPoolArchiveWithEntries(db, poolId);
  if (!result) return undefined;

  const { archive, entries } = result;
  return {
    poolId: archive.poolId,
    poolName: archive.poolName,
    tournamentId: archive.tournamentId,
    tournamentName: archive.tournamentName,
    archivedAt: archive.archivedAt,
    entries: entries.map((e) => ({
      userId: e.userId,
      displayName: e.displayName,
      rank: e.rank,
      pointsTotal: e.pointsTotal,
      breakdown: e.breakdown,
    })),
  };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter web exec vitest run src/features/pool-archive/application/get-pool-archive.test.ts`
Expected: PASS (2 tests).

---

### Task 5: `archivePoolAction` server action

**Files:**

- Create: `apps/web/src/features/pool-archive/api/actions.ts`
- Create: `apps/web/src/features/pool-archive/api/actions.test.ts`

**Interfaces:**

- Consumes: `archivePool` (Task 3); `getPoolById`, `getTournamentById` from `@cup/db`; `getActorOrThrow`
  from `@/features/auth`; `assertIsOwner` from `@/shared/authz`; `poolId` constructor from `@cup/engine`.
- Produces (used by Task 7's UI):
  - `export async function archivePoolAction(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }>`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/pool-archive/api/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import { createUser, createPool as dbCreatePool, upsertTournamentDef } from '@cup/db';
import { miniTournament } from '@cup/engine/testing';
import { tournamentId as asTournamentId } from '@cup/engine';
import type { UserId, PoolId } from '@cup/engine';

let testDb: Awaited<ReturnType<typeof makeTestDb>>;

vi.mock('@/shared/db', () => ({
  get db() {
    return testDb;
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/features/auth', () => ({ getCurrentActor: vi.fn(), getActorOrThrow: vi.fn() }));

import { archivePoolAction } from './actions';
import { getActorOrThrow } from '@/features/auth';

const mockedGetActor = vi.mocked(getActorOrThrow);

const FUTURE_KICKOFF = new Date('2099-06-11T18:00:00Z');

describe('archivePoolAction', () => {
  let ownerId: UserId;
  let memberId: UserId;
  let poolId: PoolId;

  beforeAll(async () => {
    testDb = await makeTestDb();
    await upsertTournamentDef(testDb, miniTournament, FUTURE_KICKOFF, new Map());
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    const owner = await createUser(testDb, {
      email: `owner-${crypto.randomUUID()}@x.com`,
      displayName: 'Owner',
    });
    const member = await createUser(testDb, {
      email: `member-${crypto.randomUUID()}@x.com`,
      displayName: 'Member',
    });
    ownerId = owner.id;
    memberId = member.id;

    const pool = await dbCreatePool(testDb, {
      tournamentId: asTournamentId(miniTournament.id),
      ownerId,
      name: 'Test Pool',
    });
    poolId = pool.id;
  });

  it('archives the pool when called by the owner', async () => {
    mockedGetActor.mockResolvedValue({ userId: ownerId });

    const result = await archivePoolAction({ poolId });
    expect(result.ok).toBe(true);
  });

  it('rejects a non-owner member', async () => {
    mockedGetActor.mockResolvedValue({ userId: memberId });

    const result = await archivePoolAction({ poolId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/owner/i);
  });

  it('rejects invalid input', async () => {
    mockedGetActor.mockResolvedValue({ userId: ownerId });

    const result = await archivePoolAction({});
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm --filter web exec vitest run src/features/pool-archive/api/actions.test.ts`
Expected: FAIL — `Cannot find module './actions'`.

- [ ] **Step 3: Implement the server action**

Create `apps/web/src/features/pool-archive/api/actions.ts`:

```ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { db } from '@/shared/db';
import { getActorOrThrow } from '@/features/auth';
import { assertIsOwner } from '@/shared/authz';
import { getPoolById, getTournamentById } from '@cup/db';
import { poolId as asPoolId } from '@cup/engine';
import { archivePool } from '../application/archive-pool';

const ArchivePoolSchema = z.object({ poolId: z.string() });

export async function archivePoolAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ArchivePoolSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const poolId = asPoolId(parsed.data.poolId);

  try {
    const actor = await getActorOrThrow();
    const pool = await getPoolById(db, poolId);
    if (!pool) throw new Error(`Pool ${poolId} not found`);
    assertIsOwner(pool, actor.userId);

    const tournament = await getTournamentById(db, pool.tournamentId);
    if (!tournament) throw new Error(`Tournament ${pool.tournamentId} not found`);

    await archivePool(db, {
      poolId,
      poolName: pool.name,
      tournamentId: pool.tournamentId,
      tournamentName: tournament.name,
      archivedBy: actor.userId,
    });

    revalidatePath(`/pools/${poolId}`);
    revalidatePath(`/pools/${poolId}/archive`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm --filter web exec vitest run src/features/pool-archive/api/actions.test.ts`
Expected: PASS (3 tests).

---

### Task 6: Export `ScoreBreakdownCard` from the `results` barrel

**Files:**

- Modify: `apps/web/src/features/results/index.ts`

**Interfaces:**

- Produces: `ScoreBreakdownCard` becomes importable as `import { ScoreBreakdownCard } from
'@/features/results'` (used by Task 7's `ArchiveMemberRow`).

- [ ] **Step 1: Add the export**

In `apps/web/src/features/results/index.ts`, add this line alongside the other `ui/` exports (near
`export { HitChip } from './ui/HitChip';`):

```ts
export { ScoreBreakdownCard } from './ui/ScoreBreakdownCard';
```

Also add `ScoreBreakdown` and `Scoring` to the existing `export type { ... } from './domain/types'`
block if they aren't already there (check first — `ScoreBreakdown`/`Scoring` are re-exported from
`@cup/engine` inside `domain/types.ts`, confirm with `grep -n "ScoreBreakdown\|Scoring" apps/web/src/features/results/domain/types.ts`). If missing, add:

```ts
export type { ScoreBreakdown, Scoring } from './domain/types';
```

- [ ] **Step 2: Verify the app still typechecks**

Run: `pnpm --filter web typecheck`
Expected: PASS (no errors — this is a pure export addition, nothing consumes it yet).

---

### Task 7: Pool-archive UI components and barrel

**Files:**

- Create: `apps/web/src/features/pool-archive/ui/ArchivePoolCard.tsx`
- Create: `apps/web/src/features/pool-archive/ui/ArchiveMemberRow.tsx`
- Create: `apps/web/src/features/pool-archive/index.ts`

**Interfaces:**

- Consumes: `ScoreBreakdownCard` from `@/features/results` (Task 6); `TurfCard` from `@/shared/ui`;
  `archivePoolAction` from `../api/actions` (Task 5); `PoolArchiveEntryView` from `../domain/types`
  (Task 3); `Scoring` from `@cup/engine`.
- Produces (used by Task 8's page and by the pool detail page):
  - `export function ArchivePoolCard(props: { poolId: string; isOwner: boolean; archivedAt: Date | null }): ReactElement | null`
  - `export function ArchiveMemberRow(props: { entry: PoolArchiveEntryView; scoring: Scoring | null }): ReactElement`
  - Feature barrel `apps/web/src/features/pool-archive/index.ts` re-exporting all of the above plus
    everything from Tasks 3–5.

No unit tests for these two presentational components — this repo doesn't unit-test feature-internal
UI components (only `shared/ui` gets Storybook stories per CLAUDE.md; `PoolBackupControls.tsx` next door
has no test file either). They're exercised through the page in Task 8 and, if desired later, an E2E
spec (out of scope per the design doc's non-goals).

- [ ] **Step 1: Create `ArchivePoolCard`**

Create `apps/web/src/features/pool-archive/ui/ArchivePoolCard.tsx`:

```tsx
'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { archivePoolAction } from '../api/actions';
import { TurfCard } from '@/shared/ui';

type Props = { poolId: string; isOwner: boolean; archivedAt: Date | null };

export function ArchivePoolCard({ poolId, isOwner, archivedAt }: Props): ReactElement | null {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!isOwner && !archivedAt) return null;

  function handleArchive() {
    setError(null);
    startTransition(async () => {
      const result = await archivePoolAction({ poolId });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <TurfCard title="Archive">
      <div className="px-4 py-4 space-y-3">
        <p className="text-xs text-ink-muted">
          {archivedAt
            ? `Archived on ${archivedAt.toLocaleDateString()}. This snapshot survives future name changes or account deletions.`
            : 'Freeze a permanent snapshot of the final standings once the cup is finished.'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {isOwner && (
            <button
              type="button"
              onClick={handleArchive}
              disabled={isPending}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-line bg-white text-ink-soft hover:text-ink hover:border-ink-muted transition-colors disabled:opacity-50"
            >
              {isPending ? 'Archiving…' : archivedAt ? 'Re-archive' : 'Archive this pool'}
            </button>
          )}
          {archivedAt && (
            <Link
              href={`/pools/${poolId}/archive`}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-line bg-white text-ink-soft hover:text-ink hover:border-ink-muted transition-colors no-underline"
            >
              View archive
            </Link>
          )}
        </div>
        {error && (
          <p role="status" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </TurfCard>
  );
}
```

- [ ] **Step 2: Create `ArchiveMemberRow`**

Create `apps/web/src/features/pool-archive/ui/ArchiveMemberRow.tsx`:

```tsx
import type { ReactElement } from 'react';
import type { Scoring } from '@cup/engine';
import { ScoreBreakdownCard } from '@/features/results';
import type { PoolArchiveEntryView } from '../domain/types';

type Props = { entry: PoolArchiveEntryView; scoring: Scoring | null };

export function ArchiveMemberRow({ entry, scoring }: Props): ReactElement {
  return (
    <div className="card p-4" data-testid="archive-member-row">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="display text-[20px] text-ink-muted">#{entry.rank}</span>
          <span className="font-bold text-ink">{entry.displayName}</span>
        </div>
        <span className="display text-[20px] text-ink">{entry.pointsTotal} pts</span>
      </div>
      <ScoreBreakdownCard breakdown={entry.breakdown} scoring={scoring} />
    </div>
  );
}
```

- [ ] **Step 3: Create the feature barrel**

Create `apps/web/src/features/pool-archive/index.ts`:

```ts
export type { PoolArchiveView, PoolArchiveEntryView } from './domain/types';
export { archivePool } from './application/archive-pool';
export { getPoolArchiveView } from './application/get-pool-archive';
export { archivePoolAction } from './api/actions';
export { ArchivePoolCard } from './ui/ArchivePoolCard';
export { ArchiveMemberRow } from './ui/ArchiveMemberRow';
```

- [ ] **Step 4: Verify everything still typechecks and existing tests pass**

Run: `pnpm --filter web typecheck && pnpm --filter web exec vitest run src/features/pool-archive`
Expected: PASS.

---

### Task 8: Archive page + wire into the pool detail page

**Files:**

- Create: `apps/web/src/app/(authenticated)/pools/[id]/archive/page.tsx`
- Modify: `apps/web/src/app/(authenticated)/pools/[id]/page.tsx`

**Interfaces:**

- Consumes: `getPoolArchiveView`, `ArchivePoolCard`, `ArchiveMemberRow` from `@/features/pool-archive`
  (Task 7); `getPoolById`, `getTournamentById`, `isMember` from `@cup/db`; `getCurrentActor` from
  `@/features/auth`; `BackLink` from `@/shared/ui`.
- Produces: the route `/pools/[id]/archive`; no other task depends on this.

- [ ] **Step 1: Create the archive page**

Create `apps/web/src/app/(authenticated)/pools/[id]/archive/page.tsx`:

```tsx
import type { ReactElement } from 'react';
import { redirect, notFound } from 'next/navigation';
import { isMember, getPoolById, getTournamentById } from '@cup/db';
import { getCurrentActor } from '@/features/auth';
import { db } from '@/shared/db';
import { getPoolArchiveView, ArchivePoolCard, ArchiveMemberRow } from '@/features/pool-archive';
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

  const [archive, tournament] = await Promise.all([
    getPoolArchiveView(db, poolId),
    getTournamentById(db, pool.tournamentId),
  ]);

  const isOwner = actor.userId === pool.ownerId;
  const scoring = tournament?.scoringConfig ?? null;

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
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the archive card into the pool detail page**

In `apps/web/src/app/(authenticated)/pools/[id]/page.tsx`:

Add to the existing import block:

```ts
import { ArchivePoolCard, getPoolArchiveView } from '@/features/pool-archive';
```

In the component body, alongside the existing `hasEdits` fetch, add:

```ts
const archive = await getPoolArchiveView(db, poolId);
```

(Place this line right after `const isOwner = ...` — it doesn't depend on anything computed after it,
and Next.js will run it as part of the same request; parallelizing it with `hasEditsForPool` via
`Promise.all` is a nice-to-have, not required for correctness. If you do parallelize, replace the
existing `const hasEdits = isOwner ? await hasEditsForPool(db, poolId) : false;` line with a
`Promise.all` alongside `getPoolArchiveView(db, poolId)`.)

In the "Owner controls + backup" section at the bottom, add `ArchivePoolCard` right after
`<PoolBackupControls poolId={poolId} isOwner={isOwner} />`:

```tsx
<PoolBackupControls poolId={poolId} isOwner={isOwner} />
<ArchivePoolCard poolId={poolId} isOwner={isOwner} archivedAt={archive?.archivedAt ?? null} />
```

- [ ] **Step 3: Manually verify in the dev server**

Run: `pnpm --filter web dev` (or use the project's `run` skill if available), then:

1. Sign in as a pool owner, visit `/pools/[id]`, confirm the "Archive" card appears with an "Archive
   this pool" button.
2. Click it, confirm the button flips to "Re-archive" and a "View archive" link appears.
3. Visit `/pools/[id]/archive`, confirm the standings render with rank/name/points and each member's
   `ScoreBreakdownCard` expands correctly.
4. Sign in as a non-owner member of an unarchived pool, confirm no "Archive" card/link appears on
   `/pools/[id]`.
5. Sign in as a non-owner member of an archived pool, confirm the "View archive" link (but not the
   "Archive"/"Re-archive" button) appears, and the archive page itself has no archive button for them.

Stop the dev server when done.

---

### Task 9: Docs, full verification, and the single feature commit

**Files:**

- Create: `docs/features/pool-archive.md`
- Modify: `docs/PROGRESS.md`
- Everything created/modified in Tasks 1–8
- The already-written `docs/superpowers/specs/2026-07-18-pool-result-archive-design.md`

**Interfaces:** none — this task only adds docs and commits.

- [ ] **Step 1: Write the feature design doc**

Create `docs/features/pool-archive.md` summarizing (in this repo's existing `docs/features/*.md`
style — see `docs/features/pool-backup.md` for the template): purpose, trigger (manual, owner-only,
re-archivable), data model (`pool_archives` / `pool_archive_entries`), the anonymization behavior on
`deleteUser`, authorization rules, and file locations (mirror the "File layout" table style from
`pool-backup.md`), referencing the two new DB tables, the `apps/web/src/features/pool-archive/`
slice, and the `/pools/[id]/archive` route.

- [ ] **Step 2: Update `docs/PROGRESS.md`**

Add a new `## Pool result archive (2026-07-18)` section (following the existing dated-section
convention used throughout that file, e.g. "## Top Four position bonus (2026-07-15)") summarizing:
the two new tables, the `deleteUser` anonymization change, the new `features/pool-archive/` slice, the
new `/pools/[id]/archive` route, and the pool detail page wiring. Link to
`docs/features/pool-archive.md`.

- [ ] **Step 3: Run the full verification suite**

Run, in order, and confirm each passes before moving to the next:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter web build
```

If `pnpm format` changes any files, review the diff briefly (should just be whitespace/quote
normalization) before continuing.

- [ ] **Step 4: Stage everything and create the single commit**

```bash
git add packages/db/src/schema/pool-archive.ts \
  packages/db/src/schema/index.ts \
  packages/db/migrations/ \
  packages/db/src/repositories/pool-archive.ts \
  packages/db/src/repositories/pool-archive.test.ts \
  packages/db/src/repositories/index.ts \
  packages/db/src/repositories/users.ts \
  packages/db/src/repositories/users.test.ts \
  apps/web/src/features/pool-archive/ \
  apps/web/src/features/results/index.ts \
  "apps/web/src/app/(authenticated)/pools/[id]/archive/page.tsx" \
  "apps/web/src/app/(authenticated)/pools/[id]/page.tsx" \
  docs/features/pool-archive.md \
  docs/PROGRESS.md \
  docs/superpowers/specs/2026-07-18-pool-result-archive-design.md \
  docs/superpowers/plans/2026-07-18-pool-result-archive.md

git status
```

Review the `git status` output — confirm nothing unexpected is staged and nothing from this feature is
missing — then commit:

```bash
git commit -m "$(cat <<'EOF'
feat: pool result archive

Lets a pool owner freeze a permanent snapshot of the final standings and
per-member score breakdown, decoupled from live user/pool data so it survives
later display-name changes. Account deletion still anonymizes the archived
name (scrubbing PII) while keeping rank/points/breakdown intact.
EOF
)"

git status
```

- [ ] **Step 5: Report completion**

Confirm to the user: migration filename, the new route, and that `pnpm test`/`pnpm typecheck`/`pnpm
lint`/`pnpm --filter web build` all passed. Do not push — pushing is a separate, explicit step per this
repo's working agreement.
