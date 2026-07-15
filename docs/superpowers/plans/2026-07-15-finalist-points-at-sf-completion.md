# Plan: Bank Finalist team points at semifinal completion

**Date:** 2026-07-15
**Type:** Scoring correctness change (engine + schema/data-model + sync + UI verification)
**Commit rule:** One self-contained `feat` commit (implementation + tests + this plan/spec), per repo convention.

## Problem

A player's **Final** prediction earns **zero** points until the final match is actually
played — even the per-team points for a finalist they have **already** gotten right.

Concretely, a card shows `Finalist 1/2 · 1 pending`: one predicted finalist has already won
its semifinal (locked-in correct, can never be undone), the other is still pending. Yet the
player gets 0 points from the Final category until the final is played.

Root cause — `scoreFinal` → `scoreFinishMatch` bails out entirely when the final is unplayed:

```ts
// packages/engine/src/scoring/finish-matches.ts
if (actualMatch === undefined) {
  return 0;
}
```

## Decision

Split the Final's two independent point components and bank them at different times:

- **Team points** (`perTeam` for each predicted finalist that reaches the final) — a team
  _becomes_ a finalist the moment it wins its semifinal, independent of the final's result.
  **Bank these as each semifinal completes** (i.e. per finalist, incrementally).
- **Exact-score points** (`exactScore` when predicted final score matches actual) — still
  requires the final to be played. **Unchanged.**

This mirrors the existing precedent for the `topFour` / `roundOf4` category, which was
re-attributed to **QF completion** (commit `971cbcc`; see `remaining-max.ts:70`): points
resolve the moment the underlying fact is known, not when a later match is played.

**Timing (confirmed):** bank each finalist's team point at **each SF completion** — a `1/2`
card banks half now and half once the other SF is decided.

**Scope:** finalists only. Bronze is symmetric (bronze pair = SF _losers_, also known at SF
completion) but is intentionally **out of scope** here — do not change bronze scoring.

## Data-model foundation (already exists)

The pattern to copy is `ActualResults.answers.roundOf4` in
`packages/engine/src/types.ts:174` — "Teams confirmed to have won their QF match (i.e. reached
the SF). Grows incrementally as QF matches complete — auto-derived in scripts/sync.ts, never
manually entered." Consumed by `scoreTopFour` (`packages/engine/src/scoring/sets-rankings.ts:47`).

Knockout SF matches carry `round: 'SF'` (schema enum in
`packages/schemas/src/results.ts:28` and `scripts/seed-current.ts:84`).

## Implementation steps (TDD: write the failing test first for each)

### 1. Extend the actual-results type

`packages/engine/src/types.ts` — in `ActualResults.answers` (around line 174, next to
`roundOf4`), add:

```ts
/** Teams confirmed to have won their SF match (i.e. reached the Final). Grows incrementally as
 * SF matches complete — auto-derived in scripts/sync.ts, never manually entered. */
finalists?: TeamId[];
```

### 2. Rework `scoreFinal` to bank team points early

`packages/engine/src/scoring/finish-matches.ts`

- Keep `scoreBronze` and the shared exact-score logic **unchanged in behavior** for bronze.
- Rewrite `scoreFinal` so team points come from the **confirmed-finalists set**, not from
  requiring `actual.finalMatch`:

```ts
export function scoreFinal(
  inputs: CardInputs,
  derived: DerivedCard,
  actual: ActualResults,
  scoring: Scoring,
): Points {
  // Confirmed finalists = SF winners (bank as each SF completes) plus, once the final is
  // played, its two participants (defensive: covers explicit finalMatch without answers).
  const confirmed = new Set<TeamId>(actual.answers.finalists ?? []);
  if (actual.finalMatch !== undefined) {
    confirmed.add(actual.finalMatch.home);
    confirmed.add(actual.finalMatch.away);
  }

  // Team points: perTeam for each predicted finalist confirmed to have reached the final.
  const teamCount = derived.finalists.filter((t) => confirmed.has(t)).length;
  const teamPoints = teamCount * scoring.final.perTeam;

  // Exact-score points: only once the final is actually played and goals match exactly.
  let exactPoints = 0;
  const finishScore = inputs.finishScores.final;
  if (finishScore !== undefined && actual.finalMatch !== undefined) {
    if (
      finishScore.home === actual.finalMatch.homeGoals &&
      finishScore.away === actual.finalMatch.awayGoals
    ) {
      exactPoints = scoring.final.exactScore;
    }
  }

  return points(teamPoints + exactPoints);
}
```

> Consider extracting a small shared helper for the exact-score check if it keeps
> `scoreBronze` and `scoreFinal` DRY, but do **not** change bronze's timing.

**Tests** (`packages/engine/src/scoring/finish-matches.test.ts`):

