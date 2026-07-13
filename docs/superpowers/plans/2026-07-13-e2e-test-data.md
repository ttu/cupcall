# E2E Test Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the live `wc-2026` sync in `apps/web/e2e/global-setup.ts` with two static, date-independent tournament fixtures, and add a seeded 10-member pool with realistic, varied predictions so new e2e specs can cover the leaderboard, results/points-race, and late-joiner UI.

**Architecture:** Two static data fixtures under `data/tournaments/` (`e2e-open`: never locks; `e2e-seeded`: permanently locked, fully resolved through a champion). A pure, seeded-PRNG prediction generator (informed by real production prediction-variety stats) produces group scores/bracket picks/specials for synthetic pool members. A new `scripts/seed-e2e.ts` CLI script wires fixtures + generator into the DB; `global-setup.ts` calls it instead of `pnpm sync -- wc-2026`.

**Tech Stack:** TypeScript strict, Vitest (unit test for the generator), Playwright (new specs), tsx (script runner), Zod (`@cup/schemas`), Drizzle via `@cup/db`, pure functions from `@cup/engine` (`deriveGroupOrders`, `selectQualifiers`, `resolveSlot`).

## Global Constraints

- TypeScript strict: no `any`, no unsafe casts. Use the branded constructors (`teamId`, `bracketMatchKey`, `tournamentId`, etc.) from `@cup/engine`, never `as Foo`.
- Only import from a package's public barrel (`@cup/engine`'s `index.ts`, `@cup/db`'s `index.ts`) — never deep-import an internal file.
- E2E selectors use `data-testid` (or `aria-label`/`getByRole` for real inputs) — never text content or CSS structure, per `CLAUDE.md`.
- Format + lint + typecheck must pass after every task: `pnpm format:check && pnpm lint && pnpm typecheck`.
- Commit after each task (Conventional Commits). The branch gets squashed into a single commit when finished (see `docs/PROGRESS.md` workflow) — per-task commits here are checkpoints, not the final history.
- The design doc (`docs/superpowers/specs/2026-07-13-e2e-test-data-design.md`) is already written; it is committed together with the first task's implementation, not separately (per `CLAUDE.md`: don't commit specs alone).

---

### Task 1: `e2e-open` fixture — never-locking tournament with no results

**Files:**

- Create: `data/tournaments/e2e-open/tournament.json`
- Create: `data/tournaments/e2e-open/results.json`

**Interfaces:**

- Consumes: `data/tournaments/wc-2026/tournament.json` (source to copy from) — real file, already in the repo, 48 teams / 12 groups / 72 group matches / 151 players / full R32 bracket.
- Produces: a tournament fixture directory that `scripts/sync.ts`'s `syncTournament(db, 'e2e-open', dataDir)` can load. `firstKickoff: '2099-01-01T00:00:00Z'` means `now < firstKickoff` is true forever, so `PredictionStatus` is always `'editable'` (see `apps/web/src/features/predictions/application/get-card.ts:150-151`) — this is what keeps `guest-full-prediction.spec.ts` and `bracket-picks.spec.ts` passing regardless of real-world date.

- [ ] **Step 1: Generate the fixture files**

Run from the repo root:

```bash
python3 - <<'EOF'
import json, copy

with open('data/tournaments/wc-2026/tournament.json') as f:
    base = json.load(f)

t = copy.deepcopy(base)
t['id'] = 'e2e-open'
t['name'] = 'E2E Open'
t['firstKickoff'] = '2099-01-01T00:00:00Z'

with open('data/tournaments/e2e-open/tournament.json', 'w') as f:
    json.dump(t, f, indent=2)
    f.write('\n')

results = {
    "tournamentId": "e2e-open",
    "matchResults": [],
    "groupOrder": {},
    "answers": {},
}
with open('data/tournaments/e2e-open/results.json', 'w') as f:
    json.dump(results, f, indent=2)
    f.write('\n')

print('wrote e2e-open fixture files')
EOF
```

- [ ] **Step 2: Verify the files parse against the app's own schemas**

```bash
TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx -e "
import { readFileSync } from 'node:fs';
import { tournamentSchema, resultsSchema } from '@cup/schemas';
const t = JSON.parse(readFileSync('data/tournaments/e2e-open/tournament.json', 'utf-8'));
const r = JSON.parse(readFileSync('data/tournaments/e2e-open/results.json', 'utf-8'));
tournamentSchema.parse(t);
resultsSchema.parse(r);
console.log('e2e-open: both files parse OK');
"
```

Expected: `e2e-open: both files parse OK`, no Zod errors.

- [ ] **Step 3: Commit**

```bash
git add data/tournaments/e2e-open docs/superpowers/specs/2026-07-13-e2e-test-data-design.md docs/superpowers/plans/2026-07-13-e2e-test-data.md
git commit -m "feat(e2e): add never-locking e2e-open tournament fixture"
```

---

### Task 2: `e2e-seeded` fixture — permanently-locked, fully-resolved tournament

**Files:**

- Create: `data/tournaments/e2e-seeded/tournament.json`
- Create: `data/tournaments/e2e-seeded/results.json`

**Interfaces:**

- Consumes: `data/tournaments/wc-2026/tournament.json` and `data/tournaments/wc-2026/results.json` (real data: group stage + R32/R16/QF already resolved, QF winners FRA, ESP, ENG, ARG per `bracket.progression` in `tournament.json` — `sf101` feeds from `[qf97, qf98]` i.e. FRA vs ESP, `sf102` feeds from `[qf99, qf100]` i.e. ENG vs ARG).
- Produces: a fixture where `firstKickoff: '2000-01-01T00:00:00Z'` (permanently in the past — status is `'locked'` or `'partial'` depending on `joinedAt`, never `'editable'`, per `get-card.ts:150-151`), and `results.json` extends the real data with synthesized `SF`/`Final`/`bronze` knockout entries plus a fully-resolved `answers` block — except `firstRedCardPlayer`, which is deliberately left unset (a real, legitimate "no red card shown" state) so late joiners have exactly one editable item.

- [ ] **Step 1: Generate the fixture files**

