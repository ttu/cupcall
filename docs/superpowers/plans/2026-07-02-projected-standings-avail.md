# Per-player "Still Available" in Projected Final Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `+Avail` column to the Projected final table showing the maximum additional points each player can still earn, based on their own picks (alive knockout picks + pending special bets + unresolved group matches).

**Architecture:** Two pure helper functions (`buildPerUserKnockoutRemaining`, `buildPerUserSpecialsRemaining`) compute per-user maximum achievable points in `build-race-view.ts`. These are combined into a `canStillGetByUser` map that is passed to `buildProjectedEntries`, extending `ProjectedEntry` with a `canStillGet` field. `ProjectedStandings.tsx` grows from a 4-column to a 5-column grid.

**Tech Stack:** TypeScript strict, Vitest, React/Next.js 15, Tailwind CSS. Workspace packages: `@cup/engine`, `@cup/db`.

## Global Constraints

- No `any`, no untyped dicts, no unsafe casts — TypeScript strict throughout.
- TDD: write failing tests before implementation code.
- One commit for the entire feature: implementation + tests together. Do NOT commit intermediate partial states.
- Format + lint after each edit step: `pnpm format && pnpm lint` in `apps/web`.
- Full gate before commit: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm -C apps/web build`.
- No new `shared/` code. No speculative abstractions. YAGNI.

---

## File Map

| File                                                                            | Action     | Responsibility                                                                 |
| ------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| `apps/web/src/features/results/domain/types.ts`                                 | **Modify** | Add `canStillGet: number` to `ProjectedEntry`                                  |
| `apps/web/src/features/results/application/build-race-view.ts`                  | **Modify** | Export two new helpers; update `buildProjectedEntries` + `buildPointsRaceView` |
| `apps/web/src/features/results/application/build-race-view-canstillget.test.ts` | **Create** | Unit tests for the two new helpers                                             |
| `apps/web/src/features/results/ui/ProjectedStandings.tsx`                       | **Modify** | Add `+Avail` 5th column to grid and row                                        |

---

## Task 1: Data layer — types, helpers, projection

**Files:**

- Modify: `apps/web/src/features/results/domain/types.ts`
- Modify: `apps/web/src/features/results/application/build-race-view.ts`
- Create: `apps/web/src/features/results/application/build-race-view-canstillget.test.ts`

**Interfaces:**

- Produces:
  - `ProjectedEntry.canStillGet: number`
  - `export function buildPerUserKnockoutRemaining(poolKnockoutPicks: PoolKnockoutPick[], allKnockoutMatches: KnockoutMatchView[], hitPoints: Map<string, number>): Map<string, number>`
  - `export function buildPerUserSpecialsRemaining(poolSpecialBets: PoolSpecialBet[], defs: Array<{ key: string; points: number }>, actualResults: ActualResults): Map<string, number>`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/features/results/application/build-race-view-canstillget.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildPerUserKnockoutRemaining, buildPerUserSpecialsRemaining } from './build-race-view';
import { miniTournament } from '@cup/engine/testing';
import { getSpecialBetDefs } from '@cup/engine';
import type { UserId, BracketMatchKey, ActualResults } from '@cup/engine';
import type { PoolKnockoutPick, PoolSpecialBet } from '@cup/db';
import type { KnockoutMatchView } from '../domain/types';

function makeKnockoutMatch(
  key: string,
  status: 'scheduled' | 'final',
  opts: { homeTeamId?: string | null; awayTeamId?: string | null } = {},
): KnockoutMatchView {
  return {
    bracketMatchKey: key,
    round: 'SF',
    homeTeamId: opts.homeTeamId ?? null,
    homeTeamName: null,
    awayTeamId: opts.awayTeamId ?? null,
    awayTeamName: null,
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
    hit: 'pending',
    projected: false,
    homeTeamConfirmed: true,
    awayTeamConfirmed: true,
    predictedHomeTeamId: null,
    predictedHomeTeamName: null,
    predictedAwayTeamId: null,
    predictedAwayTeamName: null,
    isEntryRound: false,
    homeTeamPredictedPct: null,
    awayTeamPredictedPct: null,
    homeTeamUserPredictedParticipant: false,
    awayTeamUserPredictedParticipant: false,
    poolPickHomePct: null,
    poolPickAwayPct: null,
    pickedOpponentStatus: 'no-pick',
    homeSlotFeederPickBusted: false,
    awaySlotFeederPickBusted: false,
  };
}

function makePick(userId: string, key: string, teamId: string): PoolKnockoutPick {
  return {
    userId: userId as UserId,
    bracketMatchKey: key as BracketMatchKey,
    winnerTeamId: teamId,
  };
}

function makeSpecialBet(userId: string, betKey: string, value: unknown): PoolSpecialBet {
  return { userId: userId as UserId, betKey, value };
}

const emptyActualResults: ActualResults = { matchResults: [], groupOrder: {}, answers: {} };

describe('buildPerUserKnockoutRemaining', () => {
  const hitPoints = new Map([
    ['sf1', 30],
    ['final', 50],
  ]);

  it('sums hitPoints for picks when both participant slots are TBD (conservative)', () => {
    const matches = [
      makeKnockoutMatch('sf1', 'scheduled'), // homeTeamId/awayTeamId null
      makeKnockoutMatch('final', 'scheduled'), // homeTeamId/awayTeamId null
    ];
    const picks = [makePick('u1', 'sf1', 'ENG'), makePick('u1', 'final', 'ENG')];
    const result = buildPerUserKnockoutRemaining(picks, matches, hitPoints);
    expect(result.get('u1')).toBe(80); // 30 + 50
  });

  it('includes pick when picked team is a confirmed participant', () => {
    const matches = [
      makeKnockoutMatch('sf1', 'scheduled', { homeTeamId: 'ENG', awayTeamId: 'FRA' }),
    ];
    const picks = [makePick('u1', 'sf1', 'ENG')];
    const result = buildPerUserKnockoutRemaining(picks, matches, hitPoints);
    expect(result.get('u1')).toBe(30);
  });

  it('excludes pick when picked team is NOT a confirmed participant (busted)', () => {
    const matches = [
      makeKnockoutMatch('sf1', 'scheduled', { homeTeamId: 'ENG', awayTeamId: 'FRA' }),
      makeKnockoutMatch('final', 'scheduled', { homeTeamId: 'ESP', awayTeamId: 'GER' }),
    ];
    const picks = [
      makePick('u1', 'sf1', 'BRA'), // busted — BRA not in ENG vs FRA
      makePick('u1', 'final', 'BRA'), // busted — BRA not in ESP vs GER
    ];
    const result = buildPerUserKnockoutRemaining(picks, matches, hitPoints);
    expect(result.get('u1')).toBe(0);
  });

  it('returns nothing for a player with no picks', () => {
    const matches = [
      makeKnockoutMatch('sf1', 'scheduled', { homeTeamId: 'ENG', awayTeamId: 'FRA' }),
    ];
    const result = buildPerUserKnockoutRemaining([], matches, hitPoints);
    expect(result.get('u1')).toBeUndefined();
  });

  it('returns 0 when the only picks are for already-final matches', () => {
    const matches = [makeKnockoutMatch('sf1', 'final', { homeTeamId: 'ENG', awayTeamId: 'FRA' })];
    const picks = [makePick('u1', 'sf1', 'ENG')];
    const result = buildPerUserKnockoutRemaining(picks, matches, hitPoints);
    expect(result.get('u1')).toBe(0);
  });

  it('differentiates two players: one with a viable pick, one with a busted pick', () => {
    const matches = [
      makeKnockoutMatch('sf1', 'scheduled', { homeTeamId: 'ENG', awayTeamId: 'FRA' }),
    ];
    const picks = [
      makePick('u1', 'sf1', 'ENG'), // alive
      makePick('u2', 'sf1', 'BRA'), // busted
    ];
    const result = buildPerUserKnockoutRemaining(picks, matches, hitPoints);
    expect(result.get('u1')).toBe(30);
    expect(result.get('u2')).toBe(0);
  });
});

describe('buildPerUserSpecialsRemaining', () => {
  const defs = getSpecialBetDefs(miniTournament.scoring).filter((d) => d.points > 0);

  it('includes points for a pending bet where the user has a pick', () => {
    const poolSpecialBets = [makeSpecialBet('u1', 'penaltyShootoutCount', 3)];
    const result = buildPerUserSpecialsRemaining(poolSpecialBets, defs, emptyActualResults);
    const penaltyDef = defs.find((d) => d.key === 'penaltyShootoutCount')!;
    expect(result.get('u1')).toBe(penaltyDef.points); // 10
  });

  it('excludes resolved bets even when the user has a pick', () => {
    const poolSpecialBets = [makeSpecialBet('u1', 'penaltyShootoutCount', 3)];
    const actualResults: ActualResults = {
      ...emptyActualResults,
      answers: { penaltyShootoutCount: 3 },
    };
    const result = buildPerUserSpecialsRemaining(poolSpecialBets, defs, actualResults);
    expect(result.get('u1') ?? 0).toBe(0);
  });

  it('returns nothing for a user with no picks on any pending bet', () => {
    const result = buildPerUserSpecialsRemaining([], defs, emptyActualResults);
    expect(result.get('u1')).toBeUndefined();
  });

  it('differentiates players: one with pick, one without', () => {
    const poolSpecialBets = [makeSpecialBet('u1', 'penaltyShootoutCount', 3)];
    const result = buildPerUserSpecialsRemaining(poolSpecialBets, defs, emptyActualResults);
    const penaltyDef = defs.find((d) => d.key === 'penaltyShootoutCount')!;
    expect(result.get('u1')).toBe(penaltyDef.points); // has a pick
    expect(result.get('u2')).toBeUndefined(); // no pick → absent from map
  });

  it('accumulates points across multiple pending bets for the same user', () => {
    const poolSpecialBets = [
      makeSpecialBet('u1', 'penaltyShootoutCount', 3),
      makeSpecialBet('u1', 'groupTopScoringTeam', 'A1'),
    ];
    const result = buildPerUserSpecialsRemaining(poolSpecialBets, defs, emptyActualResults);
    const penaltyPts = defs.find((d) => d.key === 'penaltyShootoutCount')!.points;
    const groupTopPts = defs.find((d) => d.key === 'groupTopScoringTeam')!.points;
    expect(result.get('u1')).toBe(penaltyPts + groupTopPts);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /workspaces/football-cup-prediction && pnpm test --reporter=verbose apps/web/src/features/results/application/build-race-view-canstillget.test.ts 2>&1 | tail -20
```