- Predicted finalist appears in `answers.finalists`, `finalMatch` still undefined → awards
  `perTeam` (not 0). ← the key new behavior.
- Both predicted finalists confirmed, final unplayed → `2 * perTeam`, no exact score.
- Exact score only awarded when `finalMatch` present and goals match.
- A predicted finalist NOT in the confirmed set → 0 for that team.
- Regression: existing "final played" cases still produce the same totals as before.

### 3. Derive `finalists` in sync

`scripts/sync.ts` (around lines 152–166, alongside `r32Winners`/`r16Winners`/`qfWinners`):

```ts
const sfWinners = knockoutMatches.filter((m) => m.round === 'SF').map((m) => teamId(m.winner));
```

and in the `answers` object:

```ts
answers: {
  ...(r32Winners.length > 0 ? { roundOf16: r32Winners } : {}),
  ...(r16Winners.length > 0 ? { roundOf8: r16Winners } : {}),
  ...(qfWinners.length > 0 ? { roundOf4: qfWinners } : {}),
  ...(sfWinners.length > 0 ? { finalists: sfWinners } : {}),
  ...actual.answers, // explicit answers in results.json override derived values
},
```

Update the comment block at `scripts/sync.ts:142-149` to mention SF winners → `finalists`.
Check `scripts/seed-current.ts` (~line 987+) for the same derivation pattern and mirror it if
that path also builds `answers`.

**Test** (`scripts/sync.test.ts`, near the existing roundOf4 test ~line 617): an SF result in
knockout data produces `answers.finalists = [sfWinner]` and immediately scores a card that
predicted that finalist, before any Final row exists.

### 4. Update remaining-max projection

`packages/engine/src/scoring/remaining-max.ts` (`finalMax`, around line 68). Once **both**
SFs are final, the team portion is resolved (banked or lost), so only `exactScore` remains
attainable — mirroring the `qfComplete → topFourMax = 0` treatment at line 72:

```ts
const bothSemisFinal = tournament.bracket.semiFinals.every(isFinal);
const finalMax = finalPlayed
  ? 0
  : bothSemisFinal
    ? scoring.final.exactScore
    : 2 * scoring.final.perTeam + scoring.final.exactScore;
```

Confirm `TournamentProgress` / `finalMatchIds` already carries SF match ids (the `semiFinals`
keys are match ids checked via `isFinal`). Update the `bronze/final` doc comment (lines 25).

**Test** (`remaining-max.test.ts`): before SFs → full `2*perTeam + exactScore`; after both SFs
final, final unplayed → `exactScore` only; after final played → 0.

### 5. UI verification (no logic change expected)

The `Finalist … · N pending` row and its points render from the score breakdown, so banked
team points should surface automatically once `finalists` is populated. Verify in:

- `apps/web/src/features/results/application/build-bracket-rounds.ts` (Final round build,
  ~lines 355 and the confirmed/pending logic).
- `apps/web/src/features/results/domain/bracket-health.ts` and `BracketHealthPanel.tsx`
  (there are already uncommitted local edits here — reconcile, don't clobber).

If an E2E needs to assert the banked points, add a `data-testid` (never target by class/text)
per CLAUDE.md testing rules.

## Definition of Done

- [ ] `scoreFinal` banks `perTeam` per confirmed finalist at SF completion; exact-score still
      gated on the final being played.
- [ ] `answers.finalists` typed and auto-derived in sync (and seed path if applicable).
- [ ] `remaining-max` drops the team portion once both SFs are final.
- [ ] New + regression tests pass (engine unit tests, sync integration test).
- [ ] `pnpm` lint + typecheck + tests green; system runnable.
- [ ] Bronze scoring unchanged.
- [ ] Single `feat` commit including this plan/spec.

## Files to touch

| File                                                                | Change                                   |
| ------------------------------------------------------------------- | ---------------------------------------- |
| `packages/engine/src/types.ts`                                      | add `answers.finalists?: TeamId[]`       |
| `packages/engine/src/scoring/finish-matches.ts`                     | rework `scoreFinal` (team points early)  |
| `packages/engine/src/scoring/finish-matches.test.ts`                | new + regression tests                   |
| `packages/engine/src/scoring/remaining-max.ts`                      | `finalMax` drops team portion post-SF    |
| `packages/engine/src/scoring/remaining-max.test.ts`                 | projection tests                         |
| `scripts/sync.ts`                                                   | derive `sfWinners` → `answers.finalists` |
| `scripts/sync.test.ts`                                              | SF-winner derivation test                |
| `scripts/seed-current.ts`                                           | mirror derivation if it builds `answers` |
| `apps/web/src/features/results/application/build-bracket-rounds.ts` | verify display                           |
| bracket-health UI (already has local edits)                         | verify / reconcile                       |
