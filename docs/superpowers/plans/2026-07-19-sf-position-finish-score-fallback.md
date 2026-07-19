# SF Position finish-score fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `deriveTopFour()` so the Top Four position bonus (`topFourPosition`) survives deletion
of the explicit Final/Bronze knockout pick by the invalidation cascade, by falling back to the
`prediction_finish_scores` team-identity snapshot — the same source the results-page UI already
trusts.

**Architecture:** `buildBracket()` gains a `finishScores` parameter (the shape already exists as
`CardInputs['finishScores']`, carrying `homeTeamId`/`awayTeamId`). `deriveTopFour()`'s internal
winner/loser resolution tries the explicit pick first (unchanged), then falls back to the snapshot
when no pick exists and the scoreline isn't tied. `deriveCard()` threads `input.finishScores` through.
No DB, schema, or web-layer changes.

**Tech Stack:** TypeScript strict, Vitest, pnpm workspace (`packages/engine`).

## Global Constraints

- TypeScript strict — no `any`, no unsafe casts (CLAUDE.md "Type safety").
- TDD: write the failing test before implementation code (CLAUDE.md "TDD").
- One commit for this entire feature — do not commit mid-way (CLAUDE.md "One commit per feature").
- Commit the design spec together with the implementation, not separately (CLAUDE.md
  "Documentation").
