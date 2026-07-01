---
title: Impossible knockout pick detection
date: 2026-07-01
status: approved
---

## Problem

Bracket health rows for scored knockout rounds (R16, R8) show picks as **pending** even when the
picked team has already been eliminated and can no longer appear in that match. For example, if a
user picked team A to win an R16 match but team A was knocked out in R32, the pick shows as
`pending` until the R16 match is played — even though the outcome is already determined.

This differs from group-stage qualifier health (`computeR32QualHealth`), which already detects
eliminated predicted qualifiers and marks them as busted.

## Solution

In `build-bracket-rounds.ts`, extend the `pickStatus` assignment logic: when
`effectivePickedId !== null` and `winnerId === null` (match not played), also check whether the
picked team can still appear in the match. If both `homeId` and `awayId` are known (non-null) and
`effectivePickedId` is neither of them, the pick is definitively **busted**.

```ts
// current
pickStatus = 'pending';

// new
const matchTeamsKnown = homeId !== null && awayId !== null;
const pickedTeamAbsent = effectivePickedId !== homeId && effectivePickedId !== awayId;
pickStatus = matchTeamsKnown && pickedTeamAbsent ? 'busted' : 'pending';
```

If either team is still unknown (null), we cannot conclude the pick is busted, so it stays
`pending`.

## Effect on bracket health display

`missedAnnotation` in each round row is already computed as
`totalPicks - alivePicks - pendingPicks`, so busted picks already count toward "missed". Once the
fix lands, previously-pending impossible picks move from `pendingPicks` to `bustedPicks`, and
`missedAnnotation` reflects them immediately — e.g. "0/8 · 6 pending · 2 missed" instead of
"0/8 · 8 pending".

## Scope

- **File changed:** `apps/web/src/features/results/application/build-bracket-rounds.ts`
- **Tests updated:** `build-bracket-rounds.test.ts` — add a case where the picked team is absent
  from both match participants; assert `pickStatus === 'busted'`.
- No schema, API, or UI changes required.
