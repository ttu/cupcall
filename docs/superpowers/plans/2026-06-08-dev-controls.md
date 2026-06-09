# Dev Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Clear all" button (always visible) and a "Fill random scores" button (dev-only) to the predict page so developers can reset or populate their prediction card quickly.

**Architecture:** A `DevControls` client component sits above the step tabs in `PredictStepper`, receiving an `isDev` flag from the predict page. Two server actions handle the mutations — `clearAllPredictions` (in `actions.ts`) and `devFillRandomGroupScores` (in a new `dev-actions.ts`). The DB layer gets a new `clearPredictionInputs` function that deletes all four sub-tables in parallel. The private `rescoreAfterEdit` helper in `actions.ts` is extracted to `rescore-helper.ts` so both action files can share it.

**Tech Stack:** Next.js 15 server actions, Drizzle ORM, PGlite (tests), Vitest, Zod, Tailwind CSS

---

## File Map

| Status | File                                                        | What changes                                                             |
| ------ | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| Modify | `vitest.config.ts`                                          | Add `@/` alias so action tests can mock `@/shared/db`, `@/features/auth` |
| Modify | `packages/db/src/repositories/predictions.ts`               | Add `clearPredictionInputs`                                              |
| Modify | `packages/db/src/repositories/predictions.test.ts`          | Tests for `clearPredictionInputs`                                        |
| Create | `apps/web/src/features/predictions/api/rescore-helper.ts`   | Extract `rescoreAfterEdit` from `actions.ts`                             |
| Modify | `apps/web/src/features/predictions/api/actions.ts`          | Import `rescoreAfterEdit` from helper; add `clearAllPredictions`         |
| Create | `apps/web/src/features/predictions/api/actions.test.ts`     | Integration test for `clearAllPredictions`                               |
| Create | `apps/web/src/features/predictions/api/dev-actions.ts`      | `devFillRandomGroupScores` server action                                 |
| Create | `apps/web/src/features/predictions/api/dev-actions.test.ts` | Tests for `devFillRandomGroupScores`                                     |
| Create | `apps/web/src/features/predictions/ui/DevControls.tsx`      | Client component with both buttons                                       |
| Modify | `apps/web/src/features/predictions/ui/PredictStepper.tsx`   | Add `isDev` prop, render `DevControls`                                   |
| Modify | `apps/web/src/app/pools/[id]/predict/page.tsx`              | Pass `isDev={process.env.NODE_ENV === 'development'}`                    |
| Create | `docs/superpowers/specs/2026-06-08-dev-controls-design.md`  | Committed alongside implementation                                       |

---

## Task 1: Add `@/` vitest alias + `clearPredictionInputs` DB function

**Files:**

- Modify: `vitest.config.ts`
- Modify: `packages/db/src/repositories/predictions.ts`
- Modify: `packages/db/src/repositories/predictions.test.ts`

- [ ] **Step 1.1: Add `@/` alias to vitest config**

In `vitest.config.ts`, add this entry to the end of the `resolve.alias` array (after the `@cup/schemas` entry, before the closing `]`):

```typescript
      {
        find: /^@\//,
        replacement: join(__dirname, 'apps/web/src/'),
      },
```

- [ ] **Step 1.2: Write the failing tests for `clearPredictionInputs`**

Add `clearPredictionInputs` to the import at the top of `packages/db/src/repositories/predictions.test.ts`:

```typescript
import {
  listPredictionsForTournament,
  getPredictionInputs,
  clearPredictionInputs,
} from './predictions';
```

Append this `describe` block inside the outer `describe('predictions repository', ...)` block, after the existing `describe('getPredictionInputs', ...)` block:

```typescript
describe('clearPredictionInputs', () => {
  it('deletes all sub-rows for the given prediction', async () => {
    const predId = await seedPrediction(db, poolId, userId1, tournamentId);

    await db
      .insert(schema.predictionGroupScores)
      .values([{ predictionId: predId, matchId: 'mA1', homeGoals: 2, awayGoals: 1 }]);
    await db
      .insert(schema.predictionKnockoutPicks)
      .values([{ predictionId: predId, bracketMatchKey: 'qf1', winnerTeamId: 'A1' }]);
    await db
      .insert(schema.predictionFinishScores)
      .values([{ predictionId: predId, match: 'final', homeGoals: 1, awayGoals: 0 }]);
    await db
      .insert(schema.predictionSpecials)
      .values([{ predictionId: predId, betKey: 'penaltyShootoutCount', value: 3 }]);

    await clearPredictionInputs(db, predId);

    const inputs = await getPredictionInputs(db, predId);
    expect(inputs.groupScores).toHaveLength(0);
    expect(inputs.knockoutPicks).toHaveLength(0);
    expect(inputs.finishScores).toEqual({});
    expect(inputs.specials).toEqual({});
  });

  it('does not touch rows belonging to other predictions', async () => {
    const pred1 = await seedPrediction(db, poolId, userId1, tournamentId);
    const user2 = await createUser(db, {
      email: `u2-${crypto.randomUUID()}@x.com`,
      displayName: 'Bob',
    });
    const pred2 = await seedPrediction(db, poolId, user2.id, tournamentId);

    await db.insert(schema.predictionGroupScores).values([
      { predictionId: pred1, matchId: 'mA1', homeGoals: 1, awayGoals: 0 },
      { predictionId: pred2, matchId: 'mA1', homeGoals: 2, awayGoals: 2 },
    ]);

    await clearPredictionInputs(db, pred1);

    const inputs1 = await getPredictionInputs(db, pred1);
    const inputs2 = await getPredictionInputs(db, pred2);
    expect(inputs1.groupScores).toHaveLength(0);
    expect(inputs2.groupScores).toHaveLength(1);
  });
});
```

- [ ] **Step 1.3: Run the test to verify it fails**

```bash
cd /workspaces/football-cup-prediction && pnpm test -- --reporter=verbose packages/db/src/repositories/predictions.test.ts
```

Expected: FAIL — `clearPredictionInputs` is not exported.

- [ ] **Step 1.4: Implement `clearPredictionInputs`**

Add to `packages/db/src/repositories/predictions.ts`, after the `deleteKnockoutPicks` function:

```typescript
/** Removes all prediction sub-rows (group scores, knockout picks, finish scores, specials) for a prediction. */
export async function clearPredictionInputs(db: Database, predictionId: string): Promise<void> {
  await Promise.all([
    db
      .delete(schema.predictionGroupScores)
      .where(eq(schema.predictionGroupScores.predictionId, predictionId)),
    db
      .delete(schema.predictionKnockoutPicks)
      .where(eq(schema.predictionKnockoutPicks.predictionId, predictionId)),
    db
      .delete(schema.predictionFinishScores)
      .where(eq(schema.predictionFinishScores.predictionId, predictionId)),
    db
      .delete(schema.predictionSpecials)
      .where(eq(schema.predictionSpecials.predictionId, predictionId)),
  ]);
}
```

- [ ] **Step 1.5: Run tests to verify they pass**

```bash
cd /workspaces/football-cup-prediction && pnpm test -- --reporter=verbose packages/db/src/repositories/predictions.test.ts
```

Expected: All tests in `predictions.test.ts` PASS.

- [ ] **Step 1.6: Commit**

```bash
cd /workspaces/football-cup-prediction && git add vitest.config.ts packages/db/src/repositories/predictions.ts packages/db/src/repositories/predictions.test.ts && git commit -m "feat: add clearPredictionInputs to db repo + @/ vitest alias"
```

---

## Task 2: Extract `rescoreAfterEdit` helper + add `clearAllPredictions` action

**Files:**

- Create: `apps/web/src/features/predictions/api/rescore-helper.ts`
- Modify: `apps/web/src/features/predictions/api/actions.ts`
- Create: `apps/web/src/features/predictions/api/actions.test.ts`

- [ ] **Step 2.1: Extract `rescoreAfterEdit` to a shared helper**

Create `apps/web/src/features/predictions/api/rescore-helper.ts`:

```typescript
import { db } from '@/shared/db';
import { rescoreCard } from '../application/rescore';
import { loadActualResults } from '../application/load-actual-results';
import type { Tournament, UserId } from '@cup/engine';

export async function rescoreAfterEdit(
  predictionId: string,
  poolId: string,
  userId: UserId,
  tournamentDef: Tournament,
): Promise<void> {
  const actual = await loadActualResults(db, tournamentDef.id);
  await rescoreCard({
    db,
    predictionId,
    poolId,
    userId,
    tournament: tournamentDef,
    actual,
  });
}
```

In `apps/web/src/features/predictions/api/actions.ts`:

1. Remove the `rescoreAfterEdit` function body (the private async function defined around line 50–65).

2. Add this import at the top of the imports section:

```typescript
import { rescoreAfterEdit } from './rescore-helper';
```

3. Also remove the two local imports that were only used by `rescoreAfterEdit` (they are now in `rescore-helper.ts`):

```typescript
import { rescoreCard } from '../application/rescore';
import { loadActualResults } from '../application/load-actual-results';
```

- [ ] **Step 2.2: Verify the refactor didn't break anything**

```bash
cd /workspaces/football-cup-prediction && pnpm test -- --reporter=verbose packages/db/src/repositories/predictions.test.ts && pnpm typecheck
```

Expected: All tests pass, no type errors.

- [ ] **Step 2.3: Write the failing test for `clearAllPredictions`**

Create `apps/web/src/features/predictions/api/actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import * as schema from '@cup/db/schema';
import {
  createUser,
  createPool as dbCreatePool,
  upsertTournamentDef,
  getPredictionInputs,
  getOrCreatePrediction,
  addMember,
} from '@cup/db';
import { miniTournament } from '@cup/engine/testing';
import type { UserId } from '@cup/engine';

// Mocks — only system boundaries: auth, Next.js cache, and the DB singleton.
// (The `server-only` guard in @/shared/db would throw in tests without this mock.)
let testDb: Awaited<ReturnType<typeof makeTestDb>>;

vi.mock('@/shared/db', () => ({
  get db() {
    return testDb;
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/features/auth', () => ({ getCurrentActor: vi.fn() }));

import { clearAllPredictions } from './actions';
import { getCurrentActor } from '@/features/auth';

const mockedGetActor = vi.mocked(getCurrentActor);

// firstKickoff far in the future so the card is never locked during tests
const firstKickoff = new Date('2099-06-11T18:00:00Z');
const emptyKickoffs = new Map<string, Date | null>();

describe('clearAllPredictions', () => {
  let poolId: string;
  let actorId: UserId;

  beforeAll(async () => {
    testDb = await makeTestDb();
    await upsertTournamentDef(testDb, miniTournament, firstKickoff, emptyKickoffs);
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    const owner = await createUser(testDb, {
      email: `owner-${crypto.randomUUID()}@x.com`,
      displayName: 'Owner',
    });
    const member = await createUser(testDb, {
      email: `member-${crypto.randomUUID()}@x.com`,
      displayName: 'Alice',
    });
    actorId = member.id;

    const pool = await dbCreatePool(testDb, {
      tournamentId: 'mini-2026',
      ownerId: owner.id,
      name: 'Test Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });
    poolId = pool.id;

    // assertCanEditOwnCard checks pool membership
    await addMember(testDb, poolId, actorId);

    mockedGetActor.mockResolvedValue({ userId: actorId });
  });

  it('clears all prediction data and returns ok:true', async () => {
    const pred = await getOrCreatePrediction(testDb, {
      poolId,
      userId: actorId,
      tournamentId: 'mini-2026',
    });
    await testDb
      .insert(schema.predictionGroupScores)
      .values([{ predictionId: pred.id, matchId: 'mA1', homeGoals: 2, awayGoals: 1 }]);
    await testDb
      .insert(schema.predictionKnockoutPicks)
      .values([{ predictionId: pred.id, bracketMatchKey: 'qf1', winnerTeamId: 'A1' }]);
    await testDb
      .insert(schema.predictionFinishScores)
      .values([{ predictionId: pred.id, match: 'final', homeGoals: 1, awayGoals: 0 }]);
    await testDb
      .insert(schema.predictionSpecials)
      .values([{ predictionId: pred.id, betKey: 'penaltyShootoutCount', value: 3 }]);

    const result = await clearAllPredictions({ poolId });

    expect(result).toEqual({ ok: true });
    const inputs = await getPredictionInputs(testDb, pred.id);
    expect(inputs.groupScores).toHaveLength(0);
    expect(inputs.knockoutPicks).toHaveLength(0);
    expect(inputs.finishScores).toEqual({});
    expect(inputs.specials).toEqual({});
  });

  it('returns ok:false when not signed in', async () => {
    mockedGetActor.mockResolvedValue(null);
    const result = await clearAllPredictions({ poolId });
    expect(result).toMatchObject({ ok: false });
  });

  it('returns ok:false for invalid input', async () => {
    const result = await clearAllPredictions({ poolId: 123 });
    expect(result).toMatchObject({ ok: false });
  });
});
```