```bash
python3 - <<'EOF'
import json, copy

with open('data/tournaments/wc-2026/tournament.json') as f:
    base_t = json.load(f)

t = copy.deepcopy(base_t)
t['id'] = 'e2e-seeded'
t['name'] = 'E2E Seeded'
t['firstKickoff'] = '2000-01-01T00:00:00Z'
with open('data/tournaments/e2e-seeded/tournament.json', 'w') as f:
    json.dump(t, f, indent=2)
    f.write('\n')

with open('data/tournaments/wc-2026/results.json') as f:
    base_r = json.load(f)

r = copy.deepcopy(base_r)
r['tournamentId'] = 'e2e-seeded'
r.pop('_test', None)

# Real QF winners (FRA, ESP, ENG, ARG) carried forward to a synthesized champion.
# sf101 <- [qf97 (FRA), qf98 (ESP)]; sf102 <- [qf99 (ENG), qf100 (ARG)] per tournament.json's
# bracket.progression. Bronze is contested by the two SF losers (ESP, ENG).
r['knockout'].extend([
    {"round": "SF", "matchId": "sf101", "home": "FRA", "away": "ESP",
     "homeGoals": 2, "awayGoals": 1, "winner": "FRA", "decidedBy": "regulation",
     "kickoff": "2026-07-15T20:00:00Z"},
    {"round": "SF", "matchId": "sf102", "home": "ENG", "away": "ARG",
     "homeGoals": 1, "awayGoals": 2, "winner": "ARG", "decidedBy": "regulation",
     "kickoff": "2026-07-15T23:00:00Z"},
    {"round": "Final", "matchId": "final", "home": "FRA", "away": "ARG",
     "homeGoals": 0, "awayGoals": 1, "winner": "ARG", "decidedBy": "regulation",
     "kickoff": "2026-07-19T19:00:00Z"},
    {"round": "bronze", "matchId": "bronze", "home": "ESP", "away": "ENG",
     "homeGoals": 2, "awayGoals": 1, "winner": "ESP", "decidedBy": "regulation",
     "kickoff": "2026-07-18T16:00:00Z"},
])

# Deliberately leave firstRedCardPlayer unanswered (the one open item for late joiners).
r['answers'].pop('firstRedCardPlayer', None)
r['answers'].update({
    "tournamentTopScoringTeam": "ESP",
    "tournamentTopConcedingTeam": "CUW",
    "highestMatchGoals": 8,           # true max in this dataset (group match mE1, GER 7-1 CIV)
    "mostYellowCardsTeam": "ARG",
    "penaltyShootoutCount": 4,        # matches the 4 real R32/R16 matches decided by penalties
    "finalDecidedByPenalties": False,
    "finalDecisiveGoalPlayer": "arg-messi",
    "topScorerPlayer": "arg-lautaro",
})

with open('data/tournaments/e2e-seeded/results.json', 'w') as f:
    json.dump(r, f, indent=2)
    f.write('\n')

print('wrote e2e-seeded fixture files')
EOF
```

- [ ] **Step 2: Verify the files parse and are internally consistent**

```bash
TSX_TSCONFIG_PATH=scripts/tsconfig.json npx tsx -e "
import { readFileSync } from 'node:fs';
import { tournamentSchema, resultsSchema, knockoutResultsSchema } from '@cup/schemas';
const t = JSON.parse(readFileSync('data/tournaments/e2e-seeded/tournament.json', 'utf-8'));
const r = JSON.parse(readFileSync('data/tournaments/e2e-seeded/results.json', 'utf-8'));
tournamentSchema.parse(t);
resultsSchema.parse(r);
const ko = knockoutResultsSchema.parse(r);
if ((ko.knockout ?? []).length !== 32) throw new Error('expected 32 knockout entries (16 R32 + 8 R16 + 4 QF + 2 SF + Final + bronze), got ' + (ko.knockout ?? []).length);
if (r.answers.firstRedCardPlayer !== undefined) throw new Error('firstRedCardPlayer must be unset');
console.log('e2e-seeded: parses OK, 32 knockout entries, firstRedCardPlayer unset');
"
```

Expected: `e2e-seeded: parses OK, 32 knockout entries, firstRedCardPlayer unset`.

- [ ] **Step 3: Commit**

```bash
git add data/tournaments/e2e-seeded
git commit -m "feat(e2e): add permanently-locked e2e-seeded tournament fixture"
```

---

### Task 3: Prediction-variety generator (pure functions, TDD)

Informed by real production prediction data (11 predictions, 1 pool, queried read-only): group scorelines cluster around realistic low-scoring results (2-0, 1-1, 2-1 most common); knockout picks concentrate on a favorite but are never unanimous (~75/25 splits); specials cluster on a few popular teams/players with a long tail; `finalDecidedByPenalties` splits ~70/30 false/true.

**Files:**

- Create: `scripts/e2e-seed/prediction-variety.ts`
- Create: `scripts/e2e-seed/prediction-variety.test.ts`

**Interfaces:**

