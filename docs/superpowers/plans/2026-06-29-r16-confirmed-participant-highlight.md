# R16+ Confirmed-Participant Green Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In bracket match cards for R16 and all subsequent rounds, show a green row background for confirmed team slots where the user correctly predicted that team would advance from the previous round.

**Architecture:** Add `computeUserPickedParticipants` to `build-bracket-rounds.ts` — a pick-chain walker that never substitutes actual results — and two boolean fields on `KnockoutMatchView` (`homeTeamUserPredictedParticipant`, `awayTeamUserPredictedParticipant`). `BracketMatchCard` uses these fields alongside the existing `isPick` logic to colour confirmed-participant rows green.

**Tech Stack:** TypeScript strict, React, Vitest unit tests.

## Global Constraints

- TypeScript strict — no `any`, no unsafe casts.
- No new feature flags, backwards-compat shims, or speculative abstractions.
- One commit for the entire feature (code + tests + spec doc) per CLAUDE.md.
- All tests run with `pnpm test` from the repo root.
- To run a single test file: `pnpm test -- <path-to-file>`.
- `TournamentId` brand constructor: `tournamentId` from `@cup/engine` (aliased as `asTournamentId` in tests per existing convention: `import { tournamentId as asTournamentId } from '@cup/engine'`).

---

### Task 1: Extend the type, fix the affected fixture helper, write failing tests

**Files:**

- Modify: `apps/web/src/features/results/domain/types.ts`
- Modify: `apps/web/src/features/results/domain/bracket-health.test.ts`
- Create: `apps/web/src/features/results/application/build-bracket-rounds.test.ts`

**Interfaces:**

- Produces: `KnockoutMatchView.homeTeamUserPredictedParticipant: boolean` and `KnockoutMatchView.awayTeamUserPredictedParticipant: boolean`

- [ ] **Step 1: Add two new fields to `KnockoutMatchView` in `apps/web/src/features/results/domain/types.ts`**

  Insert after `awayTeamPredictedPct: number | null;` (currently the last field before the closing `};`):

  ```ts
  /** True when the confirmed home-slot team was predicted by the user to be in this slot (progression rounds only; always false for the entry round). */
  homeTeamUserPredictedParticipant: boolean;
  /** True when the confirmed away-slot team was predicted by the user to be in this slot (progression rounds only; always false for the entry round). */
  awayTeamUserPredictedParticipant: boolean;
  ```

- [ ] **Step 2: Add the new fields to the fixture helper in `apps/web/src/features/results/domain/bracket-health.test.ts`**

  The `match()` helper at the top of that file builds a `KnockoutMatchView` literal. TypeScript will reject it once the type gains two required fields. Find the end of the returned object (after `awayTeamPredictedPct: null,`) and add:

  ```ts
      homeTeamUserPredictedParticipant: false,
      awayTeamUserPredictedParticipant: false,
  ```

