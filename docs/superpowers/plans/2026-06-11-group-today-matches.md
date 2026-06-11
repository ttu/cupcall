# Group Today Matches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show today's scheduled group-stage matches inside each group card on the results page, below completed matches.

**Architecture:** Extend `GroupResultView` with a `todayMatches` field; populate it in `buildGroupResults` by filtering for group-stage matches where `status !== 'final'` and kickoff falls on the same UTC day as `now`; render them in `GroupMatchFeed` beneath completed matches.

**Tech Stack:** TypeScript strict, Next.js 15 App Router, Vitest + PGlite integration tests.

---

### Task 1: Add `GroupUpcomingMatchRow` type and extend `GroupResultView`

**Files:**

- Modify: `apps/web/src/features/results/domain/types.ts`

- [ ] **Step 1: Add `GroupUpcomingMatchRow` and update `GroupResultView`**

In `apps/web/src/features/results/domain/types.ts`, add the new type and the new field. Replace the existing `GroupResultView` definition:

```ts
export type GroupUpcomingMatchRow = {
  matchId: string;
  groupId: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  kickoff: string | null;
  predictedHome: number | null;
  predictedAway: number | null;
};

export type GroupResultView = {
  groupId: string;
  completedMatches: GroupMatchResultRow[];
  todayMatches: GroupUpcomingMatchRow[];
  standing: GroupStandingRow[];
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /workspaces/football-cup-prediction && pnpm --filter @cup/web tsc --noEmit 2>&1 | head -40
```

Expected: errors about `todayMatches` being missing from `buildGroupResults` return — that's expected until Task 2. If there are other unrelated errors, investigate before continuing.

---

### Task 2: Write failing integration tests

**Files:**

- Modify: `apps/web/src/features/results/application/get-results-view.test.ts`

- [ ] **Step 1: Add five new test cases**

Append the following five `it` blocks inside the existing `describe('getResultsView', () => { ... })` block, after the last existing test:

```ts
it('includes today match in todayMatches', async () => {
  const todayKickoff = new Date('2030-06-15T18:00:00Z'); // same UTC day as NOW
  const matchId = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
  await upsertTournamentDef(db, miniTournament, firstKickoff, new Map([[matchId, todayKickoff]]));

  const view = await getResultsView({ db, poolId, userId, now: NOW });
  const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
  expect(groupA.todayMatches).toHaveLength(1);
  expect(groupA.todayMatches[0]!.matchId).toBe(matchId);
  expect(groupA.todayMatches[0]!.kickoff).toBe(todayKickoff.toISOString());
});

it('excludes tomorrow match from todayMatches', async () => {
  const tomorrowKickoff = new Date('2030-06-16T18:00:00Z');
  const matchId = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
  await upsertTournamentDef(
    db,
    miniTournament,
    firstKickoff,
    new Map([[matchId, tomorrowKickoff]]),
  );

  const view = await getResultsView({ db, poolId, userId, now: NOW });
  const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
  expect(groupA.todayMatches).toHaveLength(0);
});

it('excludes matches with null kickoff from todayMatches', async () => {
  // emptyKickoffs used in beforeEach → all kickoffs are null
  const view = await getResultsView({ db, poolId, userId, now: NOW });
  for (const gr of view!.groupResults) {
    expect(gr.todayMatches).toHaveLength(0);
  }
});

it('does not include completed match in todayMatches', async () => {
  const todayKickoff = new Date('2030-06-15T18:00:00Z');
  const matchId = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
  await upsertTournamentDef(db, miniTournament, firstKickoff, new Map([[matchId, todayKickoff]]));
  await finalizeMatch(db, miniTournament.id, matchId, 2, 1);

  const view = await getResultsView({ db, poolId, userId, now: NOW });
  const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
  expect(groupA.completedMatches).toHaveLength(1);
  expect(groupA.todayMatches).toHaveLength(0);
});

it('populates prediction fields in todayMatch when user has a prediction', async () => {
  const todayKickoff = new Date('2030-06-15T18:00:00Z');
  const matchId = miniTournament.groupMatches.find((m) => m.group === groupId('A'))!.id;
  await upsertTournamentDef(db, miniTournament, firstKickoff, new Map([[matchId, todayKickoff]]));

  const pred = await getOrCreatePrediction(db, {
    poolId,
    userId,
    tournamentId: miniTournament.id,
  });
  await upsertGroupScore(db, pred.id, matchId, 3, 1);

  const view = await getResultsView({ db, poolId, userId, now: NOW });
  const groupA = view!.groupResults.find((g) => g.groupId === 'A')!;
  expect(groupA.todayMatches[0]!.predictedHome).toBe(3);
  expect(groupA.todayMatches[0]!.predictedAway).toBe(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /workspaces/football-cup-prediction && pnpm test --filter @cup/web -- get-results-view 2>&1 | tail -30
```

