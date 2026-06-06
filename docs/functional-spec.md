# Cup Prediction — Functional Specification

**Status:** Draft v1
**Date:** 2026-06-06
**Target tournament:** FIFA World Cup 2026 (data-driven; other cups supported via JSON)

---

## 1. Overview

A website where friends predict the outcome of a football cup tournament and compete
in private leaderboards ("pools").

Before the tournament starts, each player fills in a **prediction card**:

1. **Every group-stage match score** (e.g. 2–1).
2. **A knockout winner pick for every tie** — from the bracket the engine builds for them
   (see below), the player picks who wins each tie up to the champion, plus the bronze-match winner.
3. **A predicted score** for their own final and bronze matchups (for the exact-score points).
4. **Tournament-wide bets** — top scorer, highest-scoring/most-conceding teams, most yellow cards,
   first red card, penalty-shootout count, whether the final goes to penalties, and the player who
   scores the decisive goal in the final (full list in §6).

From these inputs the engine **auto-derives** the artifacts the Excel scores by hand — each group's
final order (from the player's predicted scores), each player's qualifiers, knockout bracket,
**Round of 8** (quarter-finalists), the two finalists, the bronze pair, and the **top-4 final ranking**.
Because the system is automated, players never hand-enter those. All predictions **lock at the first
match kickoff**. As real results are entered, points are awarded automatically and leaderboards update
(full schedule §7).

### Key product decisions

| Decision | Choice |
|---|---|
| Platform | Responsive **website** (works on mobile browsers) |
| Stack | **Next.js** (App Router) + **PostgreSQL** (provider-agnostic) + **TypeScript** |
| Hosting | **Vercel** free tier (web) + a managed **Postgres** free tier (e.g. Neon) |
| Auth | **Magic link** (email only, passwordless) |
| Prediction flow | **All upfront**, single deadline at first kickoff |
| Scoring system | Per the **"America MM 2026" Excel** schedule (group scores + group order + Round-of-8 + bronze/final + top-4 order + tournament-wide bets) |
| Knockout progression | **Auto-derived**: group order from predicted scores → qualifiers → per-tie winner picks propagate the bracket. Group order, Round-of-8, finalists, and top-4 are computed, not entered |
| Predictions scope | **One card per user per pool** (not shared across pools) |
| Owner edits | A pool **owner can edit any member's answers in their pool at any time** (incl. after lock), fully audited |
| Tournament & results data | **JSON committed to the repo**, no admin UI |

### Non-goals (v1)

- No admin web UI for **tournament/results data** — those are managed as code (JSON in repo).
  (Pool owners *can* edit members' predictions in-app — that's a pool feature, §8.3, not data admin.)
- No public/global leaderboard — competition happens inside pools only.
- No live in-match scoring; results are entered after matches finish.
- No payments, prizes, or money handling. The Excel's prize split (60/30/10) is **not shown
  anywhere in the app**; any pot is arranged entirely offline.
- No native mobile apps.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Tournament** | A cup competition defined in JSON (teams, groups, matches, bracket rules). |
| **Group** (tournament) | A first-stage group of teams (e.g. Group A). 2026 WC has 12 groups of 4. |
| **Pool** | A private social group of users with its own leaderboard. (Named "pool" to avoid clashing with tournament groups.) |
| **Match** | A single fixture with two teams; group or knockout. Has a kickoff time and, once played, a result. |
| **Prediction** (card) | A user's complete set of answers for one pool (§6). One card per user per pool. |
| **Group order** | The final 1st–4th finishing order of a group. Derived from predicted scores and scored (§7.2). |
| **Round of 8** | The eight teams that reach the quarter-finals. Derived from each player's bracket (§6.3). |
| **Top-4 order** | The final tournament ranking of positions 1–4 (champion, runner-up, third, fourth). |
| **Special bets** | Tournament-wide novelty predictions (top scorer, cards, shootouts, etc.) — §6.6. |
| **Top scorer** | The player who scores the most goals across the whole tournament. |
| **Lock time** | Kickoff of the tournament's first match. Predictions are read-only afterward. |

---

## 3. Tech stack & deployment

- **Frontend + backend:** Next.js (App Router). Server actions / route handlers for mutations; the
  server is the only database client (no direct browser→DB access).
- **Database & auth:** standard **PostgreSQL** (any provider). **Magic-link email** login via a portable
  auth library — one account per verified email address. No proprietary platform lock-in.
- **Hosting:** Vercel (web) + a managed Postgres (e.g. Neon), both free tier. Provider is swappable via a
  connection string. See the technical spec for stack details.
- **Data-as-code:** Tournament definitions and results are JSON files in the repo
  (`/data/tournaments/<id>/`). A sync script loads them into the DB (see §11).

---

## 4. Tournament data format (JSON)

Tournament data is **committed to the repo** under `/data/tournaments/<tournamentId>/`.
There is no admin UI; editing JSON + running the sync script is the only way to create
tournaments or enter results.

### 4.1 `tournament.json` — definition

```jsonc
{
  "id": "wc-2026",
  "name": "FIFA World Cup 2026",
  "firstKickoff": "2026-06-11T18:00:00Z",   // lock time for all predictions
  "knockoutRounds": ["R32", "R16", "QF", "SF", "Final"],  // labels for display only

  // Full point schedule (§7). The engine reads every value from here — no hard-coded points.
  "scoring": {
    "groupMatch":            { "exactScore": 6, "correctOutcome": 3 },      // max 6 / match
    "groupOrder":            { "allCorrect": 6, "twoCorrect": 3, "oneCorrect": 1 }, // max 6 / group
    "groupTopScoringTeam":   10,
    "groupTopConcedingTeam": 10,
    "roundOf8PerTeam":       3,                                             // max 24 (8 teams)
    "bronze":                { "exactScore": 5, "perTeam": 5 },             // max 15
    "final":                 { "exactScore": 5, "perTeam": 5 },             // max 15
    "topFourOrder":          { "allCorrect": 20, "threeCorrect": 15, "twoCorrect": 10,
                               "oneCorrect": 5, "teamRightWrongPlace": 2 }, // max 20
    "tournamentTopScoringTeam":   10,
    "tournamentTopConcedingTeam": 10,
    "highestMatchGoals":     10,        // most goals in any single match, regulation time
    "mostYellowCardsTeam":   15,
    "firstRedCardPlayer":    20,
    "penaltyShootoutCount":  10,        // number of shootouts in the whole tournament
    "finalDecidedByPenalties": 10,      // yes/no
    "finalDecisiveGoalPlayer": 20,
    "topScorerPlayer":       15
  },

  "teams": [
    { "id": "MEX", "name": "Mexico" },
    { "id": "ARG", "name": "Argentina" }
    // ... 48 teams for WC 2026
  ],

  // Players selectable for player bets (top scorer, first red card, decisive final goal):
  "players": [
    { "id": "ARG-10", "name": "L. Messi", "team": "ARG" }
    // ...
  ],

  "groups": [
    { "id": "A", "teams": ["MEX", "RSA", "KOR", "CZE"] }
    // ... 12 groups (A–L) of 4 for WC 2026
  ],
  "groupMatches": [
    { "id": "m1", "group": "A", "home": "MEX", "away": "RSA", "kickoff": "2026-06-11T18:00:00Z" }
    // ... all 72 group matches
  ],

  // How many advance per group + cross-group third-place qualification:
  "qualification": { "autoQualifyPerGroup": 2, "bestThirdPlaced": 8 },

  // Deterministic standings order, applied top-to-bottom, to both within-group ordering and
  // cross-group third-place ranking. Computed from predicted scores (per player) and from actual
  // scores. Head-to-head is intentionally omitted for determinism; seedOrder is the final fallback.
  "standingsTiebreak": ["points", "goalDifference", "goalsFor", "seedOrder"],

  // Bracket template: who fills each entry-round slot, and how winners feed later rounds.
  // Lets the engine build every player's bracket from their qualifiers without hard-coding.
  "bracket": {
    "rounds": ["R32", "R16", "QF", "SF", "Final"],
    "entryRound": "R32",
    "slots": [
      // "1A" = group A winner, "2B" = group B runner-up, "3rd[i]" = i-th best third-placed team.
      { "match": "ro32-1", "home": "1A", "away": "3rd[0]" }
      // ... full entry-round matchup table
    ],
    "progression": [
      { "match": "ro16-1", "from": ["ro32-1", "ro32-2"] }
      // ... including the bronze match fed by the two SF losers
    ],
    "bronzeMatch": { "from": ["sf-1", "sf-2"], "losers": true }
  }
}
```

> **Derivation engine.** From a player's predicted group scores the engine computes each group's final
> order via `standingsTiebreak`; 1st/2nd auto-qualify and the eight best third-placed teams are ranked
> across groups by the same rule. `bracket.slots`/`progression` then place qualifiers and propagate the
> player's per-tie **winner picks** (§6.3). From that it computes the player's group orders, Round of 8,
> finalists, bronze pair, and top-4 — the things scored in §7. The identical computation over real
> `results.json` data yields the **actual** versions to score against.
>
> The exact WC-2026 `slots` third-placed mapping (FIFA's published table) is filled in once the real
> schedule is confirmed.

### 4.2 `results.json` — actual outcomes (updated over time)

Results are appended/edited as matches finish, committed, and synced.

```jsonc
{
  "tournamentId": "wc-2026",

  "matchResults": [
    { "matchId": "m1", "home": 2, "away": 1, "status": "final" }
    // Group matches use home/away goals only (draws allowed).
  ],

  // Actual final group orders (top-to-bottom). Normally DERIVED from matchResults via
  // standingsTiebreak; may be supplied here to override when officials apply a tiebreaker the
  // engine doesn't model. Scored against each player's derived group order (§7.2).
  "groupOrder": {
    "A": ["MEX", "CZE", "KOR", "RSA"]
    // ... optional overrides
  },

  // Actual knockout fixtures as they become known (real results, independent of any player).
  "knockout": [
    { "round": "QF", "matchId": "qf-1", "home": "ARG", "away": "BRA",
      "homeGoals": 1, "awayGoals": 0, "winner": "ARG", "decidedBy": "regulation" }
    // decidedBy: "regulation" | "extraTime" | "penalties"
  ],

  // The two designated finish matches, scored exactly (§7.3):
  "bronzeMatch": { "home": "NED", "away": "POR", "homeGoals": 2, "awayGoals": 1 },
  "finalMatch":  { "home": "ARG", "away": "FRA", "homeGoals": 3, "awayGoals": 2,
                   "decidedBy": "penalties", "decisiveGoalPlayer": "ARG-10" },

  // Answers to the discrete bets (§7.4–7.5). null until decided.
  "answers": {
    "roundOf8": ["ARG","BRA","FRA","ESP","ENG","NED","POR","CRO"], // the 8 QF teams
    "topFourOrder": ["ARG","FRA","NED","POR"],   // 1st,2nd,3rd,4th
    "groupTopScoringTeam":   "ESP",
    "groupTopConcedingTeam": "RSA",
    "tournamentTopScoringTeam":   "ARG",
    "tournamentTopConcedingTeam": "RSA",
    "highestMatchGoals":     7,        // most goals in any one match, regulation
    "mostYellowCardsTeam":   "CRO",
    "firstRedCardPlayer":    "GER-4",
    "penaltyShootoutCount":  5,
    "topScorerPlayer":       "FRA-9"
    // finalDecidedByPenalties + finalDecisiveGoalPlayer are read from finalMatch above.
  }
}
```

Every value the scoring engine needs is present in `results.json` — either as raw match data or as
an explicit answer above. `null`/absent answers simply score 0 until filled in.

---

## 5. User accounts & authentication

- **Magic link only.** User enters email → receives a sign-in link → clicked link creates/authenticates
  the account. No passwords.
- One account per verified email (unique constraint in the auth/users table).
- Minimal profile: email (private) + a **display name** (shown on leaderboards). Display name is
  editable; default derived from email local-part.
- After joining a pool, a user with an empty card for it is prompted to fill it in; past lock time a
  member sees their card read-only (the owner can still edit it, §8.3).

---

## 6. Predictions

A user has **one prediction card per pool** they belong to (cards are **not** shared across pools, so
the same user can hold different predictions in different pools). The player supplies a small set of
inputs (§6.1–6.4); the engine **derives** everything else (group orders, qualifiers, bracket, Round of
8, finalists, bronze pair, top-4). Partial saving is allowed before lock; a group whose matches aren't
all predicted can't be ordered, leaving its qualifiers and the dependent knockout picks incomplete —
those parts simply score 0 (§6.5). A pool **owner may edit any member's card** in their pool at any
time (§8.3).

### 6.1 Group-stage scores

- The player enters a predicted score (home goals, away goals) for **every group match** (72 for WC 2026).

### 6.2 Derived group order

- The engine computes each group's predicted **1st → 4th order** from the player's group scores using
  `standingsTiebreak` (points → GD → GF → seedOrder). The player does **not** enter order separately and
  cannot disagree with their own scores.
- This order is **scored directly** (§7.2) and seeds the bracket: 1st/2nd auto-qualify; the best
  `bestThirdPlaced` third-placed teams are selected across groups by the same tiebreak.

### 6.3 Knockout winner picks

- The engine fills the player's entry-round bracket from their qualifiers (§6.2) via the tournament's
  `bracket` template. Walking the bracket from R32 to the Final, the player **picks the winner of each
  tie**; each pick propagates into the next round. The player also picks the **bronze-match winner**
  (the match between the two semi-final losers).
- The player additionally enters a **predicted exact score** for their **final** and **bronze** matchups
  (used for the exact-score points in §7.3).
- **Auto-derived from these picks** (never hand-entered): the **Round of 8** (the player's eight QF
  teams), the two finalists, the bronze pair, and the **top-4 ranking** (champion = final winner,
  runner-up = final loser, 3rd = bronze winner, 4th = bronze loser).
- **Re-derivation rule:** any edit to group scores (by the player before lock, or by the owner at any
  time per §8.3) rebuilds the bracket; winner picks for teams that no longer appear are dropped and
  must be re-picked. The UI warns before applying a change that disrupts existing picks.

### 6.4 Special bets

The player answers each tournament-wide bet once:

| Bet | Input |
|---|---|
| Top scorer | one player from `players` |
| Most goals scored — group stage | one team |
| Most goals conceded — group stage | one team |
| Most goals scored — whole tournament | one team |
| Most goals conceded — whole tournament | one team |
| Highest total goals in a single match (regulation) | a number |
| Most yellow cards | one team |
| First red card | one player |
| Number of penalty shootouts in the tournament | a number |
| Is the final decided by penalties? | yes / no |
| Player who scores the decisive goal in the final | one player |

### 6.5 Locking

- At `firstKickoff`, every member's card becomes **read-only to that member**. The server rejects
  member prediction writes at/after lock time (authoritative server-side time check, not client clock).
- After lock, members can still view their predictions and all scoring.
- **Owner override:** the pool owner is **not** bound by the lock — they can edit any member's card at
  any time, before or after kickoff. Every owner edit is recorded in the audit log (§8.3) and triggers
  an immediate re-score for that card.
- **Incomplete predictions lock as-is** — there is no "complete or nothing" gate. Unpredicted group
  matches score 0; a group whose matches aren't all predicted can't be ordered, so its qualifiers and
  every downstream knockout pick that depends on them score 0. The player keeps whatever points their
  completed predictions earn. The UI shows a clear completeness indicator before lock so this is a
  deliberate choice, not a surprise.

### 6.6 Export & import

- **Export.** From any card the user can download a portable **JSON file of their inputs** — group
  scores, knockout winner picks, final/bronze predicted scores, and special bets. Derived artifacts
  (group order, Round-of-8, top-4) are *not* exported; they are recomputed on import. The file carries
  `tournamentId` and a schema `version`.
- **Import.** Uploading such a file populates a card in one step — the main way to **copy a card between
  pools** (cards aren't shared, so this replaces the old "single shared set") and to restore a backup.
  Import **validates** that `tournamentId` matches the pool's tournament and that every team/player/match
  id exists; unknown or missing fields are skipped (partial import allowed) and reported back. It
  **overwrites** the matching fields of the target card, then re-derives the bracket and re-scores.
- **Lock & permissions.** A member can import only **before lock** (same rule as manual editing). The
  **owner** can import into any member's card **at any time** as an owner edit (§8.3) — handy for entering
  predictions collected offline (e.g. transcribed from the Excel). Owner imports are **audited** like any
  other owner edit, and the audit log is visible to all members (§8.3).

```jsonc
// Export / import format — the user-prediction analog of results.json
{
  "tournamentId": "wc-2026",
  "version": 1,
  "groupScores":  [ { "matchId": "m1", "home": 2, "away": 1 } /* ... */ ],
  "knockoutPicks":[ { "bracketMatchKey": "ro32-1", "winner": "ARG" } /* ... incl. bronze */ ],
  "finishScores": { "final": { "home": 3, "away": 2 }, "bronze": { "home": 2, "away": 1 } },
  "specials":     { "topScorerPlayer": "FRA-9", "mostYellowCardsTeam": "CRO" /* ... */ }
}
```

---

## 7. Scoring

Scoring is recomputed whenever results sync (§11). All point values come from the tournament JSON.

All point values come from `scoring` in the tournament JSON (§4.1); the engine must not hard-code
numbers. Default values shown below are the "America MM 2026" schedule.

### 7.1 Group matches *(max 6 / match)*

For each group match with a final result:

- **Exact score** (both goal counts match) → **6**.
- Else **correct outcome** (predicted win/draw/loss matches actual) → **3**.
- Else **0**. *(Exact and outcome do not stack — exact is worth 6 total, not 9.)*

### 7.2 Group final order *(max 6 / group)*

Compare the player's **derived** 1–4 order for a group (§6.2) against the **actual** final order.
Count positions where the predicted team matches the actual team at the same rank:

| Positions correct | Points |
|---|---|
| 4 (all) | **6** |
| 2 | **3** |
| 1 | **1** |
| 0 | **0** |

*(Exactly 3 correct is impossible in a 4-permutation — if three are right the fourth is too — so
there is no "3 correct" tier, matching the Excel.)*

### 7.3 Bronze match & final *(max 15 each)*

The player's bronze/final **pairings are derived** from their bracket (§6.3) and their **scores are
entered**; each finish match is scored independently against the actual fixture
(`results.bronzeMatch` / `results.finalMatch`):

- **Each correct team** in the match (regardless of home/away side) → **5** (so 0, 5, or 10).
- **Exact score** of the match → **5**.

So a perfect bronze or final prediction = 10 (teams) + 5 (score) = **15**.

### 7.4 Set & ranking bets

- **Round of 8** — for each team in the player's **derived** Round of 8 (§6.3) that is in the actual
  quarter-final set (`results.answers.roundOf8`) → **3**. Order irrelevant. *(max 24.)*
- **Top-4 final ranking** — compare the player's **derived** top-4 against `results.answers.topFourOrder`.
  Score the **greater of** (a) the position tier or (b) the team consolation — the two are **not added**:

  | (a) Positions correct | Points | | (b) Consolation |
  |---|---|---|---|
  | 4 (all) | **20** | | **2** per predicted team that finishes in the actual top 4, |
  | 3 | **15** | | regardless of position. |
  | 2 | **10** | | |
  | 1 | **5** | | |

  Final top-4 points = `max(tier, 2 × teamsInActualTopFour)`.

### 7.5 Special bets

Each correct answer scores once, from `results.answers` (or the final match for the last two):

| Bet | Points |
|---|---|
| Most goals scored — group stage | **10** |
| Most goals conceded — group stage | **10** |
| Most goals scored — whole tournament | **10** |
| Most goals conceded — whole tournament | **10** |
| Highest total goals in one match (regulation) — exact number | **10** |
| Most yellow cards (team) | **15** |
| First red card (player) | **20** |
| Number of penalty shootouts — exact number | **10** |
| Final decided by penalties (yes/no) | **10** |
| Decisive goal in the final (player) | **20** |
| Top scorer (player) | **15** |

### 7.6 Total & partial scoring

- A card's score (one per user per pool) = sum of all awarded points to date.
- Scores accrue **incrementally** as results sync in: group match/order points during the group
  stage, Round-of-8 once quarter-finalists are known, bronze/final/top-4 at the end, and each
  special bet as its answer is filled in.

### 7.7 Worked example

- Predicts MEX 2–1 RSA; actual MEX 3–1 RSA → correct outcome only → **3**.
- Predicts FRA 1–0 GER; actual 1–0 → exact → **6**.
- Group A predicted order [MEX, CZE, KOR, RSA]; actual [MEX, KOR, CZE, RSA] → MEX (1st) and RSA
  (4th) correct = 2 positions → **3**.
- Round of 8: 6 of the player's 8 picks reached the QFs → 6 × 3 = **18**.
- Top-4 derived [ARG, FRA, NED, POR]; actual [ARG, NED, FRA, BRA] → tier: 1 position right (ARG) = 5;
  consolation: ARG, FRA, NED are in the real top 4 = 3 × 2 = 6. Not added → `max(5, 6)` = **6**.
- Final predicted ARG–FRA 3–2; actual ARG–FRA 3–2 → both teams (10) + exact (5) = **15**.
- Top scorer FRA-9 correct → **15**; final decided by penalties, predicted "yes", correct → **10**.

---

## 8. Pools (social groups)

Pools are private leaderboard cohorts. Any authenticated user can create them.

### 8.1 Creating

- A user creates a pool with a name → becomes its **owner**.
- Creation generates an **invite token** and a shareable **invite link**
  (`/join/<token>`).

### 8.2 Joining

- Anyone with the link who is signed in can join → becomes a **member**.
- **One membership per user per pool** (DB unique constraint). Clicking the link again when
  already a member is a no-op (shows "you're already in").
- Joining creates an **empty prediction card scoped to that pool**, which the member then fills in.
  A user in several pools maintains a separate card in each (they may differ).

### 8.3 Managing

- The **owner can kick** any member. A kicked user is removed from the leaderboard and **cannot
  silently rejoin** with the old link — see token rules below.
- The owner can **rotate** the invite token (invalidating old links) and **delete** the pool.
- The owner cannot be kicked; deleting the pool is the way to wind it down.
  (Optional: owner may transfer ownership — *deferred to future*.)

#### Owner edits to member cards

- The owner can **open and edit any member's prediction card** in their pool — every field a member
  could set (group scores, knockout winner picks, final/bronze scores, special bets) — to fix typos
  or mis-entries (e.g. correct a top-scorer pick).
- Edits are allowed **at any time, including after lock** (the owner override of §6.5). Editing scores
  re-derives that member's bracket and re-scores their card immediately.
- **Every edit is audited.** The system records editor, member, field/path, old value, new value, and
  timestamp (optional reason text). The audit trail is **visible to all members of the pool**, so any
  change is transparent to everyone.
- The owner may also edit **their own card** at any time (including after lock) — same audit rules
  apply, keeping it transparent.
- An owner edit affects **only that member's card in this pool** — predictions are not shared, so other
  pools are untouched.
- Scope guard: an owner can edit cards **only in pools they own**, and only for current members
  (not kicked users).

### 8.4 Invite tokens

- Tokens are **per-pool**, random, and stored hashed.
- Tokens may be **rotated** by the owner (old link stops working).
- Tokens may carry an optional **expiry**.
- A **kicked** user is recorded; re-joining requires a fresh invite action by the owner
  (re-add), so a leaked old link can't be used to come back.

### 8.5 Leaderboard

- Each pool shows a leaderboard: members ranked by their score **for that pool's card** (desc).
  Because all cards lock simultaneously at `firstKickoff`, equal scores are broken by a stable
  display-only key (display name, alphabetical).
- A member can open another member's card **only after lock time** (no peeking before lock). The
  **owner** can view (and edit, §8.3) any member's card at any time, since they manage the pool.

---

## 9. Anti-abuse & rate limiting

Goal: prevent mass account/pool creation and repeated-join abuse without heavy friction.
(Chosen approach: **practical limits + rate limiting**.)

| Control | Rule |
|---|---|
| Identity | Magic-link = one account per verified email. |
| Duplicate joins | Unique `(pool_id, user_id)` membership — rejoining does nothing. |
| Pool creation cap | Max **5** pools created per user (configurable). |
| Pool size cap | Max **100** members per pool (configurable). |
| Rate limit: create pool | e.g. ≤ 3 / hour per user. |
| Rate limit: join | e.g. ≤ 10 / hour per user and per IP. |
| Rate limit: magic-link request | e.g. ≤ 5 / hour per email + per IP (also mitigates email-bombing). |
| Token safety | Invite tokens stored hashed, rotatable, optionally expiring. |
| Kicked users | Tracked; cannot rejoin via old link without owner re-invite. |

Rate limiting is enforced server-side (per-user where authenticated, per-IP for pre-auth
endpoints like magic-link requests). Limits are configuration constants, tunable without code
changes to business logic.

---

## 10. Data model (PostgreSQL)

Indicative schema; column types abbreviated.

- **users** (auth) — `id`, `email`, `display_name`
- **tournaments** — `id`, `name`, `first_kickoff`, `scoring_config` (jsonb), `status`
- **teams** — `id`, `tournament_id`, `name`
- **players** — `tournament_id`, `player_id`, `name`, `team_id` (for player bets: top scorer, first
  red card, decisive final goal)
- **stage_groups** — `id` (e.g. "A"), `tournament_id`
- **stage_group_teams** — `group_id`, `team_id`, `seed_order`
- **matches** — `id`, `tournament_id`, `stage` (group|R32|R16|QF|SF|Final|bronze), `group_id?`,
  `home_team_id?`, `away_team_id?`, `kickoff`, `home_goals?`, `away_goals?`, `winner_team_id?`,
  `decided_by?` (regulation|extraTime|penalties), `status`
- **actual_group_order** — `tournament_id`, `group_id`, `position` (1–4), `team_id` (derived from
  results, or overridden per §4.2)
- **actual_answers** — `tournament_id`, `bet_key`, `value` (jsonb) — actual results of the discrete
  bets (Round-of-8 set, top-4 order, special bets); some derivable from `matches`
- **predictions** — `id`, `pool_id`, `user_id`, `tournament_id`, `locked_at?`,
  unique `(pool_id, user_id)` *(one card per user per pool — not shared across pools)*
- **prediction_group_scores** — `prediction_id`, `match_id`, `home_goals`, `away_goals`
  *(group order is derived from these, not stored as input)*
- **prediction_knockout_picks** — `prediction_id`, `bracket_match_key`, `winner_team_id`
  (covers every tie including the bronze match)
- **prediction_finish_scores** — `prediction_id`, `match` (final|bronze), `home_goals`, `away_goals`
- **prediction_specials** — `prediction_id`, `bet_key`, `value` (jsonb) — one row per special bet
  (team id / player id / number / bool)
- **prediction_edits** — `id`, `prediction_id`, `editor_user_id`, `field_path`, `old_value` (jsonb),
  `new_value` (jsonb), `reason?`, `source` (manual|import), `edited_at` — audit trail of owner edits
  (§8.3); an owner **import** (§6.6) logs the changed fields here with `source = import`
- **scores** — `pool_id`, `user_id`, `points_total`, `breakdown` (jsonb), `updated_at`,
  unique `(pool_id, user_id)` *(`breakdown` records derived artifacts — Round-of-8, top-4 — and
  per-category points; scored per pool since cards differ)*
- **pools** — `id`, `tournament_id`, `owner_id`, `name`, `invite_token_hash`, `token_expires_at?`,
  `created_at`
- **pool_members** — `pool_id`, `user_id`, `joined_at`, unique `(pool_id, user_id)`
- **pool_kicks** — `pool_id`, `user_id`, `kicked_at` (blocks silent rejoin)
- **rate_limits** — keyed counters in Postgres (`key`, `window_start`, `count`); a single
  mechanism (DB-backed counters in a server action / middleware) to stay within free tier

Authorization (enforced server-side in a single TypeScript service layer — see technical spec §6, not
database RLS): a member reads/writes **their own card in a pool** (writes blocked after lock); a pool
**owner** may read/write **every card in pools they own** at any time (the only post-lock writer), with
each write recorded in `prediction_edits`. The `prediction_edits` audit rows are **readable by all
members** of the pool. Pool membership governs leaderboard visibility; other members' cards are visible
only after lock.

---

## 11. Results sync & re-scoring (the "no admin" workflow)

1. A maintainer edits `/data/tournaments/<id>/results.json` (and `tournament.json` for setup),
   commits, and pushes.
2. A **sync script** (`npm run sync -- <tournamentId>`) — runnable locally or as a deploy step /
   GitHub Action — upserts tournament definition + results into the DB.
3. After upsert, the script (or a DB function) **recomputes scores** for every card in that
   tournament and updates `scores` + pool leaderboards.
4. The site reads from the DB; users see updated points on next load.

An **owner edit** to a member's card (§8.3) re-scores just that one card on the spot, using the same
deterministic engine — no full sync needed.

This keeps all authoritative data in version control while serving from a fast DB, with **no admin
UI** required.

---

## 12. Pages & flows

| Route | Purpose |
|---|---|
| `/` | Landing; sign in (magic link); if signed in → dashboard. |
| `/auth/callback` | Magic-link callback. |
| `/pools` | List pools the user owns/belongs to; create pool. |
| `/pools/[id]` | Pool leaderboard + manage (owner: kick, rotate token, delete). |
| `/pools/[id]/predict` | Make/edit **your card for this pool** (group scores → derived bracket & knockout winner picks → final/bronze scores → special bets). **Export / import** your card as JSON (§6.6). Read-only to the member after lock. |
| `/pools/[id]/members/[memberId]` | View a member's card (members: only after lock). **Owner:** view, edit, and **import** into the card at any time, with audit (§8.3, §6.6). |
| `/join/[token]` | Join a pool via invite link (creates an empty card for that pool). |
| `/settings` | Edit display name. |

**Primary flow:** sign in → join or create a pool → fill in that pool's card → share link → (lock) →
results sync in → watch leaderboard. Owners can correct a member's card from the member view at any time.

---

## 13. Non-functional requirements

- **Authoritative time:** lock enforcement and rate limits use server time, never the client clock.
  Lock blocks *member* writes only; pool-owner edits bypass it and are always written to the audit log.
- **Auditability:** every owner edit (to any card, including the owner's own) is recorded immutably
  (who/when/old→new) and is visible to **all members of the pool**.
- **Idempotent sync & scoring:** re-running sync/scoring produces the same result; safe to re-run.
- **Determinism:** third-place ranking, bracket building, and all derived artifacts (Round-of-8, top-4) are fully deterministic for identical inputs.
- **Privacy:** emails never shown publicly; other players' predictions hidden until lock.
- **Free-tier friendly:** stays within Vercel + managed-Postgres free limits for a hobby-scale audience.
- **Mobile-first responsive** layout.

---

## 14. Open questions / future

- **Ownership transfer** for pools (deferred).
- **Shootout/extra-time handling** — knockout results carry `decided_by`; `finalDecidedByPenalties` and
  `decisiveGoalPlayer` are read from the final fixture. Confirm data-entry convention.
- **Multiple concurrent tournaments** — schema supports it; UI assumes one active tournament in v1.
- **Tiebreak on the pool leaderboard** when points are equal — display-only ordering; confirm rule.
- **Exact WC 2026 third-placed slot table** — fill `bracket.slots` once the official schedule is published.

---

*End of functional specification — v1 draft.*
