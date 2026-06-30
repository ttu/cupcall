# Leaderboard Knockout Daily Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show per-day "+pts" on the leaderboard during the knockout stage by attributing R32 slot wins to the day each match completes, matching the group stage UX.

**Architecture:** Add `buildKnockoutSlotDeltas` to credit R32 slot picks per match day using `PoolKnockoutPick` data. Fix `buildKnockoutMilestoneDeltas` to attribute `roundOf8` points to R16 completion (not QF completion) and remove the now-redundant `roundOf16` milestone. Thread `knockoutPicks` through `buildLastDayPoints`, `buildDailyChartPlayers`, and `get-pool-detail.ts`.

**Tech Stack:** TypeScript (strict), Vitest, Next.js app router, `@cup/db`, `@cup/engine`.

## Global Constraints

- No `any`, no unsafe casts — TypeScript strict throughout.
- TDD: write failing test before implementing each piece.
- One commit for the entire feature (implementation + tests + spec doc together).
- Run `pnpm test` from repo root to run all tests.
- Run `pnpm typecheck` from repo root to typecheck.

---

### Task 1: Add `buildKnockoutSlotDeltas` + unit tests

**Files:**

- Modify: `apps/web/src/shared/race-chart.ts`
- Create: `apps/web/src/shared/race-chart.test.ts`

**Interfaces:**

- Produces:

  ```typescript
  // internal to race-chart.ts — NOT exported
  function buildKnockoutSlotDeltas(
    picks: PoolKnockoutPick[],
    allMatches: MatchRow[],
    def: Tournament,
  ): Map<string, Map<string, number>>;
  // Map<userId, Map<dateStr, points>>
  ```

- [ ] **Step 1: Create the test file with a failing test**

