# Non-Roster Player Answer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing data-as-code sync pipeline robust for actual answers whose player isn't in the closed-roster prediction list (e.g. WC 2026 first red card → Sithole, RSA). Add cross-file validation in `sync.ts` so unknown player IDs in `results.json` fail fast with a clear error, and lock in the supported workflow with integration tests.

**Architecture:** No data-model or UI changes. The workflow is: admin adds the player to `tournament.json` → `players[]`, sets the answer in `results.json`, runs `pnpm sync -- <id>`. Today the sync flow already handles that correctly (display resolves through the updated `playerMap`, scoring trivially misses for every card). We add one new helper inside `scripts/sync.ts` that validates each `playerId` reference in `results.json` against the parsed `tournament.players[]` before any DB write, and surface it in `syncTournament`. We add two integration tests next to the existing `scripts/sync.test.ts` and one short admin section in `docs/features/results.md`.

**Tech Stack:** TypeScript, Vitest, pglite, Drizzle, Zod, pino. No new dependencies.

**Reference spec:** [`docs/superpowers/specs/2026-06-13-non-roster-player-answer-design.md`](../specs/2026-06-13-non-roster-player-answer-design.md)

---

## File Structure

**Modify:**

- `scripts/sync.ts` — add `assertResultsPlayerIdsKnown(tournament, actual)` and call it after both files parse, before `upsertTournamentDef`. Keeps the cross-file concern inside the one place that holds both objects.
- `scripts/sync.test.ts` — append two integration tests (happy path + guardrail).
- `docs/features/results.md` — append a short "Recording actual answers for non-roster players" subsection under a new "Special bets" heading.

**No files created.** The validation helper is small enough to live inline in `sync.ts`.

---

## Important context for the engineer

You are working in a TypeScript monorepo (pnpm + Turborepo). Run all commands from the repo root.

Project conventions (from `CLAUDE.md`):

- **TDD** — red → green → refactor. Write the failing test first; never write production code without a failing test waiting for it.
- **One commit per feature** — implementation + tests + docs all land in one atomic commit. The plan below holds steps until the final commit.
- **Vertical-slice architecture.** This change lives entirely inside the `scripts/` sync slice — no feature module boundaries are crossed.
- **Strict TypeScript.** No `any`, no untyped dicts.
- **In-memory pglite** for integration tests via `makeTestDb()` from `@cup/db/testing`. Existing tests in `scripts/sync.test.ts:23-50` show the pattern.
- **Quality gates before commit:** format, lint, typecheck, the new + existing tests must all pass. Use `pnpm test`, `pnpm typecheck`, `pnpm lint` (or whatever scripts the repo uses — see `package.json`).

Project layout knowledge you need:

- `scripts/sync.ts` is both the CLI entry (when executed directly) and a library function (`syncTournament`) used by tests. The top-of-file comment block documents this dual role.
- `data/tournaments/mini-2026/` is the existing test fixture (small synthetic tournament). The new tests will copy/mutate these files into a `tmp` dir at runtime instead of editing the canonical fixtures.
- `Tournament.players: Player[]` is part of `tournamentSchema`'s parsed output. `Player` is `{ id: PlayerId, name: string, team: TeamId }` (from `packages/engine/src/types.ts:15`).
- The `playerId()` brand-cast in `packages/engine/src/brand.ts:12` does NOT validate — it's just `s as PlayerId`. That's why we need an explicit cross-file check.
- All three player-kind result fields live in `ActualResults`:
  - `answers.firstRedCardPlayer?: PlayerId`
  - `answers.topScorerPlayer?: PlayerId`
  - `finalMatch?.decisiveGoalPlayer?: PlayerId`
    These are the three references the guardrail must validate.

What to leave alone:

- Don't edit any UI files. The display fallback in `apps/web/src/features/results/application/get-results-view.ts:737` (`resolveSpecialDisplay`) already does the right thing once the roster is updated.
- Don't change `tournamentSchema` or `resultsSchema` — the validation belongs in `sync.ts`, not in either schema alone (neither file knows the other).
- Don't touch the canonical fixtures (`data/tournaments/<id>/*.json`). Tests build their own scratch fixtures.

---

## Task 1: Failing test — guardrail rejects unknown `firstRedCardPlayer` ID

**Files:**

- Modify: `scripts/sync.test.ts` (append a new test inside the existing `describe('syncTournament integration', ...)` block, just before the final closing `});` on line 266)

This is the test that drives new code. We'll add the happy-path/regression test next.

