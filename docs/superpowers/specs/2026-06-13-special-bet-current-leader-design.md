# Special-bet current-leader hints — design

**Status:** approved (brainstorm); awaiting implementation plan
**Date:** 2026-06-13
**Area:** `apps/web/src/features/results` + `apps/web/src/features/results/ui/SpecialBetsPanel.tsx`

## Problem

Two related issues in the Results "Specials" tab:

1. **Premature judgment.** `packages/db/src/repositories/actual-results.ts` auto-derives
   `groupTopScoringTeam`, `groupTopConcedingTeam`, and `highestMatchGoals` from any completed
   match. As soon as the first group match is final, those three bets get marked `hit`/`missed`
   based on a partial / interim leader — long before the group stage actually ends. That's wrong:
   the final answer must come from `results.json::answers`, not from a snapshot of partial match
   data.

2. **No current-leader hint.** Pending special bets show only the user's pick and a "Pending"
   chip. There's no indication of who's currently leading the underlying race, even though that
   information is derivable from match data already in the database.

The two issues are linked — fixing only (2) without (1) leaves the three auto-derived bets in
the wrong state, so the hint would rarely appear. The current-leader hint is informational
("here's how the race looks so far"), never the final answer.

## Goals

- Stop the premature auto-derivation: `groupTopScoringTeam`, `groupTopConcedingTeam`, and
  `highestMatchGoals` come exclusively from `results.json::answers` (via `actualAnswers` table).
- For each pending special bet whose leader can be derived from match results, display a small,
  visually subordinate "Currently leading: …" line.
- Hide the hint entirely when there's no signal yet (no relevant matches played).

## Non-goals

- Player-level stats (top scorer, decisive-goal player, first-red-card player) — the match model
  doesn't carry per-player goal/card data.
- Auto-resolution of bets from match data. The judging boundary stays in `results.json`.
- Changes outside the Specials tab. Predict-flow and other tabs are unaffected.

## Scope — which bets show a hint

Of the 11 special-bet definitions in `packages/engine/src/scoring/special-bet-defs.ts`:

| Bet key                      | Derivable? | Source data                                                |
| ---------------------------- | ---------- | ---------------------------------------------------------- |
| `groupTopScoringTeam`        | yes        | Group-stage match goals-for per team                       |
| `groupTopConcedingTeam`      | yes        | Group-stage match goals-against per team                   |
| `tournamentTopScoringTeam`   | yes        | All matches (group + knockout) goals-for per team          |
| `tournamentTopConcedingTeam` | yes        | All matches goals-against per team                         |
| `highestMatchGoals`          | yes        | Max `home + away` across all matches with a recorded score |
| `penaltyShootoutCount`       | yes        | Count of matches with `decidedBy === 'penalties'`          |
| `topScorerPlayer`            | no         | Per-player goal data not in `MatchRow`                     |
| `finalDecisiveGoalPlayer`    | no         | Same                                                       |
| `firstRedCardPlayer`         | no         | Per-player card data not in `MatchRow`                     |
| `mostYellowCardsTeam`        | no         | Per-team card data not in `MatchRow`                       |
| `finalDecidedByPenalties`    | no         | Single boolean known only when final is played             |

For non-derivable bets, `currentLeader` stays `null` and the UI renders as it does today.

## Design

### Domain — pure leader computation

New module: `apps/web/src/features/results/domain/special-bet-current.ts`

Exposes pure functions, one per derivable bet, that take the same `MatchRow[]` already loaded by
`getResultsView` and return a `CurrentLeader | null`:

```ts
export type CurrentLeader = {
  /** Human-readable leader(s). Comma-joined names for team bets, the number itself for number bets. */
  display: string;
  /** Quantitative context, e.g. "5 goals", "1 match", "so far". */
  detail: string;
  /** Team IDs for badge rendering when the bet kind is 'team'; empty array otherwise. */
  teamIds: string[];
};

export function computeGroupTopScoringLeader(
  def: Tournament,
  matches: MatchRow[],
): CurrentLeader | null;

export function computeGroupTopConcedingLeader(
  def: Tournament,
  matches: MatchRow[],
): CurrentLeader | null;

export function computeTournamentTopScoringLeader(
  def: Tournament,
  matches: MatchRow[],
): CurrentLeader | null;

export function computeTournamentTopConcedingLeader(
  def: Tournament,
  matches: MatchRow[],
): CurrentLeader | null;

export function computeHighestMatchGoalsLeader(matches: MatchRow[]): CurrentLeader | null;

export function computePenaltyShootoutCountLeader(matches: MatchRow[]): CurrentLeader | null;
```

Rules:

- A match contributes when both `homeGoals` and `awayGoals` are not null (covers `final` and any
  in-progress states that record a score). Other matches are ignored.
- Goals-scored / goals-conceded functions accumulate per `homeTeamId` / `awayTeamId`.
- Group-only variants restrict to `stage === 'group'`.
- Ties: include every team at the top tally. Order names by the order they appear in
  `def.teams` to keep output deterministic.