Create `apps/web/src/shared/race-chart.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { MatchRow } from '@cup/db';
import type { PoolKnockoutPick } from '@cup/db';
import { userId, bracketMatchKey, tournamentId } from '@cup/engine';
import { miniTournament } from '@cup/engine/testing';
import { buildKnockoutSlotDeltasForTest } from '@/shared/race-chart';

// Minimal MatchRow factory for knockout matches
function makeKnockoutMatch(
  id: string,
  status: MatchRow['status'],
  kickoff: Date | null,
  winnerTeamId: string | null,
): MatchRow {
  return {
    id,
    tournamentId: tournamentId('t1'),
    stage: 'R32',
    groupId: null,
    homeTeamId: null,
    awayTeamId: null,
    kickoff,
    homeGoals: null,
    awayGoals: null,
    homeConduct: null,
    awayConduct: null,
    winnerTeamId,
    decidedBy: null,
    status,
  };
}

// A minimal Tournament-shaped fixture that HAS an R16 round.
// We only need bracket.slots, bracket.roundOf16Matches, and scoring.roundOf16PerTeam.
const defWithR16 = {
  ...miniTournament,
  bracket: {
    ...miniTournament.bracket,
    roundOf16Matches: ['r16m1', 'r16m2'] as ReturnType<typeof bracketMatchKey>[],
    slots: [
      { match: bracketMatchKey('r32m1'), home: '1A', away: '2B' },
      { match: bracketMatchKey('r32m2'), home: '1C', away: '2D' },
    ],
  },
  scoring: { ...miniTournament.scoring, roundOf16PerTeam: 3 },
};

describe('buildKnockoutSlotDeltasForTest', () => {
  it('credits roundOf16PerTeam to user who picked the winner on match day', () => {
    const matches = [makeKnockoutMatch('r32m1', 'final', new Date('2026-06-29T18:00:00Z'), 'GER')];
    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bracketMatchKey('r32m1'), winnerTeamId: 'GER' },
    ];

    const deltas = buildKnockoutSlotDeltasForTest(picks, matches, defWithR16);

    expect(deltas.get(userId('u1'))?.get('2026-06-29')).toBe(3);
  });

  it('credits nothing for a wrong pick', () => {
    const matches = [makeKnockoutMatch('r32m1', 'final', new Date('2026-06-29T18:00:00Z'), 'GER')];
    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bracketMatchKey('r32m1'), winnerTeamId: 'FRA' },
    ];

    const deltas = buildKnockoutSlotDeltasForTest(picks, matches, defWithR16);

    expect(deltas.get(userId('u1'))).toBeUndefined();
  });

  it('credits nothing when match is not yet final', () => {
    const matches = [
      makeKnockoutMatch('r32m1', 'scheduled', new Date('2026-06-29T18:00:00Z'), null),
    ];
    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bracketMatchKey('r32m1'), winnerTeamId: 'GER' },
    ];

    const deltas = buildKnockoutSlotDeltasForTest(picks, matches, defWithR16);

    expect(deltas.get(userId('u1'))).toBeUndefined();
  });

  it('accumulates points across multiple matches on the same day', () => {
    const matches = [
      makeKnockoutMatch('r32m1', 'final', new Date('2026-06-29T15:00:00Z'), 'GER'),
      makeKnockoutMatch('r32m2', 'final', new Date('2026-06-29T19:00:00Z'), 'BRA'),
    ];
    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bracketMatchKey('r32m1'), winnerTeamId: 'GER' },
      { userId: userId('u1'), bracketMatchKey: bracketMatchKey('r32m2'), winnerTeamId: 'BRA' },
    ];

    const deltas = buildKnockoutSlotDeltasForTest(picks, matches, defWithR16);

    expect(deltas.get(userId('u1'))?.get('2026-06-29')).toBe(6); // 3 + 3
  });

  it('credits different users independently on separate days', () => {
    const matches = [
      makeKnockoutMatch('r32m1', 'final', new Date('2026-06-28T18:00:00Z'), 'GER'),
      makeKnockoutMatch('r32m2', 'final', new Date('2026-06-29T18:00:00Z'), 'BRA'),
    ];
    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bracketMatchKey('r32m1'), winnerTeamId: 'GER' },
      { userId: userId('u2'), bracketMatchKey: bracketMatchKey('r32m2'), winnerTeamId: 'BRA' },
    ];

    const deltas = buildKnockoutSlotDeltasForTest(picks, matches, defWithR16);

    expect(deltas.get(userId('u1'))?.get('2026-06-28')).toBe(3);
    expect(deltas.get(userId('u2'))?.get('2026-06-29')).toBe(3);
    expect(deltas.get(userId('u1'))?.get('2026-06-29')).toBeUndefined();
  });

  it('returns empty map for a tournament without an R16 round', () => {
    const matches = [makeKnockoutMatch('qf1', 'final', new Date('2026-06-29T18:00:00Z'), 'A1')];
    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bracketMatchKey('qf1'), winnerTeamId: 'A1' },
    ];

    // miniTournament has roundOf16Matches: [] — no R16 round
    const deltas = buildKnockoutSlotDeltasForTest(picks, matches, miniTournament);

    expect(deltas.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /workspaces/football-cup-prediction && pnpm test -- race-chart.test
```

Expected: FAIL — `buildKnockoutSlotDeltasForTest is not a function` (or similar import error).

- [ ] **Step 3: Add the function and test export to `race-chart.ts`**

Add this import at the top of `apps/web/src/shared/race-chart.ts` (update the existing `@cup/db` import line):

```typescript
import type { LeaderboardEntry, MatchRow, PoolGroupScore, PoolKnockoutPick } from '@cup/db';
```

Add this private function in `apps/web/src/shared/race-chart.ts` before `buildKnockoutMilestoneDeltas`:

