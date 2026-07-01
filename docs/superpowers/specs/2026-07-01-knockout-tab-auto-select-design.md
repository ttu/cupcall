---
name: knockout-tab-auto-select
description: Fix auto-selection of knockout tab in results view when knockout stage is ongoing — root cause is buildStageProgress using DB row count instead of definition-derived expected count per stage
metadata:
  type: project
---

# Knockout Tab Auto-Select — Design

## Problem

When the knockout stage is ongoing and a user navigates to the results page, the **Group Stage tab is selected** instead of the Knockout tab.

### Root cause

Both results pages already contain the correct intent:

```typescript
const defaultTab = view.currentStage !== 'group' ? 'knockout' : 'group';
```

But `currentStage` is wrong during knockout play. `buildStageProgress` computes each stage's `total` from the number of DB match rows for that stage. For knockout matches, the sync pipeline only inserts rows for **completed matches** — so when 7 of 16 R32 matches are done, the DB has 7 rows (all `final`), making `done === total === 7`, which marks R32 as `'completed'`. With no stage marked `active`, `deriveCurrentStage` falls back to the first stage key (`'group'`), giving the wrong default tab.

This also causes the **StageBar** to incorrectly show R32 as a completed checkmark while it is in progress.

## Fix

### File: `apps/web/src/shared/stage-progress.ts`

Replace the per-stage `totalCountByStage` (derived from DB row count) with a **definition-derived expected count**:

```typescript
const expectedTotal = new Map<StageKey, number>([
  ['group', def.groupMatches.length],
  ['R32', def.bracket.slots.length],
  ['R16', def.bracket.roundOf16Matches.length],
  ['QF', def.bracket.roundOf8Matches.length],
  ['SF', def.bracket.semiFinals.length],
  ['Final', 1],
]);
```

- `done` still comes from DB (`m.status === 'final'` count per stage).
- The `if (key === stages[0] && total > 0)` guard in the zero-done branch is replaced with `if (total > 0)` so that the first unplayed stage with expected matches is marked `active` — handles both the pre-tournament case (group not started) and the stage-transition case (group complete, R32 not yet started).

### No other changes

The pages' `defaultTab` logic and `deriveCurrentStage` are correct. Once `currentStage` reflects the right stage, tab auto-selection works.

## Behavior after fix

| Scenario                                 | `currentStage` before | `currentStage` after |
| ---------------------------------------- | --------------------- | -------------------- |
| Group stage ongoing (some matches final) | `group` ✓             | `group` ✓            |
| Group stage done, R32 not started        | `group` ✗             | `R32` ✓              |
| R32 partially done (7/16)                | `group` ✗             | `R32` ✓              |
| R32 done, R16 ongoing                    | `R32` or `group` ✗    | `R16` ✓              |

## Testing

Extend `buildStageProgress` unit tests in `shared/stage-progress.ts` (or a collocated test file) to cover:

1. **Stage transition** — group stage fully complete, R32 has zero DB rows but 16 expected slots → R32 is `active`.
2. **Partial knockout round** — group complete, R32 has 7 DB rows (all final) out of 16 expected → R32 is `active` with `done=7`.
3. Existing pre-tournament case (no matches played) remains `active` on group stage.
