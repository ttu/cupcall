# Scoring engine (`@cup/engine`)

Design doc for the pure scoring/derivation engine. Implements functional-spec §6 (derivation) and §7
(scoring). See also technical-spec §5.

## Responsibility

A **pure, dependency-free TypeScript package**: deterministic, no IO, no clock, no randomness, no DB.
Data in → data out. It is the single source of truth for how a prediction card is derived and scored,
reused by the (future) sync job, server actions, and tests so results are identical everywhere
(functional-spec §13).

## Public API (`packages/engine/src/index.ts`)

```ts
deriveCard(input: CardInputs, t: Tournament): DerivedCard
scoreCard(derived: DerivedCard, inputs: CardInputs, actual: ActualResults, scoring: Scoring): ScoreBreakdown
```

Plus the domain types (`Tournament`, `CardInputs`, `DerivedCard`, `ActualResults`, `Scoring`,
`ScoreBreakdown`, and input sub-types) and branded-id constructors (`teamId`, `playerId`, `groupId`,
`matchId`, `bracketMatchKey`, `points`) and `Result`/`ok`/`err`.

## Derivation (`deriveCard`, functional-spec §6)

1. **Group order** — `computeStandings`/`deriveGroupOrders` rank each group from the player's predicted
   group scores using the configurable `standingsTiebreak` (points → goalDifference → goalsFor →
   seedOrder; head-to-head intentionally omitted for determinism). Unpredicted matches contribute nothing.
2. **Qualifiers** — `selectQualifiers`: top-N per group + best-M third-placed ranked across groups by the
   same metrics (deterministic tie-break by group index then seed).
3. **Bracket** — `buildBracket`: resolves entry-round slot refs (`1A`, `2B`, `3rd[i]`), propagates the
   player's per-tie winner picks, and derives `roundOf8`, `finalists`, `bronzePair`, `roundOf4` (the 4
   QF-winner picks — used for SF scoring, needs only QF picks), and `topFour`
   (`[finalWinner, finalLoser, bronzeWinner, bronzeLoser]` — Predict page display only, needs explicit
   Final/Bronze picks). **Bronze is contested by the two SF losers** (fixed cup convention). Throws on
   a pick naming a non-participant.

## Scoring (`scoreCard`, functional-spec §7)

Every point value comes from the tournament's `scoring` block — no hard-coded numbers. Sub-scorers
(in `scoring/`), each returning branded `Points`:

| Module           | Rule                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `group-matches`  | exact 6, else correct outcome 3, else 0 (no stacking)                                                                       |
| `group-order`    | per group: 4 positions→6, 2→3, 1→1 (3 impossible)                                                                           |
| `finish-matches` | bronze & final: 5 per correct team (side-agnostic) + 5 exact score (home/away must match exactly), independent; max 15 each |
| `sets-rankings`  | round-of-8: 3 per correct team (max 24); top-4: `max(positionTier, 2×teamsInActualTop4)` — **not additive**                 |
| `specials`       | each tournament-wide bet scores iff predicted-and-actual-present-and-equal                                                  |

`scoreCard` sums the seven categories into a `ScoreBreakdown`. The functional-spec §7.7 worked example
is a literal test (total **76**).

## Guarantees

- **Deterministic & idempotent** — verified by a property test (same input → deeply-equal output).
- **Type-safe** — branded domain ids/quantities; no `any`.
- **Config-driven** — adding/removing a scored category is a JSON change, not a code change.

## Structure

```
packages/engine/src/
  brand.ts, result.ts, types.ts        # branded ids, Result, domain types
  standings.ts, qualifiers.ts, bracket.ts, derive.ts   # derivation
  scoring/{group-matches,group-order,finish-matches,sets-rankings,specials}.ts
  score.ts                             # scoreCard composition
  index.ts                             # public barrel
  __fixtures__/mini-tournament.ts      # 4-group test fixture
```

Validation of the JSON that feeds the engine (`tournament.json`, `results.json`, card import/export)
lives in the sibling `@cup/schemas` package.