- Consumes: `Tournament`, `GroupScore`, `TeamId`, `PlayerId`, `BracketMatchKey` types and `deriveGroupOrders`, `selectQualifiers`, `resolveSlot`, `teamId` from `@cup/engine` (all confirmed exported via `packages/engine/src/index.ts`); `miniTournament` from `@cup/engine/testing` (test only — a fully-typed `Tournament` fixture with 16 teams/4 groups/QF-SF-Final bracket and real `fifaRanking` values, aliased in `vitest.config.ts`, already used across the engine package's own tests).
- Produces (consumed by Task 4's `scripts/seed-e2e.ts`):
  - `type Rng = () => number`
  - `mulberry32(seed: number): Rng`
  - `generateGroupScores(rng: Rng, groupMatches: ReadonlyArray<{ id: MatchId }>): Array<{ matchId: MatchId; home: number; away: number }>`
  - `interface BracketPick { bracketMatchKey: BracketMatchKey; home: TeamId; away: TeamId; winner: TeamId }`
  - `generateBracketPicks(rng: Rng, tournament: Tournament, groupScores: GroupScore[]): BracketPick[]`
  - `generateFinishScore(rng: Rng, pick: BracketPick): { home: number; away: number }`
  - `generateSpecials(rng: Rng, tournament: Tournament): Record<string, string | number | boolean>` (all 11 keys from `SPECIAL_BET_KINDS`)
  - `pickWinnerBiased(rng: Rng, teams: ReadonlyArray<{ id: TeamId; fifaRanking?: number }>, home: TeamId, away: TeamId): TeamId` (exported for direct unit testing of the favorite-bias behavior)

- [ ] **Step 1: Write the failing tests**

Create `scripts/e2e-seed/prediction-variety.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { miniTournament } from '@cup/engine/testing';
import { teamId, bracketMatchKey } from '@cup/engine';
import {
  mulberry32,
  generateGroupScores,
  generateBracketPicks,
  generateFinishScore,
  generateSpecials,
  pickWinnerBiased,
} from './prediction-variety';

describe('prediction-variety generator', () => {
  const tournament = miniTournament;

  it('mulberry32 is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });

  it('generateGroupScores returns one entry per match with non-negative goals', () => {
    const rng = mulberry32(1);
    const scores = generateGroupScores(rng, tournament.groupMatches);
    expect(scores).toHaveLength(tournament.groupMatches.length);
    for (const s of scores) {
      expect(s.home).toBeGreaterThanOrEqual(0);
      expect(s.away).toBeGreaterThanOrEqual(0);
    }
  });

  it('generateGroupScores is deterministic for the same seed', () => {
    const a = generateGroupScores(mulberry32(7), tournament.groupMatches);
    const b = generateGroupScores(mulberry32(7), tournament.groupMatches);
    expect(a).toEqual(b);
  });

  it("generateBracketPicks: every winner is one of that match's two participants", () => {
    const rng = mulberry32(3);
    const groupScores = generateGroupScores(rng, tournament.groupMatches);
    const picks = generateBracketPicks(rng, tournament, groupScores);
    for (const p of picks) {
      expect([p.home, p.away]).toContain(p.winner);
    }
  });

  it('generateBracketPicks covers every bracket match exactly once', () => {
    const rng = mulberry32(9);
    const groupScores = generateGroupScores(rng, tournament.groupMatches);
    const picks = generateBracketPicks(rng, tournament, groupScores);
    const keys = picks.map((p) => p.bracketMatchKey);
    const expectedCount = tournament.bracket.slots.length + tournament.bracket.progression.length;
    expect(keys).toHaveLength(expectedCount);
    expect(new Set(keys).size).toBe(expectedCount);
  });

  it('pickWinnerBiased favors the lower-fifaRanking team roughly 75% of the time', () => {
    const strong = teamId('STR');
    const weak = teamId('WEAK');
    const teams = [
      { id: strong, fifaRanking: 1 },
      { id: weak, fifaRanking: 50 },
    ];
    const rng = mulberry32(123);
    let strongWins = 0;
    const trials = 400;
    for (let i = 0; i < trials; i++) {
      if (pickWinnerBiased(rng, teams, strong, weak) === strong) strongWins++;
    }
    const ratio = strongWins / trials;
    expect(ratio).toBeGreaterThan(0.65);
    expect(ratio).toBeLessThan(0.85);
  });

  it('pickWinnerBiased is a 50/50 coin flip when fifaRanking is missing', () => {
    const a = teamId('A');
    const b = teamId('B');
    const teams = [{ id: a }, { id: b }];
    const rng = mulberry32(55);
    let aWins = 0;
    const trials = 400;
    for (let i = 0; i < trials; i++) {
      if (pickWinnerBiased(rng, teams, a, b) === a) aWins++;
    }
    const ratio = aWins / trials;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });

  it('generateFinishScore always gives the winner strictly more goals', () => {
    const rng = mulberry32(11);
    const pick = {
      bracketMatchKey: bracketMatchKey('final'),
      home: teamId('A1'),
      away: teamId('B1'),
      winner: teamId('A1'),
    };
    for (let i = 0; i < 20; i++) {
      const score = generateFinishScore(rng, pick);
      expect(score.home).toBeGreaterThan(score.away);
    }
  });

  it('generateSpecials returns all 11 bet keys with in-roster values', () => {
    const rng = mulberry32(5);
    const specials = generateSpecials(rng, tournament);
    const expectedKeys = [
      'topScorerPlayer',
      'finalDecisiveGoalPlayer',
      'firstRedCardPlayer',
      'mostYellowCardsTeam',
      'groupTopScoringTeam',
      'groupTopConcedingTeam',
      'tournamentTopScoringTeam',
      'tournamentTopConcedingTeam',
      'highestMatchGoals',
      'penaltyShootoutCount',
      'finalDecidedByPenalties',
    ];
    expect(Object.keys(specials).sort()).toEqual([...expectedKeys].sort());

    const teamIds = new Set(tournament.teams.map((t) => t.id as string));
    const playerIds = new Set(tournament.players.map((p) => p.id as string));
    expect(playerIds.has(specials['topScorerPlayer'] as string)).toBe(true);
    expect(playerIds.has(specials['firstRedCardPlayer'] as string)).toBe(true);
    expect(teamIds.has(specials['mostYellowCardsTeam'] as string)).toBe(true);
    expect(typeof specials['highestMatchGoals']).toBe('number');
    expect(typeof specials['finalDecidedByPenalties']).toBe('boolean');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run scripts/e2e-seed/prediction-variety.test.ts
```

Expected: FAIL — `Cannot find module './prediction-variety'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `scripts/e2e-seed/prediction-variety.ts`:

```ts
import { deriveGroupOrders, selectQualifiers, resolveSlot } from '@cup/engine';
import type {
  Tournament,
  GroupScore,
  TeamId,
  PlayerId,
  BracketMatchKey,
  MatchId,
} from '@cup/engine';

export type Rng = () => number;

/** Deterministic PRNG (mulberry32) — same seed always produces the same sequence. */
export function mulberry32(seed: number): Rng {
  let a = seed;
  return function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedChoice<T>(rng: Rng, items: ReadonlyArray<readonly [T, number]>): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0);
  let r = rng() * total;
  for (const [item, w] of items) {
    if (r < w) return item;
    r -= w;
  }
  return items[items.length - 1]![0];
}

// Weighted scoreline table built from real production group-score prediction frequencies
// (11 predictions, 1 pool, queried read-only — see docs/superpowers/specs/2026-07-13-e2e-test-data-design.md).
const GROUP_SCORELINE_WEIGHTS: ReadonlyArray<readonly [{ home: number; away: number }, number]> = [
  [{ home: 2, away: 0 }, 116],
  [{ home: 2, away: 1 }, 92],
  [{ home: 1, away: 1 }, 91],
  [{ home: 0, away: 2 }, 74],
  [{ home: 1, away: 2 }, 66],
  [{ home: 3, away: 0 }, 56],
  [{ home: 0, away: 1 }, 47],
  [{ home: 1, away: 0 }, 40],
  [{ home: 0, away: 3 }, 38],
  [{ home: 3, away: 1 }, 37],
  [{ home: 2, away: 2 }, 31],
  [{ home: 4, away: 0 }, 27],
  [{ home: 1, away: 3 }, 24],
  [{ home: 0, away: 0 }, 16],
  [{ home: 5, away: 0 }, 7],
  [{ home: 4, away: 1 }, 6],
  [{ home: 0, away: 4 }, 5],
  [{ home: 0, away: 5 }, 4],
  [{ home: 6, away: 0 }, 3],
  [{ home: 2, away: 4 }, 2],
];

export function generateGroupScores(
  rng: Rng,
  groupMatches: ReadonlyArray<{ id: MatchId }>,
): Array<{ matchId: MatchId; home: number; away: number }> {
  return groupMatches.map((m) => {
    const { home, away } = weightedChoice(rng, GROUP_SCORELINE_WEIGHTS);
    return { matchId: m.id, home, away };
  });
}

/**
 * Picks between `home`/`away`, favoring whichever team has the lower `fifaRanking` (stronger)
 * about 75% of the time — matching the ~75/25 favorite/upset split seen in real bracket picks.
 * Falls back to a 50/50 coin flip when either team's ranking is unknown.
 */
export function pickWinnerBiased(
  rng: Rng,
  teams: ReadonlyArray<{ id: TeamId; fifaRanking?: number }>,
  home: TeamId,
  away: TeamId,
): TeamId {
  const byId = new Map(teams.map((t) => [t.id, t.fifaRanking]));
  const homeRank = byId.get(home);
  const awayRank = byId.get(away);
  if (homeRank === undefined || awayRank === undefined || homeRank === awayRank) {
    return rng() < 0.5 ? home : away;
  }
  const favorite = homeRank < awayRank ? home : away;
  const underdog = favorite === home ? away : home;
  return rng() < 0.75 ? favorite : underdog;
}

export interface BracketPick {
  bracketMatchKey: BracketMatchKey;
  home: TeamId;
  away: TeamId;
  winner: TeamId;
}

/**
 * Walks the bracket the same way `packages/engine/src/bracket.ts`'s `buildBracket` does
 * (entry-round slots, then progression in declaration order, bronze from SF losers), but always
 * produces a full, internally-consistent set of picks — one winner per match, immediately.
 */
export function generateBracketPicks(
  rng: Rng,
  tournament: Tournament,
  groupScores: GroupScore[],
): BracketPick[] {
  const groupOrders = deriveGroupOrders(tournament, groupScores);
  const qualifiers = selectQualifiers(tournament, groupScores, groupOrders);
  const autoCount = tournament.groups.length * tournament.qualification.autoQualifyPerGroup;
  const rankedThirds = qualifiers.slice(autoCount);

  const participants = new Map<BracketMatchKey, [TeamId, TeamId]>();
  const winners = new Map<BracketMatchKey, TeamId>();
  const picks: BracketPick[] = [];

  const decide = (home: TeamId, away: TeamId): TeamId =>
    pickWinnerBiased(rng, tournament.teams, home, away);

  for (const slot of tournament.bracket.slots) {
    const home = resolveSlot(slot.home, groupOrders, rankedThirds);
    const away = resolveSlot(slot.away, groupOrders, rankedThirds);
    participants.set(slot.match, [home, away]);
    const winner = decide(home, away);
    winners.set(slot.match, winner);
    picks.push({ bracketMatchKey: slot.match, home, away, winner });
  }

  for (const prog of tournament.bracket.progression) {
    if (prog.match === tournament.bracket.bronzeMatch) continue;
    const [fromA, fromB] = prog.from;
    const home = winners.get(fromA!)!;
    const away = winners.get(fromB!)!;
    participants.set(prog.match, [home, away]);
    const winner = decide(home, away);
    winners.set(prog.match, winner);
    picks.push({ bracketMatchKey: prog.match, home, away, winner });
  }

  const bronzeProg = tournament.bracket.progression.find(
    (p) => p.match === tournament.bracket.bronzeMatch,
  );
  if (bronzeProg) {
    const losers = bronzeProg.from.map((sfKey) => {
      const [home, away] = participants.get(sfKey)!;
      const winner = winners.get(sfKey)!;
      return winner === home ? away : home;
    });
    const [home, away] = [losers[0]!, losers[1]!];
    const winner = decide(home, away);
    picks.push({ bracketMatchKey: tournament.bracket.bronzeMatch, home, away, winner });
  }

  return picks;
}

/** Winner strictly outscores the loser by 1-3 goals — no draws in a decisive knockout match. */
export function generateFinishScore(rng: Rng, pick: BracketPick): { home: number; away: number } {
  const winnerGoals = 1 + Math.floor(rng() * 3);
  const loserGoals = Math.floor(rng() * winnerGoals);
  return pick.winner === pick.home
    ? { home: winnerGoals, away: loserGoals }
    : { home: loserGoals, away: winnerGoals };
}

const HIGHEST_MATCH_GOALS_WEIGHTS: ReadonlyArray<readonly [number, number]> = [
  [4, 1],
  [5, 3],
  [6, 5],
  [7, 1],
  [8, 1],
];

const PENALTY_SHOOTOUT_COUNT_WEIGHTS: ReadonlyArray<readonly [number, number]> = [
  [2, 1],
  [3, 1],
  [4, 3],
  [5, 3],
  [6, 1],
  [7, 1],
  [8, 1],
];

function pickTeamBet(rng: Rng, tournament: Tournament): TeamId {
  const ranked = [...tournament.teams].sort(
    (a, b) => (a.fifaRanking ?? 999) - (b.fifaRanking ?? 999),
  );
  const topTeams = ranked.slice(0, 8);
  const pool = rng() < 0.7 ? topTeams : tournament.teams;
  return pool[Math.floor(rng() * pool.length)]!.id;
}

function pickPlayerBet(rng: Rng, tournament: Tournament): PlayerId {
  const ranked = [...tournament.teams].sort(
    (a, b) => (a.fifaRanking ?? 999) - (b.fifaRanking ?? 999),
  );
  const topTeamIds = new Set(ranked.slice(0, 8).map((t) => t.id));
  const topPlayers = tournament.players.filter((p) => topTeamIds.has(p.team));
  const pool = rng() < 0.7 && topPlayers.length > 0 ? topPlayers : tournament.players;
  return pool[Math.floor(rng() * pool.length)]!.id;
}

/** All 11 special-bet keys (see `SPECIAL_BET_KINDS` in `@cup/engine`), weighted toward realistic answers. */
export function generateSpecials(
  rng: Rng,
  tournament: Tournament,
): Record<string, string | number | boolean> {
  return {
    topScorerPlayer: pickPlayerBet(rng, tournament),
    finalDecisiveGoalPlayer: pickPlayerBet(rng, tournament),
    firstRedCardPlayer: pickPlayerBet(rng, tournament),
    mostYellowCardsTeam: pickTeamBet(rng, tournament),
    groupTopScoringTeam: pickTeamBet(rng, tournament),
    groupTopConcedingTeam: pickTeamBet(rng, tournament),
    tournamentTopScoringTeam: pickTeamBet(rng, tournament),
    tournamentTopConcedingTeam: pickTeamBet(rng, tournament),
    highestMatchGoals: weightedChoice(rng, HIGHEST_MATCH_GOALS_WEIGHTS),
    penaltyShootoutCount: weightedChoice(rng, PENALTY_SHOOTOUT_COUNT_WEIGHTS),
    finalDecidedByPenalties: rng() < 0.3,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run scripts/e2e-seed/prediction-variety.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/e2e-seed
git commit -m "feat(e2e): add production-informed prediction-variety generator"
```

---

### Task 4: `scripts/seed-e2e.ts` — seed both fixtures + the 10-member pool

**Files:**

- Create: `scripts/seed-e2e.ts`
- Modify: `package.json` (add `seed:e2e` script)
- Modify: `.gitignore` (ignore the generated fixture-id manifest the specs will read)

**Interfaces:**

- Consumes: `syncTournament` from `./sync` (`(db, tournamentId: string, dataDir: string) => Promise<{scored:number}>`); `createGuestUser`, `upsertLoginToken`, `createPool`, `addMember`, `getOrCreatePrediction`, `upsertGroupScore`, `upsertKnockoutPick`, `upsertFinishScore`, `upsertSpecialBet` from `@cup/db`; `tournamentId as asTournamentId` from `@cup/engine`; `tournamentSchema` from `@cup/schemas`; everything exported by Task 3's `./e2e-seed/prediction-variety`.
- Produces: two dev-login tokens (`e2e-seeded-owner`, `e2e-seeded-late-joiner`) and a manifest file `apps/web/e2e/.e2e-fixture-ids.json` (`{ "seededPoolId": string }`) that Tasks 9-11's specs read to navigate directly to the seeded pool without depending on any pool-listing UI.

- [ ] **Step 1: Add the `seed:e2e` package.json script**

In `package.json`, add this line next to the existing `"seed"` entries (after `"seed:fresh:current"`):

```json
    "seed:e2e": "TSX_TSCONFIG_PATH=scripts/tsconfig.json tsx scripts/seed-e2e.ts",
```

- [ ] **Step 2: Ignore the generated fixture-id manifest**

In `.gitignore`, add:

```
apps/web/e2e/.e2e-fixture-ids.json
```

- [ ] **Step 3: Write `scripts/seed-e2e.ts`**

```ts
/**
 * scripts/seed-e2e.ts — seeds the two static e2e fixtures (e2e-open, e2e-seeded) plus a
 * 10-member pool with varied predictions under e2e-seeded, for Playwright's global-setup.
 *
 * Usage: pnpm seed:e2e
 */
import { join } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import pino from 'pino';
import { createDb } from '@cup/db';
import * as schema from '@cup/db/schema';
import {
  createGuestUser,
  upsertLoginToken,
  createPool,
  addMember,
  getOrCreatePrediction,
  upsertGroupScore,
  upsertKnockoutPick,
  upsertFinishScore,
  upsertSpecialBet,
} from '@cup/db';
import { tournamentId as asTournamentId } from '@cup/engine';
import type { Tournament } from '@cup/engine';
import { tournamentSchema } from '@cup/schemas';
import { syncTournament } from './sync';
import {
  mulberry32,
  generateGroupScores,
  generateBracketPicks,
  generateFinishScore,
  generateSpecials,
} from './e2e-seed/prediction-variety';

const OPEN_TOURNAMENT_ID = asTournamentId('e2e-open');
const SEEDED_TOURNAMENT_ID = asTournamentId('e2e-seeded');
// Literal values also hardcoded in apps/web/e2e/leaderboard.spec.ts, results.spec.ts, and
// late-joiner.spec.ts (Tasks 9-11) — not exported/imported across the scripts/apps boundary to
// avoid pulling @cup/db's createDb into the Playwright test process.
const SEEDED_OWNER_TOKEN = 'e2e-seeded-owner';
const SEEDED_LATE_JOINER_TOKEN = 'e2e-seeded-late-joiner';

const logger = pino({ name: 'seed-e2e', level: 'info' });

// Before e2e-seeded's firstKickoff (2000-01-01) — these members are NOT late joiners, so once
// the tournament is (permanently) in the past their card status is 'locked', not 'partial'.
const ON_TIME_JOINED_AT = new Date('1999-06-01T00:00:00Z');

const ON_TIME_DISPLAY_NAMES = ['Amara', 'Bilal', 'Chloe', 'Dmitri', 'Elena', 'Farid', 'Greta'];

async function seed(db: ReturnType<typeof createDb<typeof schema>>): Promise<void> {
  const cwd = process.cwd();
  const openDir = join(cwd, 'data', 'tournaments', 'e2e-open');
  const seededDir = join(cwd, 'data', 'tournaments', 'e2e-seeded');

  logger.info('syncing e2e-open (never locks — backs the fill-in-predictions specs)');
  await syncTournament(db, OPEN_TOURNAMENT_ID, openDir);

  logger.info('syncing e2e-seeded (permanently locked, resolved through champion)');
  await syncTournament(db, SEEDED_TOURNAMENT_ID, seededDir);

  const tournamentRaw: unknown = JSON.parse(
    readFileSync(join(seededDir, 'tournament.json'), 'utf-8'),
  );
  const tournament: Tournament = tournamentSchema.parse(tournamentRaw);

  // Owner doubles as the leaderboard/results viewer (canViewCards = true as pool owner).
  const owner = await createGuestUser(db, { displayName: 'Pool Owner' });
  await upsertLoginToken(db, owner.id, SEEDED_OWNER_TOKEN);

  const pool = await createPool(db, {
    tournamentId: SEEDED_TOURNAMENT_ID,
    ownerId: owner.id,
    name: 'E2E Seeded Pool',
  });
  await addMember(db, pool.id, owner.id, ON_TIME_JOINED_AT);

  const onTimeUserIds = [owner.id];
  for (const displayName of ON_TIME_DISPLAY_NAMES) {
    const user = await createGuestUser(db, { displayName });
    await addMember(db, pool.id, user.id, ON_TIME_JOINED_AT);
    onTimeUserIds.push(user.id);
  }

  for (const [index, userId] of onTimeUserIds.entries()) {
    const rng = mulberry32(index + 1);
    const prediction = await getOrCreatePrediction(db, {
      poolId: pool.id,
      userId,
      tournamentId: SEEDED_TOURNAMENT_ID,
    });

    const groupScores = generateGroupScores(rng, tournament.groupMatches);
    for (const { matchId, home, away } of groupScores) {
      await upsertGroupScore(db, prediction.id, matchId, home, away);
    }

    const picks = generateBracketPicks(rng, tournament, groupScores);
    for (const p of picks) {
      await upsertKnockoutPick(db, prediction.id, p.bracketMatchKey, p.winner);
    }

    const finalPick = picks.find((p) => p.bracketMatchKey === tournament.bracket.finalMatch)!;
    const bronzePick = picks.find((p) => p.bracketMatchKey === tournament.bracket.bronzeMatch)!;
    const finalScore = generateFinishScore(rng, finalPick);
    const bronzeScore = generateFinishScore(rng, bronzePick);
    await upsertFinishScore(db, prediction.id, 'final', finalScore.home, finalScore.away);
    await upsertFinishScore(db, prediction.id, 'bronze', bronzeScore.home, bronzeScore.away);

    const specials = generateSpecials(rng, tournament);
    for (const [key, value] of Object.entries(specials)) {
      await upsertSpecialBet(db, prediction.id, key, value);
    }
  }
  logger.info({ count: onTimeUserIds.length }, 'on-time members seeded with full predictions');

  // Late joiners: joinedAt is "now" (moments before Playwright runs), well within the 4-hour
  // late-joiner window (LATE_JOINER_WINDOW_MS in apps/web/src/shared/authz/policy.ts) — so their
  // card status is 'partial' when the specs check it. No predictions are seeded for them: since
  // e2e-seeded is fully resolved except firstRedCardPlayer, everything else would be locked
  // anyway — firstRedCardPlayer is the one item they can genuinely still fill in.
  const lateJoinedAt = new Date();
  const lateJoiner1 = await createGuestUser(db, { displayName: 'Nadia (late)' });
  await upsertLoginToken(db, lateJoiner1.id, SEEDED_LATE_JOINER_TOKEN);
  await addMember(db, pool.id, lateJoiner1.id, lateJoinedAt);

  const lateJoiner2 = await createGuestUser(db, { displayName: 'Oskar (late)' });
  await addMember(db, pool.id, lateJoiner2.id, lateJoinedAt);
  logger.info('2 late joiners added (partial-prediction status)');

  logger.info('rescoring all predictions against e2e-seeded results');
  await syncTournament(db, SEEDED_TOURNAMENT_ID, seededDir);

  const manifestPath = join(cwd, 'apps', 'web', 'e2e', '.e2e-fixture-ids.json');
  writeFileSync(manifestPath, JSON.stringify({ seededPoolId: pool.id }, null, 2) + '\n');
  logger.info({ manifestPath, poolId: pool.id }, 'wrote e2e fixture-id manifest');
}

// ---- CLI entry point (mirrors scripts/seed.ts and scripts/sync.ts) ----

const isDirectlyExecuted =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('/scripts/seed-e2e.ts') ||
    process.argv[1].endsWith('/scripts/seed-e2e.js'));

if (isDirectlyExecuted) {
  if (!process.env['DATABASE_URL']) {
    const { existsSync, readFileSync: readEnv } = await import('node:fs');
    const envPath = join(process.cwd(), 'apps', 'web', '.env.local');
    if (existsSync(envPath)) {
      for (const line of readEnv(envPath, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (key && !(key in process.env)) process.env[key] = val;
      }
    }
  }

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    process.stderr.write('DATABASE_URL is not set. Add it to apps/web/.env.local.\n');
    process.exit(1);
  }

  const db = createDb(databaseUrl, schema);
  seed(db)
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      logger.error(err, 'seed-e2e failed');
      process.exit(1);
    });
}
```

- [ ] **Step 4: Run it against the local dev DB to verify it works end-to-end**

```bash
pnpm db:reset && pnpm seed:e2e
```

Expected: exits 0; logs show `e2e-open` and `e2e-seeded` synced, "8 on-time members seeded" (owner + 7), "2 late joiners added", and a manifest path. Verify the manifest:

```bash
cat apps/web/e2e/.e2e-fixture-ids.json
```

Expected: `{ "seededPoolId": "<some uuid>" }`.

- [ ] **Step 5: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-e2e.ts package.json .gitignore
git commit -m "feat(e2e): add seed-e2e script for the two fixtures and seeded pool"
```