Expected: the five new tests fail with errors like `Property 'todayMatches' does not exist on type 'GroupResultView'` or similar. All existing tests should still pass.

---

### Task 3: Implement `todayMatches` in `buildGroupResults`

**Files:**

- Modify: `apps/web/src/features/results/application/get-results-view.ts`

- [ ] **Step 1: Pass `now` to `buildGroupResults` and add `isSameUtcDay` helper**

In `get-results-view.ts`:

1. Add `GroupUpcomingMatchRow` to the existing named import from `'../domain/types'` (around line 18):

```ts
import type {
  ResultsView,
  GroupResultView,
  GroupMatchResultRow,
  GroupUpcomingMatchRow,
  GroupStandingRow,
  KnockoutMatchView,
  BracketRoundResultView,
  BracketHealth,
  MatchHit,
  UserRankChip,
} from '../domain/types';
```

2. Update the call site inside `getResultsView` (around line 57):

```ts
const groupResults = buildGroupResults(def, allMatches, inputs, now);
```

3. Update `buildGroupResults` signature (around line 102):

```ts
function buildGroupResults(
  def: Tournament,
  allMatches: MatchRow[],
  inputs: Awaited<ReturnType<typeof getPredictionInputs>> | null,
  now: Date,
): GroupResultView[];
```

4. At the bottom of the file, after `getRoundLabel`, add:

```ts
function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}
```

- [ ] **Step 2: Populate `todayMatches` inside `def.groups.map`**

Still in `buildGroupResults`, inside the `def.groups.map((group) => { ... })` callback, add `todayMatches` after `completedMatches` is built (around line 141):

```ts
const todayMatches: GroupUpcomingMatchRow[] = allMatches
  .filter(
    (m) =>
      m.stage === 'group' &&
      m.groupId === group.id &&
      m.status !== 'final' &&
      m.kickoff !== null &&
      isSameUtcDay(m.kickoff, now),
  )
  .map((m) => ({
    matchId: m.id,
    groupId: group.id,
    homeTeamId: m.homeTeamId ?? '',
    homeTeamName: teamMap.get(m.homeTeamId ?? '') ?? m.homeTeamId ?? '',
    awayTeamId: m.awayTeamId ?? '',
    awayTeamName: teamMap.get(m.awayTeamId ?? '') ?? m.awayTeamId ?? '',
    kickoff: m.kickoff!.toISOString(),
    predictedHome: predMap.get(m.id)?.home ?? null,
    predictedAway: predMap.get(m.id)?.away ?? null,
  }));
```

Then update the return statement inside `def.groups.map` to include `todayMatches`:

```ts
return { groupId: group.id, completedMatches, todayMatches, standing };
```

- [ ] **Step 3: Run tests**

```bash
cd /workspaces/football-cup-prediction && pnpm test --filter @cup/web -- get-results-view 2>&1 | tail -30
```

Expected: all tests pass, including the five new ones.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /workspaces/football-cup-prediction && pnpm --filter @cup/web tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

---

### Task 4: Render `todayMatches` in `GroupMatchFeed`

**Files:**

- Modify: `apps/web/src/features/results/ui/GroupMatchFeed.tsx`

- [ ] **Step 1: Update imports**

At the top of `GroupMatchFeed.tsx`, update the type import to include `GroupUpcomingMatchRow`:

```ts
import type { GroupResultView, GroupUpcomingMatchRow } from '../domain/types';
```

- [ ] **Step 2: Add `UpcomingMatchRow` component**

Add this sub-component before the `GroupMatchFeed` function (still in the same file):