- [ ] **Step 3: Create `apps/web/src/features/results/application/build-bracket-rounds.test.ts`**

  ```ts
  import { describe, expect, it } from 'vitest';
  import { miniTournament } from '@cup/engine/testing';
  import { tournamentId as asTournamentId } from '@cup/engine';
  import type { MatchRow } from '@cup/db';
  import { buildBracketRounds } from './build-bracket-rounds';

  const tid = asTournamentId('mini-2026');

  function makeMatch(
    id: string,
    stage: MatchRow['stage'],
    overrides: Partial<MatchRow> = {},
  ): MatchRow {
    return {
      id,
      tournamentId: tid,
      stage,
      groupId: null,
      homeTeamId: null,
      awayTeamId: null,
      kickoff: null,
      homeGoals: null,
      awayGoals: null,
      homeConduct: null,
      awayConduct: null,
      winnerTeamId: null,
      decidedBy: null,
      status: 'scheduled',
      ...overrides,
    };
  }

  // miniTournament layout:
  //   Entry round: QF (qf1–qf4)
  //   qf1: 1A vs 2B  →  A1 vs B2  (default seed order with no group matches played)
  //   qf2: 1C vs 2D  →  C1 vs D2
  //   qf3: 1B vs 2A  →  B1 vs A2
  //   qf4: 1D vs 2C  →  D1 vs C2
  //   sf1 feeds from [qf1, qf2], sf2 feeds from [qf3, qf4]
  //   final feeds from [sf1, sf2]

  const finalQf1 = makeMatch('qf1', 'QF', {
    homeTeamId: 'A1',
    awayTeamId: 'B2',
    winnerTeamId: 'A1',
    homeGoals: 2,
    awayGoals: 0,
    status: 'final',
  });

  const finalQf2 = makeMatch('qf2', 'QF', {
    homeTeamId: 'C1',
    awayTeamId: 'D2',
    winnerTeamId: 'C1',
    homeGoals: 1,
    awayGoals: 0,
    status: 'final',
  });

  const finalQf3 = makeMatch('qf3', 'QF', {
    homeTeamId: 'B1',
    awayTeamId: 'A2',
    winnerTeamId: 'B1',
    homeGoals: 1,
    awayGoals: 0,
    status: 'final',
  });

  const finalQf4 = makeMatch('qf4', 'QF', {
    homeTeamId: 'D1',
    awayTeamId: 'C2',
    winnerTeamId: 'D1',
    homeGoals: 1,
    awayGoals: 0,
    status: 'final',
  });

  describe('buildBracketRounds — homeTeamUserPredictedParticipant / awayTeamUserPredictedParticipant', () => {
    it('is always false for entry-round (QF) cards', () => {
      const { bracketRounds } = buildBracketRounds(
        miniTournament,
        [finalQf1],
        { knockoutPicks: [{ bracketMatchKey: 'qf1', winner: 'A1' }], finishScores: {} },
        [],
        [],
      );
      const qfRound = bracketRounds.find((r) => r.label === 'QF')!;
      const qf1Card = qfRound.matches.find((m) => m.bracketMatchKey === 'qf1')!;
      expect(qf1Card.homeTeamUserPredictedParticipant).toBe(false);
      expect(qf1Card.awayTeamUserPredictedParticipant).toBe(false);
    });

    it('is true for SF home slot when user correctly picked the QF winner', () => {
      const { bracketRounds } = buildBracketRounds(
        miniTournament,
        [finalQf1, finalQf2],
        { knockoutPicks: [{ bracketMatchKey: 'qf1', winner: 'A1' }], finishScores: {} },
        [],
        [],
      );
      const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
      const sf1Card = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
      expect(sf1Card.homeTeamUserPredictedParticipant).toBe(true);
      // No pick for qf2 → away slot not predicted
      expect(sf1Card.awayTeamUserPredictedParticipant).toBe(false);
    });

    it('is false for SF home slot when user picked the losing QF team', () => {
      const { bracketRounds } = buildBracketRounds(
        miniTournament,
        [finalQf1, finalQf2],
        // B2 is a valid qf1 participant but lost
        { knockoutPicks: [{ bracketMatchKey: 'qf1', winner: 'B2' }], finishScores: {} },
        [],
        [],
      );
      const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
      const sf1Card = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
      expect(sf1Card.homeTeamUserPredictedParticipant).toBe(false);
    });

    it('is false for SF home slot when user made no QF pick', () => {
      const { bracketRounds } = buildBracketRounds(
        miniTournament,
        [finalQf1, finalQf2],
        { knockoutPicks: [], finishScores: {} },
        [],
        [],
      );
      const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
      const sf1Card = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
      expect(sf1Card.homeTeamUserPredictedParticipant).toBe(false);
    });

    it('is false when the QF match is not yet final (slot TBD)', () => {
      // No QF results → sf1 homeId is null (derivedParticipants has no sf1 entry)
      const { bracketRounds } = buildBracketRounds(
        miniTournament,
        [],
        { knockoutPicks: [{ bracketMatchKey: 'qf1', winner: 'A1' }], finishScores: {} },
        [],
        [],
      );
      const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
      const sf1Card = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
      expect(sf1Card.homeTeamUserPredictedParticipant).toBe(false);
    });

    it('is false for all cards when inputs is null (viewer mode)', () => {
      const { bracketRounds } = buildBracketRounds(
        miniTournament,
        [finalQf1, finalQf2],
        null,
        [],
        [],
      );
      const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
      const sf1Card = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
      expect(sf1Card.homeTeamUserPredictedParticipant).toBe(false);
      expect(sf1Card.awayTeamUserPredictedParticipant).toBe(false);
    });

    it('propagates correctly through a two-hop chain: QF → SF → Final', () => {
      const finalSf1 = makeMatch('sf1', 'SF', {
        homeTeamId: 'A1',
        awayTeamId: 'C1',
        winnerTeamId: 'A1',
        homeGoals: 2,
        awayGoals: 1,
        status: 'final',
      });
      const finalSf2 = makeMatch('sf2', 'SF', {
        homeTeamId: 'B1',
        awayTeamId: 'D1',
        winnerTeamId: 'B1',
        homeGoals: 1,
        awayGoals: 0,
        status: 'final',
      });
      const { bracketRounds } = buildBracketRounds(
        miniTournament,
        [finalQf1, finalQf2, finalQf3, finalQf4, finalSf1, finalSf2],
        {
          knockoutPicks: [
            { bracketMatchKey: 'qf1', winner: 'A1' },
            { bracketMatchKey: 'qf2', winner: 'C1' },
            { bracketMatchKey: 'qf3', winner: 'B1' },
            { bracketMatchKey: 'qf4', winner: 'D1' },
            { bracketMatchKey: 'sf1', winner: 'A1' },
            { bracketMatchKey: 'sf2', winner: 'B1' },
          ],
          finishScores: {},
        },
        [],
        [],
      );
      const finalRound = bracketRounds.find((r) => r.label === 'Final')!;
      const finalCard = finalRound.matches[0]!;
      // User's chain correctly predicted A1 reaching Final via sf1, B1 via sf2
      expect(finalCard.homeTeamUserPredictedParticipant).toBe(true);
      expect(finalCard.awayTeamUserPredictedParticipant).toBe(true);
    });
  });
  ```