---

### Task 5: Wire `global-setup.ts` to the new fixtures

**Files:**

- Modify: `apps/web/e2e/global-setup.ts`

**Interfaces:**

- Consumes: the `seed:e2e` pnpm script from Task 4.
- Produces: replaces the live `wc-2026` sync entirely — no e2e spec depends on `wc-2026` after this task.

- [ ] **Step 1: Replace the sync call**

Replace the full contents of `apps/web/e2e/global-setup.ts` with:

```ts
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

// apps/web uses "type": "module" — __dirname is not available; derive it from import.meta.url
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

export default function globalSetup(): void {
  // Loads the static e2e-open/e2e-seeded fixtures (never touches the live wc-2026 data, so
  // specs stay stable regardless of the real tournament's progress) and seeds a 10-member pool
  // with varied predictions for the leaderboard/results/late-joiner specs.
  // The script auto-loads apps/web/.env.local when DATABASE_URL is not set.
  execSync('pnpm seed:e2e', { cwd: repoRoot, stdio: 'inherit' });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/e2e/global-setup.ts
git commit -m "feat(e2e): point global-setup at the static e2e fixtures instead of live wc-2026"
```

---

### Task 6: Point the existing fill-in specs at `e2e-open`

Without this, both specs would default to whichever tournament sorts first by `firstKickoff` in `listTournaments` (`packages/db/src/repositories/tournament.ts:162`) — which is `e2e-seeded` (`2000-01-01` sorts before `2099-01-01`), the wrong one.

