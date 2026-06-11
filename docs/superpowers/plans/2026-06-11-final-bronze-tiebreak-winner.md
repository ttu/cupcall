# Final / 3rd-Place Tiebreak Winner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to explicitly pick the winner of the Final and 3rd-Place matches when their predicted scoreline is a tie, and persist the winner as a `knockoutPicks` row so the engine's Top‑4 derivation has a real source of truth.

**Architecture:** No schema or engine change. The `knockoutPicks` table and `engine.buildBracket` already support winner picks for `finalMatch` / `bronzeMatch`; the missing wiring is (a) the server actions writing the row, (b) the view model exposing it, (c) the UI rendering a winner picker only when the scoreline is tied, and (d) completion % treating tied + unset as incomplete.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Drizzle, Zod, Vitest + pglite integration tests, Auth.js. Predictions feature lives at `apps/web/src/features/predictions/`.

**Spec:** `docs/superpowers/specs/2026-06-11-final-bronze-tiebreak-winner-design.md`.

**Commit policy:** Spec, plan, code, and tests land as **one** commit at the end (after user manual-tests the change). Do not commit partial work.

---

## File map

| Path                                                             | Change                                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/predictions/domain/types.ts`              | Add `pickedWinnerId: TeamId \| null` to `FinishMatchView`.                                                  |
| `apps/web/src/features/predictions/application/get-card.ts`      | Populate `pickedWinnerId` for final/bronze; rework completion-count math.                                   |
| `apps/web/src/features/predictions/application/get-card.test.ts` | New cases for `pickedWinnerId` propagation + completion math.                                               |
| `apps/web/src/features/predictions/api/actions.ts`               | `saveFinishScore` + `ownerSaveFinishScore` auto-upsert implicit winner pick when score is non-tied.         |
| `apps/web/src/features/predictions/api/actions.test.ts`          | New cases covering all winner-derivation paths (non-tied, tied, owner variant, finalists-not-yet-resolved). |
| `apps/web/src/features/predictions/ui/BracketSection.tsx`        | Champion pill reads `pickedWinnerId`; render `WinnerPickRow` when score is tied.                            |
| `apps/web/src/features/predictions/ui/ReadOnlyCard.tsx`          | Show explicit winner under the Final card (and add a Bronze card section).                                  |

---

## Task 1: Extend `FinishMatchView` with `pickedWinnerId`

**Files:**

- Modify: `apps/web/src/features/predictions/domain/types.ts`

- [ ] **Step 1: Add the field**

In `apps/web/src/features/predictions/domain/types.ts`, replace the `FinishMatchView` block:

```ts
export type FinishMatchView = {
  homeTeamId: TeamId | null;
  homeTeamName: string | null;
  awayTeamId: TeamId | null;
  awayTeamName: string | null;
  predictedHome: number | null;
  predictedAway: number | null;
  /** Explicit winner pick (final/bronze knockoutPick). Null when not set. */
  pickedWinnerId: TeamId | null;
};
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm -C apps/web typecheck`
Expected: failures only in `get-card.ts` (building `finalView` / `bronzeView` without the new field) and possibly the BracketSection/ReadOnlyCard code that consumes the same shape. These are intentional — Task 2 and onward fix them.

---

## Task 2: Populate `pickedWinnerId` and fix completion math in `getCardView`

**Files:**

- Modify: `apps/web/src/features/predictions/application/get-card.ts`
- Test: `apps/web/src/features/predictions/application/get-card.test.ts`

- [ ] **Step 1: Write failing test — `pickedWinnerId` propagates**

Open `apps/web/src/features/predictions/application/get-card.test.ts`. Find the `describe('getCardView', ...)` block. Add the following test inside it (place near the other bracket-related cases — choose a position that keeps related tests grouped):

```ts
it('exposes pickedWinnerId for final and bronze from knockoutPicks', async () => {
  const { card } = await setup({
    groupScores: completeGroupScores,
    knockoutPicks: [
      { bracketMatchKey: 'qf1', winner: 'A1' },
      { bracketMatchKey: 'qf2', winner: 'C1' },
      { bracketMatchKey: 'qf3', winner: 'B1' },
      { bracketMatchKey: 'qf4', winner: 'D1' },
      { bracketMatchKey: 'sf1', winner: 'A1' },
      { bracketMatchKey: 'sf2', winner: 'B1' },
      { bracketMatchKey: 'final', winner: 'A1' },
      { bracketMatchKey: 'bronze', winner: 'C1' },
    ],
    finishScores: {
      final: { home: 1, away: 1 },
      bronze: { home: 0, away: 0 },
    },
  });

  expect(card.bracket.final.pickedWinnerId).toBe('A1');
  expect(card.bracket.bronze.pickedWinnerId).toBe('C1');
});
```

This test depends on an existing `setup` helper. If `setup`, `completeGroupScores`, or the `knockoutPicks` / `finishScores` arg shape doesn't already exist in the file, first read the file end-to-end and adapt the test to the existing harness (use whatever helpers populate `predictionGroupScores`, `predictionKnockoutPicks`, `predictionFinishScores`, then call `getCardView`). The substance of the assertion stays the same: `pickedWinnerId` reflects the stored knockout pick for `finalMatch` / `bronzeMatch`.

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm -C apps/web exec vitest run src/features/predictions/application/get-card.test.ts`
Expected: the new test fails — `pickedWinnerId` is undefined on the view.

