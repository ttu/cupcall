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

### 2.4 Semifinalists

`DerivedCard.roundOf4` = the player's 4 QF-winner picks (unordered) — i.e. the four teams the player
predicts will reach the semifinal. Each SF match's two participants are always exactly the winner
picks of its two feeding QF matches, so this is derivable from QF picks alone — present as soon as
the player has made their QF picks, independent of whether they've made SF, Final, or Bronze picks
yet.

**Membership** counts how many of those four teams are in `actualResults.answers.roundOf4` (teams
confirmed to have won their QF match), **order-agnostic**. `answers.roundOf4` is auto-derived from
QF match winners in `scripts/sync.ts` — same pattern as `roundOf16`/`roundOf8` — so this resolves
incrementally as QF matches complete, not at the end of the tournament.

| Correct semifinalists | Points (WC2026) |
| --------------------- | --------------- |
| 4                     | 20              |
| 3                     | 15              |
| 2                     | 10              |
| 1                     | 5               |
| 0                     | 0               |

**Position bonus** — `DerivedCard.topFour` — see §3 — is now also used for scoring, not just the
Predict page's "predicted final standings" display: `[finalWinner, finalLoser, bronzeWinner,
bronzeLoser]`, i.e. the player's predicted 1st/2nd/3rd/4th place. For each slot whose predicted
team exactly matches the actual team in that slot (determined from `actualResults.finalMatch.winner`
/ `bronzeMatch.winner`, since goals alone can't disambiguate a penalty shootout), the player earns an
additional **3 points** (`topFourPositionBonus`) — on top of that team's 5-point membership score.
A team can only earn the position bonus once it's also correctly predicted as a semifinalist —
reaching the Final or Bronze match implies being one of the 4 real semifinalists, so no separate
membership check is needed.

The position bonus resolves **independently per finish match**, not per QF match: the 1st/2nd bonus
banks as soon as the Final is played, the 3rd/4th bonus as soon as the Bronze match is played — so
it can remain open even after the membership table above has fully resolved (all 4 QF matches
played).

Worked example: a player predicts [ARG (1st), FRA (2nd), NED (3rd), POR (4th)]. All four reach the
semifinal (20 membership points). ARG then beats FRA in the Final exactly as predicted (+6 position
bonus: 2 slots × 3), but NED loses the Bronze match to POR, the reverse of the prediction (+0 bronze
position bonus). Total: 20 + 6 = **26**.

Max per team: 5 (membership) + 3 (position) = **8**. Max for the category: 4 × 8 = **32**.

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

**Final's team points bank as each SF completes**, independent of the Final being played — mirroring
the roundOf4/QF-completion precedent in §2.4. A team _becomes_ a finalist the moment it wins its SF,
so `scoreFinal()` awards its `perTeam` points immediately rather than waiting for the Final. The
exact-score component still requires the Final to actually be played. Concretely:

- `actualResults.answers.finalists` grows incrementally as SF matches complete — auto-derived from
  SF winners in `scripts/sync.ts`, same pattern as `roundOf16`/`roundOf8`/`roundOf4`.
- `scoreFinal()` counts `derived.finalists` teams present in the confirmed-finalists set (`answers.finalists`,
  plus `finalMatch`'s participants once played) — awarding `perTeam` per confirmed team regardless of
  whether the Final itself has been played yet.
- **Bronze is not changed** — bronze's team points still require `actualResults.bronzeMatch` to be
  set (i.e. the Bronze match played), even though the bronze pair (SF losers) is technically known at
  SF completion too. This asymmetry is intentional and out of scope for now.

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
       ├─ roundOf4   — the 4 QF-winner picks (predicted semifinalists) — used for SF membership scoring
       └─ topFour    — [finalWinner, finalLoser, bronzeWinner, bronzeLoser] — Predict page display AND
                        the SF position-bonus scoring input (see §2.4)
```

Key invariants:

- `bronzePair` is _never_ the explicit bronze bracket pick; it is always the two SF losers.
- `roundOf4` needs only the 4 QF-winner picks; it does not depend on SF, Final, or Bronze picks.
- `topFour` requires final+bronze picks to be resolved to populate each slot; it may be shorter for
  partial cards. Used both for the Predict page's ordered standings display and, since the top-four
  position bonus was added, for scoring (see §2.4) — a slot that's absent (partial card) simply
  can't earn its position bonus.
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

