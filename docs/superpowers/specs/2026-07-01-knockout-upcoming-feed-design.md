# Design spec: Knockout upcoming matches feed

**Date:** 2026-07-01
**Status:** Approved

## Problem

The knockout tab shows the visual bracket only. Users have no compact feed of upcoming matches with their predictions — something the group stage provides via `TodayMatchesFeed` and `GroupMatchFeed`.

## Solution

Add a `KnockoutUpcomingFeed` card above the bracket showing all scheduled (not final) knockout matches, sorted by kickoff (nulls last). Each row shows: teams, date + time, the user's picked winner (and predicted score for Final/Bronze), and a binary pool pick bar.

## Data layer

Add two fields to `KnockoutMatchView` in `domain/types.ts`:

```ts
/** % of pool members who directly picked the home team to win this match. Null when teams are TBD or no picks exist. */
poolPickHomePct: number | null;
/** % of pool members who directly picked the away team to win this match. Null when teams are TBD or no picks exist. */
poolPickAwayPct: number | null;
```

In `build-bracket-rounds.ts`, `computeKnockoutRoundPcts` already builds `Map<matchKey, Map<teamId, pct>>` from `poolKnockoutPicks`. Populate the new fields by looking up `knockoutRoundPcts.get(matchKey)?.get(homeTeamId)` and `?.get(awayTeamId)`. Set to `null` when either team is unknown (TBD).

No new queries — the data is already in memory.

## UI component

**File:** `apps/web/src/features/results/ui/KnockoutUpcomingFeed.tsx`

**Props:**

```ts
type Props = {
  rounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
};
```

Collect all `KnockoutMatchView` entries where `status === 'scheduled'` from both `rounds` and `bronzeMatch`. Sort by kickoff ascending, nulls last. Return `null` when the list is empty (all matches final).

**Row layout** (mirrors `UpcomingMatchRow` in `GroupMatchFeed`):

```
[Home Badge] [Home Name]     [Date · Time]       [Away Badge] [Away Name]
                             you → [Picked Team]
──────────────────────────────────────────────────────────────────────────
[Pool bar: home% ████░░░ away%]
```

- **Kickoff:** `"Jul 2 · 21:00"` format (date + time — not time-only, since these span multiple days).
- **Your pick:** `"you → [team name]"` below kickoff. Omit when no pick made. For Final/Bronze where `predictedHome`/`predictedAway` is set, append the score: `"you → France · 2–1"`.
- **Pool bar:** two-segment binary bar — home pick % and away pick % (no draw slot). Omit entirely when `poolPickHomePct` is null (teams TBD or no picks).
- **TBD teams:** show `"TBD"` as team name with no badge. Match still appears so users can see the schedule.
- **Card header:** `"Next Matches"` with the turf green strip (matches `TodayMatchesFeed` styling). Omit the card entirely when no scheduled matches remain.

**Placement:** At the top of the knockout tab in `ResultsPageClient`, before `KnockoutBracket`.

## Files changed

| File                                                                | Change                                                          |
| ------------------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/web/src/features/results/domain/types.ts`                     | Add `poolPickHomePct`, `poolPickAwayPct` to `KnockoutMatchView` |
| `apps/web/src/features/results/application/build-bracket-rounds.ts` | Populate new fields from `knockoutRoundPcts`                    |
| `apps/web/src/features/results/ui/KnockoutUpcomingFeed.tsx`         | New component                                                   |
| `apps/web/src/features/results/ui/ResultsPageClient.tsx`            | Add `<KnockoutUpcomingFeed>` above the bracket                  |

## Testing

**Integration** (extend `build-bracket-rounds.test.ts` or `get-results-view.test.ts`):

- `poolPickHomePct`/`poolPickAwayPct` correctly populated from `poolKnockoutPicks`
- Both are `null` when no picks exist
- Both are `null` when teams are TBD

**Component** (Vitest + React Testing Library):

- Renders `null` when all matches are final
- Renders one row per scheduled match
- Shows `"you → [Team]"` when a pick exists; omits when no pick
- Appends score to pick label for Final/Bronze when `predictedHome`/`predictedAway` is set
- Pool bar is hidden when `poolPickHomePct` is null
