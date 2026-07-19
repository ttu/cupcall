# Final Scenario Summary — Design

Date: 2026-07-19

## Goal

Once the Final is the only match left in the tournament, automatically surface a summary on the
Points Race tab: "if [Home Team] wins, [Player] takes the pool" / "if [Away Team] wins, [Player]
takes the pool", plus which of that projected winner's own still-open special bets need to land to
actually secure it.

## Trigger

**Correction from the first draft:** knockout matches without a result are never inserted into the
`matches` table at all (confirmed in `get-results-view.test.ts`: "KO matches are never inserted
into the matches table by the sync pipeline"). So a raw `allMatches.filter(status !== 'final')`
scan can't detect "only the Final is left" — there's typically no DB row for the Final until it's
played. The Final's `KnockoutMatchView` (built by `buildBracketRounds`, already passed into
`buildPointsRaceView` as `bracketRounds`) is the right source instead: its `homeTeamId`/`awayTeamId`
are populated from the confirmed SF winners as soon as both SFs complete, `actual?.homeTeamId ??
derivedPair?.[0] ?? null` (`build-bracket-rounds.ts`), independent of whether the Final's own row
exists yet.

```ts
const finalMatchView =
  bracketRounds
    .flatMap((r) => r.matches)
    .find((m) => m.bracketMatchKey === def.bracket.finalMatch) ?? null;
const active =
  finalMatchView !== null &&
  finalMatchView.status !== 'final' &&
  finalMatchView.homeTeamId !== null &&
  finalMatchView.awayTeamId !== null &&
  bronzeMatch !== null &&
  bronzeMatch.status === 'final';
```

`bracketRounds: BracketRoundResultView[]` and `bronzeMatch: KnockoutMatchView | null` are both
already available in `RaceParams` inside `build-race-view.ts` — no new inputs needed.
`allMatches`/`MatchRow[]` is still used, but only where it already is: as the input to
`computeSpecialBetImpossibility`.

Once both finalists are confirmed, everything upstream (group stage, all earlier knockout rounds)
is transitively resolved by bracket progression — the only extra condition needed is that Bronze
has also been played. This matters because of an existing engine fact: `scoreFinal()` already
banks each finalist's `perTeam` points as soon as SF completes (2026-07-15 "Finalist points at SF
completion"), and Bronze is fully scored once played. So by the time only the Final is unplayed,
**every leaderboard `pointsTotal` already includes group + knockout + Bronze +
Final-team-membership points.** The only things still undecided are:

1. **Final position bonus** (`scoring.topFourPositionBonus`, 1st/2nd place) — resolves purely from
   who wins, no score needed.
2. **Final exact-score bonus** (`scoring.final.exactScore`) — needs the actual scoreline, not just
   the winner.
3. **Still-open special bets** — anything not yet answered in `actualResults.answers` /
   `finalMatch`, and not already mathematically impossible per the existing
   `computeSpecialBetImpossibility` oracle.

When inactive (more than one match left, or the Final already played), the feature renders nothing.

## Scenario computation

For each of the two scenarios — `home wins` / `away wins` — every leaderboard user gets:

- `lockedScore = pointsTotal + positionBonus`. `positionBonus` mirrors the engine's
  `scoreTopFourPosition` exactly rather than assuming a clean binary 2×/0× split — a user's bracket
  picks can be internally inconsistent (e.g. a busted SF pick), so their predicted winner and
  predicted runner-up don't always resolve to a real "pair":
  `positionBonus = (pickedWinner === scenarioWinner ? topFourPositionBonus : 0) + (predictedOpponent
=== scenarioLoser ? topFourPositionBonus : 0)`, where `scenarioLoser` is simply the other real
  finalist (the Final's `KnockoutMatchView.homeTeamId`/`awayTeamId`, whichever isn't
  `scenarioWinner`). `pickedWinner` is resolved the same way the existing knockout matrix does:
  prefer the finish-score's team-id snapshot (`resolveFinaleWinner`), fall back to
  `deriveImplicitFinaleWinner` from bracket picks, fall back to the raw `knockoutPick`, fall back to
  the Final's own home/away team id when the score is a non-tied legacy row with no snapshot.
  `predictedOpponent` reuses `derivePredictedOpponent` verbatim — both helpers already exist in
  `domain/finale-winner.ts` and are already imported in `build-race-view.ts`.