Expected: `Error: No "buildPerUserKnockoutRemaining" exported from './build-race-view'` (or similar import error).

- [ ] **Step 3: Add `canStillGet` to `ProjectedEntry` in `domain/types.ts`**

In `apps/web/src/features/results/domain/types.ts`, locate `ProjectedEntry` and add the new field:

```ts
export type ProjectedEntry = {
  userId: string;
  displayName: string;
  isCurrentUser: boolean;
  currentPoints: number;
  currentRank: number;
  projectedPoints: number;
  projectedRank: number;
  /** Positive = moved up in projected standings vs current. */
  rankDelta: number;
  /** Maximum additional points this player can still earn from alive picks + pending bets + unresolved group matches. */
  canStillGet: number;
};
```

- [ ] **Step 4: Add the two exported helpers to `build-race-view.ts`**

In `apps/web/src/features/results/application/build-race-view.ts`, add these two functions **above** `buildProjectedEntries` (they have no dependencies on each other):

```ts
/**
 * Computes the maximum additional knockout points each user can still earn.
 * A pick is viable when:
 *  - the match is still pending (status !== 'final'), AND
 *  - if both participant slots are confirmed, the picked team is one of them;
 *    if either slot is TBD, the pick is conservatively treated as viable.
 * Returns a Map<userId, points>. Users with no picks are absent from the map.
 */
export function buildPerUserKnockoutRemaining(
  poolKnockoutPicks: PoolKnockoutPick[],
  allKnockoutMatches: KnockoutMatchView[],
  hitPoints: Map<string, number>,
): Map<string, number> {
  const pickMap = new Map<string, string>();
  for (const pick of poolKnockoutPicks) {
    pickMap.set(`${pick.userId}::${pick.bracketMatchKey}`, pick.winnerTeamId);
  }

  const userIds = new Set(poolKnockoutPicks.map((p) => p.userId));
  const result = new Map<string, number>();

  for (const userId of userIds) {
    let canStillGet = 0;
    for (const match of allKnockoutMatches) {
      if (match.status === 'final') continue;
      const pickedWinnerId = pickMap.get(`${userId}::${match.bracketMatchKey}`) ?? null;
      if (pickedWinnerId === null) continue;
      const bothKnown = match.homeTeamId !== null && match.awayTeamId !== null;
      if (bothKnown && pickedWinnerId !== match.homeTeamId && pickedWinnerId !== match.awayTeamId) {
        continue; // busted — picked team is not a confirmed participant
      }
      canStillGet += hitPoints.get(match.bracketMatchKey) ?? 0;
    }
    result.set(userId, canStillGet);
  }

  return result;
}

/**
 * Computes the maximum additional special-bet points each user can still earn.
 * A bet contributes iff it is unresolved (no actual answer yet) AND the user has a pick.
 * Returns a Map<userId, points>. Users with no picks on pending bets are absent.
 */
export function buildPerUserSpecialsRemaining(
  poolSpecialBets: PoolSpecialBet[],
  defs: Array<{ key: string; points: number }>,
  actualResults: ActualResults,
): Map<string, number> {
  const unresolvedKeys = new Set(
    defs
      .filter((d) => {
        const { isArray, scalar, array } = resolveActualForBet(d.key, actualResults);
        return isArray ? array.length === 0 : scalar === undefined || scalar === null;
      })
      .map((d) => d.key),
  );

  const betPoints = new Map(defs.map((d) => [d.key, d.points]));
  const result = new Map<string, number>();

  for (const sb of poolSpecialBets) {
    if (!unresolvedKeys.has(sb.betKey)) continue;
    const pts = betPoints.get(sb.betKey) ?? 0;
    result.set(sb.userId, (result.get(sb.userId) ?? 0) + pts);
  }

  return result;
}
```