```typescript
function buildKnockoutSlotDeltas(
  picks: PoolKnockoutPick[],
  allMatches: MatchRow[],
  def: Tournament,
): Map<string, Map<string, number>> {
  // Slot picks only award roundOf16 points in tournaments that have an R16 round.
  // In entry-round-as-QF brackets (mini-tournament), slots are scored via roundOf8 milestones.
  if (def.bracket.roundOf16Matches.length === 0) return new Map();

  const result = new Map<string, Map<string, number>>();
  const matchById = new Map(allMatches.map((m) => [m.id, m]));

  for (const slot of def.bracket.slots) {
    const match = matchById.get(slot.match);
    if (!match || match.status !== 'final' || !match.kickoff || !match.winnerTeamId) continue;

    const date = utcDateStr(match.kickoff);
    const winner = match.winnerTeamId;

    for (const pick of picks) {
      if (pick.bracketMatchKey !== slot.match || pick.winnerTeamId !== winner) continue;
      if (!result.has(pick.userId)) result.set(pick.userId, new Map());
      result
        .get(pick.userId)!
        .set(date, (result.get(pick.userId)!.get(date) ?? 0) + def.scoring.roundOf16PerTeam);
    }
  }

  return result;
}
```

Add a test-only export at the bottom of `race-chart.ts`:

```typescript
// Test-only exports — not part of the public API
export { buildKnockoutSlotDeltas as buildKnockoutSlotDeltasForTest };
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /workspaces/football-cup-prediction && pnpm test -- race-chart.test
```

Expected: all 6 new tests PASS.

---

### Task 2: Fix `buildKnockoutMilestoneDeltas` + milestone tests

**Files:**

- Modify: `apps/web/src/shared/race-chart.ts`
- Modify: `apps/web/src/shared/race-chart.test.ts`

**Interfaces:**

- Consumes: `buildKnockoutMilestoneDeltas` (private, unchanged signature)
- Produces: same shape, but `roundOf8` now attributed to R16 completion date (not QF), `roundOf16` no longer attributed here

- [ ] **Step 1: Write failing tests for the milestone fix**

Add to `apps/web/src/shared/race-chart.test.ts` (add `buildKnockoutMilestoneDeltasForTest` to imports from `@/shared/race-chart`):

```typescript
import {
  buildKnockoutSlotDeltasForTest,
  buildKnockoutMilestoneDeltasForTest,
} from '@/shared/race-chart';
```

Then add these tests:

```typescript
describe('buildKnockoutMilestoneDeltasForTest', () => {
  const entry = {
    userId: userId('u1'),
    displayName: 'Alice',
    pointsTotal: points(30),
    completionPercent: 100,
    breakdown: {
      groupMatches: points(0),
      groupOrder: points(0),
      roundOf16: points(6), // should NOT appear here — handled by slot deltas
      roundOf8: points(9),
      topFour: points(5),
      final: points(10),
      bronze: points(0),
      specials: points(5),
      total: points(35),
    },
  };

  // Local fixture — 4 R16 matches + 2 QF matches; distinct from module-level defWithR16 (Task 1)
  const milestoneR16Matches = ['r16m1', 'r16m2', 'r16m3', 'r16m4'] as ReturnType<
    typeof bracketMatchKey
  >[];
  const milestoneQFMatches = ['qf1', 'qf2'] as ReturnType<typeof bracketMatchKey>[];
  const milestoneDef = {
    ...miniTournament,
    bracket: {
      ...miniTournament.bracket,
      roundOf16Matches: milestoneR16Matches,
      roundOf8Matches: milestoneQFMatches,
    },
  };

  it('attributes roundOf8 to R16 completion date (not QF completion) when R16 exists', () => {
    // All R16 matches done on Jun 29; QF matches done on Jul 3
    const allMatches: MatchRow[] = [
      ...milestoneR16Matches.map((id, i) =>
        makeKnockoutMatch(id, 'final', new Date(`2026-06-29T${10 + i}:00:00Z`), 'T1'),
      ),
      ...milestoneQFMatches.map((id) =>
        makeKnockoutMatch(id, 'final', new Date('2026-07-03T18:00:00Z'), 'T1'),
      ),
      makeKnockoutMatch('final', 'final', new Date('2026-07-10T18:00:00Z'), 'T1'),
      makeKnockoutMatch('bronze', 'final', new Date('2026-07-09T18:00:00Z'), 'T1'),
    ];

    const deltas = buildKnockoutMilestoneDeltasForTest([entry], allMatches, milestoneDef);

    // roundOf8 credited to Jun 29 (last R16 match day), NOT Jul 3
    expect(deltas.get(userId('u1'))?.get('2026-06-29')).toBe(9);
    expect(deltas.get(userId('u1'))?.get('2026-07-03')).toBeUndefined();
  });

  it('does NOT attribute roundOf16 points (handled by slot deltas instead)', () => {
    const allMatches: MatchRow[] = [
      ...milestoneR16Matches.map((id) =>
        makeKnockoutMatch(id, 'final', new Date('2026-06-29T18:00:00Z'), 'T1'),
      ),
      makeKnockoutMatch('final', 'final', new Date('2026-07-10T18:00:00Z'), 'T1'),
      makeKnockoutMatch('bronze', 'final', new Date('2026-07-09T18:00:00Z'), 'T1'),
    ];

    const deltas = buildKnockoutMilestoneDeltasForTest([entry], allMatches, milestoneDef);

    // roundOf16 = 6 should NOT appear on any date
    const allPoints = [...(deltas.get(userId('u1'))?.values() ?? [])];
    const total = allPoints.reduce((a, b) => a + b, 0);
    // roundOf8(9) + topFour(5) + final(10) + specials(5) = 29; roundOf16(6) NOT included
    expect(total).toBe(29);
  });

  it('keeps current roundOf8 date for tournaments without R16 (mini-tournament)', () => {
    // mini-tournament: roundOf16Matches = [], roundOf8Matches = [qf1,qf2,qf3,qf4]
    const qfDoneMatch = makeKnockoutMatch('qf1', 'final', new Date('2026-06-25T18:00:00Z'), 'A1');
    const allMatches: MatchRow[] = [
      qfDoneMatch,
      makeKnockoutMatch('qf2', 'final', new Date('2026-06-25T20:00:00Z'), 'B1'),
      makeKnockoutMatch('qf3', 'final', new Date('2026-06-26T18:00:00Z'), 'C1'),
      makeKnockoutMatch('qf4', 'final', new Date('2026-06-26T20:00:00Z'), 'D1'),
      makeKnockoutMatch('final', 'final', new Date('2026-06-28T18:00:00Z'), 'A1'),
      makeKnockoutMatch('bronze', 'final', new Date('2026-06-27T18:00:00Z'), 'B1'),
    ];

    const miniEntry = { ...entry };
    const deltas = buildKnockoutMilestoneDeltasForTest([miniEntry], allMatches, miniTournament);

    // For mini, roundOf8 credited when all 4 QF matches done = Jun 26
    expect(deltas.get(userId('u1'))?.get('2026-06-26')).toBe(9);
  });
});
```

Also add `points` to the import from `@cup/engine`:

```typescript
import { userId, points, bracketMatchKey, tournamentId } from '@cup/engine';
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /workspaces/football-cup-prediction && pnpm test -- race-chart.test
```

Expected: the new `buildKnockoutMilestoneDeltasForTest` tests FAIL (function not exported yet).

- [ ] **Step 3: Fix `buildKnockoutMilestoneDeltas` in `race-chart.ts`**

Replace the existing `buildKnockoutMilestoneDeltas` function body (lines 268–298):

```typescript
function buildKnockoutMilestoneDeltas(
  leaderboard: LeaderboardEntry[],
  allMatches: MatchRow[],
  def: Tournament,
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();

  // For tournaments with an R16 round (WC 2026): roundOf8 points (teams in QF) are earned
  // when R16 completes and QF participants become known — not when QF matches finish.
  // For entry-round-as-QF brackets (mini): keep existing QF-completion attribution.
  const hasR16 = def.bracket.roundOf16Matches.length > 0;
  const roundOf8Date = hasR16
    ? raceMilestoneDate(def.bracket.roundOf16Matches, allMatches)
    : raceMilestoneDate(def.bracket.roundOf8Matches, allMatches);

  const bronzeDate = raceMilestoneDate([def.bracket.bronzeMatch], allMatches);
  const finalDate = raceMilestoneDate([def.bracket.finalMatch], allMatches);
  const topFourDate = maxDateStr(finalDate, bronzeDate);

  for (const entry of leaderboard) {
    const bd = entry.breakdown;
    if (!bd) continue;

    const add = (date: string | null, pts: number) => {
      if (!date || pts === 0) return;
      if (!result.has(entry.userId)) result.set(entry.userId, new Map());
      result.get(entry.userId)!.set(date, (result.get(entry.userId)!.get(date) ?? 0) + pts);
    };

    // roundOf16 is now attributed per-day by buildKnockoutSlotDeltas; skip here.
    add(roundOf8Date, bd.roundOf8);
    add(bronzeDate, bd.bronze);
    add(topFourDate, bd.topFour);
    add(finalDate, bd.final);
    add(finalDate, bd.specials);
  }

  return result;
}
```

