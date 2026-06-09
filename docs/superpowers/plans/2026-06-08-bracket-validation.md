# Bracket Validation & Pick Invalidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide advancing-team highlight until a group is fully predicted, show empty R32 slots when groups are incomplete, disable bracket matches with any missing team, and cascade-delete downstream picks when group scores change.

**Architecture:** Engine gets a new pure function `findInvalidatedPickKeys` for cascade detection. `getCardView` gains group-completeness awareness for slot resolution and qualifying flags. `BracketSection` gets a stricter disabled condition. `saveGroupScore`/`ownerSaveGroupScore` call the engine function + `deleteKnockoutPicks` before rescoring. `deleteKnockoutPicks` gets a bug-fix for its WHERE clause.

**Tech Stack:** TypeScript strict, Vitest, Drizzle ORM, PGlite (in-memory integration tests), React (UI change only, no component tests).

---

## File Map

| File                                                                 | Action                                                          |
| -------------------------------------------------------------------- | --------------------------------------------------------------- |
| `packages/db/src/repositories/predictions.ts`                        | Fix `deleteKnockoutPicks` WHERE-clause bug (`&&` → `and()`)     |
| `packages/engine/src/bracket.ts`                                     | Add `findInvalidatedPickKeys` + private `resolveSlotSafe`       |
| `packages/engine/src/index.ts`                                       | Export `findInvalidatedPickKeys`, `selectQualifiers`, `matchId` |
| `packages/engine/src/bracket.test.ts`                                | Append `findInvalidatedPickKeys` test suite                     |
| `apps/web/src/features/predictions/application/get-card.ts`          | `qualifies` flag + `resolveSlotTeam` completeness guard         |
| `apps/web/src/features/predictions/application/get-card.test.ts`     | New: integration tests for qualifying flag + slot resolution    |
| `apps/web/src/features/predictions/application/invalidation.test.ts` | New: integration test for invalidation flow                     |
| `apps/web/src/features/predictions/ui/BracketSection.tsx`            | Stricter `disabled` condition on `TieRow`                       |
| `apps/web/src/features/predictions/api/actions.ts`                   | Invalidation logic in `saveGroupScore` + `ownerSaveGroupScore`  |

---

## Task 1: Fix `deleteKnockoutPicks` WHERE-clause bug

The existing implementation uses JavaScript `&&` instead of Drizzle's `and()`, which silently drops the predicate. Fix before adding any calls to this function.

**Files:**

- Modify: `packages/db/src/repositories/predictions.ts`

- [ ] **Step 1: Read the current function**

Open `packages/db/src/repositories/predictions.ts` and locate `deleteKnockoutPicks` (around line 131).

- [ ] **Step 2: Add `and` to the Drizzle import**

Change the first line from:

```typescript
import { eq, inArray } from 'drizzle-orm';
```

to:

```typescript
import { and, eq, inArray } from 'drizzle-orm';
```

- [ ] **Step 3: Fix the WHERE clause**

Replace the body of `deleteKnockoutPicks`:

```typescript
await db
  .delete(schema.predictionKnockoutPicks)
  .where(
    eq(schema.predictionKnockoutPicks.predictionId, predictionId) &&
      inArray(schema.predictionKnockoutPicks.bracketMatchKey, keys),
  );
```

with:

```typescript
await db
  .delete(schema.predictionKnockoutPicks)
  .where(
    and(
      eq(schema.predictionKnockoutPicks.predictionId, predictionId),
      inArray(schema.predictionKnockoutPicks.bracketMatchKey, keys),
    ),
  );
```

- [ ] **Step 4: Run tests to confirm no regressions**

```bash
pnpm vitest run packages/db/src/repositories/predictions.test.ts
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/repositories/predictions.ts
git commit -m "fix: correct deleteKnockoutPicks WHERE clause (and vs &&)"
```

---

## Task 2: `findInvalidatedPickKeys` — failing tests

**Files:**

- Modify: `packages/engine/src/bracket.test.ts`

- [ ] **Step 1: Understand the mini-tournament bracket layout**

With all-draw scores the orders are A=[A1..A4], B=[B1..B4], C=[C1..C4], D=[D1..D4].

- `qf1`: home=1A=**A1**, away=2B=**B2**
- `qf2`: home=1C=**C1**, away=2D=**D2**
- `qf3`: home=1B=**B1**, away=2A=**A2**
- `qf4`: home=1D=**D1**, away=2C=**C2**
- `sf1` from `[qf1, qf2]`, `sf2` from `[qf3, qf4]`
- `final` from `[sf1, sf2]`, `bronze` from `[sf1, sf2]` (SF losers)

- [ ] **Step 2: Add the import for `findInvalidatedPickKeys` to the test file**

At the top of `packages/engine/src/bracket.test.ts`, update the bracket import:

```typescript
import { buildBracket, resolveSlot, findInvalidatedPickKeys } from './bracket.js';
```

- [ ] **Step 3: Add the test suite at the bottom of the file**