- [ ] **Step 5: Update `buildProjectedEntries` to accept and use `canStillGetByUser`**

In `apps/web/src/features/results/application/build-race-view.ts`, replace the `buildProjectedEntries` function:

```ts
function buildProjectedEntries(
  leaderboard: LeaderboardEntry[],
  userId: string | null,
  stillLiveByUser: Map<string, number>,
  canStillGetByUser: Map<string, number>,
): ProjectedEntry[] {
  const currentRankMap = new Map<string, number>(leaderboard.map((e, i) => [e.userId, i + 1]));

  const withProjected = leaderboard.map((e) => ({
    userId: e.userId,
    displayName: e.displayName,
    isCurrentUser: userId !== null && e.userId === userId,
    currentPoints: e.pointsTotal,
    projectedPoints: e.pointsTotal + (stillLiveByUser.get(e.userId) ?? 0),
    canStillGet: canStillGetByUser.get(e.userId) ?? 0,
  }));

  const sorted = withProjected.toSorted((a, b) => b.projectedPoints - a.projectedPoints);

  return sorted.map((e, i) => {
    const currentRank = currentRankMap.get(e.userId) ?? 0;
    const projectedRank = i + 1;
    return {
      userId: e.userId,
      displayName: e.displayName,
      isCurrentUser: e.isCurrentUser,
      currentPoints: e.currentPoints,
      currentRank,
      projectedPoints: e.projectedPoints,
      projectedRank,
      rankDelta: currentRank - projectedRank,
      canStillGet: e.canStillGet,
    };
  });
}
```