- `pendingItems: { label: string; points: number }[]` — the user's own still-open items:
  - Every special bet the user has a pick for whose bet is unresolved and not impossible
    (`getSpecialBetDefs(def.scoring)` for labels/points, `computeSpecialBetImpossibility` for the
    prune, `actualResults` for resolved-detection) — the same three inputs
    `buildPerUserSpecialsRemaining` already combines, just itemized instead of summed.
  - The Final exact-score bonus (`scoring.final.exactScore`), included when the user has a saved
    Final finish score with a team-id snapshot (no snapshot ⇒ the engine can never award this bonus
    at all, per `exactScorePoints` in `finish-matches.ts` — never listed) **and** either: the
    predicted score is a draw (compatible with both scenarios — a real Final can still finish level
    after 90/120 minutes and go to penalties regardless of who wins the shootout), or the predicted
    score's implied winner (`home > away ? homeTeamId : awayTeamId`) equals this scenario's winner.
    A non-tied prediction for the other team is structurally dead in this scenario and omitted.

## "Must hit" algorithm

Given each user's `lockedScore` and `pendingItems` for one scenario:

1. Sort all leaderboard users by `lockedScore` DESC, tie-break `displayName` ASC — same tie-break
   the leaderboard itself already uses (`packages/db/src/repositories/scores.ts`).
2. `leader` = top user (the projected winner for this scenario).
3. For every other user `u`: `ceiling(u) = lockedScore(u) + sum(pendingItems(u))`. Let
   `maxRivalCeiling = max(ceiling(u))` across all other users (users with no pending items just
   contribute their `lockedScore`).
4. **Clinched**: `leader.lockedScore >= maxRivalCeiling` → status `'clinched'`, empty `mustHit`. The
   leader wins even in the worst case (they get nothing more, every rival gets everything). A
   single-member pool has no rivals at all, so this is trivially `'clinched'`.
5. **Checklist**: otherwise, greedily add the leader's own `pendingItems`, highest-points first,
   accumulating until `leader.lockedScore + runningSum > maxRivalCeiling`. Those accumulated items
   (in that order) become `mustHit`, status `'checklist'`.
6. **Too close to call**: if summing _all_ of the leader's `pendingItems` still doesn't clear
   `maxRivalCeiling`, status `'too-close'`, `mustHit` = all of the leader's pending items (shown,
   but flagged as insufficient on its own — the outcome also depends on a rival's bets, not just the
   leader's).

## Types (new file `domain/final-scenario.ts`)

```ts
export type FinalScenarioPendingItem = { label: string; points: number };

export type FinalScenarioOutcome = {
  winnerTeamId: string;
  winnerTeamName: string;
  projectedWinnerUserId: string;
  projectedWinnerDisplayName: string;
  projectedPoints: number;
  status: 'clinched' | 'checklist' | 'too-close';
  mustHit: FinalScenarioPendingItem[];
};

export type FinalScenarioView = {
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  home: FinalScenarioOutcome;
  away: FinalScenarioOutcome;
} | null;

export function buildFinalScenarioView(params: {
  leaderboard: LeaderboardEntry[];
  allMatches: MatchRow[];
  def: Tournament;
  bracketRounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
  poolKnockoutPicks: PoolKnockoutPick[];
  poolFinishScores: PoolFinishScore[];
  poolSpecialBets: PoolSpecialBet[];
  actualResults: ActualResults;
}): FinalScenarioView;
```

