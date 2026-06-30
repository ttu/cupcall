# Design: Leaderboard knockout daily points

**Date:** 2026-06-30  
**Status:** Approved

## Problem

The leaderboard "+pts" badge (last-day points) works during the group stage but shows nothing during the knockout stage. Two bugs cause this:

1. `roundOf16` (points for teams correctly predicted in R16) is **never attributed to any date** in `buildKnockoutMilestoneDeltas`, so no points appear during R32.
2. `roundOf8` (points for teams correctly in QF) is attributed to the date when **all four QF matches finish**, but those points are earned when R16 finishes and teams advance to QF.

## Goal

Show per-day "+pts" on the leaderboard during the knockout stage, matching the group stage UX. Each day R32 matches complete, users see the points they gained from their slot picks.

## Data flow

`get-pool-detail.ts` fetches `getKnockoutPicksByPool` alongside the existing parallel queries (`leaderboard`, `allMatches`, `poolGroupScores`). The result flows into `buildLastDayPoints` and `buildRaceChartData` / `buildDailyChartPlayers`.

## New function: `buildKnockoutSlotDeltas`

Lives in `race-chart.ts`. Signature:

```typescript
function buildKnockoutSlotDeltas(
  picks: PoolKnockoutPick[],
  allMatches: MatchRow[],
  def: Tournament,
): Map<string, Map<string, number>>;
```

Algorithm:

- For each R32 slot in `def.bracket.slots`:
  - Find the match in `allMatches` by `slot.match`; skip if not `final` or no `kickoff`
  - `date = utcDateStr(match.kickoff)`, `winner = match.winnerTeamId`
  - For each pick where `pick.bracketMatchKey === slot.match` and `pick.winnerTeamId === winner`: credit `+def.scoring.roundOf16PerTeam` on that date for that user
- Returns `Map<userId, Map<date, points>>` — same shape as other delta builders

## Fix to `buildKnockoutMilestoneDeltas`

- **Remove** `roundOf16` attribution (now handled per-day by slot deltas)
- **Fix** `roundOf8Date`: change from `raceMilestoneDate(def.bracket.roundOf8Matches, allMatches)` to `raceMilestoneDate(def.bracket.roundOf16Matches, allMatches)` — credits QF participant points on the day R16 completes (teams confirmed in QF), not when QF ends

All other milestone attributions remain unchanged:

- `topFour` → `max(bronzeDate, finalDate)` ✓
- `bronze` → bronze match date ✓
- `final` + `specials` → final match date ✓

## `buildLastDayPoints` update

Add `knockoutPicks: PoolKnockoutPick[]` parameter. Incorporate slot deltas alongside existing group deltas:

```typescript
const slotDeltas = buildKnockoutSlotDeltas(knockoutPicks, allMatches, def);
// ...
const pts =
  (groupMatchDeltas.get(entry.userId)?.get(lastDate) ?? 0) +
  (groupOrderDeltas.get(entry.userId)?.get(lastDate) ?? 0) +
  (slotDeltas.get(entry.userId)?.get(lastDate) ?? 0) +
  (knockoutDeltas.get(entry.userId)?.get(lastDate) ?? 0);
```

## `buildDailyChartPlayers` update

Same — incorporate slot deltas per day into cumulative chart totals so the race chart also reflects per-day R32 attribution. `RaceChartExtras` and `DailyChartInput` both gain a `knockoutPicks: PoolKnockoutPick[]` field so the picks flow from `get-pool-detail.ts` through `buildRaceChartData` into `buildDailyChartPlayers`.

## Testing

**Unit tests** (`race-chart.test.ts`) for `buildKnockoutSlotDeltas`:

- R32 match final, user picked winner → correct day and correct points
- R32 match final, user picked loser → 0 points
- R32 match not yet final → 0 points
- Multiple R32 matches same day → points sum correctly per user

**Fix existing tests** for `buildKnockoutMilestoneDeltas`:

- `roundOf16` no longer attributed there
- `roundOf8` attributed to R16 completion date

**Integration test** for `buildLastDayPoints` covering a knockout-phase scenario (R32 partially complete, last complete day has slot winners).

No new E2E tests — the "+pts" badge UI already exists and is covered.

## Files changed

| File                                                         | Change                                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/shared/race-chart.ts`                          | Add `buildKnockoutSlotDeltas`; fix `buildKnockoutMilestoneDeltas`; update `buildLastDayPoints` + `buildDailyChartPlayers` signatures |
| `apps/web/src/features/pools/application/get-pool-detail.ts` | Add `getKnockoutPicksByPool` to parallel fetch; pass to downstream functions                                                         |
| `apps/web/src/shared/race-chart.test.ts`                     | New tests for slot deltas; update milestone tests                                                                                    |