**Files:**

- Modify: `apps/web/e2e/guest-full-prediction.spec.ts`
- Modify: `apps/web/e2e/bracket-picks.spec.ts`

**Interfaces:**

- Consumes: the `<select aria-label="Tournament" data-testid="tournament-select">` in `apps/web/src/features/pools/ui/CreatePoolForm.tsx:44-60`, whose `<option value={t.id}>` for `e2e-open` has `value="e2e-open"`.

- [ ] **Step 1: Update `guest-full-prediction.spec.ts`**

In `apps/web/e2e/guest-full-prediction.spec.ts`, change:

```ts
// ── 2. Create a pool ───────────────────────────────────────────────────────
await page.getByLabel('Pool name').fill('WC26 Test Pool');
```

to:

```ts
// ── 2. Create a pool ───────────────────────────────────────────────────────
// Explicitly pick e2e-open: with two fixtures now synced, the tournament select's default
// is whichever sorts first by firstKickoff, not necessarily this one.
await page.getByLabel('Tournament').selectOption('e2e-open');
await page.getByLabel('Pool name').fill('WC26 Test Pool');
```

- [ ] **Step 2: Update `bracket-picks.spec.ts`**

In `apps/web/e2e/bracket-picks.spec.ts`, change:

```ts
await page.getByLabel('Pool name').fill('Bracket Test Pool');
```