- [ ] **Step 3: Implement — populate `pickedWinnerId`**

In `apps/web/src/features/predictions/application/get-card.ts`, edit the `finalView` and `bronzeView` constructors (currently around lines 204–220):

```ts
const finalView: FinishMatchView = {
  homeTeamId: finalist1 ?? null,
  homeTeamName: finalist1 ? (teamMap.get(finalist1) ?? finalist1) : null,
  awayTeamId: finalist2 ?? null,
  awayTeamName: finalist2 ? (teamMap.get(finalist2) ?? finalist2) : null,
  predictedHome: finalFinish?.home ?? null,
  predictedAway: finalFinish?.away ?? null,
  pickedWinnerId: (knockoutPickMap.get(bracket.finalMatch) as TeamId | undefined) ?? null,
};

const bronzeView: FinishMatchView = {
  homeTeamId: bronze1 ?? null,
  homeTeamName: bronze1 ? (teamMap.get(bronze1) ?? bronze1) : null,
  awayTeamId: bronze2 ?? null,
  awayTeamName: bronze2 ? (teamMap.get(bronze2) ?? bronze2) : null,
  predictedHome: bronzeFinish?.home ?? null,
  predictedAway: bronzeFinish?.away ?? null,
  pickedWinnerId: (knockoutPickMap.get(bracket.bronzeMatch) as TeamId | undefined) ?? null,
};
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm -C apps/web exec vitest run src/features/predictions/application/get-card.test.ts`
Expected: the `pickedWinnerId` test passes.

- [ ] **Step 5: Write failing test — tied + unset is incomplete**

Add to the same `describe`:

```ts
it('counts a tied final without a winner pick as incomplete', async () => {
  const { card } = await setup({
    groupScores: completeGroupScores,
    knockoutPicks: [
      { bracketMatchKey: 'qf1', winner: 'A1' },
      { bracketMatchKey: 'qf2', winner: 'C1' },
      { bracketMatchKey: 'qf3', winner: 'B1' },
      { bracketMatchKey: 'qf4', winner: 'D1' },
      { bracketMatchKey: 'sf1', winner: 'A1' },
      { bracketMatchKey: 'sf2', winner: 'B1' },
      // no final/bronze winner picks
    ],
    finishScores: {
      final: { home: 1, away: 1 }, // tied — needs explicit winner
      bronze: { home: 2, away: 0 }, // non-tied — implicit winner OK
    },
  });

  // The final entry should not count toward filled, the bronze entry should.
  // Build a baseline with the same inputs minus the final score to verify the delta.
  const { card: baseline } = await setup({
    groupScores: completeGroupScores,
    knockoutPicks: [
      { bracketMatchKey: 'qf1', winner: 'A1' },
      { bracketMatchKey: 'qf2', winner: 'C1' },
      { bracketMatchKey: 'qf3', winner: 'B1' },
      { bracketMatchKey: 'qf4', winner: 'D1' },
      { bracketMatchKey: 'sf1', winner: 'A1' },
      { bracketMatchKey: 'sf2', winner: 'B1' },
    ],
    finishScores: {
      bronze: { home: 2, away: 0 },
    },
  });

  expect(card.completionPercent).toBe(baseline.completionPercent);
});

it('counts a non-tied final as complete without an explicit winner pick', async () => {
  const { card: withFinal } = await setup({
    groupScores: completeGroupScores,
    knockoutPicks: [
      { bracketMatchKey: 'qf1', winner: 'A1' },
      { bracketMatchKey: 'qf2', winner: 'C1' },
      { bracketMatchKey: 'qf3', winner: 'B1' },
      { bracketMatchKey: 'qf4', winner: 'D1' },
      { bracketMatchKey: 'sf1', winner: 'A1' },
      { bracketMatchKey: 'sf2', winner: 'B1' },
    ],
    finishScores: {
      final: { home: 2, away: 1 },
    },
  });
  const { card: withoutFinal } = await setup({
    groupScores: completeGroupScores,
    knockoutPicks: [
      { bracketMatchKey: 'qf1', winner: 'A1' },
      { bracketMatchKey: 'qf2', winner: 'C1' },
      { bracketMatchKey: 'qf3', winner: 'B1' },
      { bracketMatchKey: 'qf4', winner: 'D1' },
      { bracketMatchKey: 'sf1', winner: 'A1' },
      { bracketMatchKey: 'sf2', winner: 'B1' },
    ],
    finishScores: {},
  });
  expect(withFinal.completionPercent).toBeGreaterThan(withoutFinal.completionPercent);
});

it('counts a tied final with an explicit winner pick as complete', async () => {
  const { card: tiedWithPick } = await setup({
    groupScores: completeGroupScores,
    knockoutPicks: [
      { bracketMatchKey: 'qf1', winner: 'A1' },
      { bracketMatchKey: 'qf2', winner: 'C1' },
      { bracketMatchKey: 'qf3', winner: 'B1' },
      { bracketMatchKey: 'qf4', winner: 'D1' },
      { bracketMatchKey: 'sf1', winner: 'A1' },
      { bracketMatchKey: 'sf2', winner: 'B1' },
      { bracketMatchKey: 'final', winner: 'A1' },
    ],
    finishScores: { final: { home: 1, away: 1 } },
  });
  const { card: nonTied } = await setup({
    groupScores: completeGroupScores,
    knockoutPicks: [
      { bracketMatchKey: 'qf1', winner: 'A1' },
      { bracketMatchKey: 'qf2', winner: 'C1' },
      { bracketMatchKey: 'qf3', winner: 'B1' },
      { bracketMatchKey: 'qf4', winner: 'D1' },
      { bracketMatchKey: 'sf1', winner: 'A1' },
      { bracketMatchKey: 'sf2', winner: 'B1' },
    ],
    finishScores: { final: { home: 2, away: 1 } },
  });
  expect(tiedWithPick.completionPercent).toBe(nonTied.completionPercent);
});
```