Pure function, no IO — same style as `hit-points.ts` / `race-chart.ts`. `allMatches` is used only
for `computeSpecialBetImpossibility`; the Final/Bronze match state comes from `bracketRounds` /
`bronzeMatch` (see Trigger, above). Returns `null` when the trigger condition isn't met, or when the
leaderboard is empty.

## Wiring

- `apps/web/src/features/results/domain/types.ts` — `PointsRaceView` gains
  `finalScenario: FinalScenarioView`.
- `apps/web/src/features/results/application/build-race-view.ts` — `buildPointsRaceView` calls
  `buildFinalScenarioView` with data it already receives via `RaceParams` (no new params needed:
  `leaderboard`, `allMatches`, `def`, `bracketRounds`, `bronzeMatch`, `poolKnockoutPicks`,
  `poolFinishScores`, `poolSpecialBets`, `actualResults` are all already there).

## UI

New `apps/web/src/features/results/ui/FinalScenarioCard.tsx`. Rendered at the top of `RaceView.tsx`
(above the race chart card), only when `race.finalScenario !== null`. Visible in both viewer mode
and member mode — it's a pool-wide result, not tied to "my" points, matching the existing race chart
which already renders in viewer mode. Two side-by-side columns (`home` / `away` outcome):

- Team name/badge heading ("If France win the Final").
- Projected winner's name + projected points, in the design system's leaderboard-row / gold-accent
  style already used by `ProjectedStandings` for rank 1.
- `'clinched'` → a badge, e.g. "Already clinched — leads even worst-case."
- `'checklist'` → ordered list of `mustHit` items with their point values ("Needs: Top scorer —
  Mbappé (+8), Final decided by penalties — No (+5)").
- `'too-close'` → the same list, prefixed with a note that it's not sufficient on its own ("Too
  close to call — also depends on {rival}'s open bets.").

No `data-testid`s beyond what E2E needs (per CLAUDE.md — added only if an E2E spec reaches into it).
No Storybook story — feature-level `results/ui` components don't carry stories in this codebase
(only `shared/ui` does); confirmed no existing `results/ui/*.stories.*` files.

## Testing

- **Unit (domain)** `final-scenario.test.ts`:
  - Trigger: inactive when >1 match unplayed; inactive when the one unplayed match isn't the Final;
    active when only the Final remains.
  - `'clinched'` case: leader's lead exceeds every rival's full ceiling.
  - `'checklist'` case: leader needs a subset of their own pending items; assert the greedy order
    and that the minimal prefix is chosen.
  - `'too-close'` case: leader's full pending sum still doesn't clear the max rival ceiling.
  - Position bonus binary correctness for both scenarios (winner pick matching scenario vs. not).
  - Final exact-score item pruned when the user's saved score implies the other team winning.
  - Tie-break (`displayName` ASC) when `lockedScore` ties.
- **Integration**: extend `build-race-view.test.ts` (or add a focused test file) asserting
  `buildPointsRaceView(...).finalScenario` is wired correctly end-to-end with realistic
  leaderboard/pick fixtures.
- **E2E**: not in scope for this pass — no existing e2e fixture has the tournament in "only Final
  left" state; can be added later against `e2e-seeded` if that fixture's synthetic data is adjusted
  to stop one match short of the Final. Out of scope here to avoid touching the shared e2e fixture
  for a single new card.

## Out of scope

- Any change to the existing `ProjectedStandings` / `SwingCard` hit-rate projection — this is a
  separate, exact (not probabilistic) summary that only appears in the single-match-left state.
- Scenario-aware pruning of special bets beyond the Final exact-score item (e.g. inferring that
  `finalDecisiveGoalPlayer` is dead in a scenario where the user's pick's team loses) — the existing
  scenario-agnostic impossibility oracle is reused as-is, consistent with your answer to keep the
  "must hit" scope to the winner's own pending bets without deeper per-bet scenario logic.