- [ ] **Step 4: Run the new tests — verify they fail (type errors or assertion failures)**

  ```bash
  pnpm test -- apps/web/src/features/results/application/build-bracket-rounds.test.ts
  ```

  Expected: TypeScript compile errors because `homeTeamUserPredictedParticipant` / `awayTeamUserPredictedParticipant` are not yet returned by `buildMatchView`.

---

### Task 2: Implement `computeUserPickedParticipants` and wire into `buildMatchView`

**Files:**

- Modify: `apps/web/src/features/results/application/build-bracket-rounds.ts`

**Interfaces:**

- Consumes: `KnockoutMatchView.homeTeamUserPredictedParticipant: boolean`, `KnockoutMatchView.awayTeamUserPredictedParticipant: boolean` (Task 1)
- Consumes: `userPickedParticipants: Map<string, [string | null, string | null]>` via closure in `buildMatchView`

- [ ] **Step 1: Add `computeUserPickedParticipants` to `build-bracket-rounds.ts`**

  Insert this new function just before the existing `resolvePredictedTeams` function (at the bottom of the file):

  ```ts
  /**
   * Walks the bracket pick chain using ONLY the user's picks — never substituting
   * actual match results. Returns a map of what team the user predicted for the
   * home (index 0) and away (index 1) slot of each progression match.
   *
   * Entry rounds: apply the same cross-slot adjustment as computeUserPredictedParticipants
   * but do not substitute actual.winnerTeamId.
   * Progression rounds: use the user's pick for each feeder match (validated against
   * the predicted participants of that feeder) but do not substitute actual.winnerTeamId.
   */
  function computeUserPickedParticipants(
    def: Tournament,
    pickMap: Map<string, string>,
    derivedParticipants: Map<BracketMatchKey, [string, string]>,
  ): Map<string, [string | null, string | null]> {
    const allEntryPickedTeams = new Set<string>();
    for (const slot of def.bracket.slots) {
      const pick = pickMap.get(slot.match);
      if (pick) allEntryPickedTeams.add(pick);
    }

    // Entry rounds: resolve user's pick (with cross-slot adjustment) — no actual substitution.
    const entryPickWinner = new Map<BracketMatchKey, string | null>();
    for (const slot of def.bracket.slots) {
      const derived = derivedParticipants.get(slot.match);
      if (!derived) {
        entryPickWinner.set(slot.match, null);
        continue;
      }
      const directPick = pickMap.get(slot.match) ?? null;
      const directValid =
        directPick !== null && (derived[0] === directPick || derived[1] === directPick);
      if (directValid) {
        entryPickWinner.set(slot.match, directPick);
      } else {
        const crossMatch = allEntryPickedTeams.has(derived[0])
          ? derived[0]
          : allEntryPickedTeams.has(derived[1])
            ? derived[1]
            : null;
        entryPickWinner.set(slot.match, crossMatch);
      }
    }

    const predicted = new Map<string, [string | null, string | null]>();

    const getUserPickedWinner = (fromKey: string): string | null => {
      if (entryPickWinner.has(fromKey as BracketMatchKey)) {
        return entryPickWinner.get(fromKey as BracketMatchKey) ?? null;
      }
      const pick = pickMap.get(fromKey) ?? null;
      if (!pick) return null;
      const parts = predicted.get(fromKey);
      if (parts) {
        return parts[0] === pick || parts[1] === pick ? pick : null;
      }
      return null;
    };

    const bronzeKey = def.bracket.bronzeMatch;
    for (const round of def.bracket.rounds) {
      for (const prog of def.bracket.progression) {
        if (prog.match === bronzeKey) continue;
        if (predicted.has(prog.match)) continue;
        if (getRoundLabel(prog.match, def.bracket.rounds) !== round) continue;
        const [fk0, fk1] = prog.from;
        predicted.set(prog.match, [
          fk0 ? getUserPickedWinner(fk0) : null,
          fk1 ? getUserPickedWinner(fk1) : null,
        ]);
      }
    }

    return predicted;
  }
  ```