- [ ] **Step 6: Update `buildPointsRaceView` to compute `canStillGetByUser` and pass it through**

In `apps/web/src/features/results/application/build-race-view.ts`, in `buildPointsRaceView`, find the block where `stillLiveByUser` is computed (after `maxFromResolved`). Add the per-user computation **before** the `projectedEntries` call, and update that call:

```ts
// --- existing lines (unchanged) ---
const finalMatchIds = new Set(allMatches.filter((m) => m.status === 'final').map((m) => m.id));
const totalMax = computeRemainingMaxPoints(def, { finalMatchIds: new Set() });
const remainingMax = computeRemainingMaxPoints(def, { finalMatchIds });
const maxFromResolved = totalMax.total - remainingMax.total;

const stillLiveByUser = new Map<string, number>(
  leaderboard.map((e) => [
    e.userId,
    projectStillLive(e.pointsTotal, maxFromResolved, remainingMax.total),
  ]),
);

// --- NEW BLOCK: per-player canStillGet ---
const specialDefs = getSpecialBetDefs(def.scoring).filter((d) => d.points > 0);
const groupRemaining = remainingMax.groupMatches + remainingMax.groupOrder;
const allKnockoutMatchesForAvail: KnockoutMatchView[] = [
  ...bracketRounds.flatMap((r) => r.matches),
  ...(bronzeMatch ? [bronzeMatch] : []),
];
const hitPoints = buildHitPointsMap(def);
const knockoutRemaining = buildPerUserKnockoutRemaining(
  poolKnockoutPicks,
  allKnockoutMatchesForAvail,
  hitPoints,
);
const specialsRemaining = buildPerUserSpecialsRemaining(
  poolSpecialBets,
  specialDefs,
  actualResults,
);
const canStillGetByUser = new Map(
  leaderboard.map((e) => [
    e.userId,
    groupRemaining +
      (knockoutRemaining.get(e.userId) ?? 0) +
      (specialsRemaining.get(e.userId) ?? 0),
  ]),
);
// --- END NEW BLOCK ---

// ... (existing chart logic) ...

// Update this existing call (add canStillGetByUser argument):
const projectedEntries = buildProjectedEntries(
  leaderboard,
  userId,
  stillLiveByUser,
  canStillGetByUser,
);
```