- [ ] **Step 2.4: Run the test to verify it fails**

```bash
cd /workspaces/football-cup-prediction && pnpm test -- --reporter=verbose apps/web/src/features/predictions/api/actions.test.ts
```

Expected: FAIL — `clearAllPredictions` is not exported from `./actions`.

- [ ] **Step 2.5: Implement `clearAllPredictions` in `actions.ts`**

First, add `clearPredictionInputs` to the existing `@cup/db` import block in `actions.ts`:

```typescript
import {
  getPoolById,
  upsertGroupScore,
  upsertKnockoutPick,
  upsertFinishScore,
  upsertSpecialBet,
  createPredictionEdit,
  getPrediction,
  getOrCreatePrediction,
  deleteKnockoutPicks,
  getTournamentById,
  clearPredictionInputs,
} from '@cup/db';
```

Then add this action at the end of `actions.ts` (before the `exportCard` section or at the very end):

```typescript
// ---------------------------------------------------------------------------
// Clear all predictions (own card)
// ---------------------------------------------------------------------------

const ClearAllPredictionsSchema = z.object({ poolId: z.string() });

export async function clearAllPredictions(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ClearAllPredictionsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId } = parsed.data;

  try {
    const { userId } = await getActorOrThrow();
    const { pool, tournament } = await loadPoolAndTournament(poolId);

    await assertCanEditOwnCard(db, {
      actor: { userId },
      pool: { id: pool.id, ownerId: pool.ownerId },
      lockTime: tournament.firstKickoff,
      now: new Date(),
    });

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: pool.tournamentId,
    });

    await clearPredictionInputs(db, prediction.id);
    await rescoreAfterEdit(prediction.id, poolId, userId, tournament.definition!);

    revalidatePath(`/pools/${poolId}/predict`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
```

- [ ] **Step 2.6: Run tests to verify they pass**

```bash
cd /workspaces/football-cup-prediction && pnpm test -- --reporter=verbose apps/web/src/features/predictions/api/actions.test.ts
```

Expected: All three tests PASS.

- [ ] **Step 2.7: Commit**

```bash
cd /workspaces/football-cup-prediction && git add \
  apps/web/src/features/predictions/api/rescore-helper.ts \
  apps/web/src/features/predictions/api/actions.ts \
  apps/web/src/features/predictions/api/actions.test.ts \
  && git commit -m "feat: add clearAllPredictions action + extract rescoreAfterEdit helper"
```

---

## Task 3: Add `devFillRandomGroupScores` server action

**Files:**

- Create: `apps/web/src/features/predictions/api/dev-actions.ts`
- Create: `apps/web/src/features/predictions/api/dev-actions.test.ts`

- [ ] **Step 3.1: Write the failing tests**

Create `apps/web/src/features/predictions/api/dev-actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import {
  createUser,
  createPool as dbCreatePool,
  upsertTournamentDef,
  getPredictionInputs,
  getOrCreatePrediction,
} from '@cup/db';
import { miniTournament } from '@cup/engine/testing';
import type { UserId } from '@cup/engine';

let testDb: Awaited<ReturnType<typeof makeTestDb>>;

vi.mock('@/shared/db', () => ({
  get db() {
    return testDb;
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/features/auth', () => ({ getCurrentActor: vi.fn() }));

import { devFillRandomGroupScores } from './dev-actions';
import { getCurrentActor } from '@/features/auth';

const mockedGetActor = vi.mocked(getCurrentActor);

const firstKickoff = new Date('2099-06-11T18:00:00Z');
const emptyKickoffs = new Map<string, Date | null>();

describe('devFillRandomGroupScores', () => {
  let poolId: string;
  let actorId: UserId;

  beforeAll(async () => {
    testDb = await makeTestDb();
    await upsertTournamentDef(testDb, miniTournament, firstKickoff, emptyKickoffs);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();

    const owner = await createUser(testDb, {
      email: `owner-${crypto.randomUUID()}@x.com`,
      displayName: 'Owner',
    });
    const member = await createUser(testDb, {
      email: `member-${crypto.randomUUID()}@x.com`,
      displayName: 'Alice',
    });
    actorId = member.id;

    const pool = await dbCreatePool(testDb, {
      tournamentId: 'mini-2026',
      ownerId: owner.id,
      name: 'Test Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });
    poolId = pool.id;

    mockedGetActor.mockResolvedValue({ userId: actorId });
  });

  it('returns ok:false with "Dev only" when NODE_ENV is not development', async () => {
    // Default NODE_ENV in vitest is 'test'
    const result = await devFillRandomGroupScores({ poolId });
    expect(result).toEqual({ ok: false, error: 'Dev only' });
  });

  it('fills all 24 group matches with scores in [0, 4] in development mode', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const result = await devFillRandomGroupScores({ poolId });

    expect(result).toEqual({ ok: true });

    // mini-2026 has 4 groups × 6 matches = 24 group matches
    const pred = await getOrCreatePrediction(testDb, {
      poolId,
      userId: actorId,
      tournamentId: 'mini-2026',
    });
    const inputs = await getPredictionInputs(testDb, pred.id);
    expect(inputs.groupScores).toHaveLength(24);
    for (const gs of inputs.groupScores) {
      expect(gs.home).toBeGreaterThanOrEqual(0);
      expect(gs.home).toBeLessThanOrEqual(4);
      expect(gs.away).toBeGreaterThanOrEqual(0);
      expect(gs.away).toBeLessThanOrEqual(4);
    }
  });
});
```

