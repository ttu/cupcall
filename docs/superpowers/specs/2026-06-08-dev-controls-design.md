# Dev Controls — Design Spec

**Date:** 2026-06-08

## Overview

Add two quick-action buttons to the predict page to make local development faster:

- **Clear all** — always visible; wipes the user's entire prediction card (group scores, knockout picks, finish scores, specials) and rescores.
- **Fill random scores** — dev-only; fills all group stage matches with random scores (0–4 goals each) and rescores.

## Architecture

### DB layer — `packages/db`

Add `clearPredictionInputs(db, predictionId)` to `src/repositories/predictions.ts`.

Deletes all rows for the given `predictionId` from:

- `predictionGroupScores`
- `predictionKnockoutPicks`
- `predictionFinishScores`
- `predictionSpecials`

All four deletes run in parallel (`Promise.all`). Export the new function from the package index.

### Server actions — `apps/web/src/features/predictions/api/`

**`actions.ts`** — add `clearAllPredictions(poolId)`:

- Validates `poolId` (Zod string schema).
- Loads pool + tournament (existing `loadPoolAndTournament` helper).
- Calls `assertCanEditOwnCard` (same lock check as `saveGroupScore`) — returns error if tournament has started.
- Gets or creates the user's prediction.
- Calls `clearPredictionInputs`.
- Rescores via existing `rescoreAfterEdit`.
- Revalidates `/pools/${poolId}/predict`.
- Returns `{ ok: true } | { ok: false; error: string }`.

**`dev-actions.ts`** (new file) — add `devFillRandomGroupScores(poolId)`:

- First line: `if (process.env.NODE_ENV !== 'development') throw new Error('Dev only')`.
- Validates `poolId`.
- Loads pool + tournament to get `tournamentDef.groupMatches`.
- Gets or creates the user's prediction.
- For each group match, calls `upsertGroupScore` with `Math.floor(Math.random() * 5)` for home and away.
- Rescores via `rescoreAfterEdit`.
- Revalidates `/pools/${poolId}/predict`.
- Returns `{ ok: true } | { ok: false; error: string }`.

### UI — `apps/web/src/features/predictions/ui/`

**`DevControls.tsx`** (new file) — client component:

- Props: `{ poolId: string; isDev: boolean }`.
- Renders a small toolbar with:
  - "Clear all" button — always shown, calls `clearAllPredictions`.
  - "Fill random scores" button — only rendered when `isDev === true`, calls `devFillRandomGroupScores`.
- Both buttons use `useTransition` for pending state (disable + show loading text while in flight).
- Styled as small secondary/destructive buttons, visually distinct from the prediction form (e.g., a muted `dev` badge label so the intent is clear).

**`PredictStepper.tsx`** — add `isDev: boolean` to `Props`; render `<DevControls poolId={card.poolId} isDev={isDev} />` above the step tabs.

**`predict/page.tsx`** — pass `isDev={process.env.NODE_ENV === 'development'}` to `PredictStepper`.

## Data flow

```
User clicks "Fill random" / "Clear all"
  → DevControls (client)
  → server action (devFillRandomGroupScores / clearAllPredictions)
  → DB mutations (upsertGroupScore × N / clearPredictionInputs)
  → rescoreAfterEdit
  → revalidatePath → page re-renders with updated card
```

## Error handling

Both server actions return `{ ok: false; error: string }` on failure. The UI logs the error to console (dev context; no toast needed).

## Security

- `clearAllPredictions` uses the same auth check as `saveGroupScore` — the actor must be signed in and own the prediction.
- `devFillRandomGroupScores` throws immediately outside `NODE_ENV === 'development'`, so it cannot be called in production even if the client somehow renders the button.

## Testing

- Unit test for `clearPredictionInputs`: insert rows across all four sub-tables, call the function, assert all deleted.
- Integration test for `clearAllPredictions` action: seed a prediction with data, call the action, assert card is empty and rescored to 0.
- Integration test for `devFillRandomGroupScores`: call in dev env, assert all group matches have scores in [0,4].
- No E2E test needed (dev tooling only).