> Note: `getSpecialBetDefs` is already imported at the top of the file. `KnockoutMatchView` is already imported from `'../domain/types'`. No new imports needed.

- [ ] **Step 7: Run failing tests again to confirm they now pass**

```bash
cd /workspaces/football-cup-prediction && pnpm test --reporter=verbose apps/web/src/features/results/application/build-race-view-canstillget.test.ts 2>&1 | tail -30
```

Expected: all tests `PASS`.

- [ ] **Step 8: Run the full test suite to verify nothing regressed**

```bash
cd /workspaces/football-cup-prediction && pnpm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 9: Format and lint**

```bash
cd /workspaces/football-cup-prediction && pnpm format && pnpm lint 2>&1 | tail -20
```

Expected: no errors.

---

## Task 2: UI — add `+Avail` column to `ProjectedStandings`

**Files:**

- Modify: `apps/web/src/features/results/ui/ProjectedStandings.tsx`

**Interfaces:**

- Consumes: `ProjectedEntry.canStillGet: number` (from Task 1)

- [ ] **Step 1: Replace `ProjectedStandings.tsx` with the 5-column version**

Replace the entire content of `apps/web/src/features/results/ui/ProjectedStandings.tsx`:

```tsx
import type { ReactElement } from 'react';
import type { ProjectedEntry } from '../domain/types';
import { Icon, cn } from '@/shared/ui';

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function projectedSubLabel(entries: ProjectedEntry[]): string {
  const me = entries.find((e) => e.isCurrentUser);
  if (!me) return '';
  if (me.projectedRank === 1) return 'on track for 1st';
  return `enough for ${ordinal(me.projectedRank)} place`;
}

const GRID = 'grid-cols-[44px_1fr_52px_52px_64px]';

export function ProjectedStandings({ entries }: { entries: ProjectedEntry[] }): ReactElement {
  return (
    <div className="overflow-hidden">
      <div
        className={cn('grid gap-1.5 p-[8px_16px] bg-surface-2 border-t border-b border-line', GRID)}
      >
        {(['Now → Fin', 'Player', 'Now', '+Avail', 'Proj.'] as const).map((hd, i) => (
          <span
            key={hd}
            className={cn(
              'eyebrow text-ink-muted text-[10px]',
              i >= 2 ? 'text-right' : 'text-left',
            )}
          >
            {hd}
          </span>
        ))}
      </div>
      <div className="divide">
        {entries.map((e) => (
          <ProjectedRow key={e.userId} entry={e} />
        ))}
      </div>
    </div>
  );
}