- [ ] **Step 1.1: Add a tmpdir helper and one new test to `scripts/sync.test.ts`**

  Add the imports `mkdtempSync`, `writeFileSync`, `rmSync`, `cpSync`, and `readFileSync` to the existing `node:fs` import on line 8. Add `tmpdir` from `node:os`. Then append the test below inside the existing `describe` block — DO NOT remove or alter any existing test.

  Patch the import line first:

  ```ts
  // Before (line 8):
  import { join, dirname } from 'node:path';

  // After:
  import { join, dirname } from 'node:path';
  import { mkdtempSync, writeFileSync, rmSync, cpSync, readFileSync } from 'node:fs';
  import { tmpdir } from 'node:os';
  ```

  Then, immediately before the final `});` that closes the `describe('syncTournament integration', ...)` block (currently line 266), insert:

  ```ts
  it('rejects results.json that references a player ID not present in tournament.json players', async () => {
    // Build a scratch data dir that copies mini-2026 then rewrites results.json
    // with a player ID that does NOT exist in tournament.json's players[].
    const scratch = mkdtempSync(join(tmpdir(), 'sync-guardrail-'));
    try {
      cpSync(mini2026Dir, scratch, { recursive: true });

      const resultsPath = join(scratch, 'results.json');
      const results = JSON.parse(readFileSync(resultsPath, 'utf-8')) as {
        answers: Record<string, unknown>;
      };
      results.answers.firstRedCardPlayer = 'unknown-xyz';
      writeFileSync(resultsPath, JSON.stringify(results, null, 2));

      await expect(syncTournament(db, 'mini-2026', scratch)).rejects.toThrow(
        /unknown-xyz.*firstRedCardPlayer/,
      );

      // Nothing should have been persisted on rejection.
      const tournaments = await db.select().from(schema.tournaments);
      expect(tournaments).toHaveLength(0);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
  ```

- [ ] **Step 1.2: Run the test to confirm it fails**

  Run:

  ```bash
  pnpm vitest run scripts/sync.test.ts -t "rejects results.json that references a player ID not present"
  ```

  Expected: **FAIL**. The test should report something like "expected promise to reject" or report that `syncTournament` resolved successfully. (Today the brand cast `playerId('unknown-xyz')` accepts any string, so the sync silently succeeds.)

  If the test errors out for a different reason (e.g. import error, fs error), fix that first — the failure must be the assertion failure on `rejects.toThrow`.

---

## Task 2: Failing test — happy path: non-roster player resolves to flag + name

This test characterizes the workflow we want to lock in. It may already pass today (the existing pipeline supports it), but is essential as regression protection for the change in Task 3 and for the doc workflow.

**Files:**

- Modify: `scripts/sync.test.ts` (append another test after the one added in Task 1)

- [ ] **Step 2.1: Append the happy-path test**

  Inside the same `describe` block (still before the closing `});`), append:

  ```ts
  it('records and renders a non-roster player added to tournament.json mid-tournament', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'sync-happy-'));
    try {
      cpSync(mini2026Dir, scratch, { recursive: true });

      // 1. Add a brand-new player to tournament.json that no card has predicted.
      const tournamentPath = join(scratch, 'tournament.json');
      const tournament = JSON.parse(readFileSync(tournamentPath, 'utf-8')) as {
        players: Array<{ id: string; name: string; team: string }>;
        teams: Array<{ id: string }>;
      };
      const existingTeamId = tournament.teams[0]?.id;
      if (!existingTeamId) throw new Error('mini-2026 has no teams — fixture invariant broken');
      const newPlayerId = 'test-nonroster';
      tournament.players.push({
        id: newPlayerId,
        name: 'Test Nonroster',
        team: existingTeamId,
      });
      writeFileSync(tournamentPath, JSON.stringify(tournament, null, 2));

      // 2. Set firstRedCardPlayer in results.json to that brand-new player.
      const resultsPath = join(scratch, 'results.json');
      const results = JSON.parse(readFileSync(resultsPath, 'utf-8')) as {
        answers: Record<string, unknown>;
      };
      results.answers.firstRedCardPlayer = newPlayerId;
      writeFileSync(resultsPath, JSON.stringify(results, null, 2));

      // 3. Seed a pool + one card that predicts an EXISTING roster player for that bet.
      const existingPlayerId = tournament.players.find((p) => p.id !== newPlayerId)?.id;
      if (!existingPlayerId)
        throw new Error('mini-2026 has no other players — fixture invariant broken');

      const owner = await createUser(db, {
        email: `owner-${crypto.randomUUID()}@x.com`,
        displayName: 'Owner',
      });
      const user = await createUser(db, {
        email: `user-${crypto.randomUUID()}@x.com`,
        displayName: 'Alice',
      });
      const pool = await createPool(db, {
        tournamentId: 'mini-2026',
        ownerId: owner.id,
        name: 'Non-roster Pool',
        inviteTokenHash: `h-${crypto.randomUUID()}`,
      });

      const [predRow] = await db
        .insert(schema.predictions)
        .values({ poolId: pool.id, userId: user.id, tournamentId: 'mini-2026' })
        .returning();
      if (!predRow) throw new Error('No prediction row returned');

      await db
        .insert(schema.predictionSpecials)
        .values([
          { predictionId: predRow.id, betKey: 'firstRedCardPlayer', value: existingPlayerId },
        ]);

      // 4. Sync — must succeed without throwing. Scoring outcome of the
      //    sparse card is not the focus here; we assert persistence below.
      await syncTournament(db, 'mini-2026', scratch);

      // 5. The persisted tournament definition includes the new player.
      const [tRow] = await db.select().from(schema.tournaments);
      const def = tRow?.definition as { players: Array<{ id: string; name: string }> } | null;
      expect(def?.players.find((p) => p.id === newPlayerId)?.name).toBe('Test Nonroster');

      // 6. The persisted actual answer is the new player ID.
      const answers = await db.select().from(schema.actualAnswers);
      const redCardAnswer = answers.find((a) => a.betKey === 'firstRedCardPlayer');
      expect(redCardAnswer?.value).toBe(newPlayerId);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
  ```

  Note: this test exercises the data path end-to-end at the sync layer. The UI display layer (`resolveSpecialDisplay`) is already covered by `apps/web/src/features/results/application/get-results-view.test.ts`; we're not re-testing it here. The new player landing in `tournament.definition.players` is sufficient — `playerMap.get(newPlayerId)` will resolve at view-build time exactly the same way it does for any other player.

