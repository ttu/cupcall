# Points Race chart: zoom + remove projected line

**Date:** 2026-06-30
**Status:** Approved

## Summary

Two improvements to the Points Race chart:

1. **Remove the projected (dashed) line** from the chart — keep projected data for the sidebar and stat cards only.
2. **Add preset zoom buttons** (All / 14d / 7d / 5d) so users can focus on recent match days.

All changes are purely client-side. No domain, server, or type changes required.

## Change 1: Remove projected from the chart

### Context

`buildDailyChartPlayers` appends a "Projected" stage and a projected cumulative point for each player when `anyStillLive` is true. This is reflected in `chartStages`, `chartNowIndex`, and `chartPlayers.points` on `PointsRaceView`. The chart currently renders this as a dashed polyline with a shaded backdrop and "PROJECTED" label.

The projected data remains needed for:

- "Projected final table" sidebar (`ProjectedStandings`)
- "Projected total" stat card (`myProjected`, `myStillLive`)

It should not appear in the line chart.

### Fix

In `RaceView.tsx`, slice `race.chartStages` and each player's `points` array to `nowIndex + 1` before passing to `RaceChart`. After slicing, `nowIndex` passed to `RaceChart` equals `slicedStages.length - 1`.

Remove the "Actual / Projected" legend key row — with no dashed segment, the distinction is meaningless.

In `RaceChart.tsx`, hide the NOW divider (vertical dashed line + "NOW" text) when `nowIndex === n` (i.e. no projected segment follows). The divider only makes sense when separating actual from projected.

## Change 2: Zoom with preset buttons

### Zoom options

Four options: **All · 14d · 7d · 5d**. The number indicates how many most-recent match days to display. "All" shows the full history.

Hide any option whose window size ≥ total number of match-day stages (e.g. if only 6 match days have occurred, "14d" is not shown because it would be identical to "All").

Default: **All**.

### State and slice logic

Zoom state lives in `RaceView.tsx` alongside the chart. Type: `'all' | 14 | 7 | 5`.

Before rendering:

1. Strip the projected stage/points (change 1 above) to get `actualStages` and `actualPlayers`.
2. Compute `startIdx = zoomDays === 'all' ? 0 : Math.max(0, nowIndex - zoomDays)`.
3. `slicedStages = actualStages.slice(startIdx, nowIndex + 1)`.
4. For each player: `slicedPoints = player.points.slice(startIdx, nowIndex + 1)`.
5. Pass `nowIndex = slicedStages.length - 1` to `RaceChart`.

### Zoom buttons placement and style

Buttons sit in the top-right of the chart card header, to the right of the player colour legend. Pill style matching the existing sub-tab style in `PointsRaceTab`:

```
[All]  [14d]  [7d]  [5d]
```

Active button: `bg-ink-900 text-white`. Inactive: `bg-surface text-ink-muted shadow-[inset_0_0_0_1px_var(--line)]`.

Use `data-testid="race-zoom-{option}"` on each button.

## Change 3: Y-axis rescaling on zoom

Without this, zooming to "last 5 days" with players clustered at e.g. 110–125 pts would show mostly empty chart space below the lines, making the zoom visually useless.

### Fix in `RaceChart.tsx`

Compute `yMin` from the minimum visible value:

```ts
const rawMin = Math.min(...allValues);
const yMin = Math.floor(rawMin / yStep) * yStep;
```

For the "All" view the slice includes stage 0 where all players have 0 points, so `rawMin = 0` naturally. For zoomed views, `rawMin` is the lowest cumulative score in the visible window (a positive number), giving a non-zero `yMin`.

Update the `Y()` projection function:

```ts
const Y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * PLOT_H;
```

Grid lines run from `yMin` to `yMax` (step unchanged).

For the "All" view, `rawMin` is 0 (all players start at 0), so `yMin = 0` — identical to current behaviour.

## Files touched

| File                                             | Change                                                    |
| ------------------------------------------------ | --------------------------------------------------------- |
| `apps/web/src/features/results/ui/RaceView.tsx`  | zoom state, slice logic, zoom buttons, remove legend keys |
| `apps/web/src/features/results/ui/RaceChart.tsx` | `yMin` for Y-axis, hide NOW divider when `nowIndex === n` |

## Out of scope

- Domain / server / type changes
- Animated zoom transitions
- Persisting zoom preference across sessions
