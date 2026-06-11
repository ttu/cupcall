# Design: Today's Upcoming Matches in Group Results Feed

**Date:** 2026-06-11  
**Status:** Approved

## Problem

The group results page only shows completed matches (`status === 'final'`). On match days, before any results come in, each group card displays "No results yet" — giving users no indication of what's coming up today.

## Goal

Show today's scheduled (not-yet-played) group stage matches inside each group card, below any completed results, so users can see what's on for the day.

---

## Domain Types

Add `GroupUpcomingMatchRow` and extend `GroupResultView` in `apps/web/src/features/results/domain/types.ts`:

```ts
export type GroupUpcomingMatchRow = {
  matchId: string;
  groupId: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  kickoff: string | null; // ISO string; null if kickoff not set
  predictedHome: number | null;
  predictedAway: number | null;
};

// Updated:
export type GroupResultView = {
  groupId: string;
  completedMatches: GroupMatchResultRow[];
  todayMatches: GroupUpcomingMatchRow[]; // ← new
  standing: GroupStandingRow[];
};
```

**Definition of "today":** a match whose kickoff date (compared in UTC) equals the date of the `now` parameter passed to `getResultsView`. Matches with `null` kickoff are excluded. Only group-stage matches (`stage === 'group'`) that are not `'final'` are considered.

---

## Application Layer

**File:** `apps/web/src/features/results/application/get-results-view.ts`

In `buildGroupResults`, add a `now` parameter (already available from the outer function) and populate `todayMatches`:

```ts
function buildGroupResults(
  def: Tournament,
  allMatches: MatchRow[],
  inputs: ...,
  now: Date,           // ← added
): GroupResultView[]
```

Filter logic for `todayMatches` per group:

```ts
const todayMatches = allMatches
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
    kickoff: m.kickoff.toISOString(),
    predictedHome: predMap.get(m.id)?.home ?? null,
    predictedAway: predMap.get(m.id)?.away ?? null,
  }));
```

Add a small pure helper:

```ts
function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}
```

---

## UI

**File:** `apps/web/src/features/results/ui/GroupMatchFeed.tsx`

Below the completed matches section, if `group.todayMatches.length > 0`, render:

- A small "Today" label (eyebrow style, muted)
- One row per upcoming match: home badge + name · kickoff time · away badge + name
- If the user has a prediction for the match, show it as a muted "you N–N" note on the right
- No score cells; no hit chips (no result yet)

Empty state rule: show "No results yet" only when both `completedMatches` and `todayMatches` are empty.

**Kickoff time display:** format as local time using `Date.toLocaleTimeString` with `{ hour: '2-digit', minute: '2-digit' }` in the browser. Since `GroupMatchFeed` is a pure client component, this is safe.

---

## Testing

**File:** `apps/web/src/features/results/application/get-results-view.test.ts`

Add integration test cases:

1. **Today match appears** — match with `status = 'scheduled'`, `kickoff = now` (same UTC day) → appears in `todayMatches`, not in `completedMatches`.
2. **Tomorrow match excluded** — match with `kickoff = now + 1 day` → does NOT appear in `todayMatches`.
3. **No kickoff excluded** — match with `kickoff = null` → does NOT appear in `todayMatches`.
4. **Completed match stays in completedMatches** — `status = 'final'` match is not duplicated into `todayMatches`.
5. **Prediction included** — when a user has a group score prediction for a today match, `predictedHome`/`predictedAway` are populated.

---

## Out of Scope

- Showing future matches beyond today (different feature).
- A cross-group "Today's Fixtures" panel (rejected in favour of per-group inline display).
- Live match updates / polling.