to:

```ts
await page.getByLabel('Tournament').selectOption('e2e-open');
await page.getByLabel('Pool name').fill('Bracket Test Pool');
```

- [ ] **Step 3: Run both specs to verify they still pass**

```bash
pnpm db:reset && pnpm -C apps/web exec playwright test guest-full-prediction.spec.ts bracket-picks.spec.ts
```

Expected: both PASS. (This runs `global-setup.ts`, i.e. `pnpm seed:e2e`, first — same as the full suite.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/guest-full-prediction.spec.ts apps/web/e2e/bracket-picks.spec.ts
git commit -m "fix(e2e): explicitly select e2e-open tournament in existing specs"
```

---

### Task 7: Leaderboard `data-testid`s

Neither `Leaderboard.tsx`, `LeaderboardRow.tsx`, nor `Podium.tsx` currently has any `data-testid` (confirmed by grep). Per `CLAUDE.md`, e2e must select by `data-testid`, so these are added now, not worked around with text-content selectors.

**Files:**

- Modify: `apps/web/src/features/pools/ui/LeaderboardRow.tsx`
- Modify: `apps/web/src/features/pools/ui/Podium.tsx`

**Interfaces:**

- Produces: `data-testid="leaderboard-row-{rank}"` (row container), `data-testid="leaderboard-points"` (points cell) in `LeaderboardRow`; `data-testid="podium-entry-{originalRank}"` (block container), `data-testid="podium-points"` (points line) in `Podium`. Consumed by Task 9's `leaderboard.spec.ts`.

- [ ] **Step 1: Add testids to `LeaderboardRow.tsx`**

In `apps/web/src/features/pools/ui/LeaderboardRow.tsx`, change:

```tsx
  const row = (
    <div
      className={cn(
        'grid items-center gap-2 px-4 py-2.5 grid-cols-[34px_1fr_60px_60px]',
        isSelf && 'bg-green-050',
      )}
    >
```

to:

```tsx
  const row = (
    <div
      data-testid={`leaderboard-row-${rank}`}
      className={cn(
        'grid items-center gap-2 px-4 py-2.5 grid-cols-[34px_1fr_60px_60px]',
        isSelf && 'bg-green-050',
      )}
    >
```

And change:

```tsx
      <div className="text-right leading-tight">
        <div className="display tnum text-base text-ink">{entry.pointsTotal}</div>
```

to:

```tsx
      <div className="text-right leading-tight">
        <div data-testid="leaderboard-points" className="display tnum text-base text-ink">
          {entry.pointsTotal}
        </div>
```

- [ ] **Step 2: Add testids to `Podium.tsx`**

In `apps/web/src/features/pools/ui/Podium.tsx`, change:

```tsx
          const podiumBlock = (
            <div key={entry.userId} className="flex flex-col items-center w-27.5 gap-1.5">
```

to:

```tsx
          const podiumBlock = (
            <div
              key={entry.userId}
              data-testid={`podium-entry-${originalRank}`}
              className="flex flex-col items-center w-27.5 gap-1.5"
            >
```

And change:

```tsx
<div className="display text-lg" style={{ color: rankColors[i] ?? 'var(--on-dark)' }}>
  {entry.pointsTotal}
</div>
```

to:

```tsx
<div
  data-testid="podium-points"
  className="display text-lg"
  style={{ color: rankColors[i] ?? 'var(--on-dark)' }}
>
  {entry.pointsTotal}
</div>
```

- [ ] **Step 3: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/pools/ui/LeaderboardRow.tsx apps/web/src/features/pools/ui/Podium.tsx
git commit -m "feat(pools): add data-testid to leaderboard/podium rows for e2e"
```

---

### Task 8: Late-joiner banner `data-testid`

**Files:**

- Modify: `apps/web/src/app/(authenticated)/pools/[id]/predict/page.tsx`

**Interfaces:**

- Produces: `data-testid="late-joiner-banner"` on the partial-status banner (currently only matchable by its visible text). Consumed by Task 11's `late-joiner.spec.ts`.

- [ ] **Step 1: Add the testid**

In `apps/web/src/app/(authenticated)/pools/[id]/predict/page.tsx`, change:

```tsx
      {card.status === 'partial' && card.lateJoinerDeadline && (
        <div className="flex items-start gap-2.5 p-[12px_16px] mb-5 rounded-[10px] bg-surface-2 border border-line text-[13px] text-ink-soft">
```

to:

```tsx
      {card.status === 'partial' && card.lateJoinerDeadline && (
        <div
          data-testid="late-joiner-banner"
          className="flex items-start gap-2.5 p-[12px_16px] mb-5 rounded-[10px] bg-surface-2 border border-line text-[13px] text-ink-soft"
        >
```

- [ ] **Step 2: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(authenticated)/pools/[id]/predict/page.tsx"
git commit -m "feat(predict): add data-testid to late-joiner partial banner for e2e"
```

---

### Task 9: `leaderboard.spec.ts`

**Files:**

- Create: `apps/web/e2e/leaderboard.spec.ts`

**Interfaces:**

- Consumes: `apps/web/e2e/.e2e-fixture-ids.json` (written by Task 4's seed script); `podium-entry-{rank}` / `podium-points` (Task 7); `leaderboard-row-{rank}` / `leaderboard-points` (Task 7); `/login/e2e-seeded-owner` route (`apps/web/src/app/login/[token]/route.ts`).

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureIds = JSON.parse(
  readFileSync(path.join(__dirname, '.e2e-fixture-ids.json'), 'utf-8'),
) as { seededPoolId: string };

test('leaderboard ranks members by total points, descending', async ({ page }) => {
  await page.goto('/login/e2e-seeded-owner');
  await page.waitForURL('**/pools');
  await page.goto(`/pools/${fixtureIds.seededPoolId}`);

  const podiumPoints: number[] = [];
  for (const rank of [1, 2, 3]) {
    const entry = page.locator(`[data-testid="podium-entry-${rank}"]`);
    await expect(entry).toBeVisible();
    const text = await entry.locator('[data-testid="podium-points"]').textContent();
    podiumPoints.push(Number(text));
  }

  const rows = page.locator('[data-testid^="leaderboard-row-"]');
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThan(0);

  const rowPoints: number[] = [];
  for (let i = 0; i < rowCount; i++) {
    const text = await rows.nth(i).locator('[data-testid="leaderboard-points"]').textContent();
    rowPoints.push(Number(text));
  }

  const allPoints = [...podiumPoints, ...rowPoints];
  const sorted = [...allPoints].sort((a, b) => b - a);
  expect(allPoints).toEqual(sorted);
});
```

- [ ] **Step 2: Run it**

```bash
pnpm db:reset && pnpm -C apps/web exec playwright test leaderboard.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/leaderboard.spec.ts
git commit -m "test(e2e): add leaderboard ordering spec"
```

---

### Task 10: `results.spec.ts`

**Files:**

- Create: `apps/web/e2e/results.spec.ts`

**Interfaces:**

- Consumes: `results-tab-{knockout|specials|race}` (`ResultsPageClient.tsx:44`), `final-result-card` / `home-team-name` / `away-team-name` (`FinalResultCard.tsx:85,152,178`), `special-bet-result-{key}` (`SpecialBetRow.tsx:26`), `points-race-subtab-race` (`PointsRaceTab.tsx:51`), `score-breakdown-card` (`ScoreBreakdownCard.tsx:70`, rendered inside `RaceView.tsx` for a viewer with a scored breakdown).
- Corrected during implementation: `points-summary-panel` (`PointsSummaryPanel.tsx`) is NOT rendered on the Race tab — only on Group/Knockout/Specials. `score-breakdown-card` is the correct populated-summary testid on the Race tab.
- `final-result-card` renders twice simultaneously in the DOM (mobile accordion + desktop bracket, toggled by responsive CSS) — scope the locator with `:visible` to avoid a Playwright strict-mode violation.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureIds = JSON.parse(
  readFileSync(path.join(__dirname, '.e2e-fixture-ids.json'), 'utf-8'),
) as { seededPoolId: string };

test('results page shows a fully resolved bracket, specials, and points race', async ({ page }) => {
  await page.goto('/login/e2e-seeded-owner');
  await page.waitForURL('**/pools');
  await page.goto(`/pools/${fixtureIds.seededPoolId}/results`);

  // Knockout tab: Final shows France vs Argentina (Argentina champion).
  // The results page renders both a mobile accordion and a desktop bracket
  // simultaneously (toggled via responsive CSS), so the same testid appears
  // twice in the DOM — scope to the one actually visible at this viewport.
  await page.locator('[data-testid="results-tab-knockout"]').click();
  const finalCard = page.locator('[data-testid="final-result-card"]:visible');
  await expect(finalCard).toBeVisible();
  await expect(finalCard.locator('[data-testid="home-team-name"]')).toHaveText(/France/i);
  await expect(finalCard.locator('[data-testid="away-team-name"]')).toHaveText(/Argentina/i);

  // Specials tab: resolved and unresolved bets both render
  await page.locator('[data-testid="results-tab-specials"]').click();
  await expect(page.locator('[data-testid="special-bet-result-topScorerPlayer"]')).toBeVisible();
  await expect(page.locator('[data-testid="special-bet-result-firstRedCardPlayer"]')).toBeVisible();

  // Points race tab renders a populated summary (the owner's own score breakdown)
  await page.locator('[data-testid="results-tab-race"]').click();
  await page.locator('[data-testid="points-race-subtab-race"]').click();
  await expect(page.locator('[data-testid="score-breakdown-card"]')).toBeVisible();
});
```

- [ ] **Step 2: Run it**

```bash
pnpm db:reset && pnpm -C apps/web exec playwright test results.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/results.spec.ts
git commit -m "test(e2e): add results/points-race rendering spec"
```

---

### Task 11: `late-joiner.spec.ts`

**Files:**

- Create: `apps/web/e2e/late-joiner.spec.ts`

**Interfaces:**

- Consumes: `late-joiner-banner` (Task 8); `aria-label="Home goals"` disabled state (`ScoreCell.tsx:96-127`, locked via `GroupCard.tsx:27`); `[data-testid="pick-home"]` disabled state (existing, from `bracket-picks.spec.ts`'s usage of `TieCard.tsx:32`); `#special-firstRedCardPlayer` select (`SpecialBetInput.tsx:53-68`, locked via `SpecialsSection.tsx:54`); `/login/e2e-seeded-late-joiner` route.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureIds = JSON.parse(
  readFileSync(path.join(__dirname, '.e2e-fixture-ids.json'), 'utf-8'),
) as { seededPoolId: string };

test('late joiner sees the partial banner, locked items, and can fill the one open bet', async ({
  page,
}) => {
  await page.goto('/login/e2e-seeded-late-joiner');
  await page.waitForURL('**/pools');
  await page.goto(`/pools/${fixtureIds.seededPoolId}/predict`);

  await expect(page.locator('[data-testid="late-joiner-banner"]')).toBeVisible();

  // Group Stage tab is the default — a score input is locked
  const homeGoalsInput = page.getByLabel('Home goals').first();
  await expect(homeGoalsInput).toBeDisabled();

  // A bracket tie is locked
  await page.getByRole('button', { name: 'Bracket' }).click();
  const firstPickHome = page.locator('[data-testid="pick-home"]').first();
  await expect(firstPickHome).toBeDisabled();

  // The one genuinely open special bet is editable and can be filled
  await page.getByRole('button', { name: 'Special Bets' }).click();
  const section = page.locator('[data-testid="specials-section"]');
  const redCardSelect = section.locator('#special-firstRedCardPlayer');
  await expect(redCardSelect).toBeEnabled();
  await redCardSelect.selectOption({ index: 1 });
  await page.waitForLoadState('networkidle');

  // Persists after reload
  await page.reload();
  await page.getByRole('button', { name: 'Special Bets' }).click();
  await expect(section.locator('#special-firstRedCardPlayer')).not.toHaveValue('');
});
```

- [ ] **Step 2: Run it**

```bash
pnpm db:reset && pnpm -C apps/web exec playwright test late-joiner.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/late-joiner.spec.ts
git commit -m "test(e2e): add late-joiner partial-prediction spec"
```

---

### Task 12: Full-suite verification and docs

**Files:**

- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: Run the complete gate**

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm -C apps/web build
```

Expected: all green.

- [ ] **Step 2: Run the full e2e suite fresh, exactly as CI does**

```bash
pnpm db:reset
pnpm -C apps/web exec playwright install --with-deps chromium
pnpm e2e
```

Expected: all 5 specs pass (`guest-full-prediction`, `bracket-picks`, `leaderboard`, `results`, `late-joiner`).

- [ ] **Step 3: Update `docs/PROGRESS.md`**

Add a dated entry summarizing: the `wc-2026` live-data e2e fragility that was fixed, the two new static fixtures (`e2e-open`, `e2e-seeded`) and why two are needed, the production-informed prediction-variety generator, and the 3 new specs. Reference `docs/superpowers/specs/2026-07-13-e2e-test-data-design.md`.

- [ ] **Step 4: Commit**

```bash
git add docs/PROGRESS.md
git commit -m "docs: record e2e test data fixtures in PROGRESS.md"
```