- Format + lint + typecheck must pass before considering any task done (CLAUDE.md "Tooling &
  quality gates").

---

### Task 1: `deriveTopFour` falls back to the finish-score snapshot

**Files:**

- Modify: `packages/engine/src/bracket.ts`
- Modify: `packages/engine/src/derive.ts`
- Test: `packages/engine/src/bracket.test.ts`

**Interfaces:**

- Consumes: existing `FinishScore` type (`packages/engine/src/types.ts:110-121`, already has
  `home: number; away: number; homeTeamId?: TeamId | null; awayTeamId?: TeamId | null`) and
  `CardInputs['finishScores']` (`types.ts:138`, already `{ final?: FinishScore; bronze?: FinishScore }`).
  No type changes needed in `types.ts`.
- Produces: `buildBracket(t, groupOrders, qualifiers, picks, finishScores?)` — new optional 5th
  parameter, default `{}`, so all existing callers keep compiling unchanged.

- [ ] **Step 1: Write the failing tests**

Add these three `it` blocks inside the existing `describe('buildBracket', ...)` block in
`packages/engine/src/bracket.test.ts`, placed right after the existing "derives topFour as
[finalWinner, finalLoser, bronzeWinner, bronzeLoser]" test (currently ends at line 145):

```ts
it('recovers topFour from the finish-score snapshot when the explicit Final/Bronze pick is missing', () => {
  const groupOrders = deriveGroupOrders(miniTournament, allDrawScores);
  const qualifiers = selectQualifiers(miniTournament, allDrawScores, groupOrders);

  // Same QF/SF picks as the "derives topFour" test above, but NO explicit 'final'/'bronze'
  // picks — reproduces the production bug where the invalidation cascade deleted them.
  const picks: KnockoutPick[] = [
    { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
    { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
    { bracketMatchKey: bracketMatchKey('qf3'), winner: teamId('B1') },
    { bracketMatchKey: bracketMatchKey('qf4'), winner: teamId('D1') },
    { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('A1') },
    { bracketMatchKey: bracketMatchKey('sf2'), winner: teamId('B1') },
    // no 'final' or 'bronze' pick
  ];

  const result = buildBracket(miniTournament, groupOrders, qualifiers, picks, {
    final: { home: 2, away: 1, homeTeamId: teamId('A1'), awayTeamId: teamId('B1') },
    bronze: { home: 0, away: 3, homeTeamId: teamId('C1'), awayTeamId: teamId('D1') },
  });

  // Same expected result as the explicit-pick test — proves the snapshot fallback recovers
  // the identical topFour without needing the deleted pick.
  expect(result.topFour).toEqual([teamId('A1'), teamId('B1'), teamId('D1'), teamId('C1')]);
});

it('does not recover topFour from a tied finish score (needs an explicit tie-break pick)', () => {
  const groupOrders = deriveGroupOrders(miniTournament, allDrawScores);
  const qualifiers = selectQualifiers(miniTournament, allDrawScores, groupOrders);

  const picks: KnockoutPick[] = [
    { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
    { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
    { bracketMatchKey: bracketMatchKey('qf3'), winner: teamId('B1') },
    { bracketMatchKey: bracketMatchKey('qf4'), winner: teamId('D1') },
    { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('A1') },
    { bracketMatchKey: bracketMatchKey('sf2'), winner: teamId('B1') },
  ];

  const result = buildBracket(miniTournament, groupOrders, qualifiers, picks, {
    final: { home: 1, away: 1, homeTeamId: teamId('A1'), awayTeamId: teamId('B1') },
  });

  expect(result.topFour).toHaveLength(0);
});

it('prefers the explicit pick over a disagreeing finish-score snapshot', () => {
  const groupOrders = deriveGroupOrders(miniTournament, allDrawScores);
  const qualifiers = selectQualifiers(miniTournament, allDrawScores, groupOrders);

  // Explicit pick says A1 wins the final; the snapshot (e.g. a stale one) disagrees and says B1.
  // The explicit pick must win — this is also the only way a tied scoreline can register a
  // winner (a penalty-shootout tie-break pick), so explicit-pick precedence must never regress.
  const picks: KnockoutPick[] = [
    { bracketMatchKey: bracketMatchKey('qf1'), winner: teamId('A1') },
    { bracketMatchKey: bracketMatchKey('qf2'), winner: teamId('C1') },
    { bracketMatchKey: bracketMatchKey('qf3'), winner: teamId('B1') },
    { bracketMatchKey: bracketMatchKey('qf4'), winner: teamId('D1') },
    { bracketMatchKey: bracketMatchKey('sf1'), winner: teamId('A1') },
    { bracketMatchKey: bracketMatchKey('sf2'), winner: teamId('B1') },
    { bracketMatchKey: bracketMatchKey('final'), winner: teamId('A1') },
  ];

  const result = buildBracket(miniTournament, groupOrders, qualifiers, picks, {
    final: { home: 1, away: 1, homeTeamId: teamId('B1'), awayTeamId: teamId('A1') },
  });

  expect(result.topFour[0]).toBe(teamId('A1'));
  expect(result.topFour[1]).toBe(teamId('B1'));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @cup/engine test -- bracket.test.ts`
Expected: the first new test (`recovers topFour from the finish-score snapshot...`) FAILs with
`expected [] to equal [ 'A1', 'B1', 'D1', 'C1' ]` (or similar — `topFour` is empty today because
there's no explicit pick). The other two new tests PASS already (today's behavior already produces
an empty/explicit-preferring result for those cases) — that's fine, they're regression guards for
this change, not proof of a new bug.

- [ ] **Step 3: Implement the fallback in `bracket.ts`**

In `packages/engine/src/bracket.ts`, first add the import for `FinishScore` at the top:

```ts
import type {
  BracketMatchKey,
  KnockoutPick,
  Progression,
  Tournament,
  FinishScore,
} from './types.js';
```

Replace the `deriveTopFour` function (current lines 245-269) with:

```ts
/**
 * Resolves the winner of a Final/Bronze match: the explicit pick if present (this is also the
 * only way a tied scoreline can register a winner — see the finish-score fallback below), else
 * the finish-score snapshot when it unambiguously implies one (both team ids known, goals not
 * tied). Mirrors the precedence of the web layer's `resolveFinaleWinner`
 * (apps/web/src/features/results/domain/finale-winner.ts) — kept in sync deliberately, since both
 * must treat "no explicit pick" the same way for the UI and scoring engine to agree.
 */
function resolveFinaleWinner(
  pickByKey: Map<BracketMatchKey, TeamId>,
  finishScore: FinishScore | undefined,
  matchKey: BracketMatchKey,
): TeamId | null {
  const picked = pickByKey.get(matchKey);
  if (picked) return picked;
  if (
    finishScore?.homeTeamId != null &&
    finishScore.awayTeamId != null &&
    finishScore.home !== finishScore.away
  ) {
    return finishScore.home > finishScore.away ? finishScore.homeTeamId : finishScore.awayTeamId;
  }
  return null;
}

/**
 * Resolves the loser given a known winner: prefers the resolved bracket participants (existing
 * behavior — requires the winner to actually be one of the two participants), else falls back to
 * "the other finish-score snapshot team" when the winner came from the snapshot itself.
 */
function resolveFinaleLoser(
  participantsByMatch: Map<BracketMatchKey, [TeamId, TeamId]>,
  finishScore: FinishScore | undefined,
  matchKey: BracketMatchKey,
  winner: TeamId,
): TeamId | null {
  const pair = participantsByMatch.get(matchKey);
  if (pair) {
    const [home, away] = pair;
    if (winner === home) return away;
    if (winner === away) return home;
  }
  if (finishScore?.homeTeamId != null && finishScore.awayTeamId != null) {
    if (winner === finishScore.homeTeamId) return finishScore.awayTeamId;
    if (winner === finishScore.awayTeamId) return finishScore.homeTeamId;
  }
  return null;
}

/**
 * topFour = [finalWinner, finalLoser, bronzeWinner, bronzeLoser].
 * Only includes positions that are fully resolved; may be shorter than 4 for partial cards.
 * Used for the Predict page's ordered "predicted final standings" display, and for scoring the
 * Top Four position bonus.
 */
function deriveTopFour(
  bracket: Tournament['bracket'],
  participantsByMatch: Map<BracketMatchKey, [TeamId, TeamId]>,
  pickByKey: Map<BracketMatchKey, TeamId>,
  finishScores: { final?: FinishScore; bronze?: FinishScore },
): TeamId[] {
  const topFour: TeamId[] = [];
  const finalWinner = resolveFinaleWinner(pickByKey, finishScores.final, bracket.finalMatch);
  if (finalWinner) {
    topFour.push(finalWinner);
    const finalLoser = resolveFinaleLoser(
      participantsByMatch,
      finishScores.final,
      bracket.finalMatch,
      finalWinner,
    );
    if (finalLoser) topFour.push(finalLoser);
  }
  const bronzeWinner = resolveFinaleWinner(pickByKey, finishScores.bronze, bracket.bronzeMatch);
  if (bronzeWinner) {
    topFour.push(bronzeWinner);
    const bronzeLoser = resolveFinaleLoser(
      participantsByMatch,
      finishScores.bronze,
      bracket.bronzeMatch,
      bronzeWinner,
    );
    if (bronzeLoser) topFour.push(bronzeLoser);
  }
  return topFour;
}
```

Then update `buildBracket`'s signature and its call to `deriveTopFour` (current lines 67-100). Change
the signature line:

```ts
export function buildBracket(
  t: Tournament,
  groupOrders: Record<GroupId, TeamId[]>,
  qualifiers: TeamId[],
  picks: KnockoutPick[],
  finishScores: { final?: FinishScore; bronze?: FinishScore } = {},
): BracketResult {
```

And update the `topFour` line inside the returned object:

```ts
    topFour: deriveTopFour(bracket, participantsByMatch, pickByKey, finishScores),
```

- [ ] **Step 4: Thread `finishScores` through `deriveCard`**

In `packages/engine/src/derive.ts`, update the `buildBracket` call (currently lines 19-24):

```ts
const { roundOf16, roundOf8, finalists, bronzePair, topFour, roundOf4 } = buildBracket(
  t,
  groupOrders,
  qualifiers,
  input.knockoutPicks,
  input.finishScores,
);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @cup/engine test -- bracket.test.ts`
Expected: PASS — all tests in the file, including the 3 new ones.

- [ ] **Step 6: Run the full engine test suite to check for regressions**

Run: `pnpm --filter @cup/engine test`
Expected: PASS — no other test in the package should be affected, since `finishScores` defaults to
`{}` for every call site that doesn't pass it (`derive.ts` is the only caller besides tests, and it
now always passes `input.finishScores`).

