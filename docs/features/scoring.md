# Scoring System Design

## 1. Overview

The scoring system rewards players for predicting match outcomes, group standings, and bracket
progression. Points are awarded per category and summed into a total (`ScoreBreakdown`). Scoring is
pure and deterministic: given a `CardInputs` (raw picks), a `DerivedCard`, and `ActualResults`,
every scoring function returns an exact point total.

All scoring logic lives in `packages/engine/src/scoring/`.

---

## 2. Scoring Categories

### 2.1 Group Match Scoring

Per group match that has been finalised:

| Prediction accuracy                          | Points (WC2026) |
| -------------------------------------------- | --------------- |
| Exact score (home and away goals)            | 6               |
| Correct outcome only (win/draw, wrong goals) | 3               |
| Wrong outcome                                | 0               |

**Implementation:** `scoreGroupMatches()` — `packages/engine/src/scoring/group-matches.ts`

Each player predicts a `home:away` score for every group match. Resolved at `actualResults.matchResults`.

---

### 2.2 Group Order Scoring

Per group, once all group matches are final:

| Positions correct                   | Points (WC2026) |
| ----------------------------------- | --------------- |
| All 4 correct                       | 6               |
| Exactly 2 correct                   | 3               |
| Exactly 1 correct                   | 1               |
| 3 correct (impossible¹) / 0 correct | 0               |

¹ In a 4-element permutation, getting exactly 3 positions right forces the 4th to also be right.

**Implementation:** `scoreGroupOrder()` — `packages/engine/src/scoring/group-order.ts`

`DerivedCard.groupOrders` is computed from the player's group score predictions (via
`deriveGroupOrders()`). Predicted group order is compared position-by-position with
`actualResults.groupOrder[groupId]`.

---

### 2.3 Bracket Picks: R16 and QF (per-team scoring)

WC2026 bracket path: **R32** (32 entry slots) → **R16** (16 matches) → **QF** (8 matches) → **SF**
(4 matches) → **Final + Bronze**.

R16 and QF participants are _derived_ from the player's entry-round knockout picks (not picked
directly). `buildBracket()` propagates winners through the bracket to populate `derived.roundOf16`
and `derived.roundOf8`.

| Category                                                 | Per correct team | Max (WC2026) |
| -------------------------------------------------------- | ---------------- | ------------ |
| R16 — teams predicted to reach R16 (`derived.roundOf16`) | 2 pts            | 32 × 2 = 64  |
| QF — teams predicted to reach QF (`derived.roundOf8`)    | 3 pts            | 16 × 3 = 48  |

Resolved when `actualResults.answers.roundOf16` / `.roundOf8` are populated.

**Implementation:** `scoreRoundOf16()`, `scoreRoundOf8()` — `packages/engine/src/scoring/sets-rankings.ts`

---

### 2.4 Top-Four Order

`DerivedCard.topFour` = `[finalWinner, finalLoser, bronzeWinner, bronzeLoser]`, derived from the
player's final and bronze bracket picks plus the SF pairs they depend on.

Scoring once `actualResults.answers.topFourOrder` is populated:

| Positions correct | Points (WC2026) |
| ----------------- | --------------- |
| 4                 | 20              |
| 3                 | 15              |
| 2                 | 10              |
| 1                 | 5               |
| 0                 | 0               |

**Consolation:** `teamRightWrongPlace` (2 pts) × count of derived teams that appear anywhere in the
actual top-4 but in the wrong position.

**Final score:** `max(tier_points, consolation_points)`

**Implementation:** `scoreTopFour()` — `packages/engine/src/scoring/sets-rankings.ts`

---

### 2.5 Final and Bronze Match Scoring

These two matches use _derived_ participants, not the explicit bracket winner pick.

| Derived field        | Source                                                               |
| -------------------- | -------------------------------------------------------------------- |
| `derived.finalists`  | SF winner picks (2 SF bracket picks)                                 |
| `derived.bronzePair` | SF losers: each SF's non-winner participant derived from QF+SF picks |

Per finale match (same formula for both):

| Component                                | Points (WC2026) | Condition                  |
| ---------------------------------------- | --------------- | -------------------------- | --------------------------------------- |
| Per derived team present in actual match | 5               | 0, 1, or 2 teams can match |
| Exact predicted score                    | 5               | `finishScores.[final       | bronze]` matches actual home/away goals |

**Max per match:** 2 × 5 + 5 = **15 points**

The explicit knockout pick for the bronze/final winner slot is **not directly scored**. Its only
role is in the UI (showing pick status) and in the `canStillGet` calculation (see §4). The actual
points come entirely from `derived.bronzePair` / `derived.finalists`.

This means:

- Getting both SF losers right → 10 bronze pts (regardless of who the explicit bronze pick is).
- Predicting the exact final score → 5 pts (regardless of which finalists actually play).

**Implementation:** `scoreBronze()`, `scoreFinal()` — `packages/engine/src/scoring/finish-matches.ts`

---

### 2.6 Special Bets

Single-event predictions scored as boolean matches. Points awarded only after the answer is
officially resolved in `actualResults.answers`.

