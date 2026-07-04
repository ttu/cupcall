# Knockout matrix: mark eliminated-team picks as impossible

**Date:** 2026-07-04

## Problem

In the "by knockout" sub-tab (knockout matrix), a pending cell for a match whose participants are not yet fully known shows `pending` (grey + team code) even when the picked team has already been knocked out of the tournament. Examples:

- User picks GER for Bronze but GER was eliminated in QF → cell shows grey "GER", should show red "GER" (impossible).
- User picks NED for SF but NED was eliminated in R16 → cell shows grey "NED", should show red "NED" (impossible).

The existing `isImpossible` check in `buildKnockoutMatrix` only covers the case where **both** match participants are confirmed and the pick is neither of them. It does not handle elimination from an earlier round.

## Scope

Knockout matrix only (`by-knockout` sub-tab). Specials matrix is out of scope.

## Design

### Data layer — `build-race-view.ts` → `buildKnockoutMatrix`

**Step 1: derive eliminated teams**

After `allKnockoutMatches` is assembled, build the set of teams that have lost a finalised knockout match:

```typescript
const eliminatedTeams = new Set<string>();
for (const m of allKnockoutMatches) {
  if (m.status === 'final' && m.actualWinnerId) {
    if (m.homeTeamId && m.homeTeamId !== m.actualWinnerId) eliminatedTeams.add(m.homeTeamId);
    if (m.awayTeamId && m.awayTeamId !== m.actualWinnerId) eliminatedTeams.add(m.awayTeamId);
  }
}
```

**Step 2: extend `isImpossible`**

In the per-cell loop, replace the current check:

```typescript
// Before
const isImpossible =
  bothKnown &&
  pickedWinnerId !== null &&
  pickedWinnerId !== m.homeTeamId &&
  pickedWinnerId !== m.awayTeamId;

// After
const isImpossible =
  pickedWinnerId !== null &&
  (eliminatedTeams.has(pickedWinnerId) ||
    (bothKnown && pickedWinnerId !== m.homeTeamId && pickedWinnerId !== m.awayTeamId));
```

The `bothKnown` branch remains for the case where both participants are confirmed and the pick is neither (team still alive but wrong match slot).

### UI layer

No changes. `KnockoutMatrix.tsx` already renders `hit === 'impossible'` as red + line-through.

## Tests (`build-race-view.test.ts`)

| #   | Scenario                                                         | Expected                     |
| --- | ---------------------------------------------------------------- | ---------------------------- |
| 1   | SF pick for team eliminated in QF, SF not yet played             | `impossible`                 |
| 2   | Bronze pick for team eliminated in QF, Bronze not yet played     | `impossible`                 |
| 3   | Final pick for team eliminated in SF, Final not yet played       | `impossible`                 |
| 4   | Pick for still-alive team in unresolved match                    | `pending` (no regression)    |
| 5   | Existing `bothKnown` case: both teams confirmed, pick is neither | `impossible` (no regression) |