---

### Task 2: End-to-end integration test proving the production bug is fixed

**Files:**

- Test: `packages/engine/src/score.test.ts`

**Interfaces:**

- Consumes: `deriveCard` (`packages/engine/src/derive.ts`, unchanged signature
  `deriveCard(input: CardInputs, t: Tournament): DerivedCard`), `scoreCard`
  (`packages/engine/src/score.ts`, unchanged signature), `miniTournament`/`miniScoring`
  (`packages/engine/src/__fixtures__/mini-tournament.ts`), the `fullKnockoutPicks`/
  `allDrawGroupScores` fixtures already defined at the top of `score.test.ts` (lines 10-25).
- Produces: nothing consumed by later tasks — this is a leaf regression test.

- [ ] **Step 1: Write the failing test**

Add this new `describe` block at the end of `packages/engine/src/score.test.ts` (after the existing
`describe('scoreCard — determinism property', ...)` block, or after whichever block is currently
last in the file):

```ts
describe('scoreCard — SF position bonus survives a deleted explicit Final pick', () => {
  it('awards the position bonus from the finish-score snapshot when the explicit Final/Bronze pick is missing', () => {
    // Reproduces the production bug: the user picked A1/B1 to reach the final via their SF picks
    // and saved a Final score (A1 2-1 B1), but a later pick edit's invalidation cascade deleted
    // the explicit 'final' knockout pick — only the QF/SF picks and the finish-score snapshot
    // survive, exactly like fullKnockoutPicks minus its 'final'/'bronze' entries.
    const picksWithoutFinalBronze: CardInputs['knockoutPicks'] = fullKnockoutPicks.filter(
      (p) =>
        p.bracketMatchKey !== bracketMatchKey('final') &&
        p.bracketMatchKey !== bracketMatchKey('bronze'),
    );

    const cardInput: CardInputs = {
      groupScores: allDrawGroupScores,
      knockoutPicks: picksWithoutFinalBronze,
      finishScores: {
        final: { home: 2, away: 1, homeTeamId: teamId('A1'), awayTeamId: teamId('B1') },
        bronze: { home: 0, away: 3, homeTeamId: teamId('C1'), awayTeamId: teamId('D1') },
      },
      specials: {},
    };
    const actual: ActualResults = {
      matchResults: [],
      groupOrder: {},
      answers: { roundOf4: [teamId('A1'), teamId('B1'), teamId('C1'), teamId('D1')] },
      finalMatch: {
        home: teamId('A1'),
        away: teamId('B1'),
        homeGoals: 2,
        awayGoals: 1,
        winner: teamId('A1'),
      },
      bronzeMatch: {
        home: teamId('C1'),
        away: teamId('D1'),
        homeGoals: 0,
        awayGoals: 3,
        winner: teamId('D1'),
      },
    };

    const derived = deriveCard(cardInput, miniTournament);
    const breakdown = scoreCard(derived, cardInput, actual, miniScoring);

    // 4 correct semifinalists (membership) + all 4 correct positions (bonus) — see the §7.7
    // worked-example comment above for the miniScoring point values.
    expect(breakdown.topFourPosition).toBeGreaterThan(0);
    expect(breakdown.topFourPosition).toBe(4 * miniScoring.topFourPositionBonus);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cup/engine test -- score.test.ts -t "survives a deleted explicit Final pick"`