- [ ] **Step 2: Compute `userPickedParticipants` in `buildBracketRounds`**

  In `buildBracketRounds`, find the existing line:

  ```ts
  const userPredictedParticipants = inputs
    ? computeUserPredictedParticipants(def, allMatches, pickMap, derivedParticipants)
    : new Map<string, [string | null, string | null]>();
  ```

  Add the following immediately after it:

  ```ts
  const userPickedParticipants = inputs
    ? computeUserPickedParticipants(def, pickMap, derivedParticipants)
    : new Map<string, [string | null, string | null]>();
  ```

- [ ] **Step 3: Add the two new fields to `buildMatchView`'s return object**

  In `buildMatchView`, the return statement ends with:

  ```ts
      ...resolvePredictedTeams(key, homeId, awayId, userPredictedParticipants, teamMap),
    };
  ```

  Replace it with:

  ```ts
      ...resolvePredictedTeams(key, homeId, awayId, userPredictedParticipants, teamMap),
      homeTeamUserPredictedParticipant:
        !isEntryRound && homeId !== null && userPickedParticipants.get(key)?.[0] === homeId,
      awayTeamUserPredictedParticipant:
        !isEntryRound && awayId !== null && userPickedParticipants.get(key)?.[1] === awayId,
    };
  ```

- [ ] **Step 4: Run the new tests — verify they pass**

  ```bash
  pnpm test -- apps/web/src/features/results/application/build-bracket-rounds.test.ts
  ```

  Expected: all 7 tests PASS.

- [ ] **Step 5: Run the full test suite to check for regressions**

  ```bash
  pnpm test
  ```

  Expected: all tests PASS.

---

### Task 3: Update `BracketMatchCard` and commit

**Files:**

- Modify: `apps/web/src/features/results/ui/BracketMatchCard.tsx`

**Interfaces:**

- Consumes: `match.homeTeamUserPredictedParticipant: boolean`, `match.awayTeamUserPredictedParticipant: boolean` (Task 1)

- [ ] **Step 1: Update the `isPick` prop for the home `TeamRow` in `BracketMatchCard.tsx`**

  Current:

  ```tsx
  isPick={
    effectiveHomeId !== null &&
    (match.pickedWinnerId === effectiveHomeId || predictedQualifierIds.has(effectiveHomeId))
  }
  ```

  Replace with:

  ```tsx
  isPick={
    effectiveHomeId !== null &&
    (match.pickedWinnerId === effectiveHomeId ||
      predictedQualifierIds.has(effectiveHomeId) ||
      match.homeTeamUserPredictedParticipant)
  }
  ```

- [ ] **Step 2: Update the `isPick` prop for the away `TeamRow` in `BracketMatchCard.tsx`**

  Current:

  ```tsx
  isPick={
    effectiveAwayId !== null &&
    (match.pickedWinnerId === effectiveAwayId || predictedQualifierIds.has(effectiveAwayId))
  }
  ```

  Replace with:

  ```tsx
  isPick={
    effectiveAwayId !== null &&
    (match.pickedWinnerId === effectiveAwayId ||
      predictedQualifierIds.has(effectiveAwayId) ||
      match.awayTeamUserPredictedParticipant)
  }
  ```

- [ ] **Step 3: Run the full test suite**

  ```bash
  pnpm test
  ```

  Expected: all tests PASS.

- [ ] **Step 4: Run lint and typecheck**

  ```bash
  pnpm lint && pnpm typecheck
  ```

  Expected: no errors.

- [ ] **Step 5: Commit the feature**

  ```bash
  git add \
    apps/web/src/features/results/domain/types.ts \
    apps/web/src/features/results/domain/bracket-health.test.ts \
    apps/web/src/features/results/application/build-bracket-rounds.ts \
    apps/web/src/features/results/application/build-bracket-rounds.test.ts \
    apps/web/src/features/results/ui/BracketMatchCard.tsx \
    docs/superpowers/specs/2026-06-29-r16-confirmed-participant-highlight-design.md \
    docs/superpowers/plans/2026-06-29-r16-confirmed-participant-highlight.md

  git commit -m "$(cat <<'EOF'
  feat(bracket): green highlight for confirmed participants in R16+ cards

  When a team wins their match and appears as a confirmed participant in
  the next knockout round, their row now shows a green background if the
  user correctly predicted that team would advance.

  Previously, green appeared only when the user picked that team to *win*
  the current round, not when they predicted them to *reach* it.

  Adds computeUserPickedParticipants — a pure pick-chain walker that never
  substitutes actual results — and two boolean fields on KnockoutMatchView
  (homeTeamUserPredictedParticipant, awayTeamUserPredictedParticipant).
  BracketMatchCard uses these fields for all progression rounds (R16, QF,
  SF, Final).

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```