Add a test-only export at the bottom of `race-chart.ts` (update the existing test export block):

```typescript
// Test-only exports — not part of the public API
export {
  buildKnockoutSlotDeltas as buildKnockoutSlotDeltasForTest,
  buildKnockoutMilestoneDeltas as buildKnockoutMilestoneDeltasForTest,
};
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /workspaces/football-cup-prediction && pnpm test -- race-chart.test
```

Expected: all milestone tests PASS.

---

### Task 3: Thread `knockoutPicks` through race-chart types and functions

**Files:**

- Modify: `apps/web/src/shared/race-chart.ts`
- Modify: `apps/web/src/shared/race-chart.test.ts`

**Interfaces:**

- Consumes: `buildKnockoutSlotDeltas` (Task 1), `buildKnockoutMilestoneDeltas` (Task 2)
- Produces:

  ```typescript
  export type RaceChartExtras = {
    allMatches: MatchRow[];
    poolGroupScores: PoolGroupScore[];
    def: Tournament;
    knockoutPicks: PoolKnockoutPick[]; // new
  };

  export type DailyChartInput = {
    eventDates: string[];
    leaderboard: LeaderboardEntry[];
    userId: string | null;
    allMatches: MatchRow[];
    poolGroupScores: PoolGroupScore[];
    def: Tournament;
    anyStillLive: boolean;
    stillLiveByUser: Map<string, number>;
    knockoutPicks: PoolKnockoutPick[]; // new
  };

  export function buildLastDayPoints(
    leaderboard: LeaderboardEntry[],
    allMatches: MatchRow[],
    poolGroupScores: PoolGroupScore[],
    def: Tournament,
    knockoutPicks: PoolKnockoutPick[], // new
  ): { date: string; pointsByUser: Record<string, number> } | null;
  ```

- [ ] **Step 1: Write a failing integration test for `buildLastDayPoints` during R32**

Add to `apps/web/src/shared/race-chart.test.ts`:

```typescript
import { buildLastDayPoints } from '@/shared/race-chart';
```

Add this describe block:

```typescript
describe('buildLastDayPoints during knockout (R32) phase', () => {
  const tournamentWithR16 = defWithR16; // defined above in this file

  it('returns slot-win points for the last complete R32 match day', () => {
    // Jun 29: two R32 matches (both final). Jun 30: one match still scheduled.
    const allMatches: MatchRow[] = [
      makeKnockoutMatch('r32m1', 'final', new Date('2026-06-29T15:00:00Z'), 'GER'),
      makeKnockoutMatch('r32m2', 'final', new Date('2026-06-29T19:00:00Z'), 'BRA'),
      makeKnockoutMatch('r16m1', 'scheduled', null, null),
      makeKnockoutMatch('r16m2', 'scheduled', null, null),
    ];

    const picks: PoolKnockoutPick[] = [
      { userId: userId('u1'), bracketMatchKey: bracketMatchKey('r32m1'), winnerTeamId: 'GER' }, // correct
      { userId: userId('u1'), bracketMatchKey: bracketMatchKey('r32m2'), winnerTeamId: 'ARG' }, // wrong
      { userId: userId('u2'), bracketMatchKey: bracketMatchKey('r32m1'), winnerTeamId: 'FRA' }, // wrong
      { userId: userId('u2'), bracketMatchKey: bracketMatchKey('r32m2'), winnerTeamId: 'BRA' }, // correct
    ];

    const leaderboard = [
      {
        userId: userId('u1'),
        displayName: 'Alice',
        pointsTotal: points(3),
        completionPercent: 50,
        breakdown: null,
      },
      {
        userId: userId('u2'),
        displayName: 'Bob',
        pointsTotal: points(3),
        completionPercent: 50,
        breakdown: null,
      },
    ];

    const result = buildLastDayPoints(leaderboard, allMatches, [], tournamentWithR16, picks);

    expect(result).not.toBeNull();
    expect(result!.date).toBe('2026-06-29');
    expect(result!.pointsByUser[userId('u1')]).toBe(3); // 1 correct × roundOf16PerTeam(3)
    expect(result!.pointsByUser[userId('u2')]).toBe(3); // 1 correct × roundOf16PerTeam(3)
  });

  it('returns null when no complete match day exists yet', () => {
    const allMatches: MatchRow[] = [
      makeKnockoutMatch('r32m1', 'scheduled', new Date('2026-07-01T18:00:00Z'), null),
    ];

    const result = buildLastDayPoints([], allMatches, [], tournamentWithR16, []);

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /workspaces/football-cup-prediction && pnpm test -- race-chart.test
```

Expected: FAIL — `buildLastDayPoints` called with 5 args but expects 4; TypeScript error on imports too.

- [ ] **Step 3: Update `RaceChartExtras` type**

In `apps/web/src/shared/race-chart.ts`, update the `RaceChartExtras` type:

```typescript
export type RaceChartExtras = {
  allMatches: MatchRow[];
  poolGroupScores: PoolGroupScore[];
  def: Tournament;
  knockoutPicks: PoolKnockoutPick[];
};
```

- [ ] **Step 4: Update `buildRaceChartData` to pass `knockoutPicks` through**

In the `if (extras)` branch of `buildRaceChartData` (around line 47), add `knockoutPicks` to the `buildDailyChartPlayers` call:

```typescript
const result = buildDailyChartPlayers({
  eventDates,
  leaderboard,
  userId,
  allMatches: extras.allMatches,
  poolGroupScores: extras.poolGroupScores,
  def: extras.def,
  knockoutPicks: extras.knockoutPicks,
  anyStillLive: false,
  stillLiveByUser: new Map(),
});
```

- [ ] **Step 5: Update `DailyChartInput` type**

```typescript
export type DailyChartInput = {
  eventDates: string[];
  leaderboard: LeaderboardEntry[];
  userId: string | null;
  allMatches: MatchRow[];
  poolGroupScores: PoolGroupScore[];
  def: Tournament;
  anyStillLive: boolean;
  stillLiveByUser: Map<string, number>;
  knockoutPicks: PoolKnockoutPick[];
};
```

- [ ] **Step 6: Update `buildDailyChartPlayers` to destructure and use `knockoutPicks`**

Update the destructuring and delta computation in `buildDailyChartPlayers`:

```typescript
export function buildDailyChartPlayers(input: DailyChartInput): {
  stages: string[];
  nowIndex: number;
  chartPlayers: RaceChartPlayer[];
} {
  const {
    eventDates,
    leaderboard,
    userId,
    allMatches,
    poolGroupScores,
    def,
    anyStillLive,
    stillLiveByUser,
    knockoutPicks,
  } = input;

  const groupMatchDeltas = buildGroupMatchDeltas(
    poolGroupScores,
    allMatches,
    def.scoring.groupMatch,
  );
  const groupOrderDeltas = buildGroupOrderDeltas(poolGroupScores, allMatches, def, leaderboard);
  const slotDeltas = buildKnockoutSlotDeltas(knockoutPicks, allMatches, def);
  const knockoutDeltas = buildKnockoutMilestoneDeltas(leaderboard, allMatches, def);

  const nowIndex = eventDates.length;
  const stages: string[] = ['Start', ...eventDates.map(formatRaceDate)];
  if (anyStillLive) stages.push('Projected');

  let colorIdx = 0;
  const chartPlayers: RaceChartPlayer[] = leaderboard.map((entry) => {
    const isCurrentUser = userId !== null && entry.userId === userId;
    const color = isCurrentUser
      ? 'var(--green-500)'
      : (RACE_COLORS[colorIdx++] ?? 'var(--ink-muted)');

    let cumulative = 0;
    const pts: number[] = [0];

    for (const date of eventDates) {
      cumulative += groupMatchDeltas.get(entry.userId)?.get(date) ?? 0;
      cumulative += groupOrderDeltas.get(entry.userId)?.get(date) ?? 0;
      cumulative += slotDeltas.get(entry.userId)?.get(date) ?? 0;
      cumulative += knockoutDeltas.get(entry.userId)?.get(date) ?? 0;
      pts.push(cumulative);
    }

    // Anchor the final "now" point to the leaderboard total, absorbing any attribution gap.
    if (pts.length > 1) pts[pts.length - 1] = entry.pointsTotal;

    if (anyStillLive) {
      pts.push(entry.pointsTotal + (stillLiveByUser.get(entry.userId) ?? 0));
    }

    return {
      userId: entry.userId,
      displayName: entry.displayName,
      isCurrentUser,
      color,
      points: pts,
    };
  });

  return {
    stages,
    nowIndex,
    chartPlayers: chartPlayers.toSorted(
      (a, b) => (a.isCurrentUser ? 1 : 0) - (b.isCurrentUser ? 1 : 0),
    ),
  };
}
```

- [ ] **Step 7: Update `buildLastDayPoints` signature and body**

Replace the existing `buildLastDayPoints` function:

```typescript
export function buildLastDayPoints(
  leaderboard: LeaderboardEntry[],
  allMatches: MatchRow[],
  poolGroupScores: PoolGroupScore[],
  def: Tournament,
  knockoutPicks: PoolKnockoutPick[],
): { date: string; pointsByUser: Record<string, number> } | null {
  const lastDate = findLastCompleteMatchDay(allMatches);
  if (!lastDate) return null;

  const groupMatchDeltas = buildGroupMatchDeltas(
    poolGroupScores,
    allMatches,
    def.scoring.groupMatch,
  );
  const groupOrderDeltas = buildGroupOrderDeltas(poolGroupScores, allMatches, def, leaderboard);
  const slotDeltas = buildKnockoutSlotDeltas(knockoutPicks, allMatches, def);
  const knockoutDeltas = buildKnockoutMilestoneDeltas(leaderboard, allMatches, def);

  const pointsByUser: Record<string, number> = {};
  for (const entry of leaderboard) {
    const pts =
      (groupMatchDeltas.get(entry.userId)?.get(lastDate) ?? 0) +
      (groupOrderDeltas.get(entry.userId)?.get(lastDate) ?? 0) +
      (slotDeltas.get(entry.userId)?.get(lastDate) ?? 0) +
      (knockoutDeltas.get(entry.userId)?.get(lastDate) ?? 0);
    if (pts > 0) pointsByUser[entry.userId] = pts;
  }

  if (Object.keys(pointsByUser).length === 0) return null;
  return { date: lastDate, pointsByUser };
}
```

- [ ] **Step 8: Run tests to confirm they pass**

```bash
cd /workspaces/football-cup-prediction && pnpm test -- race-chart.test
```

Expected: all tests PASS.

- [ ] **Step 9: Run typecheck (expect TypeScript errors — callers not updated yet)**

```bash
cd /workspaces/football-cup-prediction && pnpm typecheck 2>&1 | head -40
```

Expected: errors in `get-pool-detail.ts` (missing `knockoutPicks` arg) and `build-race-view.ts` (missing `knockoutPicks` in `DailyChartInput`). These are fixed in Task 4.

---

### Task 4: Update callers + commit

**Files:**

- Modify: `apps/web/src/features/pools/application/get-pool-detail.ts`
- Modify: `apps/web/src/features/results/application/build-race-view.ts`