- [ ] **Step 2.2: Run the test to confirm it passes (characterization)**

  Run:

  ```bash
  pnpm vitest run scripts/sync.test.ts -t "records and renders a non-roster player"
  ```

  Expected: **PASS**. This proves the workflow already works at the data layer today. (If it fails, that's a real surprise — stop and investigate; do not move on.)

---

## Task 3: Implement the cross-file guardrail in `sync.ts`

**Files:**

- Modify: `scripts/sync.ts` — add helper + call it before the first DB write.

- [ ] **Step 3.1: Add the validation helper**

  In `scripts/sync.ts`, just below the existing `import` block (after line 27) and above `const logger = pino({ name: 'sync' });` (line 28), add:

  ```ts
  import type { Tournament, ActualResults } from '@cup/engine';
  ```

  (You can fold this into the existing `@cup/engine` import on line 15 if it already imports types — the existing line is:

  ```ts
  import type { GroupId, TeamId } from '@cup/engine';
  ```

  Make it:

  ```ts
  import type { GroupId, TeamId, Tournament, ActualResults } from '@cup/engine';
  ```

  Do NOT introduce a second import line for `@cup/engine`.

  Then, immediately above the `export async function syncTournament(...)` declaration (currently line 47), add the helper:

  ```ts
  /**
   * Verifies that every player ID referenced in `results.json` exists in
   * `tournament.json`'s players[]. Catches the typical typo / missing-roster-
   * update failure before any DB write.
   *
   * Bet keys covered:
   *   - answers.firstRedCardPlayer
   *   - answers.topScorerPlayer
   *   - finalMatch.decisiveGoalPlayer
   */
  function assertResultsPlayerIdsKnown(tournament: Tournament, actual: ActualResults): void {
    const knownPlayerIds = new Set<string>(tournament.players.map((p) => p.id));

    const references: Array<{ betKey: string; playerId: string | undefined }> = [
      { betKey: 'firstRedCardPlayer', playerId: actual.answers.firstRedCardPlayer },
      { betKey: 'topScorerPlayer', playerId: actual.answers.topScorerPlayer },
      { betKey: 'finalMatch.decisiveGoalPlayer', playerId: actual.finalMatch?.decisiveGoalPlayer },
    ];

    for (const { betKey, playerId: pid } of references) {
      if (pid !== undefined && !knownPlayerIds.has(pid)) {
        throw new Error(
          `results.json references unknown player id "${pid}" in ${betKey}. ` +
            `Add the player to tournament.json → players[] (with id, name, team), or fix the typo in results.json.`,
        );
      }
    }
  }
  ```

- [ ] **Step 3.2: Call the helper at the top of `syncTournament`**

  Right after the existing `const actual = resultsSchema.parse(resultsRaw);` line (currently line 60), insert:

  ```ts
  // 2b. Cross-file validation: any playerId reference in results.json must
  //     exist in tournament.json's players[] (the per-schema brand cast is
  //     non-validating).
  assertResultsPlayerIdsKnown(tournament, actual);
  ```

  Place it BEFORE step 3 (which extracts `rawMeta`) and well before any DB write. The intent: fail fast, before any side effects.

- [ ] **Step 3.3: Run the guardrail test — confirm it now passes**

  ```bash
  pnpm vitest run scripts/sync.test.ts -t "rejects results.json that references a player ID not present"
  ```

  Expected: **PASS**. The test should report green.

- [ ] **Step 3.4: Run the full sync test file to confirm no regressions**

  ```bash
  pnpm vitest run scripts/sync.test.ts
  ```

  Expected: **all tests pass** (the original 6 + both new ones = 8 tests).

---

## Task 4: Documentation — admin section in `results.md`

**Files:**

- Modify: `docs/features/results.md`

- [ ] **Step 4.1: Find the end of the file and append a new section**

  Open `docs/features/results.md`, scroll to the end, and append:

  ````markdown
  ## Special bets — recording actual answers

  Actual answers for special bets live in
  `data/tournaments/<tournamentId>/results.json` under `answers` (or, for the
  final's `decisiveGoalPlayer`, under `finalMatch`). The sync flow
  (`pnpm sync -- <tournamentId>`) reads both `tournament.json` and
  `results.json`, validates them, upserts the DB, and rescores every card.

  ### When the actual player isn't in the predefined roster

  Some player-kind bets (e.g. `firstRedCardPlayer`) are closed-roster: members
  picked from a dropdown of `Tournament.players`. When the real-world answer is
  a player who isn't in that roster:

  1. Add the player to `tournament.json` → `players[]`:
     ```json
     { "id": "rsa-sithole", "name": "Sithole", "team": "RSA" }
     ```
  ````

  2. Set the bet key in `results.json` → `answers`:
     ```json
     "firstRedCardPlayer": "rsa-sithole"
     ```
  3. Run `pnpm sync -- <tournamentId>`.

  This is safe even after predictions lock: predictions are sealed, so growing
  the roster doesn't change anyone's pick. The results view resolves the
  player ID through the updated roster, so the flag + name render correctly.
  No card can match, so every member's special-bet row scores `missed` for
  that bet.

  Sync fails fast if a player ID in `results.json` isn't in
  `tournament.json` → `players[]` — see
  `scripts/sync.test.ts` for the canonical happy-path + guardrail examples.

  ```

  Verify the indentation and code-fence nesting render correctly by previewing the file in your editor.
  ```

---

## Task 5: Final quality gates

- [ ] **Step 5.1: Run the project's quality gates**

  Run each in sequence; do not move on until all pass.

  ```bash
  pnpm typecheck
  pnpm lint
  pnpm test
  ```

  (If any command name differs, check `package.json` scripts. Don't bypass a failure — fix the root cause. Don't use `--no-verify` to skip pre-commit hooks.)

  Expected: each command exits 0. If anything fails, fix it; never commit red.

---

## Task 6: Commit

- [ ] **Step 6.1: Stage exactly the files this plan touched**

  ```bash
  git add scripts/sync.ts scripts/sync.test.ts docs/features/results.md docs/superpowers/specs/2026-06-13-non-roster-player-answer-design.md docs/superpowers/plans/2026-06-13-non-roster-player-answer.md
  ```

  Do NOT use `git add -A` — there may be unrelated uncommitted work in the tree.

- [ ] **Step 6.2: Verify staged contents**

  ```bash
  git status
  git diff --cached --stat
  ```

  Expected: exactly the five files above appear under "Changes to be committed", nothing else.

- [ ] **Step 6.3: Commit with a single feature commit (per project rule: one commit per feature)**

  ```bash
  git commit -m "$(cat <<'EOF'
  feat(sync): guardrail unknown player IDs in results.json

  Adds a cross-file check in scripts/sync.ts so any playerId referenced in
  results.json (firstRedCardPlayer, topScorerPlayer, finalMatch.decisiveGoalPlayer)
  must exist in tournament.json's players[]. Catches the typo / missing-roster-
  update failure before any DB write. Locks in the supported workflow for
  non-roster actual answers (add player to tournament.json, set ID in
  results.json, sync) with happy-path + guardrail integration tests, and
  documents the workflow in docs/features/results.md.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  EOF
  )"
  ```

- [ ] **Step 6.4: Confirm the commit landed**

  ```bash
  git log -1 --stat
  ```

  Expected: one new commit on top of `main`, touching the five files listed above and nothing else.

---

## Notes for the executor

- **Order matters.** Task 1 must fail before Task 3 makes it pass. Don't write the guardrail before the test exists — that's not TDD.
- **Tests own their scratch dirs.** Both new tests use `mkdtempSync(join(tmpdir(), ...))` and clean up in `finally`. Do not point them at the real fixture path with mutations; the canonical fixtures must remain pristine.
- **The Sithole production fix is NOT in this plan.** That's a separate one-line edit to `data/tournaments/wc-2026/{tournament,results}.json` + `pnpm sync`, shipping in its own commit (per the spec's "Sequencing" section, which the user explicitly approved as "separate").
- **No UI change is expected.** If you find yourself editing anything under `apps/web/src/features/results/ui/`, stop and re-read the spec — you've gone outside scope.
