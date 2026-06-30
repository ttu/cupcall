# Score Breakdown: Top-3 Leaders per Category

**Date:** 2026-06-30
**Status:** Approved

## Overview

Enhance the `ScoreBreakdownCard` to show the top 3 pool members by points in each scoring category, inline below each category row when the card is expanded.

## Data Flow

No new DB queries are needed. `ResultsView.leaderboard` already contains every member's full `ScoreBreakdown | null`. Two new values are threaded from the server component down to `ScoreBreakdownCard`:

- `currentUserId: UserId` — from `actor.userId` in `ResultsPage`
- `leaderboard: LeaderboardEntry[]` — from `view.leaderboard` in `ResultsPageClient`

**Chain:**

```
ResultsPage (server)
  → ResultsPageClient  (adds currentUserId prop)
    → PointsRaceTab    (passes leaderboard + currentUserId)
      → RaceView       (derives topByCategory, passes to ScoreBreakdownCard)
        → ScoreBreakdownCard (renders leaders inline)
```

## New Types

Co-located with `ScoreBreakdownCard`:

```typescript
type CategoryLeader = {
  displayName: string;
  points: number;
  isCurrentUser: boolean;
};

type CategoryTopThree = Partial<Record<keyof Omit<ScoreBreakdown, 'total'>, CategoryLeader[]>>;
```

## Computation (in `RaceView`)

Before rendering `ScoreBreakdownCard`, derive `topByCategory`:

```typescript
const CATEGORY_KEYS: Array<keyof Omit<ScoreBreakdown, 'total'>> = [
  'groupMatches',
  'groupOrder',
  'roundOf16',
  'roundOf8',
  'topFour',
  'final',
  'bronze',
  'specials',
];

const topByCategory: CategoryTopThree = {};
for (const key of CATEGORY_KEYS) {
  const leaders = leaderboard
    .filter((e) => e.breakdown != null && e.breakdown[key] > 0)
    .sort((a, b) => (b.breakdown![key] as number) - (a.breakdown![key] as number))
    .slice(0, 3)
    .map((e) => ({
      displayName: e.userId === currentUserId ? 'You' : e.displayName,
      points: e.breakdown![key] as number,
      isCurrentUser: e.userId === currentUserId,
    }));
  if (leaders.length > 0) topByCategory[key] = leaders;
}
```

Only entries with `points > 0` are included. Ties at position 3 are broken by the leaderboard's existing sort order (pointsTotal DESC then displayName ASC); we slice at 3.

## `ScoreBreakdownCard` Changes

Add optional prop: `topByCategory?: CategoryTopThree`

When present, render a compact leaders line beneath each row's hint text (visible only when card is expanded):

```
Group Matches                         +120
  exact score +3 · correct outcome +1
  Alice +32  You +28  Bob +17
```

**Styling:**

- Leaders line: `text-[10.5px] font-medium text-ink-muted leading-tight mt-0.5`
- Current user entry ("You"): `text-ink font-bold`
- Other entries: `text-ink-muted font-medium`
- Separator between entries: `·` or just whitespace with `gap-2` flex

When `topByCategory` is absent (viewer mode or no leaderboard passed), each row renders exactly as it does today.

## Edge Cases

| Scenario                             | Behaviour                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Fewer than 3 members with breakdowns | Show 1 or 2 entries                                                                                          |
| Everyone scored 0 in a category      | No leaders row for that category                                                                             |
| Category entry tied at 3rd           | Slice at 3 (leaderboard order as tiebreak)                                                                   |
| User has no breakdown (viewer mode)  | `topByCategory` not passed; card unchanged                                                                   |
| Pool of 1                            | No leaders shown (only the user themselves, which is trivially "You") — could show or omit; omit for clarity |

## Files to Change

| File                                              | Change                                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `app/(authenticated)/pools/[id]/results/page.tsx` | Pass `currentUserId={actor.userId}` to `ResultsPageClient`                                                     |
| `features/results/ui/ResultsPageClient.tsx`       | Accept `currentUserId`; pass `leaderboard` + `currentUserId` to `PointsRaceTab`                                |
| `features/results/ui/PointsRaceTab.tsx`           | Accept + forward `leaderboard` + `currentUserId` to `RaceView`                                                 |
| `features/results/ui/RaceView.tsx`                | Accept both; derive `topByCategory`; pass to `ScoreBreakdownCard`                                              |
| `features/results/ui/ScoreBreakdownCard.tsx`      | Add `CategoryLeader`, `CategoryTopThree` types; add optional `topByCategory` prop; render leaders line per row |

No changes to domain types, application layer, DB, or engine.

## Testing

- Unit test the `topByCategory` derivation logic (pure function — extract it if needed).
- Visual verification: seed a pool with ≥3 members who have varied scores, open the Points Race tab, expand Score Breakdown, confirm top-3 appear per category.
- Current-user highlight: confirm "You" appears bold/ink-colored when the current user is in the top 3.
