# Top Four Position Bonus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a +3pt/team position-accuracy bonus to Top Four (semifinalists) scoring — on top of
the existing 5pt/team membership points — awarded when a player's predicted final-standing slot
(1st/2nd from the Final, 3rd/4th from Bronze) exactly matches the actual slot, banked incrementally
as the Final and Bronze matches complete.

**Architecture:** Extend `scoreTopFour` (packages/engine) to sum membership (unchanged) + a new
position-bonus term computed from the existing `DerivedCard.topFour` vs a new required
`winner: TeamId` field on `ActualFinishMatch`. Propagate the new `Scoring.topFourPositionBonus`
config field and the new `winner` field through schemas, sync, and every fixture that constructs
these types. Update all three duplicated "ceiling" calculations (engine + two web-layer) so
projections stay consistent with the new max.

**Tech Stack:** TypeScript strict, Zod schemas, Vitest, Drizzle/pglite (unaffected — no migration,
`winner` rides inside existing JSONB answer values).

## Global Constraints

- TypeScript strict — no `any`, no unsafe casts (per CLAUDE.md).
- Mock only at system boundaries; prefer real collaborators (per CLAUDE.md TDD section).
- **No commits until the final task** — this whole feature lands as a single commit per user
  instruction, overriding the usual per-task commit cadence.
- Run `pnpm format && pnpm lint && pnpm typecheck` and the affected test suites after each task;
  do not proceed to the next task with a red suite.
- Ubiquitous language: use `topFourPositionBonus`, membership vs. position bonus, exactly as named
  in the spec (`docs/superpowers/specs/2026-07-15-topfour-position-bonus-design.md`).

---

## Task 1: Add `winner` to `ActualFinishMatch` and thread it through

**Why first:** the position-bonus logic in Task 2 depends on `actual.finalMatch.winner` /
`actual.bronzeMatch.winner` existing. Making `winner` required means every existing call site must
be updated in the same task, or the build won't compile — so this has to land as one atomic unit.

**Files:**

- Modify: `packages/engine/src/types.ts` (`ActualFinishMatch`)
- Modify: `packages/schemas/src/results.ts` (`actualFinishMatchSchema`, `finalMatchSchema`, the
  `resultsSchema` transform, `ResultsInput` type)
- Modify: `scripts/sync.ts` (merged `finalMatch`/`bronzeMatch` construction)
- Modify: `packages/db/src/repositories/actual-results.ts` (`getActualResults`)
- Modify: `data/tournaments/test-wc-2026/results.json` (real fixture with a penalty-decided Final)
- Modify (add `winner:` to existing literals): `apps/web/src/features/dev-tools/api/dev-actions.ts`,
  `packages/db/src/repositories/tournament.test.ts`,
  `packages/engine/src/scoring/finish-matches.test.ts`,
  `packages/engine/src/scoring/specials.test.ts`, `packages/schemas/src/results.test.ts`

**Interfaces:**

- Produces: `ActualFinishMatch.winner: TeamId` (required) — consumed by Task 2's
  `scorePositionBonus`.

- [ ] **Step 1: Add `winner` to the engine type**

In `packages/engine/src/types.ts`, find:

```ts
export interface ActualFinishMatch {
  home: TeamId;
  away: TeamId;
  homeGoals: number;
  awayGoals: number;
}
```

Replace with:

```ts
export interface ActualFinishMatch {
  home: TeamId;
  away: TeamId;
  homeGoals: number;
  awayGoals: number;
  /** Not derivable from goals alone when the match went to penalties (tied goals). */
  winner: TeamId;
}
```

- [ ] **Step 2: Add `winner` to the results schema and transform**

In `packages/schemas/src/results.ts`, find:

```ts
const actualFinishMatchSchema = z.object({
  home: teamIdSchema,
  away: teamIdSchema,
  homeGoals: z.number().int().nonnegative(),
  awayGoals: z.number().int().nonnegative(),
});
```

Replace with:

```ts
const actualFinishMatchSchema = z.object({
  home: teamIdSchema,
  away: teamIdSchema,
  homeGoals: z.number().int().nonnegative(),
  awayGoals: z.number().int().nonnegative(),
  winner: teamIdSchema,
});
```

Then in the transform, find:

```ts
if (v.bronzeMatch !== undefined) {
  base.bronzeMatch = v.bronzeMatch;
}
if (v.finalMatch !== undefined) {
  const fm = v.finalMatch;
  base.finalMatch = {
    home: fm.home,
    away: fm.away,
    homeGoals: fm.homeGoals,
    awayGoals: fm.awayGoals,
    ...(fm.decidedBy !== undefined && { decidedBy: fm.decidedBy }),
    ...(fm.decisiveGoalPlayer !== undefined && { decisiveGoalPlayer: fm.decisiveGoalPlayer }),
  };
}
```

Replace with:

```ts
if (v.bronzeMatch !== undefined) {
  base.bronzeMatch = v.bronzeMatch;
}
if (v.finalMatch !== undefined) {
  const fm = v.finalMatch;
  base.finalMatch = {
    home: fm.home,
    away: fm.away,
    homeGoals: fm.homeGoals,
    awayGoals: fm.awayGoals,
    winner: fm.winner,
    ...(fm.decidedBy !== undefined && { decidedBy: fm.decidedBy }),
    ...(fm.decisiveGoalPlayer !== undefined && { decisiveGoalPlayer: fm.decisiveGoalPlayer }),
  };
}
```

Then update the exported `ResultsInput` type — find:

```ts
  bronzeMatch?: { home: string; away: string; homeGoals: number; awayGoals: number };
  finalMatch?: {
    home: string;
    away: string;
    homeGoals: number;
    awayGoals: number;
    decidedBy?: 'regulation' | 'extraTime' | 'penalties';
    decisiveGoalPlayer?: string;
  };
```

Replace with:

```ts
  bronzeMatch?: { home: string; away: string; homeGoals: number; awayGoals: number; winner: string };
  finalMatch?: {
    home: string;
    away: string;
    homeGoals: number;
    awayGoals: number;
    winner: string;
    decidedBy?: 'regulation' | 'extraTime' | 'penalties';
    decisiveGoalPlayer?: string;
  };
```

- [ ] **Step 3: Thread `winner` through sync.ts's merged Final/Bronze construction**

In `scripts/sync.ts`, find:

```ts
    ...(derivedBronzeMatch !== undefined && {
      bronzeMatch: {
        home: teamId(derivedBronzeMatch.home),
        away: teamId(derivedBronzeMatch.away),
        homeGoals: derivedBronzeMatch.homeGoals,
        awayGoals: derivedBronzeMatch.awayGoals,
      },
    }),
    ...(derivedFinalMatch !== undefined && {
      finalMatch: {
        home: teamId(derivedFinalMatch.home),
        away: teamId(derivedFinalMatch.away),
        homeGoals: derivedFinalMatch.homeGoals,
        awayGoals: derivedFinalMatch.awayGoals,
        ...(derivedFinalMatch.decidedBy !== undefined && {
          decidedBy: derivedFinalMatch.decidedBy,
        }),
      },
    }),
```

Replace with:

```ts
    ...(derivedBronzeMatch !== undefined && {
      bronzeMatch: {
        home: teamId(derivedBronzeMatch.home),
        away: teamId(derivedBronzeMatch.away),
        homeGoals: derivedBronzeMatch.homeGoals,
        awayGoals: derivedBronzeMatch.awayGoals,
        winner: teamId(derivedBronzeMatch.winner),
      },
    }),
    ...(derivedFinalMatch !== undefined && {
      finalMatch: {
        home: teamId(derivedFinalMatch.home),
        away: teamId(derivedFinalMatch.away),
        homeGoals: derivedFinalMatch.homeGoals,
        awayGoals: derivedFinalMatch.awayGoals,
        winner: teamId(derivedFinalMatch.winner),
        ...(derivedFinalMatch.decidedBy !== undefined && {
          decidedBy: derivedFinalMatch.decidedBy,
        }),
      },
    }),
```

- [ ] **Step 4: Read `winner` in the DB repository**

In `packages/db/src/repositories/actual-results.ts`, find:

```ts
const bronzeMatch: ActualResults['bronzeMatch'] = rawBronze
  ? {
      home: teamId(rawBronze.home as string),
      away: teamId(rawBronze.away as string),
      homeGoals: rawBronze.homeGoals as number,
      awayGoals: rawBronze.awayGoals as number,
    }
  : undefined;
```

Replace with:

```ts
const bronzeMatch: ActualResults['bronzeMatch'] = rawBronze
  ? {
      home: teamId(rawBronze.home as string),
      away: teamId(rawBronze.away as string),
      homeGoals: rawBronze.homeGoals as number,
      awayGoals: rawBronze.awayGoals as number,
      winner: teamId(rawBronze.winner as string),
    }
  : undefined;
```

Then find:

```ts
const finalMatch: ActualResults['finalMatch'] = rawFinal
  ? {
      home: teamId(rawFinal.home as string),
      away: teamId(rawFinal.away as string),
      homeGoals: rawFinal.homeGoals as number,
      awayGoals: rawFinal.awayGoals as number,
      ...(rawFinalDecidedBy !== undefined ? { decidedBy: rawFinalDecidedBy } : {}),
      ...(finalDecisiveGoalPlayer !== undefined
        ? { decisiveGoalPlayer: finalDecisiveGoalPlayer }
        : {}),
    }
  : undefined;
```

Replace with:

```ts
const finalMatch: ActualResults['finalMatch'] = rawFinal
  ? {
      home: teamId(rawFinal.home as string),
      away: teamId(rawFinal.away as string),
      homeGoals: rawFinal.homeGoals as number,
      awayGoals: rawFinal.awayGoals as number,
      winner: teamId(rawFinal.winner as string),
      ...(rawFinalDecidedBy !== undefined ? { decidedBy: rawFinalDecidedBy } : {}),
      ...(finalDecisiveGoalPlayer !== undefined
        ? { decisiveGoalPlayer: finalDecisiveGoalPlayer }
        : {}),
    }
  : undefined;
```

- [ ] **Step 5: Backfill the real fixture data file**

In `data/tournaments/test-wc-2026/results.json`, find:

```json
  "bronzeMatch": {
    "home": "GER",
    "away": "BRA",
    "homeGoals": 2,
    "awayGoals": 1
  },
  "finalMatch": {
    "home": "ESP",
    "away": "ARG",
    "homeGoals": 1,
    "awayGoals": 1,
    "decidedBy": "penalties"
  },
```

Replace with:

```json
  "bronzeMatch": {
    "home": "GER",
    "away": "BRA",
    "homeGoals": 2,
    "awayGoals": 1,
    "winner": "GER"
  },
  "finalMatch": {
    "home": "ESP",
    "away": "ARG",
    "homeGoals": 1,
    "awayGoals": 1,
    "winner": "ESP",
    "decidedBy": "penalties"
  },
```

- [ ] **Step 6: Add `winner` to every existing test/seed literal**

Add a `winner` field to each `ActualFinishMatch`-shaped object literal below, set to whichever team
the literal's own `homeGoals`/`awayGoals` already implies won (higher goals wins; this is purely
mechanical — it does not change any test's behavior since no existing code reads `winner` yet).

`apps/web/src/features/dev-tools/api/dev-actions.ts` — find:

```ts
    bronzeMatch: { home: teamId('GER'), away: teamId('BRA'), homeGoals: 2, awayGoals: 1 },
    finalMatch: {
      home: teamId('ESP'),
      away: teamId('ARG'),
      homeGoals: 1,
      awayGoals: 1,
      decidedBy: 'penalties',
    },
```

Replace with:

```ts
    bronzeMatch: {
      home: teamId('GER'),
      away: teamId('BRA'),
      homeGoals: 2,
      awayGoals: 1,
      winner: teamId('GER'),
    },
    finalMatch: {
      home: teamId('ESP'),
      away: teamId('ARG'),
      homeGoals: 1,
      awayGoals: 1,
      winner: teamId('ESP'),
      decidedBy: 'penalties',
    },
```

`packages/db/src/repositories/tournament.test.ts` — find:

```ts
        bronzeMatch: { home: teamId('A1'), away: teamId('B1'), homeGoals: 2, awayGoals: 0 },
        finalMatch: {
          home: teamId('C1'),
          away: teamId('D1'),
          homeGoals: 1,
          awayGoals: 0,
          decidedBy: 'regulation',
        },
```

Replace with:

```ts
        bronzeMatch: {
          home: teamId('A1'),
          away: teamId('B1'),
          homeGoals: 2,
          awayGoals: 0,
          winner: teamId('A1'),
        },
        finalMatch: {
          home: teamId('C1'),
          away: teamId('D1'),
          homeGoals: 1,
          awayGoals: 0,
          winner: teamId('C1'),
          decidedBy: 'regulation',
        },
```

`packages/schemas/src/results.test.ts` — find:

```ts
  bronzeMatch: { home: 'NED', away: 'POR', homeGoals: 2, awayGoals: 1 },
  finalMatch: {
    home: 'ARG',
    away: 'FRA',
    homeGoals: 3,
    awayGoals: 2,
    decidedBy: 'penalties',
    decisiveGoalPlayer: 'ARG-10',
  },
```

Replace with:

```ts
  bronzeMatch: { home: 'NED', away: 'POR', homeGoals: 2, awayGoals: 1, winner: 'NED' },
  finalMatch: {
    home: 'ARG',
    away: 'FRA',
    homeGoals: 3,
    awayGoals: 2,
    winner: 'ARG',
    decidedBy: 'penalties',
    decisiveGoalPlayer: 'ARG-10',
  },
```

`packages/engine/src/scoring/finish-matches.test.ts` — apply each of these 11 replacements (all
within `finalMatch: {...}` / `bronzeMatch: {...}` object literals passed to `makeActual`; add
`winner:` right after `awayGoals`, using the team with more goals):

| Line (approx) | Old                                                                              | New                                                                                          |
| ------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 63            | `finalMatch: { home: A1, away: A2, homeGoals: 3, awayGoals: 2 },`                | `finalMatch: { home: A1, away: A2, homeGoals: 3, awayGoals: 2, winner: A1 },`                |
| 72            | `finalMatch: { home: A1, away: A2, homeGoals: 3, awayGoals: 2 },`                | `finalMatch: { home: A1, away: A2, homeGoals: 3, awayGoals: 2, winner: A1 },`                |
| 82            | `finalMatch: { home: A1, away: B1, homeGoals: 3, awayGoals: 2 },`                | `finalMatch: { home: A1, away: B1, homeGoals: 3, awayGoals: 2, winner: A1 },`                |
| 92            | `finalMatch: { home: A2, away: A1, homeGoals: 2, awayGoals: 3 }, // actual 2-3`  | `finalMatch: { home: A2, away: A1, homeGoals: 2, awayGoals: 3, winner: A1 }, // actual 2-3`  |
| 101           | `finalMatch: { home: B1, away: B2, homeGoals: 3, awayGoals: 2 }, // actual 3-2`  | `finalMatch: { home: B1, away: B2, homeGoals: 3, awayGoals: 2, winner: B1 }, // actual 3-2`  |
| 110           | `finalMatch: { home: B1, away: B2, homeGoals: 3, awayGoals: 2 },`                | `finalMatch: { home: B1, away: B2, homeGoals: 3, awayGoals: 2, winner: B1 },`                |
| 127           | `finalMatch: { home: A1, away: A2, homeGoals: 3, awayGoals: 2 },`                | `finalMatch: { home: A1, away: A2, homeGoals: 3, awayGoals: 2, winner: A1 },`                |
| 158           | `finalMatch: { home: A1, away: A2, homeGoals: 3, awayGoals: 2 },`                | `finalMatch: { home: A1, away: A2, homeGoals: 3, awayGoals: 2, winner: A1 },`                |
| 169           | `bronzeMatch: { home: B1, away: B2, homeGoals: 1, awayGoals: 0 },`               | `bronzeMatch: { home: B1, away: B2, homeGoals: 1, awayGoals: 0, winner: B1 },`               |
| 188           | `bronzeMatch: { home: B1, away: B2, homeGoals: 2, awayGoals: 1 },`               | `bronzeMatch: { home: B1, away: B2, homeGoals: 2, awayGoals: 1, winner: B1 },`               |
| 197           | `bronzeMatch: { home: B2, away: B1, homeGoals: 0, awayGoals: 3 }, // actual 0-3` | `bronzeMatch: { home: B2, away: B1, homeGoals: 0, awayGoals: 3, winner: B1 }, // actual 0-3` |

Since several of these lines are textually identical (e.g. lines 63/72/127/158 are all
`finalMatch: { home: A1, away: A2, homeGoals: 3, awayGoals: 2 },`), use each occurrence's
surrounding `it(...)` block to disambiguate when editing (do not use a blind replace-all — replace
each occurrence individually in file order).

`packages/engine/src/scoring/specials.test.ts` — this file constructs `finalMatch` via a
`makeActual({}, {...})` second positional argument, all shaped `{ home, away, homeGoals, awayGoals,
... }`. Add `winner: ARG` to every one (all 5 occurrences use `home: ARG, away: teamId('FRA'),
homeGoals: 3, awayGoals: 2` or similar with ARG as the higher-goals team):

Find each of these (5 occurrences, at approx. lines 173, 188, 197-206, 212-220, 233):

```ts
      { home: ARG, away: teamId('FRA'), homeGoals: 3, awayGoals: 2, decidedBy: 'penalties' },
```

Replace with:

```ts
      { home: ARG, away: teamId('FRA'), homeGoals: 3, awayGoals: 2, winner: ARG, decidedBy: 'penalties' },
```

(this exact string appears at lines 173 and 188 — replace both)

Find (line ~197-206):

```ts
      {
        home: ARG,
        away: teamId('FRA'),
        homeGoals: 3,
        awayGoals: 2,
        decisiveGoalPlayer: GOAL_SCORER,
      },
```