**Interfaces:**

- Consumes: updated `buildLastDayPoints` (5-arg) and `DailyChartInput` (with `knockoutPicks`) from Task 3

- [ ] **Step 1: Update `get-pool-detail.ts` imports**

Replace the `@cup/db` import block:

```typescript
import type { Db } from '@cup/db';
import {
  getPoolById,
  getLeaderboard,
  getTournamentById,
  getMatchesForTournament,
  getGroupScoresByPool,
  getKnockoutPicksByPool,
} from '@cup/db';
```

- [ ] **Step 2: Add `getKnockoutPicksByPool` to the parallel fetch**

Replace the `Promise.all` call (lines 41–45):

```typescript
const [leaderboard, allMatches, poolGroupScores, knockoutPicks] = await Promise.all([
  getLeaderboard(db, poolId, computeTotalFields(def)),
  getMatchesForTournament(db, pool.tournamentId),
  getGroupScoresByPool(db, poolId),
  getKnockoutPicksByPool(db, poolId),
]);
```

- [ ] **Step 3: Pass `knockoutPicks` to `buildRaceChartData` and `buildLastDayPoints`**

Replace the `raceChart` and `lastDayPoints` lines:

```typescript
const raceChart = def
  ? buildRaceChartData(leaderboard, null, { allMatches, poolGroupScores, def, knockoutPicks })
  : buildRaceChartData(leaderboard, null);
const lastDayPoints = def
  ? buildLastDayPoints(leaderboard, allMatches, poolGroupScores, def, knockoutPicks)
  : null;
```

- [ ] **Step 4: Update `build-race-view.ts` to pass `knockoutPicks` to `buildDailyChartPlayers`**

In `apps/web/src/features/results/application/build-race-view.ts`, add `knockoutPicks: poolKnockoutPicks` to the `buildDailyChartPlayers` call (around line 108):

```typescript
const result = buildDailyChartPlayers({
  eventDates,
  leaderboard,
  userId,
  allMatches,
  poolGroupScores,
  def,
  anyStillLive,
  stillLiveByUser,
  knockoutPicks: poolKnockoutPicks,
});
```

- [ ] **Step 5: Run typecheck — expect clean**

```bash
cd /workspaces/football-cup-prediction && pnpm typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 6: Run all tests**

```bash
cd /workspaces/football-cup-prediction && pnpm test
```

Expected: all tests PASS (no regressions).

- [ ] **Step 7: Commit everything together (implementation + tests + spec doc)**

```bash
git -C /workspaces/football-cup-prediction add \
  apps/web/src/shared/race-chart.ts \
  apps/web/src/shared/race-chart.test.ts \
  apps/web/src/features/pools/application/get-pool-detail.ts \
  apps/web/src/features/results/application/build-race-view.ts \
  docs/superpowers/specs/2026-06-30-leaderboard-knockout-daily-points-design.md \
  docs/superpowers/plans/2026-06-30-leaderboard-knockout-daily-points.md
```

```bash
git -C /workspaces/football-cup-prediction commit -m "$(cat <<'EOF'
feat(leaderboard): show per-day knockout points from R32 slot wins

Adds per-day attribution of roundOf16 points during the R32 knockout
phase so the '+pts' badge on the leaderboard updates after each day's
matches, matching the group stage UX.

- buildKnockoutSlotDeltas: credits roundOf16PerTeam per correct R32
  slot pick on the day the match becomes final
- buildKnockoutMilestoneDeltas: roundOf8 now attributed to R16
  completion date (teams confirmed in QF), not QF completion date;
  roundOf16 removed from milestone (handled per-day instead)
- buildLastDayPoints: new knockoutPicks param, incorporates slot deltas
- buildDailyChartPlayers / RaceChartExtras / DailyChartInput: thread
  knockoutPicks through for accurate race chart during R32
- get-pool-detail: fetches getKnockoutPicksByPool in parallel
- build-race-view: passes poolKnockoutPicks to buildDailyChartPlayers

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds, pre-commit hooks pass.