```typescript
describe('findInvalidatedPickKeys', () => {
  // Baseline: all-draw group orders (seed order)
  const baseOrders: Record<ReturnType<typeof groupId>, ReturnType<typeof teamId>[]> = {
    [groupId('A')]: [teamId('A1'), teamId('A2'), teamId('A3'), teamId('A4')],
    [groupId('B')]: [teamId('B1'), teamId('B2'), teamId('B3'), teamId('B4')],
    [groupId('C')]: [teamId('C1'), teamId('C2'), teamId('C3'), teamId('C4')],
    [groupId('D')]: [teamId('D1'), teamId('D2'), teamId('D3'), teamId('D4')],
  };
  // Qualifiers: top-2 from each group (autoQualifyPerGroup=2, no thirds)
  const baseQualifiers = [
    teamId('A1'),
    teamId('A2'),
    teamId('B1'),
    teamId('B2'),
    teamId('C1'),
    teamId('C2'),
    teamId('D1'),
    teamId('D2'),
  ];
  // Full set of picks (A1 wins qf1, C1 wins qf2, B1 wins qf3, D1 wins qf4,
  //                    A1 wins sf1, B1 wins sf2, A1 wins final, C1 wins bronze)
  const fullPicks: KnockoutPick[] = [
    { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
    { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
    { bracketMatchKey: bracketMatchKey('qf3'), winner: teamId('B1') },
    { bracketMatchKey: bracketMatchKey('qf4'), winner: teamId('D1') },
    { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('A1') },
    { bracketMatchKey: bracketMatchKey('sf2'), winner: teamId('B1') },
    { bracketMatchKey: bracketMatchKey('final'), winner: teamId('A1') },
    { bracketMatchKey: bracketMatchKey('bronze'), winner: teamId('C1') },
  ];

  it('returns empty array when no picks exist', () => {
    const keys = findInvalidatedPickKeys(miniTournament, baseOrders, baseQualifiers, []);
    expect(keys).toHaveLength(0);
  });

  it('returns empty array when group orders unchanged and all picks are valid', () => {
    const keys = findInvalidatedPickKeys(miniTournament, baseOrders, baseQualifiers, fullPicks);
    expect(keys).toHaveLength(0);
  });

  it('invalidates qf pick when picked team is displaced from its slot', () => {
    // A2 now beats A1 → A=[A2,A1,A3,A4]; qf1 slot becomes A2 vs B2
    const swappedOrders = {
      ...baseOrders,
      [groupId('A')]: [teamId('A2'), teamId('A1'), teamId('A3'), teamId('A4')],
    };
    const swappedQualifiers = [
      teamId('A2'),
      teamId('A1'),
      teamId('B1'),
      teamId('B2'),
      teamId('C1'),
      teamId('C2'),
      teamId('D1'),
      teamId('D2'),
    ];
    // Only qf1 pick (A1) needs checking here
    const picks: KnockoutPick[] = [
      { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
    ];

    const keys = findInvalidatedPickKeys(miniTournament, swappedOrders, swappedQualifiers, picks);
    expect(keys).toContain(bracketMatchKey('qf1'));
    expect(keys).toHaveLength(1);
  });

  it('does not invalidate qf pick when picked team stays in slot despite opponent change', () => {
    // B3 becomes runner-up instead of B2 → qf1: A1 vs B3; A1 pick still valid
    const changedBOrders = {
      ...baseOrders,
      [groupId('B')]: [teamId('B1'), teamId('B3'), teamId('B2'), teamId('B4')],
    };
    const changedQualifiers = [
      teamId('A1'),
      teamId('A2'),
      teamId('B1'),
      teamId('B3'),
      teamId('C1'),
      teamId('C2'),
      teamId('D1'),
      teamId('D2'),
    ];
    const picks: KnockoutPick[] = [
      { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
    ];

    const keys = findInvalidatedPickKeys(miniTournament, changedBOrders, changedQualifiers, picks);
    expect(keys).toHaveLength(0);
  });

  it('cascades: invalidating a qf pick also invalidates the dependent sf pick', () => {
    // A2 becomes 1st → qf1 now A2 vs B2 → qf1 pick A1 invalid
    // sf1 depends on qf1 winner → sf1 pick A1 also invalid
    const swappedOrders = {
      ...baseOrders,
      [groupId('A')]: [teamId('A2'), teamId('A1'), teamId('A3'), teamId('A4')],
    };
    const swappedQualifiers = [
      teamId('A2'),
      teamId('A1'),
      teamId('B1'),
      teamId('B2'),
      teamId('C1'),
      teamId('C2'),
      teamId('D1'),
      teamId('D2'),
    ];
    const picks: KnockoutPick[] = [
      { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
      { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
      { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('A1') },
    ];

    const keys = findInvalidatedPickKeys(miniTournament, swappedOrders, swappedQualifiers, picks);
    expect(keys).toContain(bracketMatchKey('qf1'));
    expect(keys).toContain(bracketMatchKey('sf1'));
    expect(keys).not.toContain(bracketMatchKey('qf2'));
  });

  it('cascades through qf → sf → final → bronze on full pick set', () => {
    const swappedOrders = {
      ...baseOrders,
      [groupId('A')]: [teamId('A2'), teamId('A1'), teamId('A3'), teamId('A4')],
    };
    const swappedQualifiers = [
      teamId('A2'),
      teamId('A1'),
      teamId('B1'),
      teamId('B2'),
      teamId('C1'),
      teamId('C2'),
      teamId('D1'),
      teamId('D2'),
    ];

    const keys = findInvalidatedPickKeys(
      miniTournament,
      swappedOrders,
      swappedQualifiers,
      fullPicks,
    );

    // qf1 invalid (A1 no longer in qf1)
    expect(keys).toContain(bracketMatchKey('qf1'));
    // sf1 invalid (qf1 winner unknown)
    expect(keys).toContain(bracketMatchKey('sf1'));
    // final invalid (sf1 winner unknown)
    expect(keys).toContain(bracketMatchKey('final'));
    // bronze invalid (sf1 loser unknown)
    expect(keys).toContain(bracketMatchKey('bronze'));
    // qf2, qf3, qf4, sf2 are still valid
    expect(keys).not.toContain(bracketMatchKey('qf2'));
    expect(keys).not.toContain(bracketMatchKey('qf3'));
    expect(keys).not.toContain(bracketMatchKey('qf4'));
    expect(keys).not.toContain(bracketMatchKey('sf2'));
  });

  it('does not invalidate bronze when sf picks and bronze pick are all valid', () => {
    // All orders unchanged; bronze pick C1 is sf1 loser — should be valid
    const keys = findInvalidatedPickKeys(miniTournament, baseOrders, baseQualifiers, fullPicks);
    expect(keys).not.toContain(bracketMatchKey('bronze'));
  });
});
```