- [ ] **Step 3.2: Run the test to verify it fails**

```bash
cd /workspaces/football-cup-prediction && pnpm test -- --reporter=verbose apps/web/src/features/predictions/api/dev-actions.test.ts
```

Expected: FAIL — `devFillRandomGroupScores` is not exported from `./dev-actions`.

- [ ] **Step 3.3: Implement `dev-actions.ts`**

Create `apps/web/src/features/predictions/api/dev-actions.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/shared/db';
import { getCurrentActor } from '@/features/auth';
import { getPoolById, getTournamentById, getOrCreatePrediction, upsertGroupScore } from '@cup/db';
import { rescoreAfterEdit } from './rescore-helper';

async function getActorOrThrow() {
  const actor = await getCurrentActor();
  if (!actor) throw new Error('Not signed in');
  return actor;
}

async function loadPoolAndTournament(poolId: string) {
  const pool = await getPoolById(db, poolId);
  if (!pool) throw new Error(`Pool ${poolId} not found`);
  const tournament = await getTournamentById(db, pool.tournamentId);
  if (!tournament) throw new Error(`Tournament ${pool.tournamentId} not found`);
  if (!tournament.definition)
    throw new Error(
      `Tournament definition not loaded for ${pool.tournamentId}. Run pnpm sync first.`,
    );
  return { pool, tournament };
}

const DevFillSchema = z.object({ poolId: z.string() });

export async function devFillRandomGroupScores(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (process.env.NODE_ENV !== 'development') return { ok: false, error: 'Dev only' };

  const parsed = DevFillSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  const { poolId } = parsed.data;

  try {
    const { userId } = await getActorOrThrow();
    const { pool, tournament } = await loadPoolAndTournament(poolId);
    const tournamentDef = tournament.definition!;

    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: pool.tournamentId,
    });

    for (const match of tournamentDef.groupMatches) {
      const home = Math.floor(Math.random() * 5);
      const away = Math.floor(Math.random() * 5);
      await upsertGroupScore(db, prediction.id, match.id, home, away);
    }

    await rescoreAfterEdit(prediction.id, poolId, userId, tournamentDef);

    revalidatePath(`/pools/${poolId}/predict`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

```bash
cd /workspaces/football-cup-prediction && pnpm test -- --reporter=verbose apps/web/src/features/predictions/api/dev-actions.test.ts
```

Expected: Both tests PASS.

- [ ] **Step 3.5: Commit**

```bash
cd /workspaces/football-cup-prediction && git add \
  apps/web/src/features/predictions/api/dev-actions.ts \
  apps/web/src/features/predictions/api/dev-actions.test.ts \
  && git commit -m "feat: add devFillRandomGroupScores server action"
```

---

## Task 4: DevControls UI + wire into PredictStepper and predict page

**Files:**

- Create: `apps/web/src/features/predictions/ui/DevControls.tsx`
- Modify: `apps/web/src/features/predictions/ui/PredictStepper.tsx`
- Modify: `apps/web/src/app/pools/[id]/predict/page.tsx`

- [ ] **Step 4.1: Create `DevControls.tsx`**

Create `apps/web/src/features/predictions/ui/DevControls.tsx`:

```tsx
'use client';

