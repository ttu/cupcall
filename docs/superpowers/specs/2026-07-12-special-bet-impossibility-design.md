---
title: Early impossibility detection for special bets
date: 2026-07-12
status: approved
---

## Problem

Special bets only ever show `pending`, `hit`, or `missed`, and `hit`/`missed` are set exclusively
from `results.json::answers` — i.e. only once the whole relevant stat is officially resolved. This
means a pick that is already **mathematically guaranteed** to be wrong (the picked team has no
matches left and isn't currently leading; a running counter has already passed the guessed number)
still shows as `Pending` for the rest of the tournament, right alongside picks that are genuinely
still live.

This is the special-bets analog of a gap that's already been fixed for knockout bracket picks:
`PickStatus`/`KnockoutMatchHit` mark a pick `busted`/`impossible` as soon as the picked team is
eliminated or absent from a confirmed matchup, without waiting for that specific tie to be played
(`docs/superpowers/specs/2026-07-01-impossible-knockout-pick-design.md`).

### Why this isn't the bug that was removed on 2026-06-13

`docs/superpowers/specs/2026-06-13-special-bet-current-leader-design.md` removed exactly this kind
of early-resolution for `groupTopScoringTeam`, `groupTopConcedingTeam`, and `highestMatchGoals`,
because the old code inferred `hit`/`missed` from **who's currently ahead** — a value that can flip
as more matches are played, producing wrong, reversible answers.

This feature only fires on facts that are **monotonic and irreversible**:

- a team has played its last possible match (it can never add another goal, concede another goal,
  or reach the final again), or
- a running tournament-wide counter (highest single-match total, shootout count) has already
  exceeded the guessed number — these counters only ever increase.

Neither condition can later reverse itself, so a pick flagged this way can never contradict the
eventual official answer in `results.json`.

## Goals

- For the 7 special bets with a live data source, mark a user's pick `missed` as soon as it's
  mathematically guaranteed to lose — not just currently trailing.
- Apply consistently in the three places a special-bet's resolution state is shown or summed:
  the results panel (current viewer's card), the pool-wide Specials Matrix, and the
  `canStillGet` / points-race projection for every pool member.
- Reuse one pure computation for all three call sites (no duplicated impossibility logic).

## Non-goals

- The 4 bets with no live underlying data (`topScorerPlayer`, `firstRedCardPlayer`,
  `mostYellowCardsTeam`, `finalDecidedByPenalties`) — the match model carries no per-player/card
  data, so impossibility can never be proven early for these. Unchanged.
- No new `hit` enum value. Per product decision, an impossible pick renders exactly like an
  officially-resolved miss (`hit: 'missed'`, same chip). The "why" (team eliminated vs. counter
  exceeded) is available internally for a future tooltip but isn't surfaced in this pass.
- No change to `packages/engine/src/scoring/remaining-max.ts` (the pool-wide, non-per-user
  `computeRemainingMaxPoints`). That module has no visibility into individual picks and stays a
  conservative ceiling; only the per-user `canStillGet` paths in the results feature change.

## Scope — which bets, and the rule per bet

| Bet key                      | Kind                | Impossible when                                                                    |
| ---------------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| `groupTopScoringTeam`        | team (ties allowed) | Team's group stage is fully played **and** it isn't among the current tied leaders |
| `groupTopConcedingTeam`      | team (ties allowed) | Same, for goals conceded                                                           |
| `tournamentTopScoringTeam`   | team (ties allowed) | Team will never play again **and** it isn't among the current tied leaders         |
| `tournamentTopConcedingTeam` | team (ties allowed) | Same, for goals conceded                                                           |
| `highestMatchGoals`          | number              | Current max single-match goal total already exceeds the predicted number           |
| `penaltyShootoutCount`       | number              | Current shootout count already exceeds the predicted number                        |
| `finalDecisiveGoalPlayer`    | player              | Predicted player's team will never play again                                      |

"Current tied leaders" reuses the existing `computeGroupTopScoringLeader` /
`computeGroupTopConcedingLeader` / `computeTournamentTopScoringLeader` /
`computeTournamentTopConcedingLeader` functions in `domain/special-bet-current.ts`
(`CurrentLeader.teamIds`).

### "Team will never play again"

Computed from actual scheduling/results only — no group-standings simulation:

- **Group-stage-complete for a team**: every `MatchRow` with `stage === 'group'` involving that
  team has `status === 'final'`.
- **Tournament-eliminated**: the team lost a knockout match that's final (existing pattern, e.g.
  `knockoutEliminatedTeams` in `build-bracket-rounds.ts`/`build-race-view.ts`) **or** the group
  stage is fully complete (every group match final) and the team never appears as `homeTeamId`/
  `awayTeamId` in any non-group `MatchRow` (i.e. it wasn't slotted into the knockout stage at all).

This sidesteps the "mathematically eliminated but still has group matches to play" trap: a team
that's already out of qualification contention can still add goals in its remaining group games,
so only "group stage fully played" locks the group-stage tallies, and only "no knockout matches
ever, or lost one" locks the tournament-wide tallies.

### Number bets

`highestMatchGoals` and `penaltyShootoutCount` reuse `computeHighestMatchGoalsLeader` /
`computePenaltyShootoutCountLeader`, which already return the current value as `CurrentLeader.display`
(a stringified number). Impossible when `Number(currentLeader.display) > predictedValue`.

## Solution

### New domain module — the impossibility oracle

`apps/web/src/features/results/domain/special-bet-impossibility.ts`:

```ts
export type SpecialBetImpossibility = {
  /** True when this specific answer can no longer become correct for this bet. */
  isImpossible(betKey: string, value: unknown): boolean;
};

export function computeSpecialBetImpossibility(
  def: Tournament,
  matches: MatchRow[],
): SpecialBetImpossibility;
```

Internally builds, once per call:

- `groupCompleteTeams: Set<TeamId>` — teams with all group matches final.
- `tournamentDoneTeams: Set<TeamId>` — teams that will never play again (see above).
- The 4 team-leader results + 2 number-leader results from `special-bet-current.ts`.

`isImpossible(betKey, value)` dispatches on `betKey`:

- Team bets (`groupTopScoringTeam`, `groupTopConcedingTeam`, `tournamentTopScoringTeam`,
  `tournamentTopConcedingTeam`): `value` is a team id. Impossible when the relevant "done" set
  contains it and the relevant leader's `teamIds` doesn't.
- `finalDecisiveGoalPlayer`: `value` is a player id, resolved to a team via
  `def.players`. Impossible when that team is in `tournamentDoneTeams`.
- `highestMatchGoals` / `penaltyShootoutCount`: `value` is a number. Impossible when the
  corresponding leader exists and its numeric value exceeds `value`.
- Any other key (the 4 non-goal bets): always `false`.

Pure function, no IO — same shape as the existing `special-bet-current.ts` module it sits beside.

### Call site 1 — results panel

`build-special-bet-results.ts`: after computing `hit` the existing way, if `hit === 'pending'` and
`userRaw` is set, additionally check `impossibility.isImpossible(d.key, userRaw)`. If true, set
`hit = 'missed'` (`pointsAwarded` stays `0`, already the case for `pending`). `currentLeader` stays
populated as today (still useful context for _why_ it's missed).

`buildSpecialBetResults` gains one new parameter: the already-computed `SpecialBetImpossibility`
(built once in `get-results-view.ts` from `def` + `matches`, alongside where `special-bet-current`
values are already derived from the same inputs).

### Call site 2 — pool-wide Specials Matrix

`build-race-view.ts` → `buildSpecialsMatrix`: same one-line addition — when a cell would otherwise
be `pending` and the user has a pick, check `isImpossible(d.key, raw)` and set `hit = 'missed'`
instead. `points` stays `0`. The oracle is built once per `getResultsView` call and threaded through
(matches/def are already in scope at the `buildRaceView` call site).

### Call site 3 — per-user `canStillGet`

`build-race-view.ts` → `buildPerUserSpecialsRemaining`: gains the same oracle parameter. For each
`(userId, betKey, value)` pick that's currently unresolved, only add `d.points` to that user's
running total when `!isImpossible(betKey, value)`. This makes every pool member's projected ceiling
(not just the current viewer's) reflect dead picks. The current viewer's own number already improves
for free via call site 1 (it flows through `buildSpecialsSummary`'s `pending`-points sum), so this
closes the gap for everyone else's row in the Points Race.

## Testing

Following the test diamond:

- **Unit** — `special-bet-impossibility.test.ts`: one case per bet key/rule —
  - team bet: team done + not leading → impossible; team done + tied leader → not impossible; team
    still has matches left → not impossible regardless of tally.
  - group-scope vs tournament-scope: a team eliminated from qualifying but with one group match
    left is **not** yet locked for `groupTopScoringTeam`.
  - number bet: current value below/at/above the guess.
  - `finalDecisiveGoalPlayer`: player's team eliminated pre-final vs. mid-tournament vs. still alive.
  - non-goal bet keys always return `false`.
- **Integration** — extend existing suites:
  - `build-special-bet-results.test.ts` (or `get-results-view.test.ts`): a pending pick that's now
    impossible renders `hit: 'missed'`.
  - `build-race-view.test.ts`: a Specials Matrix cell for an eliminated pick shows `missed`; a pool
    member's `canStillGet` excludes points from a now-dead special-bet pick.

## Files touched

- **Create** `apps/web/src/features/results/domain/special-bet-impossibility.ts`
- **Create** `apps/web/src/features/results/domain/special-bet-impossibility.test.ts`
- **Edit** `apps/web/src/features/results/application/build-special-bet-results.ts` — thread the
  oracle through, set `hit = 'missed'` for impossible pending picks.
- **Edit** `apps/web/src/features/results/application/get-results-view.ts` — build the oracle once,
  pass to `buildSpecialBetResults`.
- **Edit** `apps/web/src/features/results/application/build-race-view.ts` — build/pass the oracle
  into `buildSpecialsMatrix` and `buildPerUserSpecialsRemaining`.
- **Edit** corresponding test files for the three call sites.
- No schema, type-union, or UI changes — `hit` already supports `'missed'` everywhere it's read.