- [ ] **Step 4: Run tests to confirm they fail**

```bash
pnpm vitest run packages/engine/src/bracket.test.ts 2>&1 | tail -20
```

Expected: FAIL — `findInvalidatedPickKeys is not a function` or similar.

---

## Task 3: `findInvalidatedPickKeys` — implementation

**Files:**

- Modify: `packages/engine/src/bracket.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: Add `resolveSlotSafe` and `findInvalidatedPickKeys` to `bracket.ts`**

Append after the existing `export { resolveSlot }` line at the bottom of `packages/engine/src/bracket.ts`:

```typescript
/** Safe slot resolver — returns undefined instead of throwing when refs are unresolvable. */
function resolveSlotSafe(
  ref: string,
  groupOrders: Record<GroupId, TeamId[]>,
  rankedThirds: TeamId[],
): TeamId | undefined {
  try {
    return resolveSlot(ref, groupOrders, rankedThirds);
  } catch {
    return undefined;
  }
}

/**
 * Returns the BracketMatchKeys of picks that are no longer valid after a group score change.
 *
 * Walks the bracket in topological order (entry slots → progression → bronze).
 * When a pick is invalidated it is removed from the working pick map so that downstream
 * matches that depend on it are also flagged.
 *
 * Bronze is handled specially: its participants are SF losers, not SF winners.
 */
