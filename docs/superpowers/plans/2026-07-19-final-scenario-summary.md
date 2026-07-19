# Final Scenario Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the Final is the only match left in the tournament, automatically show a Points Race
summary: for each possible Final winner, who takes the pool and which of their own still-open
special bets need to hit to hold the lead.

**Architecture:** A new pure domain module (`domain/final-scenario.ts`) computes the two-scenario
projection from data `buildPointsRaceView` already has in scope; it's wired into `PointsRaceView`
and rendered by a new presentational card at the top of the Race sub-tab. A small preparatory
refactor extracts one bit of duplicated special-bet-resolution logic so the new module and the
existing specials matrix share it instead of diverging.

**Tech Stack:** TypeScript, Vitest, React (Next.js App Router), existing `@cup/engine`/`@cup/db`
workspace packages.

## Global Constraints

- **One commit for the whole feature** (CLAUDE.md: "One commit per feature... Do not create
  intermediate or partial commits"). Do **not** run `git commit` after Tasks 1–4 — only Task 5
  commits, and it includes the design spec, all implementation, and all tests together.
- The design spec at `docs/superpowers/specs/2026-07-19-final-scenario-summary-design.md` already
  exists (uncommitted) — it lands in the same commit as this implementation, not separately.
- TypeScript strict, no `any`, no unsafe casts (CLAUDE.md "Type safety").
- Mock only at system boundaries; prefer real collaborators — these are pure functions, so tests
  call them directly with plain-object fixtures, no mocking needed at all.
- Run `pnpm --filter web lint`, `pnpm --filter web typecheck` (or the repo's equivalent root
  scripts — check `package.json` if these exact filter names don't exist) after every task, not
  just at the end, so failures are caught close to their cause.

---

## Task 1: Extract special-bet resolution helpers into a domain module

**Files:**

- Create: `apps/web/src/features/results/domain/special-bet-resolution.ts`
- Modify: `apps/web/src/features/results/application/build-race-view.ts:9` (import), `:615-628`
  (`buildPerUserSpecialsRemaining`'s `unresolvedKeys`), `:1306-1362` (delete `ARRAY_ANSWER_BETS` +
  `resolveActualForBet`), `:1364-1379` (`classifySpecialsCellHit`)
- Test: no new test file — this is a behavior-preserving refactor covered by the existing
  `build-race-view.test.ts` (specials-matrix and `buildPerUserSpecialsRemaining` describe blocks)

**Interfaces:**

- Produces: `resolveActualForBet(betKey: string, actualResults: ActualResults): { isArray: boolean; scalar: unknown; array: unknown[] }` and `isBetResolved(actual: { isArray: boolean; scalar: unknown; array: unknown[] }): boolean`, both exported from `apps/web/src/features/results/domain/special-bet-resolution.ts`. Task 2 imports both.

Why: `build-race-view.ts`'s private `resolveActualForBet` (the switch over
`finalDecidedByPenalties` / `finalDecisiveGoalPlayer` / array-answer bets / scalar bets) is exactly
what Task 2's `final-scenario.ts` also needs to know whether a special bet is still open. Since
`final-scenario.ts` is a **domain** module, it must not import from `build-race-view.ts` (an
**application** module) — that would invert the dependency direction. Moving the pure resolution
logic into `domain/` lets both sides depend on it correctly.

- [ ] **Step 1: Create the new domain file**

```ts
// apps/web/src/features/results/domain/special-bet-resolution.ts
import type { ActualResults } from '@cup/engine';

export type ResolvedBetAnswer = { isArray: boolean; scalar: unknown; array: unknown[] };

const ARRAY_ANSWER_BETS = new Set([
  'groupTopScoringTeam',
  'groupTopConcedingTeam',
  'tournamentTopScoringTeam',
  'tournamentTopConcedingTeam',
  'mostYellowCardsTeam',
  'topScorerPlayer',
]);

/**
 * Resolves a special bet's actual answer from ActualResults, normalizing the three different
 * shapes (boolean derived from finalMatch, single value from finalMatch, array/scalar from
 * answers) into one shape callers can check uniformly.
 */
export function resolveActualForBet(
  betKey: string,
  actualResults: ActualResults,
): ResolvedBetAnswer {
  if (betKey === 'finalDecidedByPenalties') {
    const val =
      actualResults.finalMatch !== undefined
        ? actualResults.finalMatch.decidedBy === 'penalties'
        : undefined;
    return { isArray: false, scalar: val, array: [] };
  }
  if (betKey === 'finalDecisiveGoalPlayer') {
    return { isArray: false, scalar: actualResults.finalMatch?.decisiveGoalPlayer, array: [] };
  }
  if (ARRAY_ANSWER_BETS.has(betKey)) {
    const arr = ((actualResults.answers as Record<string, unknown[]>)[betKey] ?? []) as unknown[];
    return { isArray: true, scalar: undefined, array: arr };
  }
  return {
    isArray: false,
    scalar: (actualResults.answers as Record<string, unknown>)[betKey],
    array: [],
  };
}

/** True once a bet has an actual answer recorded (array non-empty, or scalar set). */
export function isBetResolved(actual: ResolvedBetAnswer): boolean {
  return actual.isArray
    ? actual.array.length > 0
    : actual.scalar !== undefined && actual.scalar !== null;
}
```

- [ ] **Step 2: Update `build-race-view.ts` to import instead of defining locally**

Change the import block at the top (line 9) from:

```ts
import { computeRemainingMaxPoints, getSpecialBetDefs } from '@cup/engine';
```

to (add a new import line right after it):

```ts
import { computeRemainingMaxPoints, getSpecialBetDefs } from '@cup/engine';
import { resolveActualForBet, isBetResolved } from '../domain/special-bet-resolution';
```

Delete the now-duplicated `ARRAY_ANSWER_BETS` const and `resolveActualForBet` function (currently
lines 1306–1362, the block starting `const ARRAY_ANSWER_BETS = new Set([` through the closing `}`
of `resolveActualForBet`).

In `buildPerUserSpecialsRemaining` (around line 615–628), change:

```ts
const unresolvedKeys = new Set(
  defs
    .filter((d) => {
      const { isArray, scalar, array } = resolveActualForBet(d.key, actualResults);
      return isArray ? array.length === 0 : scalar === undefined || scalar === null;
    })
    .map((d) => d.key),
);
```

to:

```ts
const unresolvedKeys = new Set(
  defs.filter((d) => !isBetResolved(resolveActualForBet(d.key, actualResults))).map((d) => d.key),
);
```

In `classifySpecialsCellHit` (around line 1364–1379), change:

```ts
const { isArray, scalar, array } = actual;
const isResolved = isArray ? array.length > 0 : scalar !== undefined && scalar !== null;
```

to:

```ts
const { isArray, scalar, array } = actual;
const isResolved = isBetResolved(actual);
```

(Leave the rest of `classifySpecialsCellHit` — the `isArray`/`array`/`scalar` destructure is still
used below for the hit/miss comparison.)

- [ ] **Step 3: Run the existing test suite to confirm the refactor is behavior-preserving**

Run: `pnpm --filter web vitest run src/features/results/application/build-race-view.test.ts`
Expected: PASS, same test count as before the change (no new tests added in this task).

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: no errors.

Do not commit — this task's changes stay staged/uncommitted until Task 5.

---

## Task 2: Implement the `final-scenario` domain module

**Files:**

- Create: `apps/web/src/features/results/domain/final-scenario.ts`
- Test: `apps/web/src/features/results/domain/final-scenario.test.ts`

**Interfaces:**

- Consumes: `resolveActualForBet`, `isBetResolved` from `./special-bet-resolution` (Task 1);
  `computeSpecialBetImpossibility`, `SpecialBetImpossibility` from `./special-bet-impossibility`
  (existing); `deriveImplicitFinaleWinner`, `derivePredictedOpponent`, `resolveFinaleWinner` from
  `./finale-winner` (existing); `getSpecialBetDefs` from `@cup/engine` (existing); types
  `BracketRoundResultView`, `KnockoutMatchView` from `./types` (existing); `LeaderboardEntry`,
  `MatchRow`, `PoolKnockoutPick`, `PoolFinishScore`, `PoolSpecialBet` from `@cup/db`; `Tournament`,
  `ActualResults` from `@cup/engine`.
- Produces: `buildFinalScenarioView(params): FinalScenarioView`, plus exported types
  `FinalScenarioView`, `FinalScenarioOutcome`, `FinalScenarioPendingItem` — all consumed by Task 3.

### Step 1: Write the failing test file

```ts
// apps/web/src/features/results/domain/final-scenario.test.ts
import { describe, it, expect } from 'vitest';
import { miniTournament } from '@cup/engine/testing';
import { points } from '@cup/engine';
import type { UserId, BracketMatchKey, ActualResults, TeamId } from '@cup/engine';
import type {
  LeaderboardEntry,
  MatchRow,
  PoolKnockoutPick,
  PoolFinishScore,
  PoolSpecialBet,
} from '@cup/db';
import type { KnockoutMatchView, BracketRoundResultView } from './types';
import { buildFinalScenarioView } from './final-scenario';

function makeLeaderboardEntry(uid: string, displayName: string, pointsTotal = 0): LeaderboardEntry {
  return {
    userId: uid as UserId,
    displayName,
    pointsTotal: points(pointsTotal),
    breakdown: null,
    completionPercent: null,
  };
}

function makeKnockoutMatch(
  key: string,
  round: string,
  status: 'scheduled' | 'final',
  opts: {
    homeTeamId?: string | null;
    homeTeamName?: string | null;
    awayTeamId?: string | null;
    awayTeamName?: string | null;
  } = {},
): KnockoutMatchView {
  return {
    bracketMatchKey: key,
    round,
    homeTeamId: opts.homeTeamId ?? null,
    homeTeamName: opts.homeTeamName ?? null,
    awayTeamId: opts.awayTeamId ?? null,
    awayTeamName: opts.awayTeamName ?? null,
    actualHome: null,
    actualAway: null,
    actualWinnerId: null,
    actualWinnerName: null,
    kickoff: null,
    status,
    pickedWinnerId: null,
    pickedWinnerName: null,
    pickedOpponentId: null,
    pickedOpponentName: null,
    pickStatus: 'no-pick',
    predictedHome: null,
    predictedAway: null,
    predictedGoalsByTeam: null,
    hit: 'pending',
    points: 0,
    projected: false,
    homeTeamConfirmed: true,
    awayTeamConfirmed: true,
    predictedHomeTeamId: null,
    predictedHomeTeamName: null,
    predictedAwayTeamId: null,
    predictedAwayTeamName: null,
    pickedHomeTeamId: null,
    pickedHomeTeamName: null,
    pickedAwayTeamId: null,
    pickedAwayTeamName: null,
    isEntryRound: false,
    homeTeamPredictedPct: null,
    awayTeamPredictedPct: null,
    homeTeamUserPredictedParticipant: false,
    awayTeamUserPredictedParticipant: false,
    poolPickHomePct: null,
    poolPickAwayPct: null,
    pickedOpponentStatus: 'no-pick',
    homeSlotFeederPickedId: null,
    awaySlotFeederPickedId: null,
    decidedBy: null,
  };
}

function makeRound(label: string, matches: KnockoutMatchView[]): BracketRoundResultView {
  return { label, matches };
}

function makePick(uid: string, key: string, winnerTeamId: string): PoolKnockoutPick {
  return { userId: uid as UserId, bracketMatchKey: key as BracketMatchKey, winnerTeamId };
}

function makeFinishScore(
  uid: string,
  home: number,
  away: number,
  teamIds?: { homeTeamId: string; awayTeamId: string },
): PoolFinishScore {
  return {
    userId: uid as UserId,
    match: 'final',
    home,
    away,
    homeTeamId: teamIds?.homeTeamId ?? null,
    awayTeamId: teamIds?.awayTeamId ?? null,
  };
}

function makeSpecialBet(uid: string, betKey: string, value: unknown): PoolSpecialBet {
  return { userId: uid as UserId, betKey, value };
}

function groupMatch(
  id: string,
  groupId: string,
  home: string,
  away: string,
  homeGoals: number,
  awayGoals: number,
): MatchRow {
  return {
    id,
    tournamentId: miniTournament.id as unknown as MatchRow['tournamentId'],
    stage: 'group',
    groupId,
    homeTeamId: home,
    awayTeamId: away,
    kickoff: null,
    homeGoals,
    awayGoals,
    homeConduct: null,
    awayConduct: null,
    winnerTeamId: homeGoals > awayGoals ? home : away,
    decidedBy: null,
    status: 'final',
  };
}

const emptyActualResults: ActualResults = { matchResults: [], groupOrder: {}, answers: {} };

// The Final: A1 (home) vs B1 (away), both finalists confirmed, not yet played.
const finalScheduled = makeKnockoutMatch('final', 'Final', 'scheduled', {
  homeTeamId: 'A1',
  homeTeamName: 'Team A1',
  awayTeamId: 'B1',
  awayTeamName: 'Team B1',
});
const finalPlayed = makeKnockoutMatch('final', 'Final', 'final', {
  homeTeamId: 'A1',
  awayTeamId: 'B1',
});
const bronzePlayed = makeKnockoutMatch('bronze', 'Bronze', 'final', {
  homeTeamId: 'C1',
  awayTeamId: 'D1',
});
const bronzeScheduled = makeKnockoutMatch('bronze', 'Bronze', 'scheduled', {
  homeTeamId: 'C1',
  awayTeamId: 'D1',
});

const baseParams = {
  allMatches: [] as MatchRow[],
  def: miniTournament,
  poolKnockoutPicks: [] as PoolKnockoutPick[],
  poolFinishScores: [] as PoolFinishScore[],
  poolSpecialBets: [] as PoolSpecialBet[],
  actualResults: emptyActualResults,
};

describe('buildFinalScenarioView — trigger', () => {
  it('is null when the Final has already been played', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 10)],
      bracketRounds: [makeRound('Final', [finalPlayed])],
      bronzeMatch: bronzePlayed,
    });
    expect(view).toBeNull();
  });

  it('is null when Bronze has not been played yet', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 10)],
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzeScheduled,
    });
    expect(view).toBeNull();
  });

  it('is null when both finalists are not yet confirmed', () => {
    const halfKnown = makeKnockoutMatch('final', 'Final', 'scheduled', {
      homeTeamId: 'A1',
      awayTeamId: null,
    });
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 10)],
      bracketRounds: [makeRound('Final', [halfKnown])],
      bronzeMatch: bronzePlayed,
    });
    expect(view).toBeNull();
  });

  it('is null when the leaderboard is empty', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [],
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    expect(view).toBeNull();
  });

  it('is active with correct team ids/names when only the Final remains', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 10)],
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    expect(view).not.toBeNull();
    expect(view!.homeTeamId).toBe('A1');
    expect(view!.homeTeamName).toBe('Team A1');
    expect(view!.awayTeamId).toBe('B1');
    expect(view!.awayTeamName).toBe('Team B1');
  });
});

describe('buildFinalScenarioView — clinched baseline', () => {
  it('a single-member pool is trivially clinched in both scenarios', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 10)],
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    expect(view!.home.status).toBe('clinched');
    expect(view!.home.projectedWinnerUserId).toBe('u1');
    expect(view!.away.status).toBe('clinched');
    expect(view!.away.projectedWinnerUserId).toBe('u1');
  });

  it('the higher-pointsTotal player is clinched when no picks or bets are involved', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [
        makeLeaderboardEntry('u1', 'Alice', 100),
        makeLeaderboardEntry('u2', 'Bob', 80),
      ],
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    expect(view!.home.status).toBe('clinched');
    expect(view!.home.projectedWinnerDisplayName).toBe('Alice');
    expect(view!.home.projectedPoints).toBe(100);
  });

  it('ties break by displayName ascending, matching the leaderboard tie-break', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Zack', 50), makeLeaderboardEntry('u2', 'Amy', 50)],
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    expect(view!.home.projectedWinnerDisplayName).toBe('Amy');
  });
});

describe('buildFinalScenarioView — position bonus flips the projected winner', () => {
  // sf1 feeds qf1+qf2, sf2 feeds qf3+qf4 in miniTournament's bracket (see __fixtures__/mini-tournament.ts).
  // Both players pick consistent SF chains resolving to {A1, B1} as their predicted finalist pair —
  // only their Final-winner pick differs, isolating the positionBonus effect.
  function consistentPicks(uid: string, finalWinner: 'A1' | 'B1'): PoolKnockoutPick[] {
    return [
      makePick(uid, 'qf1', 'A1'),
      makePick(uid, 'qf2', 'C1'),
      makePick(uid, 'qf3', 'B1'),
      makePick(uid, 'qf4', 'D1'),
      makePick(uid, 'sf1', 'A1'),
      makePick(uid, 'sf2', 'B1'),
      makePick(uid, 'final', finalWinner),
    ];
  }

  it('a correct winner pick with a consistent SF chain earns 2x topFourPositionBonus (3 each)', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 50), makeLeaderboardEntry('u2', 'Bob', 55)],
      poolKnockoutPicks: [...consistentPicks('u1', 'A1'), ...consistentPicks('u2', 'B1')],
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    // Home scenario (A1 wins): Alice picked A1 correctly (+3 winner, +3 opponent=B1) -> 56.
    // Bob picked B1 (wrong team, wrong opponent too) -> stays 55. Alice leads, clinched (no pending items).
    expect(view!.home.projectedWinnerDisplayName).toBe('Alice');
    expect(view!.home.projectedPoints).toBe(56);
    expect(view!.home.status).toBe('clinched');

    // Away scenario (B1 wins): Bob picked B1 correctly -> 55 + 6 = 61. Alice picked A1 (wrong) -> stays 50.
    expect(view!.away.projectedWinnerDisplayName).toBe('Bob');
    expect(view!.away.projectedPoints).toBe(61);
    expect(view!.away.status).toBe('clinched');
  });
});

describe('buildFinalScenarioView — must-hit checklist', () => {
  it("lists only as many of the leader's own pending items as needed, highest-value first", () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 50), makeLeaderboardEntry('u2', 'Bob', 48)],
      poolSpecialBets: [
        makeSpecialBet('u1', 'mostYellowCardsTeam', 'A1'), // 15 pts
        makeSpecialBet('u1', 'groupTopScoringTeam', 'A1'), // 10 pts
        makeSpecialBet('u2', 'highestMatchGoals', 5), // 10 pts
      ],
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    // Bob's ceiling = 48 + 10 = 58 > Alice's 50 -> not clinched.
    // Alice needs > 8 more; her highest pending item alone (15) clears it.
    expect(view!.home.status).toBe('checklist');
    expect(view!.home.mustHit).toHaveLength(1);
    expect(view!.home.mustHit[0]!.points).toBe(15);
  });

  it("is too-close-to-call when even all of the leader's pending items fall short", () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 50), makeLeaderboardEntry('u2', 'Bob', 60)],
      poolSpecialBets: [
        makeSpecialBet('u1', 'mostYellowCardsTeam', 'A1'), // 15 pts
        makeSpecialBet('u1', 'groupTopScoringTeam', 'A1'), // 10 pts
        makeSpecialBet('u2', 'highestMatchGoals', 5), // 10 pts
      ],
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    // No picks for either user -> positionBonus is 0 everywhere, so lockedScore is just
    // pointsTotal: Bob (60) > Alice (50) -> Bob is the leader. maxRivalCeiling = Alice's ceiling
    // = 50 + 15 + 10 = 75. Bob's lockedScore (60) < 75 -> not clinched. Bob's only pending item
    // is his 10-pt bet: running = 60 + 10 = 70, still not > 75 -> falls short even using
    // everything he has.
    expect(view!.home.projectedWinnerDisplayName).toBe('Bob');
    expect(view!.home.status).toBe('too-close');
    expect(view!.home.mustHit).toHaveLength(1);
    expect(view!.home.mustHit[0]!.points).toBe(10);
  });

  it("excludes an already-resolved special bet from a rival's ceiling", () => {
    const resolvedActuals: ActualResults = {
      ...emptyActualResults,
      answers: { highestMatchGoals: 7 },
    };
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 56), makeLeaderboardEntry('u2', 'Bob', 55)],
      poolSpecialBets: [makeSpecialBet('u2', 'highestMatchGoals', 5)],
      actualResults: resolvedActuals,
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    // Bob's highestMatchGoals bet is already resolved (actual=7) -> not a pending item -> ceiling stays 55.
    expect(view!.home.status).toBe('clinched');
  });

  it("excludes a mathematically impossible special bet pick from a rival's ceiling", () => {
    const groupAFull: MatchRow[] = [
      groupMatch('mA1', 'A', 'A1', 'A2', 3, 0),
      groupMatch('mA2', 'A', 'A1', 'A3', 3, 0),
      groupMatch('mA3', 'A', 'A1', 'A4', 3, 0),
      groupMatch('mA4', 'A', 'A2', 'A3', 3, 0),
      groupMatch('mA5', 'A', 'A2', 'A4', 3, 0),
      groupMatch('mA6', 'A', 'A3', 'A4', 1, 1),
    ];
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 56), makeLeaderboardEntry('u2', 'Bob', 55)],
      poolSpecialBets: [makeSpecialBet('u2', 'groupTopScoringTeam', 'A2')], // A1 dominates -> A2 pick is dead
      allMatches: groupAFull,
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    expect(view!.home.status).toBe('clinched');
  });
});

describe('buildFinalScenarioView — Final exact-score pending item', () => {
  // A snapshot-backed finish score also drives pickedWinner resolution (resolveFinaleWinner's
  // team-id-snapshot branch short-circuits before touching bracket picks at all), so a non-tied
  // prediction contributes BOTH a positionBonus (in whichever scenario it implies) and — only in
  // that same scenario — the exact-score pending item. Both tests below account for that combined
  // effect explicitly rather than assuming the item is the only thing moving.

  it('contributes a pending item only in the scenario matching the implied winner', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 45), makeLeaderboardEntry('u2', 'Bob', 44)],
      poolFinishScores: [makeFinishScore('u1', 2, 1, { homeTeamId: 'A1', awayTeamId: 'B1' })],
      poolSpecialBets: [makeSpecialBet('u2', 'highestMatchGoals', 5)], // Bob's own 10-pt pending item
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    // Home (A1 wins): Alice's 2-1 prediction implies A1 -> pickedWinner='A1' matches scenarioWinner
    // -> +3 positionBonus (no opponent pick, so only the winner half applies) -> lockedScore 48.
    // Bob stays at 44. Alice leads; maxRivalCeiling = Bob's ceiling = 44 + 10 = 54. 48 < 54 -> not
    // clinched. Alice's only pending item here is the 5-pt exact score (implied winner matches) ->
    // running = 48 + 5 = 53, still <= 54 -> too-close, but the item IS present.
    expect(view!.home.status).toBe('too-close');
    expect(view!.home.mustHit).toHaveLength(1);
    expect(view!.home.mustHit[0]!.points).toBe(5);

    // Away (B1 wins): Alice's implied winner (A1) doesn't match -> no positionBonus, no exact-score
    // item -> lockedScore 45, pendingItems empty. Bob unchanged at 44 + [10]. Alice still leads
    // (45 > 44); maxRivalCeiling = 54; not clinched; but Alice has nothing pending to list.
    expect(view!.away.status).toBe('too-close');
    expect(view!.away.mustHit).toHaveLength(0);
  });

  it('is pending in both scenarios when the predicted score is a draw', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 40), makeLeaderboardEntry('u2', 'Bob', 38)],
      poolFinishScores: [makeFinishScore('u1', 1, 1, { homeTeamId: 'A1', awayTeamId: 'B1' })],
      poolSpecialBets: [makeSpecialBet('u2', 'highestMatchGoals', 5)], // Bob's own 10-pt pending item
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    // A tied prediction never implies a winner, so resolveFinaleWinner returns null before even
    // looking at the snapshot -> Alice's positionBonus is 0 in both scenarios, isolating the
    // exact-score item's own behavior. Alice leads 40 > 38 either way; maxRivalCeiling = Bob's
    // ceiling = 38 + 10 = 48; not clinched. Alice's only pending item (the 5-pt draw prediction) is
    // present in both scenarios -> mustHit has exactly 1 item both times.
    expect(view!.home.status).toBe('too-close');
    expect(view!.home.mustHit).toHaveLength(1);
    expect(view!.home.mustHit[0]!.points).toBe(5);
    expect(view!.away.status).toBe('too-close');
    expect(view!.away.mustHit).toHaveLength(1);
    expect(view!.away.mustHit[0]!.points).toBe(5);
  });

  it('is never included when the finish score has no team-id snapshot', () => {
    const view = buildFinalScenarioView({
      ...baseParams,
      leaderboard: [makeLeaderboardEntry('u1', 'Alice', 40), makeLeaderboardEntry('u2', 'Bob', 38)],
      poolFinishScores: [makeFinishScore('u1', 1, 1)], // tied, no homeTeamId/awayTeamId snapshot
      poolSpecialBets: [makeSpecialBet('u2', 'highestMatchGoals', 5)],
      bracketRounds: [makeRound('Final', [finalScheduled])],
      bronzeMatch: bronzePlayed,
    });
    // Same point totals as the draw test above, but no snapshot -> exactScorePoints can never be
    // awarded (finish-matches.ts), so no pending item should appear at all, in either scenario —
    // contrast with the previous test's mustHit length of 1.
    expect(view!.home.mustHit).toHaveLength(0);
    expect(view!.away.mustHit).toHaveLength(0);
  });
});
```

### Step 2: Run the test to verify it fails

Run: `pnpm --filter web vitest run src/features/results/domain/final-scenario.test.ts`
Expected: FAIL — `Cannot find module './final-scenario'` (the module doesn't exist yet).

### Step 3: Implement `final-scenario.ts`

```ts
// apps/web/src/features/results/domain/final-scenario.ts
import { getSpecialBetDefs } from '@cup/engine';
import type { Tournament, ActualResults } from '@cup/engine';
import type {
  LeaderboardEntry,
  MatchRow,
  PoolKnockoutPick,
  PoolFinishScore,
  PoolSpecialBet,
} from '@cup/db';
import type { BracketRoundResultView, KnockoutMatchView } from './types';
import {
  deriveImplicitFinaleWinner,
  derivePredictedOpponent,
  resolveFinaleWinner,
} from './finale-winner';
import {
  computeSpecialBetImpossibility,
  type SpecialBetImpossibility,
} from './special-bet-impossibility';
import { resolveActualForBet, isBetResolved } from './special-bet-resolution';

export type FinalScenarioPendingItem = { label: string; points: number };

export type FinalScenarioOutcome = {
  winnerTeamId: string;
  winnerTeamName: string;
  projectedWinnerUserId: string;
  projectedWinnerDisplayName: string;
  projectedPoints: number;
  status: 'clinched' | 'checklist' | 'too-close';
  mustHit: FinalScenarioPendingItem[];
};

export type FinalScenarioView = {
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  home: FinalScenarioOutcome;
  away: FinalScenarioOutcome;
} | null;

type Params = {
  leaderboard: LeaderboardEntry[];
  allMatches: MatchRow[];
  def: Tournament;
  bracketRounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
  poolKnockoutPicks: PoolKnockoutPick[];
  poolFinishScores: PoolFinishScore[];
  poolSpecialBets: PoolSpecialBet[];
  actualResults: ActualResults;
};

/** Locates the Final's KnockoutMatchView and confirms both finalists + Bronze are settled. */
function findActiveFinalMatch(
  bracketRounds: BracketRoundResultView[],
  bronzeMatch: KnockoutMatchView | null,
  finalMatchKey: string,
): KnockoutMatchView | null {
  const finalMatchView =
    bracketRounds.flatMap((r) => r.matches).find((m) => m.bracketMatchKey === finalMatchKey) ??
    null;
  if (finalMatchView === null) return null;
  if (finalMatchView.status === 'final') return null;
  if (finalMatchView.homeTeamId === null || finalMatchView.awayTeamId === null) return null;
  if (bronzeMatch === null || bronzeMatch.status !== 'final') return null;
  return finalMatchView;
}

type UserFinalPick = { pickedWinner: string | null; predictedOpponent: string | null };

/**
 * Per-user effective Final winner pick + derived predicted opponent (from the user's own SF pick
 * chain — may not resolve to a real pair when the user's bracket is busted, which is expected and
 * handled by the caller via independent comparisons rather than an assumed 2x/0x binary).
 */
function buildFinalPicksByUser(
  leaderboard: LeaderboardEntry[],
  poolKnockoutPicks: PoolKnockoutPick[],
  poolFinishScores: PoolFinishScore[],
  finalMatchView: KnockoutMatchView,
  bracket: Tournament['bracket'],
): Map<string, UserFinalPick> {
  const finalMatchKey = bracket.finalMatch as string;
  const picksByUser = new Map<string, Map<string, string>>();
  for (const pick of poolKnockoutPicks) {
    const uid = pick.userId as string;
    if (!picksByUser.has(uid)) picksByUser.set(uid, new Map());
    picksByUser.get(uid)!.set(pick.bracketMatchKey as string, pick.winnerTeamId);
  }
  const finishScoreByUser = new Map<string, PoolFinishScore>();
  for (const fs of poolFinishScores) {
    if (fs.match === 'final') finishScoreByUser.set(fs.userId as string, fs);
  }

  const result = new Map<string, UserFinalPick>();
  for (const entry of leaderboard) {
    const uid = entry.userId as string;
    const userPickMap = picksByUser.get(uid) ?? new Map<string, string>();
    const knockoutPick = userPickMap.get(finalMatchKey) ?? null;
    const fs = finishScoreByUser.get(uid);

    const derivedWinner = resolveFinaleWinner(fs, (home, away) =>
      deriveImplicitFinaleWinner(finalMatchKey, bracket, userPickMap, home, away),
    );

    let pickedWinner: string | null;
    if (derivedWinner !== null) {
      pickedWinner = derivedWinner;
    } else if (fs === undefined || fs.home === fs.away) {
      pickedWinner = knockoutPick;
    } else {
      pickedWinner =
        fs.home > fs.away
          ? (finalMatchView.homeTeamId ?? knockoutPick)
          : (finalMatchView.awayTeamId ?? knockoutPick);
    }

    const predictedOpponent = derivePredictedOpponent(
      finalMatchKey,
      bracket,
      userPickMap,
      pickedWinner,
    );
    result.set(uid, { pickedWinner, predictedOpponent });
  }
  return result;
}

/** Every still-open special bet's points for each user, scenario-independent. */
function buildSpecialPendingItemsByUser(
  poolSpecialBets: PoolSpecialBet[],
  actualResults: ActualResults,
  specialDefs: { key: string; label: string; points: number }[],
  impossibility: SpecialBetImpossibility,
): Map<string, FinalScenarioPendingItem[]> {
  const defByKey = new Map(specialDefs.map((d) => [d.key, d]));
  const result = new Map<string, FinalScenarioPendingItem[]>();
  for (const sb of poolSpecialBets) {
    const def = defByKey.get(sb.betKey);
    if (def === undefined) continue;
    if (isBetResolved(resolveActualForBet(sb.betKey, actualResults))) continue;
    if (impossibility.isImpossible(sb.betKey, sb.value)) continue;
    const uid = sb.userId as string;
    if (!result.has(uid)) result.set(uid, []);
    result.get(uid)!.push({ label: def.label, points: def.points });
  }
  return result;
}

/**
 * Final exact-score bonus as a pending item for one user in one scenario, or null when it can
 * never be awarded (no team-id snapshot) or is structurally dead in this scenario (predicted a
 * decisive score for the other team).
 */
function finalExactScoreItem(
  fs: PoolFinishScore | undefined,
  scenarioWinnerTeamId: string,
  exactScorePoints: number,
): FinalScenarioPendingItem | null {
  if (fs === undefined || fs.homeTeamId === null || fs.awayTeamId === null) return null;
  if (fs.home === fs.away) return { label: 'Final exact score', points: exactScorePoints };
  const impliedWinner = fs.home > fs.away ? fs.homeTeamId : fs.awayTeamId;
  if (impliedWinner !== scenarioWinnerTeamId) return null;
  return { label: 'Final exact score', points: exactScorePoints };
}

function sumPoints(items: FinalScenarioPendingItem[]): number {
  return items.reduce((sum, item) => sum + item.points, 0);
}

function buildOutcome(options: {
  scenarioWinnerTeamId: string;
  scenarioWinnerTeamName: string;
  scenarioLoserTeamId: string;
  leaderboard: LeaderboardEntry[];
  finalPicksByUser: Map<string, UserFinalPick>;
  specialPendingByUser: Map<string, FinalScenarioPendingItem[]>;
  finishScoreByUser: Map<string, PoolFinishScore>;
  topFourPositionBonus: number;
  finalExactScorePoints: number;
}): FinalScenarioOutcome {
  const {
    scenarioWinnerTeamId,
    scenarioWinnerTeamName,
    scenarioLoserTeamId,
    leaderboard,
    finalPicksByUser,
    specialPendingByUser,
    finishScoreByUser,
    topFourPositionBonus,
    finalExactScorePoints,
  } = options;

  const rows = leaderboard.map((entry) => {
    const uid = entry.userId as string;
    const pick = finalPicksByUser.get(uid)!;
    const positionBonus =
      (pick.pickedWinner === scenarioWinnerTeamId ? topFourPositionBonus : 0) +
      (pick.predictedOpponent === scenarioLoserTeamId ? topFourPositionBonus : 0);
    const lockedScore = entry.pointsTotal + positionBonus;

    const pendingItems = [...(specialPendingByUser.get(uid) ?? [])];
    const exactItem = finalExactScoreItem(
      finishScoreByUser.get(uid),
      scenarioWinnerTeamId,
      finalExactScorePoints,
    );
    if (exactItem !== null) pendingItems.push(exactItem);

    return { userId: uid, displayName: entry.displayName, lockedScore, pendingItems };
  });

  const sorted = rows.toSorted(
    (a, b) => b.lockedScore - a.lockedScore || a.displayName.localeCompare(b.displayName),
  );
  const leader = sorted[0]!;
  const rivals = sorted.slice(1);
  const maxRivalCeiling =
    rivals.length === 0
      ? -Infinity
      : Math.max(...rivals.map((r) => r.lockedScore + sumPoints(r.pendingItems)));

  if (leader.lockedScore >= maxRivalCeiling) {
    return {
      winnerTeamId: scenarioWinnerTeamId,
      winnerTeamName: scenarioWinnerTeamName,
      projectedWinnerUserId: leader.userId,
      projectedWinnerDisplayName: leader.displayName,
      projectedPoints: leader.lockedScore,
      status: 'clinched',
      mustHit: [],
    };
  }

  const ordered = leader.pendingItems.toSorted((a, b) => b.points - a.points);
  const mustHit: FinalScenarioPendingItem[] = [];
  let running = leader.lockedScore;
  for (const item of ordered) {
    mustHit.push(item);
    running += item.points;
    if (running > maxRivalCeiling) break;
  }

  return {
    winnerTeamId: scenarioWinnerTeamId,
    winnerTeamName: scenarioWinnerTeamName,
    projectedWinnerUserId: leader.userId,
    projectedWinnerDisplayName: leader.displayName,
    projectedPoints: leader.lockedScore,
    status: running > maxRivalCeiling ? 'checklist' : 'too-close',
    mustHit,
  };
}

export function buildFinalScenarioView(params: Params): FinalScenarioView {
  const {
    leaderboard,
    allMatches,
    def,
    bracketRounds,
    bronzeMatch,
    poolKnockoutPicks,
    poolFinishScores,
    poolSpecialBets,
    actualResults,
  } = params;

  if (leaderboard.length === 0) return null;

  const finalMatchView = findActiveFinalMatch(
    bracketRounds,
    bronzeMatch,
    def.bracket.finalMatch as string,
  );
  if (finalMatchView === null) return null;

  const homeTeamId = finalMatchView.homeTeamId!;
  const awayTeamId = finalMatchView.awayTeamId!;
  const teamNames = new Map(def.teams.map((t) => [t.id as string, t.name]));
  const homeTeamName = teamNames.get(homeTeamId) ?? homeTeamId;
  const awayTeamName = teamNames.get(awayTeamId) ?? awayTeamId;

  const specialDefs = getSpecialBetDefs(def.scoring).filter((d) => d.points > 0);
  const impossibility = computeSpecialBetImpossibility(def, allMatches);
  const specialPendingByUser = buildSpecialPendingItemsByUser(
    poolSpecialBets,
    actualResults,
    specialDefs,
    impossibility,
  );
  const finalPicksByUser = buildFinalPicksByUser(
    leaderboard,
    poolKnockoutPicks,
    poolFinishScores,
    finalMatchView,
    def.bracket,
  );
  const finishScoreByUser = new Map(
    poolFinishScores.filter((fs) => fs.match === 'final').map((fs) => [fs.userId as string, fs]),
  );

  return {
    homeTeamId,
    homeTeamName,
    awayTeamId,
    awayTeamName,
    home: buildOutcome({
      scenarioWinnerTeamId: homeTeamId,
      scenarioWinnerTeamName: homeTeamName,
      scenarioLoserTeamId: awayTeamId,
      leaderboard,
      finalPicksByUser,
      specialPendingByUser,
      finishScoreByUser,
      topFourPositionBonus: def.scoring.topFourPositionBonus,
      finalExactScorePoints: def.scoring.final.exactScore,
    }),
    away: buildOutcome({
      scenarioWinnerTeamId: awayTeamId,
      scenarioWinnerTeamName: awayTeamName,
      scenarioLoserTeamId: homeTeamId,
      leaderboard,
      finalPicksByUser,
      specialPendingByUser,
      finishScoreByUser,
      topFourPositionBonus: def.scoring.topFourPositionBonus,
      finalExactScorePoints: def.scoring.final.exactScore,
    }),
  };
}
```

### Step 4: Run the test to verify it passes

Run: `pnpm --filter web vitest run src/features/results/domain/final-scenario.test.ts`
Expected: PASS, all `it` blocks green. Every fixture's point totals in this file were computed by
hand against the algorithm in Step 3 (see the inline comments above each assertion) — if any case
fails, the bug is in the implementation, not the test's expected numbers; re-derive by hand from the
`buildOutcome` logic before changing an assertion.

### Step 5: Typecheck and lint

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: no errors.

Do not commit — stays uncommitted until Task 5.

---

## Task 3: Wire `finalScenario` into `PointsRaceView`

**Files:**

- Modify: `apps/web/src/features/results/domain/types.ts` (add field + import)
- Modify: `apps/web/src/features/results/application/build-race-view.ts` (call the new builder,
  include the result in the returned `PointsRaceView`)
- Modify: `apps/web/src/features/results/application/build-race-view.test.ts` (append one
  integration-style test)

**Interfaces:**

- Consumes: `buildFinalScenarioView`, `FinalScenarioView` from `../domain/final-scenario` (Task 2).
- Produces: `PointsRaceView.finalScenario: FinalScenarioView`, consumed by Task 4's UI.

- [ ] **Step 1: Add the field to `PointsRaceView`**

In `apps/web/src/features/results/domain/types.ts`, add near the top (alongside the other domain
re-exports, e.g. right after the `StageKey`/`LeaderboardEntry` re-export block):

```ts
export type {
  FinalScenarioView,
  FinalScenarioOutcome,
  FinalScenarioPendingItem,
} from './final-scenario';
```

Then in the `PointsRaceView` type definition, add the new field (after `specialsMatrixBets`):

```ts
export type PointsRaceView = {
  // ... existing fields unchanged ...
  /** Rows of the per-special-bet matrix, sorted by totalPoints DESC. */
  specialsMatrix: SpecialsMatrixEntry[];
  /** Special bet column definitions, filtered to bets with points > 0. */
  specialsMatrixBets: SpecialsMatrixBet[];
  /** Non-null only when the Final is the sole remaining match — see domain/final-scenario.ts. */
  finalScenario: FinalScenarioView;
};
```

- [ ] **Step 2: Write the failing integration test**

Append to the end of `apps/web/src/features/results/application/build-race-view.test.ts`:

```ts
// ---------------------------------------------------------------------------
// buildPointsRaceView — finalScenario wiring
// ---------------------------------------------------------------------------

describe('buildPointsRaceView — finalScenario', () => {
  it('is null when the tournament has not reached the only-Final-left state', () => {
    const leaderboard = [makeLeaderboardEntry('u1', 'Alice', 10)];
    const { finalScenario } = buildPointsRaceView({
      leaderboard,
      userId: null,
      allMatches: [],
      poolGroupScores: [],
      def: miniTournament,
      myTotalCanStillGet: 0,
      bracketRounds: [],
      bronzeMatch: null,
      poolKnockoutPicks: [],
      poolFinishScores: [],
      poolSpecialBets: [],
      actualResults: emptyActualResults,
    });
    expect(finalScenario).toBeNull();
  });

  it('is populated once only the Final remains', () => {
    const finalMatch = makeKnockoutMatch('final', 'Final', 'scheduled', {
      homeTeamId: 'A1',
      awayTeamId: 'B1',
    });
    const bronzeMatch = makeKnockoutMatch('bronze', 'Bronze', 'final', {
      homeTeamId: 'C1',
      awayTeamId: 'D1',
    });
    const leaderboard = [
      makeLeaderboardEntry('u1', 'Alice', 60),
      makeLeaderboardEntry('u2', 'Bob', 40),
    ];
    const { finalScenario } = buildPointsRaceView({
      leaderboard,
      userId: null,
      allMatches: [],
      poolGroupScores: [],
      def: miniTournament,
      myTotalCanStillGet: 0,
      bracketRounds: [makeRound('Final', [finalMatch])],
      bronzeMatch,
      poolKnockoutPicks: [],
      poolFinishScores: [],
      poolSpecialBets: [],
      actualResults: emptyActualResults,
    });
    expect(finalScenario).not.toBeNull();
    expect(finalScenario!.homeTeamId).toBe('A1');
    expect(finalScenario!.home.projectedWinnerDisplayName).toBe('Alice');
    expect(finalScenario!.away.projectedWinnerDisplayName).toBe('Alice');
  });
});
```

This reuses `makeLeaderboardEntry`, `makeKnockoutMatch`, `makeRound`, and `emptyActualResults`,
which already exist earlier in this same test file (see the top of
`build-race-view.test.ts` and the constant defined near line 1416) — no new imports needed beyond
what Step 3 below adds to `build-race-view.ts` itself (the test only calls the already-imported
`buildPointsRaceView`).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web vitest run src/features/results/application/build-race-view.test.ts -t finalScenario`
Expected: FAIL — `finalScenario` is `undefined`, not present on the returned object / TS error that
`PointsRaceView` has no `finalScenario` (depending on whether the type change from Step 1 already
landed; if so this becomes a runtime `undefined` failure instead of a type error).

- [ ] **Step 3: Wire it into `buildPointsRaceView`**

In `apps/web/src/features/results/application/build-race-view.ts`, add an import near the other
domain imports (after the `buildVariantCellKey` import):

```ts
import { buildFinalScenarioView } from '../domain/final-scenario';
```

Inside `buildPointsRaceView`, after the existing `specialsMatrix`/`specialsMatrixBets` computation
and before the `return` statement, add:

```ts
const finalScenario = buildFinalScenarioView({
  leaderboard,
  allMatches,
  def,
  bracketRounds,
  bronzeMatch,
  poolKnockoutPicks,
  poolFinishScores,
  poolSpecialBets,
  actualResults,
});
```

Then add `finalScenario,` to the returned object (alongside `specialsMatrix, specialsMatrixBets,`).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter web vitest run src/features/results/application/build-race-view.test.ts`
Expected: PASS, full file (not just the new tests) — confirms Task 1's refactor and this wiring
didn't regress anything else in this large test file.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: no errors. This will also catch any other call site constructing a `PointsRaceView`
object literal by hand that now needs the new required field — search for them:

Run: `grep -rn "PointsRaceView = {" apps/web/src`
Expected: only the one in `build-race-view.ts` (the return statement just edited) constructs a full
literal; if others turn up, add `finalScenario: null` to each and re-run typecheck.

Do not commit — stays uncommitted until Task 5.

---

## Task 4: `FinalScenarioCard` UI component

**Files:**

- Create: `apps/web/src/features/results/ui/FinalScenarioCard.tsx`
- Modify: `apps/web/src/features/results/ui/RaceView.tsx` (import + render)
- Modify: `apps/web/src/features/results/index.ts` (export the new component, if the barrel exports
  other `results/ui` components individually — check the existing barrel first)

**Interfaces:**

- Consumes: `FinalScenarioView`, `FinalScenarioOutcome` from `../domain/final-scenario` (re-exported
  via `../domain/types` per Task 3 Step 1); `TeamBadge`, `cn` from `@/shared/ui`.
- Produces: `FinalScenarioCard({ scenario: FinalScenarioView }): ReactElement | null`.

No dedicated test file for this task — matches this feature's existing convention: presentational
`.tsx` components under `results/ui/` (e.g. `StatCard.tsx`, `ProjectedStandings.tsx`, `SwingCard.tsx`)
don't have component tests; only pure logic extracted into sibling `*-utils.ts` files does. This
component has no branching logic complex enough to warrant extracting a utils file — it just maps
the already-fully-computed `FinalScenarioOutcome` onto markup.

- [ ] **Step 1: Check the barrel export convention**

Run: `grep -n "RaceView\|ProjectedStandings\|SwingCard" apps/web/src/features/results/index.ts`

If those UI components are individually exported from the barrel, add `FinalScenarioCard` the same
way in Step 4 below. If (as is likely, since `RaceView.tsx` is a client component owned entirely by
`PointsRaceTab.tsx` which isn't itself re-exported per-subcomponent) they are **not** individually
exported, skip the barrel change — `FinalScenarioCard` only needs to be imported by `RaceView.tsx`
in the same folder.

- [ ] **Step 2: Create the component**

```tsx
// apps/web/src/features/results/ui/FinalScenarioCard.tsx
import type { ReactElement } from 'react';
import type { FinalScenarioOutcome, FinalScenarioView } from '../domain/final-scenario';
import { TeamBadge, cn } from '@/shared/ui';

export function FinalScenarioCard({
  scenario,
}: {
  scenario: FinalScenarioView;
}): ReactElement | null {
  if (scenario === null) return null;

  return (
    <div className="card p-[18px_20px] mb-4">
      <div className="section-label mb-3">If the Final goes either way…</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ScenarioColumn
          teamId={scenario.homeTeamId}
          teamName={scenario.homeTeamName}
          outcome={scenario.home}
        />
        <ScenarioColumn
          teamId={scenario.awayTeamId}
          teamName={scenario.awayTeamName}
          outcome={scenario.away}
        />
      </div>
    </div>
  );
}

function ScenarioColumn({
  teamId,
  teamName,
  outcome,
}: {
  teamId: string;
  teamName: string;
  outcome: FinalScenarioOutcome;
}): ReactElement {
  return (
    <div className="rounded-xl bg-surface-2 p-[14px_16px]">
      <div className="flex items-center gap-2 mb-2">
        <TeamBadge teamId={teamId} size="sm" />
        <span className="text-[12px] font-extrabold text-ink-muted uppercase tracking-[0.08em]">
          If {teamName} win
        </span>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="display text-[20px] text-gold">{outcome.projectedWinnerDisplayName}</span>
        <span className="tnum text-[13px] font-bold text-ink-muted">
          {outcome.projectedPoints} pts
        </span>
      </div>
      <ScenarioStatus outcome={outcome} />
    </div>
  );
}

function ScenarioStatus({ outcome }: { outcome: FinalScenarioOutcome }): ReactElement {
  if (outcome.status === 'clinched') {
    return (
      <span className={cn('chip text-[11px] font-extrabold text-green-700 bg-green-050')}>
        Already clinched
      </span>
    );
  }

  const intro = outcome.status === 'too-close' ? 'Too close to call — also needs:' : 'Still needs:';

  return (
    <div>
      <p className="text-[11px] font-bold text-ink-muted mb-1">{intro}</p>
      <ul className="flex flex-col gap-1">
        {outcome.mustHit.map((item) => (
          <li
            key={item.label}
            className="flex items-center justify-between text-[12px] font-semibold text-ink"
          >
            <span>{item.label}</span>
            <span className="tnum text-ink-muted">+{item.points}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Render it at the top of `RaceView.tsx`**

In `apps/web/src/features/results/ui/RaceView.tsx`, add the import near the other sibling UI
imports (after `import { SwingCard } from './SwingCard';`):

```ts
import { FinalScenarioCard } from './FinalScenarioCard';
```

Then, inside the returned JSX, right after the opening `<div className="pb-6">` (before the
existing `<div className="card p-[18px_20px_8px] mb-4">` race-chart block), add:

```tsx
<FinalScenarioCard scenario={race.finalScenario} />
```

This renders unconditionally on `race.finalScenario` (the component itself returns `null` when the
scenario is inactive), in both `viewerMode` and member mode, ahead of the `{!viewerMode && ...}`
gated stat cards below it — matching the design's "visible for everyone" decision.

- [ ] **Step 4: Manual verification**

Run: `pnpm --filter web dev` (or however this repo starts the web app locally — check
`package.json` scripts if `dev` isn't filtered this way), then in a browser open a pool's Results →
Points Race → Race tab.

Since no seeded fixture currently reaches the "only Final left" state (per the design doc's Out of
Scope note), the card won't render against real dev data — that's expected. Confirm instead that:

1. The page still renders with no console errors (the card returning `null` doesn't break layout).
2. `pnpm --filter web typecheck` passes (confirms the JSX wiring compiles).

If you want to see the card rendered, temporarily hardcode a non-null `finalScenario` return in
`buildFinalScenarioView` in a scratch local edit, view it, then revert — do not commit any temporary
hardcoding.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: no errors.

Do not commit — stays uncommitted until Task 5.

---

## Task 5: Full verification and the single feature commit

**Files:** none new — this task verifies and commits everything from Tasks 1–4 plus the pre-existing
uncommitted spec file.

- [ ] **Step 1: Run the full web test suite**

Run: `pnpm --filter web vitest run`
Expected: PASS, zero failures, including every existing test file (confirms Task 1's refactor and
Task 3's new required `PointsRaceView` field didn't break anything elsewhere, e.g.
`get-results-view.test.ts`).

- [ ] **Step 2: Run typecheck, lint, and build across the whole repo**

Run: `pnpm typecheck && pnpm lint && pnpm build` (root scripts, per CLAUDE.md "Run most CI steps
locally before pushing" — check `package.json` at the repo root for the exact script names if these
don't exist verbatim).
Expected: all green.

- [ ] **Step 3: Update `docs/PROGRESS.md`**

Add a new dated bullet section under "What exists" (following the existing style of the most recent
entries, e.g. "## Top Four position bonus (2026-07-15)"), summarizing: new
`domain/final-scenario.ts` + `buildFinalScenarioView`, the `special-bet-resolution.ts` extraction,
the `PointsRaceView.finalScenario` field, and `FinalScenarioCard` in `RaceView.tsx`. Link the design
doc. Keep it to the same length/density as the existing entries (a handful of bullet points, not a
restatement of the whole spec).

- [ ] **Step 4: Stage and commit everything as one feature commit**

```bash
git add docs/superpowers/specs/2026-07-19-final-scenario-summary-design.md \
        docs/superpowers/plans/2026-07-19-final-scenario-summary.md \
        docs/PROGRESS.md \
        apps/web/src/features/results/domain/special-bet-resolution.ts \
        apps/web/src/features/results/domain/final-scenario.ts \
        apps/web/src/features/results/domain/final-scenario.test.ts \
        apps/web/src/features/results/domain/types.ts \
        apps/web/src/features/results/application/build-race-view.ts \
        apps/web/src/features/results/application/build-race-view.test.ts \
        apps/web/src/features/results/ui/FinalScenarioCard.tsx \
        apps/web/src/features/results/ui/RaceView.tsx
git status --short
```

Review the `git status --short` output — confirm nothing unexpected is staged (e.g. no accidental
changes to unrelated files) before committing. If Task 4 Step 1 required a barrel export change to
`apps/web/src/features/results/index.ts`, add that path too.

```bash
git commit -m "$(cat <<'EOF'
feat(results): auto-generate a Final scenario summary once only the Final remains

Shows who wins the pool for each possible Final outcome and which of their
own still-open special bets need to hit to hold the lead.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git status --short
```

Expected: single commit created, working tree clean afterward (aside from anything intentionally
left out of scope).

---

## Self-Review Notes

- **Spec coverage:** Trigger detection (Task 2, `findActiveFinalMatch`) ✓. Locked-score / position
  bonus math (Task 2, `buildFinalPicksByUser` + `buildOutcome`) ✓. Special-bet pending items incl.
  resolved/impossible exclusion (Task 2, `buildSpecialPendingItemsByUser`) ✓. Final exact-score
  pending item incl. draw-compatibility and no-snapshot cases (Task 2, `finalExactScoreItem`) ✓.
  Must-hit greedy algorithm + clinched/checklist/too-close states + tie-break (Task 2, `buildOutcome`)
  ✓. `PointsRaceView` wiring (Task 3) ✓. UI placement, viewer-mode visibility (Task 4) ✓. The
  `special-bet-resolution.ts` DRY extraction the spec's "reuses `buildPerUserSpecialsRemaining`'s
  three inputs" line implied (Task 1) ✓.
- **Out of scope confirmed:** no E2E test added (spec explicitly deferred this); no Storybook story
  (matches existing `results/ui` convention, confirmed no `.stories.*` files exist in that folder).
- **Type consistency check:** `FinalScenarioView`/`FinalScenarioOutcome`/`FinalScenarioPendingItem`
  names match exactly across Task 2 (definition), Task 3 (re-export + `PointsRaceView` field), and
  Task 4 (component props) — no renamed variants introduced.