- Return `null` when:
  - No matches have contributed (no scored matches yet), OR
  - The top tally is `0` (degenerate "leader" — everyone tied at zero conveys nothing).
- `computePenaltyShootoutCountLeader` returns `null` when count is `0`; otherwise
  `{ display: String(count), detail: '', teamIds: [] }` — the UI renders "So far: 2" with no
  parenthetical detail.
- `computeHighestMatchGoalsLeader` returns `null` when no match has a recorded score; otherwise
  `{ display: String(max), detail: <"1 match" | "N matches">, teamIds: [] }` — N counts matches
  tied at the max.

### Application wiring

`buildSpecialBetResults` in `apps/web/src/features/results/application/get-results-view.ts` gains a
`matches: MatchRow[]` parameter (already available in `getResultsView`). After computing `hit`, when
`hit === 'pending'` it dispatches on `d.key` to the matching leader function and stores the result
on the row. For non-pending rows or non-derivable keys, `currentLeader = null`.

### Domain type addition

`apps/web/src/features/results/domain/types.ts` — extend `SpecialBetResultRow`:

```ts
export type SpecialBetResultRow = {
  // …existing fields…
  /** Informational only — derived from match data when the bet is still pending. Never the final answer. */
  currentLeader: CurrentLeader | null;
};
```

Re-export `CurrentLeader` from the same file.

### UI

`apps/web/src/features/results/ui/SpecialBetsPanel.tsx` — inside `SpecialBetRow`, when
`isPending && bet.currentLeader !== null`, render an additional line below the pick row:

```
Most goals — group stage                              [Pending]
🇪🇸 Your pick: Spain                                    10 pts
  Currently leading: 🇧🇷 Brazil, 🇦🇷 Argentina (5 goals)
```

Visual rules:

- `fontSize: 11`, `color: var(--ink-muted)`, no bold — clearly subordinate to "Your pick".
- Prefix string: `Currently leading:` for team/number bets, `So far:` for `penaltyShootoutCount`.
- Detail in parentheses after the display when non-empty: `"(5 goals)"`, `"(1 match)"`. Empty
  detail (penalty count) renders just the prefix + number, no parentheses.
- Render `TeamBadge` per id in `currentLeader.teamIds` (same component used for "Your pick").
- Data-testid: `special-bet-current-leader-${bet.key}` so E2E / integration UI tests can target it.

### Testing

Following the test diamond:

- **Unit (pure domain functions)** — `special-bet-current.test.ts`:
  - empty matches → `null`
  - all matches scoreless → `null`
  - single leader → exact team + detail
  - tied leaders → all team IDs in `def.teams` order
  - group variants exclude knockout matches
  - tournament variants include knockout matches
  - highest-match-goals picks max, counts ties
  - shootout counter counts only `decidedBy === 'penalties'`
- **Integration** — `get-results-view.test.ts`:
  - pending derivable bet with relevant played matches → row has populated `currentLeader`
  - pending non-derivable bet → `currentLeader === null`
  - resolved bet (answer present in `results.json`) → `currentLeader === null` even if matches exist
  - no matches played → `currentLeader === null` across all derivable bets

E2E coverage is not added — the existing Specials tab E2E already exercises the panel render path.

## Decisions

- **Tie display = list all names.** Transparent; the UI is mobile-friendly enough to handle long
  team lists, and truncation hides information without saving meaningful space.
- **Empty state = hide the hint.** Zero-zero leaders convey nothing; absence is cleaner than
  "No matches played yet" text under every pending bet.
- **Computation in the application layer**, not the engine. The engine is pure scoring/derivation;
  current-leader is a UI affordance, not part of the scoring contract.
- **No new database query.** All needed data is already in `allMatches` loaded by
  `getResultsView` — function takes `MatchRow[]` and `Tournament`, nothing else.

## Files touched

- **Create** `apps/web/src/features/results/domain/special-bet-current.ts`
- **Create** `apps/web/src/features/results/domain/special-bet-current.test.ts`
- **Edit** `apps/web/src/features/results/domain/types.ts` — extend `SpecialBetResultRow`,
  export `CurrentLeader`.
- **Edit** `apps/web/src/features/results/application/get-results-view.ts` — pass matches into
  `buildSpecialBetResults`, dispatch to leader functions for pending derivable bets.
- **Edit** `apps/web/src/features/results/application/get-results-view.test.ts` — add cases for
  current-leader behaviour.
- **Edit** `apps/web/src/features/results/ui/SpecialBetsPanel.tsx` — render the leader line for
  pending bets.
- **Edit** `packages/db/src/repositories/actual-results.ts` — remove the auto-derivation
  fallbacks for `groupTopScoringTeam`, `groupTopConcedingTeam`, and `highestMatchGoals`. Those
  three bets now come exclusively from the `actualAnswers` table.