import type { ReactElement } from 'react';
import { useTransition } from 'react';
import { clearAllPredictions } from '../api/actions';
import { devFillRandomGroupScores } from '../api/dev-actions';

type Props = {
  poolId: string;
  isDev: boolean;
};

export function DevControls({ poolId, isDev }: Props): ReactElement {
  const [isClearPending, startClearTransition] = useTransition();
  const [isFillPending, startFillTransition] = useTransition();

  function handleClear() {
    startClearTransition(async () => {
      const result = await clearAllPredictions({ poolId });
      if (!result.ok) console.error('clearAllPredictions failed:', result.error);
    });
  }

  function handleFill() {
    startFillTransition(async () => {
      const result = await devFillRandomGroupScores({ poolId });
      if (!result.ok) console.error('devFillRandomGroupScores failed:', result.error);
    });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {isDev && (
        <span className="text-[10px] font-bold tracking-widest uppercase text-[var(--ink-muted)] border border-[var(--line)] rounded px-1.5 py-0.5 select-none">
          dev
        </span>
      )}
      {isDev && (
        <button
          type="button"
          onClick={handleFill}
          disabled={isFillPending}
          className="text-xs px-2.5 py-1 rounded border border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--line-strong)] transition-colors disabled:opacity-40"
        >
          {isFillPending ? 'Filling…' : 'Fill random scores'}
        </button>
      )}
      <button
        type="button"
        onClick={handleClear}
        disabled={isClearPending}
        className="text-xs px-2.5 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 transition-colors disabled:opacity-40"
      >
        {isClearPending ? 'Clearing…' : 'Clear all'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4.2: Update `PredictStepper.tsx`**

In `apps/web/src/features/predictions/ui/PredictStepper.tsx`:

1. Add import:

```typescript
import { DevControls } from './DevControls';
```

2. Add `isDev` to `Props`:

```typescript
type Props = {
  card: CardView;
  teams: { id: string; name: string }[];
  players: { id: string; name: string }[];
  isDev: boolean;
};
```

3. Destructure in the function signature:

```typescript
export function PredictStepper({ card, teams, players, isDev }: Props): ReactElement {
```

4. Render `DevControls` between `CompletionBar` and the lock notice — insert after the `<CompletionBar ... />` line:

```tsx
{
  /* Dev controls */
}
<DevControls poolId={card.poolId} isDev={isDev} />;
```

- [ ] **Step 4.3: Pass `isDev` from `predict/page.tsx`**

In `apps/web/src/app/pools/[id]/predict/page.tsx`, update the `PredictStepper` JSX:

```tsx
<PredictStepper
  card={card}
  teams={teams}
  players={players}
  isDev={process.env.NODE_ENV === 'development'}
/>
```

- [ ] **Step 4.4: Typecheck**

```bash
cd /workspaces/football-cup-prediction && pnpm typecheck
```

Expected: No type errors.

- [ ] **Step 4.5: Run full test suite**

```bash
cd /workspaces/football-cup-prediction && pnpm test
```

Expected: All tests pass.

- [ ] **Step 4.6: Lint and format**

```bash
cd /workspaces/football-cup-prediction && pnpm lint && pnpm format
```

Expected: No lint errors; format applies any whitespace fixes.

- [ ] **Step 4.7: Commit with spec and plan**

```bash
cd /workspaces/football-cup-prediction && git add \
  apps/web/src/features/predictions/ui/DevControls.tsx \
  apps/web/src/features/predictions/ui/PredictStepper.tsx \
  apps/web/src/app/pools/[id]/predict/page.tsx \
  docs/superpowers/specs/2026-06-08-dev-controls-design.md \
  docs/superpowers/plans/2026-06-08-dev-controls.md \
  && git commit -m "feat: add DevControls to predict page (clear all + dev fill random scores)"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] `pnpm test` — all tests green
- [ ] `pnpm typecheck` — no type errors
- [ ] `pnpm lint` — no lint errors
- [ ] Manual smoke test: open predict page in dev mode, verify "Clear all" and "Fill random scores" buttons appear and work
- [ ] Manual smoke test: in production build (`NODE_ENV=production`), only "Clear all" appears — no "dev" badge, no "Fill random scores"