Expected: FAIL — `expected 0 to be greater than 0` (this is run _before_ Task 1's fix; if Task 1 is
already done by this point, skip this verification step and proceed straight to Step 3).

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm --filter @cup/engine test -- score.test.ts -t "survives a deleted explicit Final pick"`
Expected: PASS (this requires Task 1's implementation to already be in place).

- [ ] **Step 4: Run the full engine test suite**

Run: `pnpm --filter @cup/engine test`
Expected: PASS — all tests green, including the new one.

---

### Task 3: Update PROGRESS.md and finalize the commit

**Files:**

- Modify: `docs/PROGRESS.md`
- (already created in brainstorming, now committed alongside the code):
  `docs/superpowers/specs/2026-07-19-sf-position-finish-score-fallback-design.md`
- (already created, now committed alongside the code):
  `docs/superpowers/plans/2026-07-19-sf-position-finish-score-fallback.md` (this file)

**Interfaces:** None — documentation only.

- [ ] **Step 1: Add a dated entry to `docs/PROGRESS.md`**

Insert a new `##` section right after the "## Final scenario summary (2026-07-19)" section (i.e.
immediately before "## What's next (the remaining-plan sequence)", currently starting at line 717).
Insert this text:

```markdown
## SF Position bonus: finish-score snapshot fallback (2026-07-19)

Fixed a production bug found via a user report: the Top Four position bonus (`topFourPosition`,
shipped 2026-07-15) was effectively non-functional — 0 of 11 scored predictions in production had
any `topFourPosition` > 0, despite users having correctly predicted the Final winner.

**Root cause:** `deriveTopFour()` (`packages/engine/src/bracket.ts`) only resolved the Final/Bronze
winner from an explicit `prediction_knockout_picks` row. That row is written implicitly when a user
saves their Final/Bronze score (`applyFinishScore` in `apps/web/src/features/predictions/api/actions.ts`),
but gets deleted by the pick-invalidation cascade whenever an upstream SF/QF pick changes afterward,
and is never regenerated unless the score is re-saved. The `prediction_finish_scores` snapshot
(`home_team_id`/`away_team_id`, from migration `0008_finish_score_team_ids.sql`) survives untouched
and is what the results-page UI already uses to recover (`resolveFinaleWinner` /
`deriveImplicitFinaleWinner` in `apps/web/src/features/results/domain/finale-winner.ts`) — the
scoring engine had no equivalent fallback.

**Fix:** `deriveTopFour()` now tries the explicit pick first (unchanged — also the only way a tied
scoreline can register a winner, via an explicit tie-break pick), then falls back to the finish-score
snapshot when no pick exists and the scoreline isn't tied. `buildBracket()` gained an optional
`finishScores` parameter (defaults to `{}`, so existing callers are unaffected); `deriveCard()` now
threads `input.finishScores` through. No DB/schema/web changes — `CardInputs['finishScores']` already
carried the needed snapshot.

**Rollout:** code fix only rescopes _future_ rescoring — production's existing `scores.breakdown` rows
still need a fresh `pnpm sync -- wc-2026` run (against prod `DATABASE_URL`) to actually recompute
everyone's `topFourPosition`. Verified via direct prod DB query (`postgres` MCP) that all 11 current
`prediction_finish_scores` rows already have the snapshot populated, so this one rescore fully
resolves the backlog — no separate backfill script.

- **Design/plan:**
  `docs/superpowers/specs/2026-07-19-sf-position-finish-score-fallback-design.md`,
  `docs/superpowers/plans/2026-07-19-sf-position-finish-score-fallback.md`.
```