**Top-four:** membership and the position bonus (§2.4) resolve independently, so `canStillGet` sums
two separately-computed ceilings:

```
// Membership — zero once every QF match has been played (roundOf4FullyKnown)
sfRemaining          = sfHealth.totalPicks - sfHealth.bustedPicks - sfHealth.alivePicks
membershipMaxPossible = sfRemaining × scoring.roundOf4PerTeam

// Position bonus — resolves independently per finish match
topFourPositionCeiling =
  (finalPlayed  ? 0 : max(0, 2 - bustedSfPicks)         × scoring.topFourPositionBonus) +
  (bronzePlayed ? 0 : max(0, 2 - effectiveBronzeBusted) × scoring.topFourPositionBonus)

canStillGet = (roundOf4FullyKnown ? 0 : membershipMaxPossible) + topFourPositionCeiling
```

`sfHealth.totalPicks` equals the number of QF matches (4 for WC2026), not the number of picks
made. Busted QF picks reduce the membership ceiling; unpicked slots do not. Subtracting
`sfHealth.alivePicks` (not just `bustedPicks`) avoids double-counting picks already banked, since
`bd.topFour` now combines membership and position-bonus earnings and can no longer be subtracted
directly the way the old single-category ceiling did.

The position bonus stays open even after membership has fully resolved — it only closes once its
own finish match (Final for 1st/2nd, Bronze for 3rd/4th) has been played, reusing the same
`bustedSfPicks`/`effectiveBronzeBusted` counts computed for the Final/Bronze ceilings below.

**Final / Bronze:**
Both finals slots (home/away) are occupied by _derived_ participants from the two SF picks.

```
bustedSfPicks         = finalistHealth.bustedPicks   // wrong SF winner picks
effectiveBronzeBusted = max(bustedSfPicks, bronzePicksBusted)
maxPossible           = max(0, (2 - bustedCount)) × perTeam + exactScore
canStillGet           = max(0, maxPossible - alreadyEarned)
```

For Final, `alreadyEarned` can now be non-zero before the Final is played (team points banked as
each SF completes — see §2.5), so the subtraction is load-bearing, not just defensive. For Bronze,
`alreadyEarned` stays 0 until the Bronze match is played (bronze's timing is unchanged).

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

- **Top-four membership:** (non-busted QF picks − already-confirmed-correct picks) ×
  `roundOf4PerTeam`, clamped to 0 — the confirmed portion is subtracted so it isn't double-counted
  against points already banked via `scoreTopFour`.
- **Final/Bronze:** count busted SF-slot pairs → `max(0, 2 - busted) × perTeam + exactScore`, plus
  `max(0, 2 - busted) × topFourPositionBonus` for the corresponding top-four position-bonus slots
  (1st/2nd for Final, 3rd/4th for Bronze) — reusing the same busted-pair counts as the line above,
  each added inside the `if (!finalPlayed)` / `if (!bronzePlayed)` guard so the position-bonus
  upside disappears the moment its finish match is played.

---

## 5. Max Remaining Points (Upper Bound)

`computeRemainingMaxPoints()` — `packages/engine/src/scoring/remaining-max.ts`

Returns the theoretical maximum still attainable across all categories given which matches are
final. Used as the ceiling for `canStillGet` calculations and for the "missed" figure
(`maxFromResolved - earned`).

Notable conservative choices:

- `roundOf16` and `roundOf8` are locked to 0 once the group stage is complete (bracket is fixed).
- `topFour`'s **membership** portion locks once every QF match is played (all four semifinalists
  are then known); its **position-bonus** portion locks independently — 1st/2nd once the Final is
  played, 3rd/4th once Bronze is played — so `topFour`'s overall ceiling can stay above 0 even
  after membership has fully resolved.
- `final`'s team portion (2 × `perTeam`) locks once both SF matches are played, leaving only
  `exactScore` attainable until the Final itself is played — mirroring `topFour`'s QF-completion
  treatment, one round later. Bronze is unaffected: its full `2 × perTeam + exactScore` upside
  remains open until the Bronze match is played.
- Specials are treated as fully open until the whole tournament is complete.
