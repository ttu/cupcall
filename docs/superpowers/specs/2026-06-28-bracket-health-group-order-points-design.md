# Design: Show group-order points in Bracket Health R32 row

**Date:** 2026-06-28
**Status:** Approved

## Problem

The Bracket Health panel shows a per-round pick-health row for R32 (teams predicted to qualify from groups). After groups start resolving, users earn group-order points (scoring for correct 1st/2nd/3rd/4th finishes), but there is no place in the Bracket Health panel that surfaces these earned points. Users must scroll away to see their group-order total.

## Goal

Display the user's total earned group-order points as a sub-line under the R32 row in the Bracket Health panel, updated progressively as groups finalise.

## Design

### Data layer

Add one field to `BracketHealth` (in `apps/web/src/features/results/domain/types.ts`):

```ts
export type BracketHealth = {
  // ... existing fields ...
  /** Total group-order points the user has earned so far. Null in viewer mode. */
  groupOrderPoints: number | null;
};
```

`null` when there is no authenticated user (viewer mode). `0` is valid and means no points earned yet.

### Application layer

In `get-results-view.ts`, after `buildBracketHealth` returns, set the new field from the user's score breakdown:

```ts
bracketHealth.groupOrderPoints = userBreakdown?.groupOrder ?? null;
```

`userBreakdown` is already computed earlier in the same function from `leaderboard.find(e => e.userId)?.breakdown`.

No changes to `buildBracketHealth`, `buildR32QualHealth`, or `BracketRoundHealth`.

### UI layer

In `BracketHealthPanel.tsx`, after the `health.perRound.map` block renders each `RoundHealthRow`, detect the R32 row by its label and render a sub-line below it:

```tsx
{
  health.perRound.map((r) => (
    <React.Fragment key={r.label}>
      <RoundHealthRow round={r} />
      {r.label === 'R32' && health.groupOrderPoints !== null && health.groupOrderPoints > 0 && (
        <div className="pl-10 text-[11px] font-semibold text-green-700">
          Group order +{health.groupOrderPoints} pts
        </div>
      )}
    </React.Fragment>
  ));
}
```

The sub-line is:

- **Hidden** when `groupOrderPoints` is `null` (viewer mode) or `0` (no points yet).
- **Shown** progressively as groups complete and the leaderboard breakdown updates.
- Indented (`pl-10`) to sit under the R32 row's bar/count.

### Testing

`get-results-view.test.ts`: assert that `bracketHealth.groupOrderPoints` equals the user's `breakdown.groupOrder` value when the user is authenticated, and is `null` in viewer mode.

No changes needed to `bracket-health-display.test.ts` or `RoundHealthRow` (the component is unchanged).

## Scope

| File                                                                 | Change                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------- |
| `apps/web/src/features/results/domain/types.ts`                      | Add `groupOrderPoints: number \| null` to `BracketHealth` |
| `apps/web/src/features/results/application/get-results-view.ts`      | Set `bracketHealth.groupOrderPoints`                      |
| `apps/web/src/features/results/ui/BracketHealthPanel.tsx`            | Render sub-line under R32 row                             |
| `apps/web/src/features/results/application/get-results-view.test.ts` | Assert new field                                          |

## Out of scope

- Showing "missed" or "can still get" group-order points here (those live in the group summary).
- Changing `BracketRoundHealth` or `RoundHealthRow`.
- Showing group-order points for individual groups.