Replace with:

```ts
      {
        home: ARG,
        away: teamId('FRA'),
        homeGoals: 3,
        awayGoals: 2,
        winner: ARG,
        decisiveGoalPlayer: GOAL_SCORER,
      },
```

(this exact string appears twice, at lines ~199-205 and ~214-220 — replace both)

Find (line ~233):

```ts
const actual = makeActual({}, { home: ARG, away: teamId('FRA'), homeGoals: 3, awayGoals: 2 });
```

Replace with:

```ts
const actual = makeActual(
  {},
  { home: ARG, away: teamId('FRA'), homeGoals: 3, awayGoals: 2, winner: ARG },
);
```

- [ ] **Step 7: Typecheck and run the affected test suites**

Run:

```bash
pnpm --filter @cup/engine typecheck && pnpm --filter @cup/engine test -- finish-matches specials
pnpm --filter @cup/schemas typecheck && pnpm --filter @cup/schemas test
pnpm --filter @cup/db typecheck && pnpm --filter @cup/db test -- tournament.test
pnpm --filter web typecheck
```

Expected: all pass. (`pnpm --filter web typecheck` will still fail until Task 2 adds
`topFourPositionBonus` to `Scoring` if that task hasn't run yet in a fresh session — if run
strictly in order, Task 2 comes next, so this is expected to be green at this point since Task 1
doesn't touch `Scoring`.)

Do not commit — this lands with the final task's single commit.

---

## Task 2: Engine core — `topFourPositionBonus` config + `scoreTopFour` position bonus

**Files:**

- Modify: `packages/engine/src/types.ts` (`Scoring`)
- Modify: `packages/engine/src/scoring/sets-rankings.ts` (`scoreTopFour`)
- Modify: `packages/engine/src/scoring/sets-rankings.test.ts`
- Modify: `packages/engine/src/score.test.ts` (§7.7 worked example)
- Modify: `packages/engine/src/__fixtures__/mini-tournament.ts` (`miniScoring`)
- Modify: `packages/schemas/src/tournament.ts` (`scoringSchema`)
- Modify: `packages/schemas/src/tournament.test.ts`, `packages/schemas/src/card-io.test.ts`
- Modify: `packages/db/src/testing/fixtures.ts` (`testScoring`)
- Modify: `data/tournaments/wc-2026/tournament.json`, `data/tournaments/mini-2026/tournament.json`,
  `data/tournaments/e2e-open/tournament.json`, `data/tournaments/e2e-seeded/tournament.json`,
  `data/tournaments/test-wc-2026/tournament.json`
- Modify: `apps/web/src/features/pools/application/pools.test.ts`,
  `apps/web/src/shared/authz/policy.test.ts`

**Interfaces:**

- Consumes: `ActualFinishMatch.winner` from Task 1.
- Produces: `Scoring.topFourPositionBonus: number`; `scoreTopFour(derived, actual, scoring): Points`
  now returns membership + position bonus combined (same public signature as before).

- [ ] **Step 1: Add the config field**

In `packages/engine/src/types.ts`, find:

```ts
/** Per confirmed semifinalist (see scoreTopFour). Order never matters. */
roundOf4PerTeam: number;
```

Replace with:

```ts
/** Per confirmed semifinalist (see scoreTopFour). Order never matters. */
roundOf4PerTeam: number;
/**
 * Bonus per team whose predicted final-standing slot (1st/2nd from the Final, 3rd/4th from
 * Bronze) exactly matches the actual slot. See scoreTopFour. Independent of roundOf4PerTeam —
 * resolves per finish match, not per QF match.
 */
topFourPositionBonus: number;
```

- [ ] **Step 2: Write the failing unit tests for the position bonus**

In `packages/engine/src/scoring/sets-rankings.test.ts`, extend the helpers. Find:

```ts
function makeDerived(
  roundOf8: TeamId[],
  roundOf4: TeamId[],
  roundOf16: TeamId[] = [],
): DerivedCard {
  return {
    groupOrders: {},
    qualifiers: [],
    roundOf16,
    roundOf8,
    finalists: [],
    bronzePair: [],
    topFour: [],
    roundOf4,
  };
}

function makeActual(opts: {
  roundOf16?: TeamId[];
  roundOf8?: TeamId[];
  roundOf4?: TeamId[];
}): ActualResults {
  return {
    matchResults: [],
    groupOrder: {},
    answers: {
      ...(opts.roundOf16 !== undefined ? { roundOf16: opts.roundOf16 } : {}),
      ...(opts.roundOf8 !== undefined ? { roundOf8: opts.roundOf8 } : {}),
      ...(opts.roundOf4 !== undefined ? { roundOf4: opts.roundOf4 } : {}),
    },
  };
}
```

Replace with:

```ts
function makeDerived(
  roundOf8: TeamId[],
  roundOf4: TeamId[],
  roundOf16: TeamId[] = [],
  topFour: TeamId[] = [],
): DerivedCard {
  return {
    groupOrders: {},
    qualifiers: [],
    roundOf16,
    roundOf8,
    finalists: [],
    bronzePair: [],
    topFour,
    roundOf4,
  };
}

function makeActual(opts: {
  roundOf16?: TeamId[];
  roundOf8?: TeamId[];
  roundOf4?: TeamId[];
  finalMatch?: ActualResults['finalMatch'];
  bronzeMatch?: ActualResults['bronzeMatch'];
}): ActualResults {
  return {
    matchResults: [],
    groupOrder: {},
    answers: {
      ...(opts.roundOf16 !== undefined ? { roundOf16: opts.roundOf16 } : {}),
      ...(opts.roundOf8 !== undefined ? { roundOf8: opts.roundOf8 } : {}),
      ...(opts.roundOf4 !== undefined ? { roundOf4: opts.roundOf4 } : {}),
    },
    ...(opts.finalMatch !== undefined ? { finalMatch: opts.finalMatch } : {}),
    ...(opts.bronzeMatch !== undefined ? { bronzeMatch: opts.bronzeMatch } : {}),
  };
}
```

Then, immediately before the closing `});` of the `describe('scoreTopFour', ...)` block (after the
existing `'score never decreases as roundOf4 grows incrementally'` test), add:

```ts
it('position bonus: all 4 slots correct when Final and Bronze both resolve as predicted', () => {
  const derived = makeDerived([], [ARG, FRA, NED, POR], [], [ARG, FRA, NED, POR]);
  const actual = makeActual({
    roundOf4: [ARG, FRA, NED, POR],
    finalMatch: { home: ARG, away: FRA, homeGoals: 2, awayGoals: 1, winner: ARG },
    bronzeMatch: { home: NED, away: POR, homeGoals: 1, awayGoals: 0, winner: NED },
  });
  // membership: 4 × 5 = 20; position: 4 × 3 = 12
  expect(scoreTopFour(derived, actual, miniScoring)).toBe(32);
});

it('position bonus: 0 when the Final result swaps the predicted 1st/2nd', () => {
  const derived = makeDerived([], [ARG, FRA, NED, POR], [], [ARG, FRA, NED, POR]);
  const actual = makeActual({
    roundOf4: [ARG, FRA, NED, POR],
    finalMatch: { home: ARG, away: FRA, homeGoals: 1, awayGoals: 2, winner: FRA },
  });
  // membership: 20; position: 0 (predicted ARG=1st/FRA=2nd, actual FRA=1st/ARG=2nd)
  expect(scoreTopFour(derived, actual, miniScoring)).toBe(20);
});

it('position bonus banks for Final slots before Bronze is played', () => {
  const derived = makeDerived([], [ARG, FRA, NED, POR], [], [ARG, FRA, NED, POR]);
  const actual = makeActual({
    roundOf4: [ARG, FRA, NED, POR],
    finalMatch: { home: ARG, away: FRA, homeGoals: 2, awayGoals: 1, winner: ARG },
  });
  // membership: 20; position: 2 × 3 = 6 (Final slots only — Bronze not yet played)
  expect(scoreTopFour(derived, actual, miniScoring)).toBe(26);
});

it('position bonus banks for Bronze slots independently of the Final', () => {
  const derived = makeDerived([], [ARG, FRA, NED, POR], [], [ARG, FRA, NED, POR]);
  const actual = makeActual({
    roundOf4: [ARG, FRA, NED, POR],
    bronzeMatch: { home: NED, away: POR, homeGoals: 1, awayGoals: 0, winner: NED },
  });
  // membership: 20; position: 2 × 3 = 6 (Bronze slots only — Final not yet played)
  expect(scoreTopFour(derived, actual, miniScoring)).toBe(26);
});

it('position bonus is order-sensitive even though membership is not', () => {
  // derived.roundOf4 (membership) has no order; derived.topFour (position) does.
  // Predicted topFour has ARG/FRA swapped relative to who actually won the Final.
  const derived = makeDerived([], [ARG, FRA, NED, POR], [], [FRA, ARG, NED, POR]);
  const actual = makeActual({
    roundOf4: [ARG, FRA, NED, POR],
    finalMatch: { home: ARG, away: FRA, homeGoals: 2, awayGoals: 1, winner: ARG },
  });
  // membership: 20 (order-agnostic, all 4 present); position: 0 (predicted 1st=FRA, actual 1st=ARG)
  expect(scoreTopFour(derived, actual, miniScoring)).toBe(20);
});

it('position bonus is 0 for a partial card missing Final/Bronze picks, even once both matches resolve', () => {
  const derived = makeDerived([], [ARG, FRA, NED, POR], [], []); // no Final/Bronze picks made
  const actual = makeActual({
    roundOf4: [ARG, FRA, NED, POR],
    finalMatch: { home: ARG, away: FRA, homeGoals: 2, awayGoals: 1, winner: ARG },
    bronzeMatch: { home: NED, away: POR, homeGoals: 1, awayGoals: 0, winner: NED },
  });
  expect(scoreTopFour(derived, actual, miniScoring)).toBe(20); // membership only
});
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `pnpm --filter @cup/engine test -- sets-rankings`
Expected: FAIL — `miniScoring` missing `topFourPositionBonus` (compile error) and/or the new
`position bonus` tests return only the membership value.

- [ ] **Step 4: Implement `scoreTopFour`'s position bonus**

In `packages/engine/src/scoring/sets-rankings.ts`, find:

```ts
export function scoreTopFour(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  if (actual.answers.roundOf4 === undefined) {
    return points(0);
  }

  const actualSet = new Set(actual.answers.roundOf4);
  const correctCount = derived.roundOf4.filter((team) => actualSet.has(team)).length;

  return points(correctCount * scoring.roundOf4PerTeam);
}
```

Replace with:

```ts
export function scoreTopFour(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  return points(
    scoreTopFourMembership(derived, actual, scoring) +
      scoreTopFourPositionBonus(derived, actual, scoring),
  );
}

/** Correct top-4 (semifinalist) team predictions, set membership only — order never matters. */
function scoreTopFourMembership(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): number {
  if (actual.answers.roundOf4 === undefined) {
    return 0;
  }

  const actualSet = new Set(actual.answers.roundOf4);
  const correctCount = derived.roundOf4.filter((team) => actualSet.has(team)).length;

  return correctCount * scoring.roundOf4PerTeam;
}

/**
 * +topFourPositionBonus per team whose predicted final-standing slot (1st/2nd from the Final,
 * 3rd/4th from Bronze) exactly matches the actual slot. Resolves independently per match: 1st/2nd
 * as soon as the Final is played, 3rd/4th as soon as Bronze is played. A team can only earn this
 * if it also earned membership points — reaching the Final/Bronze match implies being one of the
 * 4 real semifinalists, so no separate membership check is needed here.
 */
function scoreTopFourPositionBonus(
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): number {
  const [predictedFinalWinner, predictedFinalLoser, predictedBronzeWinner, predictedBronzeLoser] =
    derived.topFour;
  let total = 0;

  if (actual.finalMatch !== undefined) {
    const { home, away, winner } = actual.finalMatch;
    const loser = winner === home ? away : home;
    if (predictedFinalWinner === winner) total += scoring.topFourPositionBonus;
    if (predictedFinalLoser === loser) total += scoring.topFourPositionBonus;
  }

  if (actual.bronzeMatch !== undefined) {
    const { home, away, winner } = actual.bronzeMatch;
    const loser = winner === home ? away : home;
    if (predictedBronzeWinner === winner) total += scoring.topFourPositionBonus;
    if (predictedBronzeLoser === loser) total += scoring.topFourPositionBonus;
  }

  return total;
}
```

- [ ] **Step 5: Add `topFourPositionBonus` to every `Scoring` literal**

In each of the following files, find the line `roundOf4PerTeam: 5,` (or `"roundOf4PerTeam": 5,` for
JSON) and add `topFourPositionBonus: 3,` (or `"topFourPositionBonus": 3,`) immediately after it:

- `packages/engine/src/__fixtures__/mini-tournament.ts` (`miniScoring`)
- `packages/db/src/testing/fixtures.ts` (`testScoring`)
- `apps/web/src/features/pools/application/pools.test.ts` (`SCORING`)
- `apps/web/src/shared/authz/policy.test.ts` (inline `scoringConfig`)
- `packages/schemas/src/tournament.test.ts` (`validTournamentJson.scoring`)
- `packages/schemas/src/card-io.test.ts` (`scoring`)
- `data/tournaments/wc-2026/tournament.json`
- `data/tournaments/mini-2026/tournament.json`
- `data/tournaments/e2e-open/tournament.json`
- `data/tournaments/e2e-seeded/tournament.json`
- `data/tournaments/test-wc-2026/tournament.json`

For the JSON files use `"topFourPositionBonus": 3,`.

Also update the assertion in `packages/schemas/src/tournament.test.ts` — find:

```ts
expect(result.scoring.roundOf4PerTeam).toBe(5);
```

Add immediately after it:

```ts
expect(result.scoring.topFourPositionBonus).toBe(3);
```

- [ ] **Step 6: Add `topFourPositionBonus` to the zod scoring schema**

In `packages/schemas/src/tournament.ts`, find:

```ts
  roundOf4PerTeam: z.number(),
```

Replace with:

```ts
  roundOf4PerTeam: z.number(),
  topFourPositionBonus: z.number(),
```

- [ ] **Step 7: Run the tests to verify they pass**

Run:

```bash
pnpm --filter @cup/engine test -- sets-rankings
pnpm --filter @cup/schemas test
pnpm --filter @cup/db test -- fixtures
pnpm --filter web test -- pools.test policy.test
```

Expected: all PASS.

- [ ] **Step 8: Update the §7.7 worked example in score.test.ts**

`derived77.topFour` is already `[ARG, FRA, NED, POR]` and `actual77.finalMatch` already has
`home: ARG, away: FRA, homeGoals: 3, awayGoals: 2` — ARG is the Final winner (predicted 1st = ARG,
predicted 2nd = FRA; both correct), so this worked example now earns the Final's position bonus:
2 × 3 = 6 extra points (no `bronzeMatch` in `actual77`, so no Bronze position bonus).

In `packages/engine/src/score.test.ts`, find:

```ts
const actual77: ActualResults = {
  matchResults: [
    { matchId: m1, home: 3, away: 1 }, // home win, different score → outcome only → 3
    { matchId: m2, home: 1, away: 0 }, // exact → 6
  ],
  groupOrder: actualGroupOrder,
  finalMatch: {
    home: ARG,
    away: FRA,
    homeGoals: 3,
    awayGoals: 2,
    decidedBy: 'penalties',
  },
```

Replace with:

```ts
const actual77: ActualResults = {
  matchResults: [
    { matchId: m1, home: 3, away: 1 }, // home win, different score → outcome only → 3
    { matchId: m2, home: 1, away: 0 }, // exact → 6
  ],
  groupOrder: actualGroupOrder,
  finalMatch: {
    home: ARG,
    away: FRA,
    homeGoals: 3,
    awayGoals: 2,
    winner: ARG,
    decidedBy: 'penalties',
  },
```

Then find the comment block:

```ts
// groupMatches:   correct-outcome-only(3) + exact(6)       = 9
// groupOrder:     2 positions correct                       = 3
// roundOf8:       6-of-8 correct × 3                       = 18
// topFour:        all 4 predicted semifinalists confirmed (tier 20) = 20
// final:          both teams + exact 3–2                    = 15
// bronze:         none                                      = 0
// specials:       topScorerPlayer(15) + penalties(10)       = 25
// total:                                                    = 90
```

Replace with:

```ts
// groupMatches:   correct-outcome-only(3) + exact(6)       = 9
// groupOrder:     2 positions correct                       = 3
// roundOf8:       6-of-8 correct × 3                       = 18
// topFour:        all 4 predicted semifinalists confirmed (20) + 2 correct Final positions (6) = 26
// final:          both teams + exact 3–2                    = 15
// bronze:         none                                      = 0
// specials:       topScorerPlayer(15) + penalties(10)       = 25
// total:                                                    = 96
```

Then find:

```ts
  answers: {
    roundOf8: ACTUAL_R8,
    roundOf4: [ARG, FRA, NED, POR], // all 4 of the player's predicted semifinalists confirmed → tier 20
    topScorerPlayer: [FRA9],
  },
```

Replace with:

```ts
  answers: {
    roundOf8: ACTUAL_R8,
    roundOf4: [ARG, FRA, NED, POR], // all 4 of the player's predicted semifinalists confirmed → 20
    topScorerPlayer: [FRA9],
  },
```

Then find:

```ts
describe('scoreCard — §7.7 worked example', () => {
  it('produces the correct ScoreBreakdown with total 90', () => {
    const breakdown = scoreCard(derived77, inputs77, actual77, miniScoring);

    expect(breakdown.groupMatches).toBe(9); // 3 + 6
    expect(breakdown.groupOrder).toBe(3); // 2 correct (twoCorrect)
    expect(breakdown.roundOf8).toBe(18); // 6 × 3
    expect(breakdown.topFour).toBe(20); // all 4 predicted semifinalists confirmed
    expect(breakdown.final).toBe(15); // 10 teams + 5 exact
    expect(breakdown.bronze).toBe(0); // no bronzeMatch in actual
    expect(breakdown.specials).toBe(25); // 15 + 10
    expect(breakdown.total).toBe(90);
  });
});
```

Replace with:

```ts
describe('scoreCard — §7.7 worked example', () => {
  it('produces the correct ScoreBreakdown with total 96', () => {
    const breakdown = scoreCard(derived77, inputs77, actual77, miniScoring);

    expect(breakdown.groupMatches).toBe(9); // 3 + 6
    expect(breakdown.groupOrder).toBe(3); // 2 correct (twoCorrect)
    expect(breakdown.roundOf8).toBe(18); // 6 × 3
    expect(breakdown.topFour).toBe(26); // 4×5 membership + 2×3 Final position bonus
    expect(breakdown.final).toBe(15); // 10 teams + 5 exact
    expect(breakdown.bronze).toBe(0); // no bronzeMatch in actual
    expect(breakdown.specials).toBe(25); // 15 + 10
    expect(breakdown.total).toBe(96);
  });
});
```

- [ ] **Step 9: Run the full engine test suite**

Run: `pnpm --filter @cup/engine test`
Expected: all PASS (this also re-verifies the "determinism" and "integration sanity" tests in
`score.test.ts`, which reuse `derived77`/`actual77`/`miniScoring` without separate hardcoded
numbers, so they should pass unchanged).

Do not commit — this lands with the final task's single commit.

---

## Task 3: Engine ceiling — `remaining-max.ts`

**Files:**

- Modify: `packages/engine/src/scoring/remaining-max.ts`
- Modify: `packages/engine/src/scoring/remaining-max.test.ts`

**Interfaces:**

- Consumes: `Scoring.topFourPositionBonus` (Task 2).
- Produces: `computeRemainingMaxPoints(...).topFour` now includes both membership and
  position-bonus upside; other categories unchanged.

- [ ] **Step 1: Update the ceiling formula**

In `packages/engine/src/scoring/remaining-max.ts`, find:

```ts
// Top four (semifinalists): resolves once every QF match has been played — at that point the
// four actual semifinalists are fully known, independent of Final/Bronze results.
const qfComplete = bracket.roundOf8Matches.every(isFinal);
const topFourMax = qfComplete ? 0 : 4 * scoring.roundOf4PerTeam;
```

Replace with:

```ts
// Top four (semifinalists): membership resolves once every QF match has been played — at that
// point the four actual semifinalists are fully known. The position bonus resolves
// independently per finish match: 1st/2nd once the Final is played, 3rd/4th once Bronze is
// played — so it can remain attainable even after membership has fully resolved.
const qfComplete = bracket.roundOf8Matches.every(isFinal);
const topFourMembershipMax = qfComplete ? 0 : 4 * scoring.roundOf4PerTeam;
const topFourPositionMax =
  (finalPlayed ? 0 : 2 * scoring.topFourPositionBonus) +
  (bronzePlayed ? 0 : 2 * scoring.topFourPositionBonus);
const topFourMax = topFourMembershipMax + topFourPositionMax;
```

(`finalPlayed` and `bronzePlayed` are already declared earlier in this function, above this block —
no reordering needed.)

Also update the module doc comment. Find:

```ts
 *  - topFour:      resolves once every QF match has been played (the four
 *                  semifinalists are then fully known).
```

Replace with:

```ts
 *  - topFour:      membership resolves once every QF match has been played (the four
 *                  semifinalists are then fully known); the position bonus resolves
 *                  independently per finish match (1st/2nd at the Final, 3rd/4th at
 *                  Bronze) and can remain attainable after membership has resolved.
```

- [ ] **Step 2: Update `remaining-max.test.ts` fixture constant**

In `packages/engine/src/scoring/remaining-max.test.ts`, find:

```ts
const MAX_TOP_FOUR = 4 * miniScoring.roundOf4PerTeam;
```

Replace with:

```ts
const MAX_TOP_FOUR = 4 * miniScoring.roundOf4PerTeam + 4 * miniScoring.topFourPositionBonus;
```

- [ ] **Step 3: Rewrite the "unaffected by bronze/final alone" test block**

Find:

```ts
it('top-four upside is unaffected by bronze/final alone (needs QF, not finish matches)', () => {
  expect(computeRemainingMaxPoints(miniTournament, progress([BRONZE_KEY])).topFour).toBe(
    MAX_TOP_FOUR,
  );
  expect(computeRemainingMaxPoints(miniTournament, progress([FINAL_KEY])).topFour).toBe(
    MAX_TOP_FOUR,
  );
  expect(computeRemainingMaxPoints(miniTournament, progress([BRONZE_KEY, FINAL_KEY])).topFour).toBe(
    MAX_TOP_FOUR,
  );
});

it('top-four upside zeroes once every QF match is played', () => {
  const result = computeRemainingMaxPoints(miniTournament, progress(QF_KEYS));
  expect(result.topFour).toBe(0);
});
```

Replace with:

```ts
it('top-four membership upside is unaffected by bronze/final alone (needs QF)', () => {
  // Membership (4 × roundOf4PerTeam) stays fully open regardless of bronze/final progress;
  // only the position-bonus portion shrinks as bronze/final are played.
  const membershipMax = 4 * miniScoring.roundOf4PerTeam;
  const bronzeOnly = computeRemainingMaxPoints(miniTournament, progress([BRONZE_KEY]));
  const finalOnly = computeRemainingMaxPoints(miniTournament, progress([FINAL_KEY]));
  const both = computeRemainingMaxPoints(miniTournament, progress([BRONZE_KEY, FINAL_KEY]));

  // bronze played → its 2-slot position upside (3rd/4th) is gone; final's (1st/2nd) remains
  expect(bronzeOnly.topFour).toBe(membershipMax + 2 * miniScoring.topFourPositionBonus);
  // final played → its 2-slot position upside (1st/2nd) is gone; bronze's (3rd/4th) remains
  expect(finalOnly.topFour).toBe(membershipMax + 2 * miniScoring.topFourPositionBonus);
  // both played → no position upside remains, only membership (QF not yet played)
  expect(both.topFour).toBe(membershipMax);
});

it('top-four membership upside zeroes once every QF match is played, but position bonus remains open', () => {
  const result = computeRemainingMaxPoints(miniTournament, progress(QF_KEYS));
  // Membership resolved (0); position bonus still fully open (neither final nor bronze played)
  expect(result.topFour).toBe(4 * miniScoring.topFourPositionBonus);
});

it('top-four fully zeroes once QF, Final, and Bronze have all been played', () => {
  const result = computeRemainingMaxPoints(
    miniTournament,
    progress([...QF_KEYS, FINAL_KEY, BRONZE_KEY]),
  );
  expect(result.topFour).toBe(0);
});
```

- [ ] **Step 4: Update the "after QF"/"after SF"/"after bronze only"/"after final only" stage-transition tests**

Find:

```ts
it('after QF: top-four resolves; bronze, final, and specials remain', () => {
  const result = computeRemainingMaxPoints(
    miniTournament,
    progress([...ALL_GROUP_MATCH_IDS, ...QF_KEYS]),
  );
  expect(result.topFour).toBe(0);
  expect(result.total).toBe(MAX_BRONZE + MAX_FINAL + MAX_SPECIALS);
});

it('after SF: top-four already resolved (QF complete); final drops to exactScore-only (both SFs final); bronze + specials open', () => {
  const result = computeRemainingMaxPoints(
    miniTournament,
    progress([...ALL_GROUP_MATCH_IDS, ...QF_KEYS, ...SF_KEYS]),
  );
  expect(result.topFour).toBe(0);
  expect(result.final).toBe(miniScoring.final.exactScore);
  expect(result.total).toBe(MAX_BRONZE + miniScoring.final.exactScore + MAX_SPECIALS);
});

it('after bronze only: bronze locked, top-four already resolved, final at exactScore-only (both SFs already final), specials open', () => {
  const result = computeRemainingMaxPoints(
    miniTournament,
    progress([...ALL_GROUP_MATCH_IDS, ...QF_KEYS, ...SF_KEYS, BRONZE_KEY]),
  );
  expect(result.bronze).toBe(0);
  expect(result.final).toBe(miniScoring.final.exactScore);
  expect(result.topFour).toBe(0);
  expect(result.specials).toBe(MAX_SPECIALS);
});

it('after final only (bronze still pending): final locked, top-four already resolved, bronze + specials open', () => {
  const result = computeRemainingMaxPoints(
    miniTournament,
    progress([...ALL_GROUP_MATCH_IDS, ...QF_KEYS, ...SF_KEYS, FINAL_KEY]),
  );
  expect(result.final).toBe(0);
  expect(result.bronze).toBe(MAX_BRONZE);
  expect(result.topFour).toBe(0);
  expect(result.specials).toBe(MAX_SPECIALS);
});
```

Replace with:

```ts
it('after QF: top-four membership resolves but position bonus stays open; bronze, final, and specials remain', () => {
  const result = computeRemainingMaxPoints(
    miniTournament,
    progress([...ALL_GROUP_MATCH_IDS, ...QF_KEYS]),
  );
  const topFourPositionMax = 4 * miniScoring.topFourPositionBonus;
  expect(result.topFour).toBe(topFourPositionMax);
  expect(result.total).toBe(MAX_BRONZE + MAX_FINAL + MAX_SPECIALS + topFourPositionMax);
});

it('after SF: top-four membership already resolved (QF complete), position bonus still fully open; final drops to exactScore-only (both SFs final); bronze + specials open', () => {
  const result = computeRemainingMaxPoints(
    miniTournament,
    progress([...ALL_GROUP_MATCH_IDS, ...QF_KEYS, ...SF_KEYS]),
  );
  const topFourPositionMax = 4 * miniScoring.topFourPositionBonus;
  expect(result.topFour).toBe(topFourPositionMax);
  expect(result.final).toBe(miniScoring.final.exactScore);
  expect(result.total).toBe(
    MAX_BRONZE + miniScoring.final.exactScore + MAX_SPECIALS + topFourPositionMax,
  );
});

it('after bronze only: bronze locked, top-four membership resolved but Final-slot position bonus remains, final at exactScore-only, specials open', () => {
  const result = computeRemainingMaxPoints(
    miniTournament,
    progress([...ALL_GROUP_MATCH_IDS, ...QF_KEYS, ...SF_KEYS, BRONZE_KEY]),
  );
  expect(result.bronze).toBe(0);
  expect(result.final).toBe(miniScoring.final.exactScore);
  expect(result.topFour).toBe(2 * miniScoring.topFourPositionBonus); // Final slots only
  expect(result.specials).toBe(MAX_SPECIALS);
});

it('after final only (bronze still pending): final locked, top-four membership resolved but Bronze-slot position bonus remains, bronze + specials open', () => {
  const result = computeRemainingMaxPoints(
    miniTournament,
    progress([...ALL_GROUP_MATCH_IDS, ...QF_KEYS, ...SF_KEYS, FINAL_KEY]),
  );
  expect(result.final).toBe(0);
  expect(result.bronze).toBe(MAX_BRONZE);
  expect(result.topFour).toBe(2 * miniScoring.topFourPositionBonus); // Bronze slots only
  expect(result.specials).toBe(MAX_SPECIALS);
});
```

- [ ] **Step 5: Add `topFourPositionBonus: 0` to the "zero scoring config" test object**

Find:

```ts
      scoring: {
        groupMatch: { exactScore: 0, correctOutcome: 0 },
        groupOrder: { allCorrect: 0, twoCorrect: 0, oneCorrect: 0 },
        groupTopScoringTeam: 0,
        groupTopConcedingTeam: 0,
        roundOf16PerTeam: 0,
        roundOf8PerTeam: 0,
        bronze: { exactScore: 0, perTeam: 0 },
        final: { exactScore: 0, perTeam: 0 },
        roundOf4PerTeam: 0,
        tournamentTopScoringTeam: 0,
```

Replace with:

```ts
      scoring: {
        groupMatch: { exactScore: 0, correctOutcome: 0 },
        groupOrder: { allCorrect: 0, twoCorrect: 0, oneCorrect: 0 },
        groupTopScoringTeam: 0,
        groupTopConcedingTeam: 0,
        roundOf16PerTeam: 0,
        roundOf8PerTeam: 0,
        bronze: { exactScore: 0, perTeam: 0 },
        final: { exactScore: 0, perTeam: 0 },
        roundOf4PerTeam: 0,
        topFourPositionBonus: 0,
        tournamentTopScoringTeam: 0,
```

- [ ] **Step 6: Run the ceiling test suite**

Run: `pnpm --filter @cup/engine test -- remaining-max`
Expected: all PASS. Double-check the "total equals sum of category fields" and "upside
monotonically decreases" tests (unmodified) still pass — they assert structural properties that
hold regardless of the formula change.

Do not commit — this lands with the final task's single commit.

---

## Task 4: Web ceiling — `build-race-view.ts` per-user knockout ceiling

**Files:**

- Modify: `apps/web/src/features/results/application/build-race-view.ts`
  (`buildPerUserKnockoutCanStillGet`)
- Modify: `apps/web/src/features/results/application/build-race-view-canstillget.test.ts`

**Interfaces:**

- Consumes: `Scoring.topFourPositionBonus` (Task 2).
- Produces: `buildPerUserKnockoutCanStillGet(...)` return values increase by the reachable position
  bonus wherever Final/Bronze aren't yet played.

- [ ] **Step 1: Add the position-bonus terms**

In `apps/web/src/features/results/application/build-race-view.ts`, find:

```ts
// Final: finalist perTeam × non-busted SF picks + exactScore.
if (!finalPlayed) {
  let bustedSfPicks = 0;
  for (const sfKey of sfKeys) {
    if (picks.has(sfKey) && !isNotBusted(sfKey)) bustedSfPicks++;
  }
  canStillGet += Math.max(0, 2 - bustedSfPicks) * scoring.final.perTeam + scoring.final.exactScore;
}
```

Replace with:

```ts
// Final: finalist perTeam × non-busted SF picks + exactScore.
if (!finalPlayed) {
  let bustedSfPicks = 0;
  for (const sfKey of sfKeys) {
    if (picks.has(sfKey) && !isNotBusted(sfKey)) bustedSfPicks++;
  }
  canStillGet += Math.max(0, 2 - bustedSfPicks) * scoring.final.perTeam + scoring.final.exactScore;
  // TopFour position bonus (1st/2nd place): reachable while the predicted finalist is
  // still alive, independent of the Final team-points ceiling above.
  canStillGet += Math.max(0, 2 - bustedSfPicks) * scoring.topFourPositionBonus;
}
```

Then find:

```ts
      canStillGet +=
        Math.max(0, 2 - bustedBronzePairs) * scoring.bronze.perTeam + scoring.bronze.exactScore;
    }

    result.set(userId, canStillGet);
```

Replace with:

```ts
      canStillGet +=
        Math.max(0, 2 - bustedBronzePairs) * scoring.bronze.perTeam + scoring.bronze.exactScore;
      // TopFour position bonus (3rd/4th place): reachable while the predicted bronze
      // participant is still alive, independent of the Bronze team-points ceiling above.
      canStillGet += Math.max(0, 2 - bustedBronzePairs) * scoring.topFourPositionBonus;
    }

    result.set(userId, canStillGet);
```

- [ ] **Step 2: Update `build-race-view-canstillget.test.ts` expected totals**

`miniScoring.topFourPositionBonus` is 3. In every test below, apply the exact replacement shown —
each new value already accounts for the specific `bustedSfPicks`/`bustedBronzePairs` count that
test's scenario produces (derived from the existing comments in each test).

Find:

```ts
// topFour(4 non-busted)=20, Final=2×5+5=15, Bronze=2×5+5=15 (2 sf picks → 2 bronze pairs)
// But u1 has no SF picks → bustedSfPicks=0 (no-picks not counted as busted)
//   Final: max(0,2-0)×5+5=15
//   Bronze: no sfWinner picks → sfWinner=null → no busted bronze pairs counted → 2×5+5=15
expect(result.get('u1')).toBe(20 + 15 + 15); // 50
```

Replace with:

```ts
// topFour(4 non-busted)=20, Final=2×5+5+2×3=21, Bronze=2×5+5+2×3=21 (0 busted SF picks)
expect(result.get('u1')).toBe(20 + 21 + 21); // 62
```

Find:

```ts
    // 1 busted QF pick → nonBustedQf = 4-1 = 3 → topFour(3)=15
    // Final: 15, Bronze: 15
    expect(result.get('u1')).toBe(15 + 15 + 15); // 45
  });

  it('gives 0 topFour when roundOf4 is already fully known', () => {
```

Replace with:

```ts
    // 1 busted QF pick → nonBustedQf = 4-1 = 3 → topFour(3)=15
    // Final: 15 + 2×3=6 = 21; Bronze: 21 (0 busted SF picks)
    expect(result.get('u1')).toBe(15 + 21 + 21); // 57
  });

  it('gives 0 topFour when roundOf4 is already fully known', () => {
```

Find:

```ts
// No topFour (resolved), no SF picks → Final=15, Bronze=15 (no-picks not counted as busted)
expect(result.get('u1')).toBe(0 + 15 + 15); // 30
```

Replace with:

```ts
// No topFour (resolved); Final/Bronze position bonus still open (0 busted SF picks)
// Final=15+6=21, Bronze=15+6=21
expect(result.get('u1')).toBe(0 + 21 + 21); // 42
```

Find:

```ts
    // topFour: 4 - 0 busted (only qf1, qf2 picked) → wait, qfKeys = [qf1,qf2,qf3,qf4], nonBustedQf starts at 4
    // u1 has picks for qf1 (A1, viable) and qf2 (C1, viable), qf3 and qf4 (no pick = not busted)
    // nonBustedQf = 4 (all unbusted)
    // topFour = 20
    // Final: 2 sf picks, both viable → bustedSf=0 → max(0,2-0)×5+5=15
    // Bronze: sf1 winner=A1, qf1→A1, qf2→C1; sf1 loser=C1 (qf2 winner ≠ sf1 winner A1)
    //         sf2 winner=B1, qf3=null, qf4=null; sfWinner=B1 but no qf picks → bronzeTeam=null → skip
    //   → bustedBronzePairs=0 → 2×5+5=15
    expect(result.get('u1')).toBe(20 + 15 + 15); // 50
  });

  it('gives 0 Final canStillGet when final match is already played', () => {
```

Replace with:

```ts
    // topFour = 20 (nonBustedQf=4, all unbusted)
    // Final: bustedSf=0 → 2×5+5+2×3=21
    // Bronze: bustedBronzePairs=0 → 2×5+5+2×3=21
    expect(result.get('u1')).toBe(20 + 21 + 21); // 62
  });

  it('gives 0 Final canStillGet when final match is already played', () => {
```

Find:

```ts
// Final played → 0 for Final; Bronze not played → 15
expect(result.get('u1')).toBe(20 + 0 + 15); // 35
```

Replace with:

```ts
// Final played → 0 for Final (position bonus for 1st/2nd also gone, block skipped entirely)
// Bronze not played → 15 + 2×3=6 = 21 (0 busted SF picks: sf1 unresolved → conservatively viable)
expect(result.get('u1')).toBe(20 + 0 + 21); // 41
```

Find:

```ts
    // nonBustedQf = 4-1=3 → topFour=15; Final: no SF picks → 15; Bronze: 15
    expect(result.get('u1')).toBe(15 + 15 + 15); // 45
  });

  it('marks pick as busted when both participants confirmed and pick not among them', () => {
```

Replace with:

```ts
    // nonBustedQf = 4-1=3 → topFour=15; Final: no SF picks → 21; Bronze: 21
    expect(result.get('u1')).toBe(15 + 21 + 21); // 57
  });

  it('marks pick as busted when both participants confirmed and pick not among them', () => {
```

Find:

```ts
// qf1 pick busted (C1 not in A1 vs B2 when both known) → nonBustedQf=3 → topFour=15
expect(result.get('u1')).toBe(15 + 15 + 15); // 45
```

Replace with:

```ts
// qf1 pick busted (C1 not in A1 vs B2 when both known) → nonBustedQf=3 → topFour=15
// Final/Bronze: no SF picks → 21 each
expect(result.get('u1')).toBe(15 + 21 + 21); // 57
```

Find:

```ts
    // QF: no picks (or not busted) → topFour=20
    // SF1 pick viable (TBD) → bustedSfPicks=0 → Final=15
    // Bronze: sf1 winner=A1 but no QF picks for sf1 feeders → bronzeTeam=null → 0 busted → Bronze=15
    expect(result.get('u1')).toBe(20 + 15 + 15); // 50
  });

  it('returns 0 for a player whose only picks are for already-final matches', () => {
```

Replace with:

```ts
    // QF: no picks (or not busted) → topFour=20
    // SF1 pick viable (TBD) → bustedSfPicks=0 → Final=15+6=21
    // Bronze: sf1 winner=A1 but no QF picks for sf1 feeders → bronzeTeam=null → 0 busted → Bronze=21
    expect(result.get('u1')).toBe(20 + 21 + 21); // 62
  });

  it('returns 0 for a player whose only picks are for already-final matches', () => {
```

Find:

```ts
// qf1 is final and pick=B2 lost → busted → nonBustedQf=3 → topFour=15, Final=15, Bronze=15
// Note: Final and Bronze are still available for u1 (they just don't have SF picks)
expect(result.get('u1')).toBe(15 + 15 + 15); // 45
```

Replace with:

```ts
// qf1 is final and pick=B2 lost → busted → nonBustedQf=3 → topFour=15, Final=21, Bronze=21
// Note: Final and Bronze are still available for u1 (they just don't have SF picks)
expect(result.get('u1')).toBe(15 + 21 + 21); // 57
```

Find:

```ts
// topFour: qf1 busted, qf2 busted → nonBustedQf=2 → topFour=10
// Final: sf1 busted (B2 eliminated), sf2 no pick → bustedSfPicks=1 → max(0,2-1)×5+5=10
// Bronze: sf1's SF-winner pick is busted, so its derived bronze slot must be busted too
//   (not merely re-derived from Z9, which looks "alive" only because it never played a
//   real knockout match) → bustedBronzePairs=1 → max(0,2-1)×5+5=10
expect(result.get('u1')).toBe(10 + 10 + 10); // 30
```

Replace with:

```ts
// topFour: qf1 busted, qf2 busted → nonBustedQf=2 → topFour=10
// Final: sf1 busted (B2 eliminated), sf2 no pick → bustedSfPicks=1 → max(0,2-1)×5+5+max(0,2-1)×3=13
// Bronze: sf1's SF-winner pick is busted, so its derived bronze slot must be busted too
//   (not merely re-derived from Z9, which looks "alive" only because it never played a
//   real knockout match) → bustedBronzePairs=1 → max(0,2-1)×5+5+max(0,2-1)×3=13
expect(result.get('u1')).toBe(10 + 13 + 13); // 36
```

Find:

```ts
// u1: qf1 final, pick=A1 won → nonBustedQf=4, confirmedQf=1 (already banked via scoreTopFour)
//   → ceiling=topFour(4)=20, banked=topFour(1)=5 → remaining upside=20-5=15
// u2: qf1 final, pick=B2 lost → nonBustedQf=3, confirmedQf=0 → ceiling=15, banked=0 → 15
// Both surface the same *remaining* upside — u1's already-confirmed 5 points show up in
// their banked pointsTotal instead, not here (avoids double-counting).
expect(result.get('u1')).toBe(15 + 15 + 15); // 45
expect(result.get('u2')).toBe(15 + 15 + 15); // 45
```

Replace with:

```ts
// u1: qf1 final, pick=A1 won → nonBustedQf=4, confirmedQf=1 (already banked via scoreTopFour)
//   → ceiling=topFour(4)=20, banked=topFour(1)=5 → remaining upside=20-5=15
// u2: qf1 final, pick=B2 lost → nonBustedQf=3, confirmedQf=0 → ceiling=15, banked=0 → 15
// Both surface the same *remaining* upside — u1's already-confirmed 5 points show up in
// their banked pointsTotal instead, not here (avoids double-counting).
// Final/Bronze: neither u1 nor u2 has SF picks → 0 busted → 21 each
expect(result.get('u1')).toBe(15 + 21 + 21); // 57
expect(result.get('u2')).toBe(15 + 21 + 21); // 57
```

- [ ] **Step 3: Run the test suite**

Run: `pnpm --filter web test -- build-race-view`
Expected: all PASS.

Do not commit — this lands with the final task's single commit.

---

## Task 5: Web ceiling — `get-results-view.ts` per-user knockout round breakdown

**Files:**

- Modify: `apps/web/src/features/results/application/get-results-view.ts`
  (`buildKnockoutRoundBreakdown`)
- Modify: `apps/web/src/features/results/application/get-results-view.test.ts`

**Interfaces:**

- Consumes: `Scoring.topFourPositionBonus` (Task 2); reuses this function's existing
  `bustedSfPicks` / `effectiveBronzeBusted` locals.
- Produces: the `'SF'` row's `canStillGet` now includes reachable position bonus; `earned` and
  `missed` semantics are unchanged (still `bd?.topFour` combined and `max - avail - earned`
  respectively).

- [ ] **Step 1: Update the membership-ceiling derivation and add the position-bonus ceiling**

In `apps/web/src/features/results/application/get-results-view.ts`, find:

```ts
// For topFour: if some QF picks are busted, the achievable ceiling decreases.
// Use the 'SF' health row (populated from QF picks) to count still-possible picks.
// Use totalPicks - bustedPicks (not alivePicks + pendingPicks) so that 'no-pick' slots
// don't incorrectly reduce the achievable ceiling.
const sfRemaining = sfHealth !== null ? sfHealth.totalPicks - sfHealth.bustedPicks : null;
const sfMaxPossible =
  sfRemaining !== null ? sfRemaining * def.scoring.roundOf4PerTeam : totalMax.topFour;

// Once every QF match's winner is known, roundOf4 has as many entries as there are QF
// matches — at that point topFour is fully resolved and no further upside remains, even in
// contexts (e.g. tests, or a sync run that never wrote individual match rows) where the
// bracket-health `sfHealth` ceiling wouldn't otherwise reflect that.
const roundOf4FullyKnown =
  (actualResults.answers.roundOf4?.length ?? 0) >= def.bracket.roundOf8Matches.length;
```

Replace with:

```ts
// For topFour membership: if some QF picks are busted or already confirmed correct, the
// achievable ceiling shrinks accordingly. Use totalPicks - bustedPicks - alivePicks (not just
// totalPicks - bustedPicks) so already-banked picks aren't double-counted as still-reachable
// upside — 'no-pick' and 'pending' slots remain counted as reachable, matching
// buildPerUserKnockoutCanStillGet's equivalent (nonBustedQf - confirmedQf) formula.
const sfRemaining =
  sfHealth !== null ? sfHealth.totalPicks - sfHealth.bustedPicks - sfHealth.alivePicks : null;
const membershipMaxPossible =
  sfRemaining !== null
    ? sfRemaining * def.scoring.roundOf4PerTeam
    : 4 * def.scoring.roundOf4PerTeam;

// Once every QF match's winner is known, roundOf4 has as many entries as there are QF
// matches — at that point topFour membership is fully resolved and no further membership
// upside remains, even in contexts (e.g. tests, or a sync run that never wrote individual
// match rows) where the bracket-health `sfHealth` ceiling wouldn't otherwise reflect that.
// The position bonus (below) resolves independently of membership via the Final/Bronze
// matches, so it can remain attainable after membership itself has fully resolved.
const roundOf4FullyKnown =
  (actualResults.answers.roundOf4?.length ?? 0) >= def.bracket.roundOf8Matches.length;
```

- [ ] **Step 2: Compute the position-bonus ceiling and fold it into `canStillGet.topFour`**

Find:

```ts
const canStillGet = {
  roundOf16: perTeamAvail(r16Health, r16Answered, totalMax.roundOf16),
  roundOf8: perTeamAvail(r8Health, r8Answered, totalMax.roundOf8),
  topFour: roundOf4FullyKnown ? 0 : sfMaxPossible - (bd?.topFour ?? 0),
  bronze: finaleAvail(
    def.scoring.bronze,
    bd?.bronze ?? 0,
    actualResults.bronzeMatch !== undefined,
    effectiveBronzeBusted,
  ),
  final: finaleAvail(
    def.scoring.final,
    bd?.final ?? 0,
    actualResults.finalMatch !== undefined,
    bustedSfPicks,
  ),
};
```

Replace with:

```ts
const finalPlayed = actualResults.finalMatch !== undefined;
const bronzePlayed = actualResults.bronzeMatch !== undefined;

// Position bonus (1st/2nd from the Final, 3rd/4th from Bronze) resolves independently of
// membership, once each finish match is played — reuses the same busted-pick counts as the
// Final/Bronze ceilings below, since a slot can only pay out if its predicted team is alive.
const topFourPositionCeiling =
  (finalPlayed ? 0 : Math.max(0, 2 - bustedSfPicks) * def.scoring.topFourPositionBonus) +
  (bronzePlayed ? 0 : Math.max(0, 2 - effectiveBronzeBusted) * def.scoring.topFourPositionBonus);

const canStillGet = {
  roundOf16: perTeamAvail(r16Health, r16Answered, totalMax.roundOf16),
  roundOf8: perTeamAvail(r8Health, r8Answered, totalMax.roundOf8),
  topFour: (roundOf4FullyKnown ? 0 : membershipMaxPossible) + topFourPositionCeiling,
  bronze: finaleAvail(def.scoring.bronze, bd?.bronze ?? 0, bronzePlayed, effectiveBronzeBusted),
  final: finaleAvail(def.scoring.final, bd?.final ?? 0, finalPlayed, bustedSfPicks),
};
```

- [ ] **Step 3: Update the one affected test assertion**

In `apps/web/src/features/results/application/get-results-view.test.ts`, find:

```ts
const sfRow = rows.find((r) => r.label === 'SF')!;
expect(sfRow.canStillGet).toBe(3 * roundOf4PerTeam); // 3 of 4 QF picks still viable
expect(sfRow.missed).toBe(1 * roundOf4PerTeam); // 1 of 4 QF picks busted
```

Replace with:

```ts
const sfRow = rows.find((r) => r.label === 'SF')!;
const { topFourPositionBonus } = miniTournament.scoring;
// membership: 3 of 4 QF picks still viable → 3×roundOf4PerTeam; position bonus: neither
// Final nor Bronze played, no SF/bronze picks made → fully open, 4×topFourPositionBonus.
expect(sfRow.canStillGet).toBe(3 * roundOf4PerTeam + 4 * topFourPositionBonus);
// missed reflects only the lost membership point — the busted QF pick doesn't affect the
// still-open position bonus.
expect(sfRow.missed).toBe(1 * roundOf4PerTeam);
```

- [ ] **Step 4: Run the results-view test suite**

Run: `pnpm --filter web test -- get-results-view`
Expected: all PASS. All other `topFour`/`canStillGet`/`missed` assertions in this file derive their
expected values from `computeRemainingMaxPoints(...)` dynamically (not hardcoded), so they pick up
the new max automatically and should not need further changes — but if any additional assertion
fails, work out the new expected number the same way as Step 3 (membership ceiling via the
`totalPicks - busted - alive` formula, plus `Math.max(0, 2 - bustedCount) * topFourPositionBonus`
per finish match not yet played) rather than loosening the assertion.

Do not commit — this lands with the final task's single commit.

---

## Task 6: Docs

**Files:**

- Modify: `docs/functional-spec.md` (§7.4 rule text, §7.7 worked example)
- Modify: `docs/features/scoring.md` (§2.4 Top Four, §4.1 canStillGet)
- Modify: `docs/features/scoring-engine.md` (fix the pre-existing stale tiered-formula text)
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: Update functional-spec.md §7.4 and §7.7**

Read `docs/functional-spec.md` around §7.4 (Top Four rule) and §7.7 (worked example). Update the
rule text to describe both the 5pt membership (unchanged) and the new 3pt position bonus (banked
incrementally per finish match), matching the spec doc's "Rule detail" section. Update the §7.7
worked-example numbers to match the new `score.test.ts` totals (topFour 20→26 if that example
includes a matching Final result; otherwise leave numbers as-is if the example doesn't touch the
Final).

- [ ] **Step 2: Update docs/features/scoring.md §2.4 and §4.1**

§2.4 (Top Four): add the position-bonus rule description, the worked example from the spec doc, and
the incremental-banking note (1st/2nd at Final, 3rd/4th at Bronze).

§4.1 (canStillGet): note that the topFour ceiling now has two independently-resolving components
(membership at QF completion, position bonus at Final/Bronze completion) and that all three
ceiling implementations (`remaining-max.ts`, `build-race-view.ts`, `get-results-view.ts`) must stay
consistent.

- [ ] **Step 3: Fix the stale rule text in scoring-engine.md**

In `docs/features/scoring-engine.md`, find the line describing Top Four as
`max(positionTier, 2×teamsInActualTop4) — not additive` (approx. line 48) and replace it with the
current rule: flat 5pt/team membership (order-agnostic) + 3pt/team position bonus (order-sensitive,
banked per finish match).

- [ ] **Step 4: Update docs/PROGRESS.md**

Add an entry noting the Top Four position bonus feature is implemented: config field
`topFourPositionBonus`, new `ActualFinishMatch.winner` field, and the three updated ceiling
calculations.

- [ ] **Step 5: Run the format/lint check on docs**

Run: `pnpm format` (docs are typically excluded from lint/typecheck but should still be
Prettier-formatted if the repo formats Markdown).

Do not commit — this lands with the final task's single commit.

---

## Task 7: Full verification and single commit

**Files:** none (verification + commit only)

- [ ] **Step 1: Run the full local quality gate**

Run, in order, stopping to fix any failure before proceeding:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
```

- [ ] **Step 2: Run the build**

Run: `pnpm build`
Expected: succeeds (the increment must be runnable per CLAUDE.md's Definition of Done).

- [ ] **Step 3: Manually sanity-check the `winner` backfill didn't change any other computed value**

Run: `pnpm --filter @cup/engine test -- finish-matches` and confirm the `scoreFinal`/`scoreBronze`
suite still passes unchanged (these functions never read `winner`, so behavior must be identical to
before Task 1).

- [ ] **Step 4: Review the full diff**

Run: `git status` and `git diff --stat` to confirm every file listed across Tasks 1-6 was touched,
and no unrelated files were modified.

- [ ] **Step 5: Stage and create the single commit**

```bash
git add -A
git status
```

Review the staged file list, then commit:

```bash
git commit -m "$(cat <<'EOF'
feat(scoring): add Top Four position bonus

Award +3pts per semifinalist whose predicted final-standing slot
(1st/2nd from the Final, 3rd/4th from Bronze) matches the actual
outcome, on top of the existing 5pt membership points. Banks
incrementally as the Final and Bronze matches complete, mirroring
the existing QF-completion banking for membership. Requires a new
ActualFinishMatch.winner field, since goals alone can't determine
the winner of a penalty shootout.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Verify the commit**

Run: `git status` and `git log -1 --stat`
Expected: working tree clean, single new commit containing every file from Tasks 1-6.