- [ ] **Step 2: Run the full quality gate**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test`
Expected: all green. If `format:check` fails, run `pnpm format` and re-check.

- [ ] **Step 3: Stage and commit everything as a single commit**

```bash
git add packages/engine/src/bracket.ts packages/engine/src/derive.ts \
  packages/engine/src/bracket.test.ts packages/engine/src/score.test.ts \
  docs/PROGRESS.md \
  docs/superpowers/specs/2026-07-19-sf-position-finish-score-fallback-design.md \
  docs/superpowers/plans/2026-07-19-sf-position-finish-score-fallback.md
git commit -m "$(cat <<'EOF'
fix(engine): recover SF position bonus from finish-score snapshot

deriveTopFour() only read the explicit Final/Bronze knockout pick, which
the invalidation cascade deletes whenever an upstream SF/QF pick changes
and never regenerates. It now falls back to the prediction_finish_scores
team-identity snapshot, matching what the results-page UI already trusts.

Fixes a production bug where 0 of 11 scored predictions had any
topFourPosition > 0 despite correct Final predictions.
EOF
)"
```

- [ ] **Step 4: Verify the commit**

Run: `git status && git log -1 --stat`
Expected: working tree clean (aside from anything intentionally left out), single new commit with
all 7 files listed above.

---

## Post-implementation (not part of this plan's commit)

After this commit lands, production's stored scores are still stale until someone reruns
`pnpm sync -- wc-2026` against the production database — per established project convention, the
user runs production syncs themselves rather than an agent. Flag this clearly once the commit is
done; do not run it automatically.