```tsx
function UpcomingMatchRow({ match }: { match: GroupUpcomingMatchRow }): ReactElement {
  const kickoffTime =
    match.kickoff !== null
      ? new Date(match.kickoff).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr 80px',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
      }}
    >
      {/* Home */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 6,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--ink)',
          }}
        >
          {match.homeTeamName}
        </span>
        <TeamBadge teamId={match.homeTeamId} size="sm" />
      </div>

      {/* Kickoff time */}
      <span
        style={{
          fontSize: 12,
          color: 'var(--ink-muted)',
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}
      >
        {kickoffTime ?? '–'}
      </span>

      {/* Away */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <TeamBadge teamId={match.awayTeamId} size="sm" />
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--ink)',
          }}
        >
          {match.awayTeamName}
        </span>
      </div>

      {/* User prediction (if any) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {match.predictedHome !== null && (
          <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-muted)' }}>
            you {match.predictedHome}–{match.predictedAway}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `GroupMatchFeed` to render today section**

Replace the entire body of `GroupMatchFeed` with:

```tsx
export function GroupMatchFeed({ group }: Props): ReactElement {
  const hasCompleted = group.completedMatches.length > 0;
  const hasToday = group.todayMatches.length > 0;

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div className="turf" style={{ padding: '10px 16px' }}>
        <span className="display" style={{ fontSize: 20, color: 'var(--on-dark)' }}>
          Group {group.groupId}
        </span>
      </div>

      {!hasCompleted && !hasToday && (
        <p
          style={{
            fontSize: 13,
            padding: '16px 0',
            textAlign: 'center',
            color: 'var(--ink-muted)',
          }}
        >
          No results yet
        </p>
      )}

      {hasCompleted && (
        <div className="divide">
          {group.completedMatches.map((m) => (
            <div
              key={m.matchId}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr 116px',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
              }}
            >
              {/* Home team */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 6,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: m.actualHome > m.actualAway ? 'var(--ink)' : 'var(--ink-muted)',
                  }}
                >
                  {m.homeTeamName}
                </span>
                <TeamBadge teamId={m.homeTeamId} size="sm" />
              </div>

              {/* Score */}
              <span
                className="display tnum"
                style={{ fontSize: 19, color: 'var(--ink)', textAlign: 'center' }}
              >
                {m.actualHome}
                <span style={{ color: 'var(--ink-muted)', margin: '0 2px', fontSize: 14 }}>–</span>
                {m.actualAway}
              </span>

              {/* Away team */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  minWidth: 0,
                }}
              >
                <TeamBadge teamId={m.awayTeamId} size="sm" />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: m.actualAway > m.actualHome ? 'var(--ink)' : 'var(--ink-muted)',
                  }}
                >
                  {m.awayTeamName}
                </span>
              </div>

              {/* Prediction + hit chip */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: 3,
                }}
              >
                {m.predictedHome !== null && (
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-muted)' }}>
                    you {m.predictedHome}–{m.predictedAway}
                  </span>
                )}
                <HitChip hit={m.hit} points={m.pointsAwarded} />
              </div>
            </div>
          ))}
        </div>
      )}

      {hasToday && (
        <>
          <div
            style={{
              padding: '8px 14px 4px',
              borderTop: hasCompleted ? '1px solid var(--line-soft)' : undefined,
            }}
          >
            <span className="eyebrow" style={{ fontSize: 10, color: 'var(--ink-muted)' }}>
              Today
            </span>
          </div>
          <div className="divide">
            {group.todayMatches.map((m) => (
              <UpcomingMatchRow key={m.matchId} match={m} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /workspaces/football-cup-prediction && pnpm --filter @cup/web tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Run lint**

```bash
cd /workspaces/football-cup-prediction && pnpm --filter @cup/web lint 2>&1 | tail -20
```

Expected: no errors.

---

### Task 5: Run full test suite and commit

- [ ] **Step 1: Run all tests**

```bash
cd /workspaces/football-cup-prediction && pnpm test 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 2: Run typecheck and lint across workspace**

```bash
cd /workspaces/football-cup-prediction && pnpm typecheck && pnpm lint 2>&1 | tail -20
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add \
  apps/web/src/features/results/domain/types.ts \
  apps/web/src/features/results/application/get-results-view.ts \
  apps/web/src/features/results/application/get-results-view.test.ts \
  apps/web/src/features/results/ui/GroupMatchFeed.tsx \
  docs/superpowers/specs/2026-06-11-group-today-matches-design.md \
  docs/superpowers/plans/2026-06-11-group-today-matches.md

git commit -m "$(cat <<'EOF'
feat(results): show today's scheduled group matches in results feed

Adds todayMatches to GroupResultView, populated by filtering group-stage
matches whose kickoff falls on the current UTC day. GroupMatchFeed renders
them below completed results under a 'Today' label, including the user's
prediction if they have one.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```