function ProjectedRow({ entry }: { entry: ProjectedEntry }): ReactElement {
  const {
    rankDelta,
    projectedRank,
    currentPoints,
    projectedPoints,
    canStillGet,
    displayName,
    isCurrentUser,
  } = entry;
  const isTop3 = projectedRank <= 3;

  return (
    <div
      className={cn(
        'grid gap-1.5 p-[10px_16px] items-center',
        GRID,
        isCurrentUser ? 'bg-green-050' : 'bg-transparent',
      )}
    >
      <span className="flex items-center gap-1">
        <span className={cn('display text-base w-4.5', isTop3 ? 'text-gold' : 'text-ink-muted')}>
          {projectedRank}
        </span>
        {rankDelta !== 0 && (
          <span
            className={cn(
              'inline-flex items-center gap-px text-[10px] font-extrabold',
              rankDelta > 0 ? 'text-green-600' : 'text-danger',
            )}
          >
            <span className={cn('inline-flex', rankDelta > 0 ? 'rotate-180' : '')}>
              <Icon name="chevdown" size={11} stroke={2.8} color="currentColor" />
            </span>
            {Math.abs(rankDelta)}
          </span>
        )}
      </span>

      <span className="min-w-0">
        <span
          className={cn(
            'block font-bold text-[13px] truncate',
            isCurrentUser ? 'text-green-700' : 'text-ink',
          )}
        >
          {isCurrentUser ? 'You' : displayName.split(' ')[0]}
        </span>
        {!isCurrentUser && displayName.split(' ')[1] && (
          <span className="block text-[11px] font-medium text-ink-muted truncate">
            {displayName.split(' ').slice(1).join(' ')}
          </span>
        )}
      </span>

      <span className="tnum text-right font-semibold text-[13px] text-ink-muted">
        {currentPoints}
      </span>

      <span
        className={cn(
          'tnum text-right font-semibold text-[13px]',
          canStillGet > 0 ? 'text-green-600' : 'text-ink-muted',
        )}
      >
        {canStillGet > 0 ? `+${canStillGet}` : '–'}
      </span>

      <span
        className={cn(
          'display tnum text-right text-[18px]',
          isCurrentUser ? 'text-green-600' : 'text-ink',
        )}
      >
        {projectedPoints}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Format and lint**

```bash
cd /workspaces/football-cup-prediction && pnpm format && pnpm lint 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 3: Typecheck**

```bash
cd /workspaces/football-cup-prediction && pnpm typecheck 2>&1 | tail -20
```

Expected: no errors.

---

## Task 3: Final verification and commit

- [ ] **Step 1: Run the full gate**

```bash
cd /workspaces/football-cup-prediction && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm -C apps/web build 2>&1 | tail -30
```

Expected: all steps pass. If any step fails, fix before continuing.

- [ ] **Step 2: Commit everything as a single feature commit**

```bash
git add \
  apps/web/src/features/results/domain/types.ts \
  apps/web/src/features/results/application/build-race-view.ts \
  apps/web/src/features/results/application/build-race-view-canstillget.test.ts \
  apps/web/src/features/results/ui/ProjectedStandings.tsx \
  docs/superpowers/specs/2026-07-02-projected-standings-avail-design.md \
  docs/superpowers/plans/2026-07-02-projected-standings-avail.md

git commit -m "$(cat <<'EOF'
feat(results): add per-player +Avail column to projected final table

Each entry in the Projected final table now shows how many points the
player can still earn, based on their own picks: alive knockout picks
(busted picks are excluded when participants are confirmed), pending
special bets (resolved bets contribute 0), and unresolved group matches
(same for all players).

Two new exported pure functions — buildPerUserKnockoutRemaining and
buildPerUserSpecialsRemaining — compute the per-user values and are
unit-tested in build-race-view-canstillget.test.ts. ProjectedEntry gains
a canStillGet field. ProjectedStandings grows from 4 to 5 columns.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement                              | Task covering it |
| --------------------------------------------- | ---------------- |
| `ProjectedEntry.canStillGet: number`          | Task 1 Step 3    |
| `buildPerUserKnockoutRemaining` helper        | Task 1 Step 4    |
| `buildPerUserSpecialsRemaining` helper        | Task 1 Step 4    |
| `buildProjectedEntries` updated signature     | Task 1 Step 5    |
| `buildPointsRaceView` wires canStillGetByUser | Task 1 Step 6    |
| New test file with 4+ cases per helper        | Task 1 Step 1    |
| `ProjectedStandings` 5-column grid            | Task 2 Step 1    |
| `+Avail` column: green when > 0, `–` when 0   | Task 2 Step 1    |
| Format/lint/typecheck/test gate               | Task 3 Step 1    |
| Single feature commit                         | Task 3 Step 2    |

**Placeholder scan:** No TBD, TODO, or "implement later" text. All code blocks are complete.

**Type consistency:**

- `buildPerUserKnockoutRemaining` defined in Step 4 → used in Step 6 with matching signature.
- `buildPerUserSpecialsRemaining` defined in Step 4 → used in Step 6 with matching signature.
- `canStillGetByUser: Map<string, number>` produced in Step 6 → accepted by `buildProjectedEntries` in Step 5.
- `ProjectedEntry.canStillGet: number` added in Step 3 → populated in Step 5 → consumed in Step 1 of Task 2.
- `GRID` constant defined once, used in both header and row divs.