| Bet key                      | Points (WC2026) | Kind                 |
| ---------------------------- | --------------- | -------------------- |
| `topScorerPlayer`            | 15              | Player — set match   |
| `finalDecisiveGoalPlayer`    | 20              | Player — exact match |
| `firstRedCardPlayer`         | 20              | Player — exact match |
| `mostYellowCardsTeam`        | 15              | Team — set match     |
| `groupTopScoringTeam`        | 10              | Team — set match     |
| `groupTopConcedingTeam`      | 10              | Team — set match     |
| `tournamentTopScoringTeam`   | 10              | Team — set match     |
| `tournamentTopConcedingTeam` | 10              | Team — set match     |
| `highestMatchGoals`          | 10              | Number — exact match |
| `penaltyShootoutCount`       | 10              | Number — exact match |
| `finalDecidedByPenalties`    | 10              | Bool — exact match   |

**Set match** bets award points if the player's pick is one of the resolved answers (handles ties).
**Exact match** bets require a single strict equality.

**Implementation:** `scoreSpecials()` — `packages/engine/src/scoring/specials.ts`

---

## 3. Derived Card Architecture

Raw picks flow through `buildBracket()` to produce the intermediate `BracketResult` / `DerivedCard`
that all scoring functions consume:

```
CardInputs (raw picks)
  └─ buildBracket(tournament, groupOrders, qualifiers, knockoutPicks)
       ├─ roundOf16  — teams in R32 slots (implicit R16 participants)
       ├─ roundOf8   — teams in QF entry slots (implicit QF participants)
       ├─ finalists  — SF winner picks (→ Final participants)
       ├─ bronzePair — SF losers derived from SF winner pick + SF participants
       └─ topFour    — [finalWinner, finalLoser, bronzeWinner, bronzeLoser]
```

Key invariants:

- `bronzePair` is _never_ the explicit bronze bracket pick; it is always the two SF losers.
- `topFour` requires all four of final+bronze to be resolved; it may be shorter for partial cards.
- Stale picks (team not a match participant) are silently dropped; partial cards score 0 for
  unresolvable rounds.

**Implementation:** `buildBracket()` — `packages/engine/src/bracket.ts`

---

## 4. "Can Still Get" Calculation

Each player's **can-still-get** is the maximum additional points still achievable from their
current picks given tournament state. It is used in:

- The player's own breakdown panel (current user path).
- The projected standings table (all users path).

### 4.1 Current User Path

Computed in `buildKnockoutRoundBreakdown()` — `apps/web/src/features/results/application/get-results-view.ts`.

Uses `BracketHealth` rows derived from the current user's real picks.

**Per-team rounds (R16, QF):**

```
canStillGet = health.maxPossiblePoints - health.earnedPoints
```

`maxPossiblePoints = (alivePicks + pendingPicks) × ptsPerPick`

**Top-four:**

```
sfRemaining  = sfHealth.totalPicks - sfHealth.bustedPicks
sfMaxPossible = topFourTierMax(sfRemaining)
canStillGet   = sfMaxPossible - (alreadyEarned)
```

`sfHealth.totalPicks` equals the number of QF matches (4 for WC2026), not the number of picks
made. Busted QF picks reduce the achievable tier; unpicked slots do not.

**Final / Bronze:**
Both finals slots (home/away) are occupied by _derived_ participants from the two SF picks.

```
bustedSfPicks         = finalistHealth.bustedPicks   // wrong SF winner picks
effectiveBronzeBusted = max(bustedSfPicks, bronzePicksBusted)
canStillGet           = max(0, (2 - bustedCount)) × perTeam + exactScore
```

For `bronzePicksBusted`, two scenarios must be distinguished:

| Scenario                                                                                  | Bronze participants known?        | Count toward bronzePicksBusted?                      |
| ----------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------- |
| Explicit bronze bracket pick is wrong team (not a SF loser), actual SF losers still alive | Yes (homeTeamId + awayTeamId set) | **No** — explicit pick irrelevant to derived scoring |
| Explicit bronze bracket pick is for a team eliminated from the tournament                 | No (participants null, null)      | **Yes** — elimination implies SF-loser slot is lost  |

When bronze participants are both confirmed, `pickStatus === 'busted'` means only the explicit
winner pick is wrong — the derived pair (`bronzePair`) is unaffected and full team points remain
attainable. Only count `pickStatus === 'busted'` when participants are unknown (elimination case).

### 4.2 Other Users Path

Computed in `buildPerUserKnockoutCanStillGet()` — `apps/web/src/features/results/application/build-race-view.ts`.

Uses `MatchRow[]` directly to detect eliminated teams. Applies the same logic:

- **Top-four:** count non-busted QF picks → `topFourTierMax(n)`
- **Final/Bronze:** count busted SF-slot pairs → `max(0, 2 - busted) × perTeam + exactScore`

---

## 5. Max Remaining Points (Upper Bound)

`computeRemainingMaxPoints()` — `packages/engine/src/scoring/remaining-max.ts`

Returns the theoretical maximum still attainable across all categories given which matches are
final. Used as the ceiling for `canStillGet` calculations and for the "missed" figure
(`maxFromResolved - earned`).

Notable conservative choices:

- `roundOf16` and `roundOf8` are locked to 0 once the group stage is complete (bracket is fixed).
- `topFour` is locked once both Final and Bronze are played.
- Specials are treated as fully open until the whole tournament is complete.