- [ ] **Step 6: Run tests, verify they fail**

Run: `pnpm -C apps/web exec vitest run src/features/predictions/application/get-card.test.ts`
Expected: the new completion tests fail — current code unconditionally counts a `finishScores[match]` row as 1 filled field.

- [ ] **Step 7: Implement — rework completion math**

In `apps/web/src/features/predictions/application/get-card.ts`, replace the completion block (currently around lines 258–275) with:

```ts
// 8. Completion
const finalFilled = isFinishFilled(
  inputs.finishScores.final,
  knockoutPickMap.get(bracket.finalMatch),
);
const bronzeFilled = isFinishFilled(
  inputs.finishScores.bronze,
  knockoutPickMap.get(bracket.bronzeMatch),
);

const totalFields =
  groups.reduce((acc, g) => acc + g.matches.length, 0) +
  bracket.slots.length +
  bracket.progression.filter(
    (p) => p.match !== bracket.bronzeMatch && p.match !== bracket.finalMatch,
  ).length +
  2 /* final + bronze scores */ +
  specials.length;
const filledFields =
  inputs.groupScores.length +
  inputs.knockoutPicks.filter(
    (kp) => kp.bracketMatchKey !== bracket.finalMatch && kp.bracketMatchKey !== bracket.bronzeMatch,
  ).length +
  (finalFilled ? 1 : 0) +
  (bronzeFilled ? 1 : 0) +
  Object.keys(inputs.specials).length;
const completionPercent = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;
```

Then, at the bottom of the file (alongside the other helpers), add:

```ts
function isFinishFilled(
  finishScore: { home: number; away: number } | undefined,
  pickedWinner: TeamId | undefined,
): boolean {
  if (!finishScore) return false;
  if (finishScore.home === finishScore.away) return pickedWinner !== undefined;
  return true;
}
```

- [ ] **Step 8: Run all get-card tests**

Run: `pnpm -C apps/web exec vitest run src/features/predictions/application/get-card.test.ts`
Expected: all tests pass.

- [ ] **Step 9: Run typecheck**

Run: `pnpm -C apps/web typecheck`
Expected: passes (the type error introduced in Task 1 is now resolved for `get-card.ts`; UI files may still fail until Task 4/5).

---

## Task 3: Auto-derive implicit winner pick from non-tied finish score

**Files:**

- Modify: `apps/web/src/features/predictions/api/actions.ts`
- Test: `apps/web/src/features/predictions/api/actions.test.ts`

The implicit derivation uses `deriveCard(...)` to find the two teams of the final/bronze and picks the higher-scoring side. If the finalists/bronze-pair haven't resolved (no SF picks yet), do nothing extra — just save the score.

- [ ] **Step 1: Wire setup boilerplate for finish-score tests**

In `apps/web/src/features/predictions/api/actions.test.ts`, scroll to the bottom. Add a new top-level `describe` block for `saveFinishScore`:

```ts
import { saveFinishScore, ownerSaveFinishScore } from './actions';
import {
  upsertKnockoutPick as dbUpsertKnockoutPick,
  upsertGroupScore as dbUpsertGroupScore,
} from '@cup/db';

describe('saveFinishScore — implicit winner derivation', () => {
  let poolId: string;
  let actorId: UserId;
  let predictionId: string;

  beforeAll(async () => {
    if (!testDb) {
      testDb = await makeTestDb();
      await upsertTournamentDef(testDb, miniTournament, firstKickoff, emptyKickoffs);
    }
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
    await addMember(testDb, poolId, actorId);

    const pred = await getOrCreatePrediction(testDb, {
      poolId,
      userId: actorId,
      tournamentId: 'mini-2026',
    });
    predictionId = pred.id;

    // Seed a complete-enough card so deriveCard can resolve the finalists/bronze pair:
    //   - group scores that produce a clear top-2 in every group
    //   - QF picks
    //   - SF picks (final/bronze winners depend on these)
    await seedCompleteGroupsAndQfSf(testDb, predictionId);

    mockedGetActor.mockResolvedValue({ userId: actorId });
  });
  // tests go here
});
```

Add the helper near the other helpers at the top (after the `firstKickoff` constant) — it seeds enough state so `deriveCard` returns concrete finalists. Use the `miniTournament` group structure (groups A–D, two qualify per group, qf1=1A vs 2B, qf2=1C vs 2D, qf3=1B vs 2A, qf4=1D vs 2C):

```ts
async function seedCompleteGroupsAndQfSf(db: typeof testDb, predictionId: string): Promise<void> {
  // Group scores: home team always wins 1-0 → group order is m1, m2, m3, m4 deterministic.
  const groups = ['A', 'B', 'C', 'D'] as const;
  for (const g of groups) {
    // 6 matches per group (round-robin among 4 teams); seed every one 1-0 home.
    const matches = miniTournament.groupMatches.filter((m) => m.group === g);
    for (const m of matches) {
      await dbUpsertGroupScore(db, predictionId, m.id, 1, 0);
    }
  }

  // QF + SF picks: pick home of each (qf1 = 1A, qf2 = 1C, qf3 = 1B, qf4 = 1D; sf1 winner = A1, sf2 winner = B1).
  await dbUpsertKnockoutPick(db, predictionId, bracketMatchKey('qf1'), 'A1');
  await dbUpsertKnockoutPick(db, predictionId, bracketMatchKey('qf2'), 'C1');
  await dbUpsertKnockoutPick(db, predictionId, bracketMatchKey('qf3'), 'B1');
  await dbUpsertKnockoutPick(db, predictionId, bracketMatchKey('qf4'), 'D1');
  await dbUpsertKnockoutPick(db, predictionId, bracketMatchKey('sf1'), 'A1');
  await dbUpsertKnockoutPick(db, predictionId, bracketMatchKey('sf2'), 'B1');
}
```

> NOTE: confirm `miniTournament.groupMatches` exists with that shape — if the existing test file already has helpers that seed groups, prefer reusing them. The substance is: by the end of this helper the prediction has finalists `[A1, B1]` and bronze pair `[C1, D1]`.

- [ ] **Step 2: Write failing test — non-tied final saves implicit winner pick**

Inside the new `describe('saveFinishScore — implicit winner derivation', ...)`:

```ts
it('upserts a knockoutPicks row for the higher side when final score is non-tied', async () => {
  const result = await saveFinishScore({ poolId, match: 'final', home: 2, away: 1 });
  expect(result).toEqual({ ok: true });

  const inputs = await getPredictionInputs(testDb, predictionId);
  expect(inputs.finishScores.final).toEqual({ home: 2, away: 1 });
  const pick = inputs.knockoutPicks.find((kp) => kp.bracketMatchKey === 'final');
  expect(pick?.winner).toBe('A1'); // finalists are [A1, B1]; higher side = home = A1
});

it('upserts a knockoutPicks row for the away side when home loses', async () => {
  const result = await saveFinishScore({ poolId, match: 'final', home: 0, away: 3 });
  expect(result).toEqual({ ok: true });

  const inputs = await getPredictionInputs(testDb, predictionId);
  const pick = inputs.knockoutPicks.find((kp) => kp.bracketMatchKey === 'final');
  expect(pick?.winner).toBe('B1'); // away side of finalists [A1, B1]
});

it('also derives winner for the bronze match', async () => {
  await saveFinishScore({ poolId, match: 'bronze', home: 3, away: 1 });
  const inputs = await getPredictionInputs(testDb, predictionId);
  const pick = inputs.knockoutPicks.find((kp) => kp.bracketMatchKey === 'bronze');
  expect(pick?.winner).toBe('C1'); // bronze pair is [C1, D1] (SF losers)
});

it('does NOT overwrite an existing pick when the score is tied', async () => {
  // Pre-seed an explicit pick (e.g. user previously chose B1 via the tie picker).
  await dbUpsertKnockoutPick(testDb, predictionId, bracketMatchKey('final'), 'B1');

  await saveFinishScore({ poolId, match: 'final', home: 1, away: 1 });

  const inputs = await getPredictionInputs(testDb, predictionId);
  expect(inputs.finishScores.final).toEqual({ home: 1, away: 1 });
  const pick = inputs.knockoutPicks.find((kp) => kp.bracketMatchKey === 'final');
  expect(pick?.winner).toBe('B1');
});

it('does not create a pick when finalists are not yet resolved', async () => {
  // Wipe the SF picks so deriveCard cannot resolve finalists.
  await testDb
    .delete(schema.predictionKnockoutPicks)
    .where(
      and(
        eq(schema.predictionKnockoutPicks.predictionId, predictionId),
        eq(schema.predictionKnockoutPicks.bracketMatchKey, bracketMatchKey('sf1')),
      ),
    );

  await saveFinishScore({ poolId, match: 'final', home: 2, away: 1 });

  const inputs = await getPredictionInputs(testDb, predictionId);
  expect(inputs.finishScores.final).toEqual({ home: 2, away: 1 });
  expect(inputs.knockoutPicks.find((kp) => kp.bracketMatchKey === 'final')).toBeUndefined();
});
```

Add the imports needed at the top of the file if missing:

```ts
import { and, eq } from 'drizzle-orm';
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `pnpm -C apps/web exec vitest run src/features/predictions/api/actions.test.ts -t 'implicit winner derivation'`
Expected: the new tests fail — no knockout pick is created.

- [ ] **Step 4: Implement — auto-derive in `saveFinishScore`**

In `apps/web/src/features/predictions/api/actions.ts`, add this helper above the `// ---- Save group score (own card) ----` section:

```ts
/**
 * Derive the implicit winner of a tied-vs-not-tied finish score.
 *
 * Returns the TeamId of the higher-scoring side using the resolved finalists / bronze pair,
 * or undefined when:
 *   - the score is tied (caller should leave any existing pick untouched), or
 *   - the finalists / bronze pair are not yet resolved (no SF picks).
 */
async function deriveFinishWinner(
  predictionId: string,
  match: 'final' | 'bronze',
  home: number,
  away: number,
  tournamentDef: Tournament,
): Promise<TeamId | undefined> {
  if (home === away) return undefined;

  const inputs = await getPredictionInputs(db, predictionId);
  const derived = deriveCard(inputs, tournamentDef);
  const pair = match === 'final' ? derived.finalists : derived.bronzePair;
  if (pair.length < 2) return undefined;

  const [homeSide, awaySide] = pair as [TeamId, TeamId];
  return home > away ? homeSide : awaySide;
}
```

Add the missing imports at the top of `actions.ts`:

```ts
import { deriveCard } from '@cup/engine';
```

Then in `saveFinishScore`, after the existing `await upsertFinishScore(db, prediction.id, match, home, away);` line and before the rescore call, insert:

```ts
const implicitWinner = await deriveFinishWinner(
  prediction.id,
  match,
  home,
  away,
  tournament.definition!,
);
if (implicitWinner !== undefined) {
  await upsertKnockoutPick(
    db,
    prediction.id,
    match === 'final'
      ? tournament.definition!.bracket.finalMatch
      : tournament.definition!.bracket.bronzeMatch,
    implicitWinner,
  );
}
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `pnpm -C apps/web exec vitest run src/features/predictions/api/actions.test.ts -t 'implicit winner derivation'`
Expected: all four tests pass.

---

## Task 4: Mirror the auto-derivation in `ownerSaveFinishScore`

**Files:**

- Modify: `apps/web/src/features/predictions/api/actions.ts`
- Test: `apps/web/src/features/predictions/api/actions.test.ts`

- [ ] **Step 1: Write failing test — owner path also derives the winner**

Add to `actions.test.ts` either inside the existing `saveFinishScore` describe or a new one:

```ts
describe('ownerSaveFinishScore — implicit winner derivation', () => {
  let poolId: string;
  let ownerId: UserId;
  let memberId: UserId;
  let predictionId: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    const owner = await createUser(testDb, {
      email: `o-${crypto.randomUUID()}@x.com`,
      displayName: 'Owner',
    });
    const member = await createUser(testDb, {
      email: `m-${crypto.randomUUID()}@x.com`,
      displayName: 'Alice',
    });
    ownerId = owner.id;
    memberId = member.id;

    const pool = await dbCreatePool(testDb, {
      tournamentId: 'mini-2026',
      ownerId,
      name: 'Owner Pool',
      inviteTokenHash: `h-${crypto.randomUUID()}`,
    });
    poolId = pool.id;
    await addMember(testDb, poolId, memberId);

    const pred = await getOrCreatePrediction(testDb, {
      poolId,
      userId: memberId,
      tournamentId: 'mini-2026',
    });
    predictionId = pred.id;
    await seedCompleteGroupsAndQfSf(testDb, predictionId);

    mockedGetActor.mockResolvedValue({ userId: ownerId });
  });

  it('upserts implicit winner pick when owner saves a non-tied final score', async () => {
    const result = await ownerSaveFinishScore({
      poolId,
      targetUserId: memberId,
      match: 'final',
      home: 3,
      away: 1,
    });
    expect(result).toEqual({ ok: true });

    const inputs = await getPredictionInputs(testDb, predictionId);
    const pick = inputs.knockoutPicks.find((kp) => kp.bracketMatchKey === 'final');
    expect(pick?.winner).toBe('A1');
  });

  it('does not overwrite an existing pick on a tied owner-save', async () => {
    await dbUpsertKnockoutPick(testDb, predictionId, bracketMatchKey('final'), 'B1');

    await ownerSaveFinishScore({
      poolId,
      targetUserId: memberId,
      match: 'final',
      home: 2,
      away: 2,
    });

    const inputs = await getPredictionInputs(testDb, predictionId);
    const pick = inputs.knockoutPicks.find((kp) => kp.bracketMatchKey === 'final');
    expect(pick?.winner).toBe('B1');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm -C apps/web exec vitest run src/features/predictions/api/actions.test.ts -t 'ownerSaveFinishScore'`
Expected: tests fail.

- [ ] **Step 3: Implement — mirror the derivation in the owner path**

In `apps/web/src/features/predictions/api/actions.ts`, inside `ownerSaveFinishScore`, after `await upsertFinishScore(db, prediction.id, match, home, away);` and **before** the `createPredictionEdit` call, insert:

```ts
const implicitWinner = await deriveFinishWinner(
  prediction.id,
  match,
  home,
  away,
  tournament.definition!,
);
if (implicitWinner !== undefined) {
  await upsertKnockoutPick(
    db,
    prediction.id,
    match === 'final'
      ? tournament.definition!.bracket.finalMatch
      : tournament.definition!.bracket.bronzeMatch,
    implicitWinner,
  );
}
```

Audit-log only the score change — the implicit winner pick is a derived side-effect, not a separate user-visible field worth logging.

- [ ] **Step 4: Run tests, verify they pass**

Run: `pnpm -C apps/web exec vitest run src/features/predictions/api/actions.test.ts -t 'ownerSaveFinishScore'`
Expected: tests pass.

---

## Task 5: UI — render the winner picker when score is tied

**Files:**

- Modify: `apps/web/src/features/predictions/ui/BracketSection.tsx`

The `FinalCard` already receives `match: FinishMatchView` (now including `pickedWinnerId`). We replace the inferred-from-score `champion` calculation with a direct read of `pickedWinnerId`, and render two pick buttons when the score is tied.

- [ ] **Step 1: Replace the `champion` derivation**

In `apps/web/src/features/predictions/ui/BracketSection.tsx`, in `FinalCard`, replace:

```tsx
const champion =
  match.predictedHome !== null && match.predictedAway !== null
    ? match.predictedHome >= match.predictedAway
      ? { teamId: match.homeTeamId, teamName: match.homeTeamName }
      : { teamId: match.awayTeamId, teamName: match.awayTeamName }
    : null;
```

with:

```tsx
const champion = (() => {
  if (match.pickedWinnerId === null) return null;
  if (match.pickedWinnerId === match.homeTeamId) {
    return { teamId: match.homeTeamId, teamName: match.homeTeamName };
  }
  if (match.pickedWinnerId === match.awayTeamId) {
    return { teamId: match.awayTeamId, teamName: match.awayTeamName };
  }
  return null;
})();

const scoreIsTied =
  match.predictedHome !== null &&
  match.predictedAway !== null &&
  match.predictedHome === match.predictedAway;

const bothTeamsResolved = match.homeTeamId !== null && match.awayTeamId !== null;
const needsTiebreak = scoreIsTied && bothTeamsResolved;
```

- [ ] **Step 2: Thread the winner-pick callback through `FinalCard` props**

`FinalCard` already lives inside `BracketSection`, which receives `onPick?`. Extend `FinalCard`'s props with the same shape:

```tsx
function FinalCard({
  match,
  matchKey,
  poolId,
  locked,
  onSave,
  onPickWinner,
}: {
  match: FinishMatchView;
  matchKey: 'final' | 'bronze';
  poolId: string;
  locked: boolean;
  onSave: (match: 'final' | 'bronze', home: number, away: number) => void | Promise<void>;
  onPickWinner: (matchKey: 'final' | 'bronze', winner: string) => void;
}) {
```

Then at the two `<FinalCard ...>` call sites inside `BracketSection`, pass `onPickWinner={(mk, w) => handlePick(mk, w)}` — `handlePick` already dispatches `saveKnockoutPick` (or the upstream `onPick` override for the owner editor).

- [ ] **Step 3: Render the winner-pick row when tied**

Inside `FinalCard`'s returned JSX, **immediately after** the closing `</div>` of the "Match row: home | score | away" grid and **before** the `{champion?.teamId && (...)}` pill block, add:

```tsx
{
  needsTiebreak && !locked && (
    <div
      data-testid={`${matchKey}-winner-picker`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '6px 10px 10px',
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: isFinal ? 'var(--on-dark-soft)' : 'var(--ink-muted)',
          textAlign: 'center',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        Pick the shootout winner
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          data-testid={`${matchKey}-pick-home`}
          aria-pressed={match.pickedWinnerId === match.homeTeamId}
          onClick={() => match.homeTeamId && onPickWinner(matchKey, match.homeTeamId)}
          disabled={!match.homeTeamId}
          style={tieButtonStyle(match.pickedWinnerId === match.homeTeamId, isFinal)}
        >
          {match.homeTeamName ?? '—'}
        </button>
        <button
          type="button"
          data-testid={`${matchKey}-pick-away`}
          aria-pressed={match.pickedWinnerId === match.awayTeamId}
          onClick={() => match.awayTeamId && onPickWinner(matchKey, match.awayTeamId)}
          disabled={!match.awayTeamId}
          style={tieButtonStyle(match.pickedWinnerId === match.awayTeamId, isFinal)}
        >
          {match.awayTeamName ?? '—'}
        </button>
      </div>
    </div>
  );
}
```

Add a tiny style helper above `FinalCard` (file-scope):

```tsx
function tieButtonStyle(isPick: boolean, isFinal: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '6px 8px',
    borderRadius: 7,
    border: isPick
      ? '1px solid var(--green-300)'
      : `1px solid ${isFinal ? 'rgba(255,255,255,.12)' : 'var(--line)'}`,
    background: isPick ? 'var(--green-050)' : isFinal ? 'rgba(255,255,255,.04)' : 'transparent',
    color: isPick ? 'var(--green-700)' : isFinal ? 'var(--on-dark)' : 'var(--ink)',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  };
}
```

(Import `React` for the `CSSProperties` type if it isn't already imported; the file already uses TSX so `import type { ReactElement } from 'react';` is in place — add `CSSProperties` to that import.)

- [ ] **Step 4: Verify typecheck**

Run: `pnpm -C apps/web typecheck`
Expected: passes.

- [ ] **Step 5: Verify the dev server compiles and the page renders**

(Manual gate; deferred to the user's later browser test. No code change here.)

---

## Task 6: ReadOnlyCard — show explicit winner under the Final card

**Files:**

- Modify: `apps/web/src/features/predictions/ui/ReadOnlyCard.tsx`

The current ReadOnlyCard only renders the Final block (no Bronze). To stay scope-minimal we (a) add an explicit "Winner: TEAM" line to the existing Final block and (b) add a sibling Bronze block mirroring it. Existing tests should not need updates beyond the type addition.

- [ ] **Step 1: Add a "Winner" row to the existing Final block**

Inside `ReadOnlyCard.tsx`, immediately after the Final block's `</div>` that closes the score row (the one that holds `homeTeamName ... predictedHome–predictedAway ... awayTeamName`), insert:

```tsx
{
  card.bracket.final.predictedHome === card.bracket.final.predictedAway &&
    card.bracket.final.predictedHome !== null && (
      <div
        style={{
          padding: '6px 16px 12px',
          fontSize: 12,
          color: 'var(--on-dark-soft)',
          textAlign: 'center',
        }}
      >
        Winner:{' '}
        <span style={{ color: 'var(--on-dark)', fontWeight: 700 }}>
          {card.bracket.final.pickedWinnerId === card.bracket.final.homeTeamId
            ? card.bracket.final.homeTeamName
            : card.bracket.final.pickedWinnerId === card.bracket.final.awayTeamId
              ? card.bracket.final.awayTeamName
              : '—'}
        </span>
      </div>
    );
}
```

- [ ] **Step 2: Add a Bronze block mirroring the Final block**

Immediately after the closing `</div>` of the Final card block (the outer wrapper, just before the close of the `<section aria-label="Bracket picks">`), add a sibling block that renders `card.bracket.bronze`. Use the same markup as the Final block but with `'3rd Place'` as the title, lighter chrome (use `'var(--surface)'` background and `1px solid var(--line-soft)` border instead of the gold/dark surface):

```tsx
{
  /* 3rd Place */
}
<div
  className="card"
  style={{
    overflow: 'hidden',
  }}
>
  <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line-soft)' }}>
    <span className="display" style={{ fontSize: 15, color: 'var(--ink)' }}>
      3rd Place
    </span>
  </div>
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
    <span
      style={{
        flex: 1,
        textAlign: 'right',
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--ink)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {card.bracket.bronze.homeTeamName ?? '—'} {teamFlag(card.bracket.bronze.homeTeamId)}
    </span>
    <span
      className="display tnum"
      style={{ fontSize: 22, color: 'var(--ink)', minWidth: 56, textAlign: 'center' }}
    >
      {card.bracket.bronze.predictedHome !== null
        ? `${card.bracket.bronze.predictedHome}–${card.bracket.bronze.predictedAway}`
        : '–'}
    </span>
    <span
      style={{
        flex: 1,
        fontSize: 13,
        fontWeight: 700,
        color: 'var(--ink)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {teamFlag(card.bracket.bronze.awayTeamId)} {card.bracket.bronze.awayTeamName ?? '—'}
    </span>
  </div>
  {card.bracket.bronze.predictedHome === card.bracket.bronze.predictedAway &&
    card.bracket.bronze.predictedHome !== null && (
      <div
        style={{
          padding: '6px 16px 12px',
          fontSize: 12,
          color: 'var(--ink-muted)',
          textAlign: 'center',
        }}
      >
        Winner:{' '}
        <span style={{ color: 'var(--ink)', fontWeight: 700 }}>
          {card.bracket.bronze.pickedWinnerId === card.bracket.bronze.homeTeamId
            ? card.bracket.bronze.homeTeamName
            : card.bracket.bronze.pickedWinnerId === card.bracket.bronze.awayTeamId
              ? card.bracket.bronze.awayTeamName
              : '—'}
        </span>
      </div>
    )}
</div>;
```

- [ ] **Step 3: Typecheck**

Run: `pnpm -C apps/web typecheck`
Expected: passes.

---

## Task 7: Full gate — format, lint, typecheck, test, build

- [ ] **Step 1: Run the full gate**

Run, from repo root: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm -C apps/web build`
Expected: all green.

- [ ] **Step 2: Format & re-run lint**

If `format:check` fails, run `pnpm format` and re-run from Step 1.

- [ ] **Step 3: Stop here — wait for user manual test**

Do **not** commit yet. The user wants to verify the behaviour in the browser before commit.

---

## Task 8: After the user confirms — single commit

- [ ] **Step 1: Stage everything**

Stage the spec, plan, code, and tests:

```bash
git add docs/superpowers/specs/2026-06-11-final-bronze-tiebreak-winner-design.md \
        docs/superpowers/plans/2026-06-11-final-bronze-tiebreak-winner.md \
        apps/web/src/features/predictions/domain/types.ts \
        apps/web/src/features/predictions/application/get-card.ts \
        apps/web/src/features/predictions/application/get-card.test.ts \
        apps/web/src/features/predictions/api/actions.ts \
        apps/web/src/features/predictions/api/actions.test.ts \
        apps/web/src/features/predictions/ui/BracketSection.tsx \
        apps/web/src/features/predictions/ui/ReadOnlyCard.tsx
```

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(predict): pick shootout winner for tied final and 3rd place

For the Final and 3rd Place matches, allow the user to explicitly pick
the shootout winner when the predicted scoreline is a tie. Non-tied
scores auto-derive the implicit winner. The winner is stored as a
knockoutPicks row so engine.buildBracket has a real source of truth for
the Top-4 derivation. Tied score without a winner pick counts as
incomplete in the completion %.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Verify commit**

Run: `git status`
Expected: clean working tree, one new commit on the current branch.

---

## Self-review

- Spec coverage: every "Files changed" entry in the spec maps to a task above (types → T1, get-card → T2, actions → T3+T4, BracketSection → T5, ReadOnlyCard → T6).
- No placeholders: every step shows the exact code or command. Helper functions are named consistently across tasks (`deriveFinishWinner`, `isFinishFilled`, `seedCompleteGroupsAndQfSf`, `tieButtonStyle`).
- The implementation order is: type → view model → behaviour → UI, so each task compiles after its own changes (Task 1 leaves a temporary mismatch in `get-card.ts` that Task 2 resolves — called out explicitly).
- Commit gating: spec + plan + code land together, after the user manual-tests, as required.