export function findInvalidatedPickKeys(
  t: Tournament,
  newGroupOrders: Record<GroupId, TeamId[]>,
  newQualifiers: TeamId[],
  existingPicks: KnockoutPick[],
): BracketMatchKey[] {
  const { bracket, groups, qualification } = t;
  const autoCount = groups.length * qualification.autoQualifyPerGroup;
  const rankedThirds: TeamId[] = newQualifiers.slice(autoCount);

  const pickMap = new Map<BracketMatchKey, TeamId>(
    existingPicks.map((p) => [p.bracketMatchKey, p.winner]),
  );
  const participantsByMatch = new Map<BracketMatchKey, [TeamId, TeamId]>();
  const invalidKeys: BracketMatchKey[] = [];

  // 1. Entry-round slots (e.g. R32 / QF depending on tournament)
  for (const slot of bracket.slots) {
    const home = resolveSlotSafe(slot.home, newGroupOrders, rankedThirds);
    const away = resolveSlotSafe(slot.away, newGroupOrders, rankedThirds);

    if (home !== undefined && away !== undefined) {
      participantsByMatch.set(slot.match, [home, away]);
    }

    const pick = pickMap.get(slot.match);
    if (pick !== undefined) {
      if (home === undefined || away === undefined || (pick !== home && pick !== away)) {
        invalidKeys.push(slot.match);
        pickMap.delete(slot.match);
      }
    }
  }

  // 2. Progression entries in declaration order (topo: R32→R16→QF→SF→Final); skip bronze
  for (const prog of bracket.progression) {
    if (prog.match === bracket.bronzeMatch) continue;

    const homePick = prog.from[0] != null ? pickMap.get(prog.from[0]) : undefined;
    const awayPick = prog.from[1] != null ? pickMap.get(prog.from[1]) : undefined;

    if (homePick !== undefined && awayPick !== undefined) {
      participantsByMatch.set(prog.match, [homePick, awayPick]);
    }

    const pick = pickMap.get(prog.match);
    if (pick !== undefined) {
      if (
        homePick === undefined ||
        awayPick === undefined ||
        (pick !== homePick && pick !== awayPick)
      ) {
        invalidKeys.push(prog.match);
        pickMap.delete(prog.match);
      }
    }
  }

  // 3. Bronze: participants are SF losers (not winners)
  const bronzeProg = bracket.progression.find((p) => p.match === bracket.bronzeMatch);
  if (bronzeProg) {
    const bronzeParticipants: TeamId[] = [];
    for (const sfKey of bronzeProg.from) {
      const sfPair = participantsByMatch.get(sfKey);
      const sfWinner = pickMap.get(sfKey);
      if (sfPair !== undefined && sfWinner !== undefined) {
        const loser = sfWinner === sfPair[0] ? sfPair[1] : sfPair[0];
        bronzeParticipants.push(loser);
      }
    }

    const bronzePick = pickMap.get(bracket.bronzeMatch);
    if (bronzePick !== undefined) {
      if (bronzeParticipants.length < 2 || !bronzeParticipants.includes(bronzePick)) {
        invalidKeys.push(bracket.bronzeMatch);
      }
    }
  }

  return invalidKeys;
}
```

- [ ] **Step 2: Export from engine `index.ts`**

In `packages/engine/src/index.ts`, add to the exports:

```typescript
// Bracket utilities
export { findInvalidatedPickKeys } from './bracket.js';
export { selectQualifiers } from './qualifiers.js';
export { matchId } from './brand.js';
```

(Add after the existing `export { deriveGroupOrders }` line, or at the end of the Core engine functions block.)

- [ ] **Step 3: Run the new tests**

```bash
pnpm vitest run packages/engine/src/bracket.test.ts 2>&1 | tail -30
```

Expected: all `findInvalidatedPickKeys` tests pass. Existing tests still pass.

- [ ] **Step 4: Run full engine tests**

```bash
pnpm vitest run packages/engine 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/bracket.ts packages/engine/src/index.ts packages/engine/src/bracket.test.ts
git commit -m "feat(engine): add findInvalidatedPickKeys for cascade pick deletion"
```

---

## Task 4: `getCardView` — qualifying highlight test (red)

**Files:**

- Create: `apps/web/src/features/predictions/application/get-card.test.ts`

The mini-tournament has 4 groups × 6 matches = 24 total group matches. A group is "complete" only when all 6 of its matches have predicted scores.

- [ ] **Step 1: Create the test file**

```typescript
/**
 * Integration tests for getCardView.
 * Uses a real in-memory PGlite database — no mocks.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import {
  upsertTournamentDef,
  createUser,
  createPool,
  upsertGroupScore,
  getOrCreatePrediction,
} from '@cup/db';
import { miniTournament } from '@cup/engine/testing';
import { groupId, teamId, bracketMatchKey } from '@cup/engine';
import type { UserId } from '@cup/engine';
import { getCardView } from './get-card';

const firstKickoff = new Date('2030-06-11T18:00:00Z');
const now = new Date('2025-01-01T00:00:00Z');
const emptyKickoffs = new Map<string, Date | null>();

type TestDb = Awaited<ReturnType<typeof makeTestDb>>;

async function setupDb(db: TestDb) {
  await upsertTournamentDef(db, miniTournament, firstKickoff, emptyKickoffs);
  const owner = await createUser(db, {
    email: `owner-${crypto.randomUUID()}@test.com`,
    displayName: 'Owner',
  });
  const pool = await createPool(db, {
    tournamentId: miniTournament.id,
    ownerId: owner.id,
    name: 'Test Pool',
    inviteTokenHash: `h-${crypto.randomUUID()}`,
  });
  const user = await createUser(db, {
    email: `user-${crypto.randomUUID()}@test.com`,
    displayName: 'Alice',
  });
  return { poolId: pool.id, userId: user.id as UserId };
}

// All 6 match IDs for group A in the mini-tournament
function groupAMatchIds() {
  return miniTournament.groupMatches.filter((m) => m.group === groupId('A')).map((m) => m.id);
}

// All match IDs for a given group
function groupMatchIds(g: string) {
  return miniTournament.groupMatches.filter((m) => m.group === groupId(g)).map((m) => m.id);
}

describe('getCardView — qualifying highlight', () => {
  let db: TestDb;
  let poolId: string;
  let userId: UserId;

  beforeEach(async () => {
    db = await makeTestDb();
    ({ poolId, userId } = await setupDb(db));
  });

  it('marks NO team as qualifying when the group is incomplete', async () => {
    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    // Add only 3 of the 6 group-A matches
    const matchIds = groupAMatchIds();
    for (const mid of matchIds.slice(0, 3)) {
      await upsertGroupScore(db, prediction.id, mid, 1, 0);
    }

    const card = await getCardView({
      db,
      poolId,
      userId,
      tournamentId: miniTournament.id,
      tournament: miniTournament,
      firstKickoff,
      now,
      createIfMissing: false,
    });

    const groupA = card!.groups.find((g) => g.groupId === groupId('A'))!;
    expect(groupA.complete).toBe(false);
    expect(groupA.derivedOrder.every((e) => e.qualifies === false)).toBe(true);
  });

  it('marks top-2 as qualifying when the group is complete', async () => {
    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    // Predict all 6 group-A matches as draws
    for (const mid of groupAMatchIds()) {
      await upsertGroupScore(db, prediction.id, mid, 0, 0);
    }

    const card = await getCardView({
      db,
      poolId,
      userId,
      tournamentId: miniTournament.id,
      tournament: miniTournament,
      firstKickoff,
      now,
      createIfMissing: false,
    });

    const groupA = card!.groups.find((g) => g.groupId === groupId('A'))!;
    expect(groupA.complete).toBe(true);
    // autoQualifyPerGroup = 2
    const qualifying = groupA.derivedOrder.filter((e) => e.qualifies);
    expect(qualifying).toHaveLength(2);
    // Positions 0 and 1 qualify; positions 2 and 3 do not
    expect(groupA.derivedOrder[0]!.qualifies).toBe(true);
    expect(groupA.derivedOrder[1]!.qualifies).toBe(true);
    expect(groupA.derivedOrder[2]!.qualifies).toBe(false);
    expect(groupA.derivedOrder[3]!.qualifies).toBe(false);
  });
});

describe('getCardView — bracket slot resolution', () => {
  let db: TestDb;
  let poolId: string;
  let userId: UserId;

  beforeEach(async () => {
    db = await makeTestDb();
    ({ poolId, userId } = await setupDb(db));
  });

  it('shows null team for an entry-round slot when its group is incomplete', async () => {
    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    // Complete group B, C, D but leave group A incomplete
    for (const g of ['B', 'C', 'D']) {
      for (const mid of groupMatchIds(g)) {
        await upsertGroupScore(db, prediction.id, mid, 0, 0);
      }
    }
    // Add only 1 of 6 group A matches
    await upsertGroupScore(db, prediction.id, groupAMatchIds()[0]!, 1, 0);

    const card = await getCardView({
      db,
      poolId,
      userId,
      tournamentId: miniTournament.id,
      tournament: miniTournament,
      firstKickoff,
      now,
      createIfMissing: false,
    });

    // qf1 = 1A vs 2B: group A incomplete → home (1A) is null; group B complete → away (2B) is B2
    const qfRound = card!.bracket.rounds.find((r) => r.label === 'QF')!;
    const qf1 = qfRound.ties.find((t) => t.bracketMatchKey === bracketMatchKey('qf1'))!;
    expect(qf1.homeTeamId).toBeNull();
    expect(qf1.awayTeamId).toBe(teamId('B2')); // group B complete, B2 is runner-up on all draws

    // qf3 = 1B vs 2A: group B complete → home (1B) is B1; group A incomplete → away (2A) is null
    const qf3 = qfRound.ties.find((t) => t.bracketMatchKey === bracketMatchKey('qf3'))!;
    expect(qf3.homeTeamId).toBe(teamId('B1'));
    expect(qf3.awayTeamId).toBeNull();
  });

  it('shows real teams in entry-round slots when all groups are complete', async () => {
    const prediction = await getOrCreatePrediction(db, {
      poolId,
      userId,
      tournamentId: miniTournament.id,
    });
    for (const g of ['A', 'B', 'C', 'D']) {
      for (const mid of groupMatchIds(g)) {
        await upsertGroupScore(db, prediction.id, mid, 0, 0);
      }
    }

    const card = await getCardView({
      db,
      poolId,
      userId,
      tournamentId: miniTournament.id,
      tournament: miniTournament,
      firstKickoff,
      now,
      createIfMissing: false,
    });

    const qfRound = card!.bracket.rounds.find((r) => r.label === 'QF')!;
    const qf1 = qfRound.ties.find((t) => t.bracketMatchKey === bracketMatchKey('qf1'))!;
    expect(qf1.homeTeamId).toBe(teamId('A1')); // 1A = A1 on all draws
    expect(qf1.awayTeamId).toBe(teamId('B2')); // 2B = B2
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm vitest run apps/web/src/features/predictions/application/get-card.test.ts 2>&1 | tail -20
```

Expected: FAIL (qualifying marks top-2 green even for incomplete groups; slot resolver returns real teams regardless of completeness).

---

## Task 5: `getCardView` — qualifying highlight + slot resolution (green)

**Files:**

- Modify: `apps/web/src/features/predictions/application/get-card.ts`

- [ ] **Step 1: Fix the `qualifies` flag**

In `get-card.ts`, locate the `groups` map (around line 68). The current code is:

```typescript
const complete = matches.every((m) => m.predictedHome !== null);

return {
  groupId: group.id as GroupId,
  matches,
  derivedOrder: derivedGroupOrder.map((tid, i) => ({
    teamId: tid,
    teamName: teamMap.get(tid) ?? tid,
    qualifies: i < autoQualify,
  })),
  complete: matches.every((m) => m.predictedHome !== null),
};
```

If you don't see a `complete` local variable, the current code computes `complete` inline. Replace the `groups` map body (the `return { ... }` inside the `.map((group) => {` callback) with:

```typescript
const complete = matches.every((m) => m.predictedHome !== null);

return {
  groupId: group.id as GroupId,
  matches,
  derivedOrder: derivedGroupOrder.map((tid, i) => ({
    teamId: tid,
    teamName: teamMap.get(tid) ?? tid,
    qualifies: complete && i < autoQualify,
  })),
  complete,
};
```

- [ ] **Step 2: Add group-completeness set after building `groups`**

After the `groups` array is fully built (after the `tournament.groups.map(...)` call, around line 99), add:

```typescript
const completeGroupsSet = new Set<GroupId>(groups.filter((g) => g.complete).map((g) => g.groupId));
const allGroupsComplete = completeGroupsSet.size === tournament.groups.length;
```

- [ ] **Step 3: Update `resolveSlotTeam` to accept and enforce completeness**

At the bottom of `get-card.ts`, replace the existing `resolveSlotTeam` function:

```typescript
function resolveSlotTeam(
  slotRef: string,
  qualifiers: TeamId[],
  groupOrders: Record<GroupId, TeamId[]>,
): TeamId | undefined {
  // SlotRef formats: "1A" (1st of group A), "2B", "3rd[0]" (best third-placed)
  const posGroupMatch = slotRef.match(/^(\d+)([A-Z]+)$/);
  if (posGroupMatch) {
    const pos = parseInt(posGroupMatch[1]!) - 1;
    const groupId = posGroupMatch[2] as GroupId;
    return groupOrders[groupId]?.[pos];
  }
  const thirdMatch = slotRef.match(/^3rd\[(\d+)\]$/);
  if (thirdMatch) {
    const idx = parseInt(thirdMatch[1]!);
    // Third-placed qualifiers are those NOT in top-2 of any group, sorted — index into qualifiers
    return qualifiers[idx];
  }
  return undefined;
}
```

with:

```typescript
function resolveSlotTeam(
  slotRef: string,
  qualifiers: TeamId[],
  groupOrders: Record<GroupId, TeamId[]>,
  completeGroups: Set<GroupId>,
  allGroupsComplete: boolean,
): TeamId | undefined {
  const posGroupMatch = slotRef.match(/^(\d+)([A-Z]+)$/);
  if (posGroupMatch) {
    const pos = parseInt(posGroupMatch[1]!) - 1;
    const gId = posGroupMatch[2] as GroupId;
    if (!completeGroups.has(gId)) return undefined;
    return groupOrders[gId]?.[pos];
  }
  const thirdMatch = slotRef.match(/^3rd\[(\d+)\]$/);
  if (thirdMatch) {
    if (!allGroupsComplete) return undefined;
    const idx = parseInt(thirdMatch[1]!);
    return qualifiers[idx];
  }
  return undefined;
}
```

- [ ] **Step 4: Thread the new arguments into all `resolveSlotTeam` call sites**

In the bracket-building section (the `for (const slot of bracket.slots)` loop, around line 118), update each call:

```typescript
const homeId =
  resolveSlotTeam(
    slot.home,
    derived.qualifiers,
    derived.groupOrders,
    completeGroupsSet,
    allGroupsComplete,
  ) ?? null;
const awayId =
  resolveSlotTeam(
    slot.away,
    derived.qualifiers,
    derived.groupOrders,
    completeGroupsSet,
    allGroupsComplete,
  ) ?? null;
```

- [ ] **Step 5: Run tests**

```bash
pnpm vitest run apps/web/src/features/predictions/application/get-card.test.ts 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Run full test suite to check no regressions**

```bash
pnpm vitest run 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/predictions/application/get-card.ts \
        apps/web/src/features/predictions/application/get-card.test.ts
git commit -m "feat: hide advancing indicator until group complete; null bracket slots for incomplete groups"
```

---

## Task 6: `BracketSection` — disable match when either team is missing

**Files:**

- Modify: `apps/web/src/features/predictions/ui/BracketSection.tsx`

- [ ] **Step 1: Locate and update the `TieRow` component disabled conditions**

In `BracketSection.tsx`, find the `TieRow` function (around line 116). The two `TeamPickButton` calls currently have:

```typescript
      <TeamPickButton
        ...
        disabled={locked || noTeams || !homeTeamId}
        ...
      />
      ...
      <TeamPickButton
        ...
        disabled={locked || noTeams || !awayTeamId}
        ...
      />
```

Replace both `disabled` props with a single shared condition (either team missing disables both):

```typescript
      <TeamPickButton
        teamId={homeTeamId}
        teamName={homeTeamName ?? '?'}
        picked={pickedWinnerId === homeTeamId}
        disabled={locked || !homeTeamId || !awayTeamId}
        onClick={() => homeTeamId && onPick(bracketMatchKey, homeTeamId)}
        side="home"
      />
      <span className="text-[var(--ink-muted)] text-xs font-bold select-none px-1">vs</span>
      <TeamPickButton
        teamId={awayTeamId}
        teamName={awayTeamName ?? '?'}
        picked={pickedWinnerId === awayTeamId}
        disabled={locked || !homeTeamId || !awayTeamId}
        onClick={() => awayTeamId && onPick(bracketMatchKey, awayTeamId)}
        side="away"
      />
```

Also remove the now-unused `noTeams` variable declaration (line 127):

```typescript
const noTeams = !homeTeamId && !awayTeamId;
```

- [ ] **Step 2: Typecheck**

```bash
pnpm tsc --noEmit -p apps/web/tsconfig.json 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/predictions/ui/BracketSection.tsx
git commit -m "fix: disable bracket match buttons when either team slot is empty"
```

---

## Task 7: Invalidation integration — test (red) then implementation (green)

### Sub-step A: Write the integration test

**Files:**

- Create: `apps/web/src/features/predictions/application/invalidation.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
/**
 * Integration test: pick invalidation after group score change.
 * Tests the coordination of engine.findInvalidatedPickKeys + db.deleteKnockoutPicks.
 * Uses a real in-memory PGlite database.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '@cup/db/testing';
import {
  upsertTournamentDef,
  createUser,
  createPool,
  getOrCreatePrediction,
  upsertGroupScore,
  upsertKnockoutPick,
  getPredictionInputs,
  deleteKnockoutPicks,
} from '@cup/db';
import { miniTournament } from '@cup/engine/testing';
import {
  groupId,
  teamId,
  bracketMatchKey,
  matchId,
  findInvalidatedPickKeys,
  selectQualifiers,
  deriveGroupOrders,
} from '@cup/engine';
import type { UserId } from '@cup/engine';

const firstKickoff = new Date('2030-06-11T18:00:00Z');
const emptyKickoffs = new Map<string, Date | null>();

type TestDb = Awaited<ReturnType<typeof makeTestDb>>;

async function setup(db: TestDb) {
  await upsertTournamentDef(db, miniTournament, firstKickoff, emptyKickoffs);
  const owner = await createUser(db, {
    email: `owner-${crypto.randomUUID()}@test.com`,
    displayName: 'Owner',
  });
  const pool = await createPool(db, {
    tournamentId: miniTournament.id,
    ownerId: owner.id,
    name: 'Test Pool',
    inviteTokenHash: `h-${crypto.randomUUID()}`,
  });
  const user = await createUser(db, {
    email: `user-${crypto.randomUUID()}@test.com`,
    displayName: 'Alice',
  });
  const prediction = await getOrCreatePrediction(db, {
    poolId: pool.id,
    userId: user.id as UserId,
    tournamentId: miniTournament.id,
  });
  return { poolId: pool.id, userId: user.id as UserId, predictionId: prediction.id };
}

// Seed all group scores as draws so each group is complete with seed-order standings
async function seedAllGroupScores(db: TestDb, predictionId: string) {
  for (const m of miniTournament.groupMatches) {
    await upsertGroupScore(db, predictionId, m.id, 0, 0);
  }
}

describe('pick invalidation after group score change', () => {
  let db: TestDb;
  let predictionId: string;

  beforeEach(async () => {
    db = await makeTestDb();
    ({ predictionId } = await setup(db));
  });

  it('deletes qf pick when the picked team is no longer in that slot', async () => {
    // Seed all scores as draws → A1 is group A winner
    await seedAllGroupScores(db, predictionId);

    // User picks A1 for qf1 (slot: 1A vs 2B → A1 vs B2)
    await upsertKnockoutPick(db, predictionId, bracketMatchKey('qf1'), teamId('A1'));

    // Now change a group A match so A2 beats A1 → A2 becomes 1st, A1 becomes 2nd
    // In mini-tournament, first group-A match is A1 vs A2 (mA1)
    const mA1 = miniTournament.groupMatches.find(
      (m) => m.group === groupId('A') && m.home === teamId('A1') && m.away === teamId('A2'),
    )!;
    const newScore = { matchId: mA1.id, home: 0, away: 1 }; // A2 wins

    // Simulate the action: derive new group state
    const inputs = await getPredictionInputs(db, predictionId);
    const updatedScores = [
      ...inputs.groupScores.filter((s) => s.matchId !== mA1.id),
      { matchId: mA1.id, home: 0, away: 1 },
    ];
    const newGroupOrders = deriveGroupOrders(miniTournament, updatedScores);
    const newQualifiers = selectQualifiers(miniTournament, updatedScores, newGroupOrders);

    // Upsert the new score
    await upsertGroupScore(db, predictionId, newScore.matchId, newScore.home, newScore.away);

    // Find and delete invalid picks
    const invalidKeys = findInvalidatedPickKeys(
      miniTournament,
      newGroupOrders,
      newQualifiers,
      inputs.knockoutPicks,
    );
    await deleteKnockoutPicks(db, predictionId, invalidKeys);

    // qf1 pick should be gone
    const after = await getPredictionInputs(db, predictionId);
    expect(
      after.knockoutPicks.find((p) => p.bracketMatchKey === bracketMatchKey('qf1')),
    ).toBeUndefined();
  });

  it('cascades: deletes sf pick when its dependent qf pick is invalidated', async () => {
    await seedAllGroupScores(db, predictionId);

    // User picks: A1 for qf1, C1 for qf2, A1 for sf1
    await upsertKnockoutPick(db, predictionId, bracketMatchKey('qf1'), teamId('A1'));
    await upsertKnockoutPick(db, predictionId, bracketMatchKey('qf2'), teamId('C1'));
    await upsertKnockoutPick(db, predictionId, bracketMatchKey('sf1'), teamId('A1'));

    // A2 beats A1 → A2 becomes qf1 home; A1 pick invalid
    const mA1 = miniTournament.groupMatches.find(
      (m) => m.group === groupId('A') && m.home === teamId('A1') && m.away === teamId('A2'),
    )!;

    const inputs = await getPredictionInputs(db, predictionId);
    const updatedScores = [
      ...inputs.groupScores.filter((s) => s.matchId !== mA1.id),
      { matchId: mA1.id, home: 0, away: 1 },
    ];
    const newGroupOrders = deriveGroupOrders(miniTournament, updatedScores);
    const newQualifiers = selectQualifiers(miniTournament, updatedScores, newGroupOrders);

    await upsertGroupScore(db, predictionId, mA1.id, 0, 1);

    const invalidKeys = findInvalidatedPickKeys(
      miniTournament,
      newGroupOrders,
      newQualifiers,
      inputs.knockoutPicks,
    );
    await deleteKnockoutPicks(db, predictionId, invalidKeys);

    const after = await getPredictionInputs(db, predictionId);
    // qf1 and sf1 should both be gone
    expect(
      after.knockoutPicks.find((p) => p.bracketMatchKey === bracketMatchKey('qf1')),
    ).toBeUndefined();
    expect(
      after.knockoutPicks.find((p) => p.bracketMatchKey === bracketMatchKey('sf1')),
    ).toBeUndefined();
    // qf2 pick (C1) should still be present
    expect(
      after.knockoutPicks.find((p) => p.bracketMatchKey === bracketMatchKey('qf2')),
    ).toBeDefined();
  });

  it('does not delete picks when group score change does not affect qualifiers', async () => {
    await seedAllGroupScores(db, predictionId);

    // User picks A1 for qf1
    await upsertKnockoutPick(db, predictionId, bracketMatchKey('qf1'), teamId('A1'));

    // Change group A match A3 vs A4 (both non-qualifiers — won't affect 1A or 2A)
    const mA34 = miniTournament.groupMatches.find(
      (m) => m.group === groupId('A') && m.home === teamId('A3') && m.away === teamId('A4'),
    )!;

    const inputs = await getPredictionInputs(db, predictionId);
    const updatedScores = [
      ...inputs.groupScores.filter((s) => s.matchId !== mA34.id),
      { matchId: mA34.id, home: 2, away: 0 }, // A3 wins, but A3 is still 3rd
    ];
    const newGroupOrders = deriveGroupOrders(miniTournament, updatedScores);
    const newQualifiers = selectQualifiers(miniTournament, updatedScores, newGroupOrders);

    await upsertGroupScore(db, predictionId, mA34.id, 2, 0);

    const invalidKeys = findInvalidatedPickKeys(
      miniTournament,
      newGroupOrders,
      newQualifiers,
      inputs.knockoutPicks,
    );
    await deleteKnockoutPicks(db, predictionId, invalidKeys);

    const after = await getPredictionInputs(db, predictionId);
    // qf1 pick (A1) should still be present — A1 is still group A winner
    expect(
      after.knockoutPicks.find((p) => p.bracketMatchKey === bracketMatchKey('qf1')),
    ).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to confirm tests fail** (they should, since `findInvalidatedPickKeys` and `selectQualifiers` might not be exported yet — already done in Task 3, so these should now pass the engine parts, but `deleteKnockoutPicks` bug was already fixed in Task 1)

```bash
pnpm vitest run apps/web/src/features/predictions/application/invalidation.test.ts 2>&1 | tail -20
```

Expected: PASS (engine + db pieces are already in place from Tasks 1–3).

### Sub-step B: Wire invalidation into `saveGroupScore` and `ownerSaveGroupScore`

**Files:**

- Modify: `apps/web/src/features/predictions/api/actions.ts`

- [ ] **Step 3: Add imports to `actions.ts`**

Update the `@cup/engine` import at the top:

```typescript
import {
  bracketMatchKey as bmk,
  deriveGroupOrders,
  selectQualifiers,
  findInvalidatedPickKeys,
  matchId as mkId,
} from '@cup/engine';
import type { BracketMatchKey, MatchId, TeamId } from '@cup/engine';
```

Also add `deleteKnockoutPicks` and `getPredictionInputs` to the `@cup/db` import (they are already exported from `@cup/db` via the repo index):

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
  getPredictionInputs,
} from '@cup/db';
```

- [ ] **Step 4: Add a shared helper for the invalidation logic**

Add this private helper after the `rescoreAfterEdit` function (around line 65):

```typescript
async function invalidatePicksAfterGroupScoreChange(
  predictionId: string,
  matchId: string,
  home: number,
  away: number,
  tournamentDef: import('@cup/engine').Tournament,
  existingInputs: import('@cup/engine').CardInputs,
) {
  const updatedGroupScores = [
    ...existingInputs.groupScores.filter((s) => s.matchId !== (matchId as MatchId)),
    { matchId: matchId as MatchId, home, away },
  ];
  const newGroupOrders = deriveGroupOrders(tournamentDef, updatedGroupScores);
  const newQualifiers = selectQualifiers(tournamentDef, updatedGroupScores, newGroupOrders);

  return findInvalidatedPickKeys(
    tournamentDef,
    newGroupOrders,
    newQualifiers,
    existingInputs.knockoutPicks,
  );
}
```

- [ ] **Step 5: Update `saveGroupScore` to call the helper**

In `saveGroupScore`, after `const prediction = await getOrCreatePrediction(...)`, replace:

```typescript
await upsertGroupScore(db, prediction.id, mId, home, away);
await rescoreAfterEdit(prediction.id, poolId, userId, tournament.definition!);
```

with:

```typescript
const existingInputs = await getPredictionInputs(db, prediction.id);
await upsertGroupScore(db, prediction.id, mId, home, away);

const invalidKeys = await invalidatePicksAfterGroupScoreChange(
  prediction.id,
  mId,
  home,
  away,
  tournament.definition!,
  existingInputs,
);
if (invalidKeys.length > 0) {
  await deleteKnockoutPicks(db, prediction.id, invalidKeys);
}

await rescoreAfterEdit(prediction.id, poolId, userId, tournament.definition!);
```

- [ ] **Step 6: Update `ownerSaveGroupScore` similarly**

In `ownerSaveGroupScore`, after the audit record creation (`await createPredictionEdit(...)`), find:

```typescript
await rescoreAfterEdit(prediction.id, poolId, targetUserId, tournament.definition!);
```

and replace that block with:

```typescript
const invalidKeys = await invalidatePicksAfterGroupScoreChange(
  prediction.id,
  mId,
  home,
  away,
  tournament.definition!,
  oldInputs,
);
if (invalidKeys.length > 0) {
  await deleteKnockoutPicks(db, prediction.id, invalidKeys);
}

await rescoreAfterEdit(prediction.id, poolId, targetUserId, tournament.definition!);
```

Note: `ownerSaveGroupScore` already loads `oldInputs` for the audit log (line ~280), so reuse that — no extra DB call needed.

- [ ] **Step 7: Typecheck the actions file**

```bash
pnpm tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep "actions.ts" | head -10
```

Expected: no errors.

- [ ] **Step 8: Run full test suite**

```bash
pnpm vitest run 2>&1 | tail -20
```

Expected: all pass.

- [ ] **Step 9: Final commit (spec + all implementation)**

```bash
git add \
  packages/engine/src/bracket.ts \
  packages/engine/src/index.ts \
  packages/engine/src/bracket.test.ts \
  apps/web/src/features/predictions/application/get-card.ts \
  apps/web/src/features/predictions/application/get-card.test.ts \
  apps/web/src/features/predictions/application/invalidation.test.ts \
  apps/web/src/features/predictions/ui/BracketSection.tsx \
  apps/web/src/features/predictions/api/actions.ts \
  docs/superpowers/specs/2026-06-08-bracket-validation-design.md
git commit -m "feat: bracket validation — empty slots, qualifying highlight, cascade pick invalidation"
```

---

## Self-Review Checklist

- [x] **Spec coverage**: qualifying flag (Task 5 ✓), R32 empty slots (Task 5 ✓), both-team-missing disable (Task 6 ✓), cascade invalidation (Tasks 2–3, 7 ✓), tests for each (Tasks 2, 4, 7 ✓).
- [x] **Placeholder scan**: No TBD/TODO. All code blocks are complete.
- [x] **Type consistency**: `findInvalidatedPickKeys` signature consistent across bracket.ts, index.ts, and test. `resolveSlotTeam` new signature matches all call sites. `invalidatePicksAfterGroupScoreChange` helper uses `MatchId` cast consistently.
- [x] **Bug fix included**: `deleteKnockoutPicks` WHERE clause (`&&` → `and()`) fixed in Task 1 before any code calls it.
- [x] **`ownerSaveGroupScore` covered**: Task 7 Step 6 explicitly updates it and reuses the already-loaded `oldInputs`.
