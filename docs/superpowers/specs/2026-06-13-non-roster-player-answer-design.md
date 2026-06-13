# Non-roster player as actual answer — design

**Date:** 2026-06-13
**Status:** Approved (pending implementation)

## Problem

A special bet whose actual answer is a player who isn't in the predefined
roster has no clean way to be recorded today. Concrete trigger: at WC 2026 the
first red card was given to South Africa's Sithole — a player not present in
`data/tournaments/wc-2026/tournament.json`'s `players[]`.

`firstRedCardPlayer` is a closed-roster bet (dropdown only, `allowFreeText`
unset), so:

- No member could pick Sithole — every card will miss.
- The actual answer still needs to render correctly in the results view
  (flag + name), the way every other player answer does.

The same situation will recur for any player-kind special bet
(`firstRedCardPlayer`, `topScorerPlayer`, `finalDecisiveGoalPlayer`) in any
future tournament — this is not a one-off.

## Decision

Use the existing data-as-code pipeline. When the actual answer is a
non-roster player, the admin:

1. Adds the player to
   `data/tournaments/<id>/tournament.json` → `players[]`
   (e.g. `{ "id": "rsa-sithole", "name": "Sithole", "team": "RSA" }`).
2. Sets the answer in
   `data/tournaments/<id>/results.json` → `answers.firstRedCardPlayer:
"rsa-sithole"` (or the appropriate bet key).
3. Runs `pnpm sync -- <tournamentId>`.

The sync upserts the new tournament definition (roster now includes the
player), upserts the actual answer, then rescores. All cards get
`hit: 'missed'` for that bet. The results view's `resolveSpecialDisplay`
looks up the player ID against the updated roster and renders the flag +
name like any other player answer — no UI changes required.

### Why this is safe for a locked tournament

- Predictions are already locked. The pick UI is no longer reachable, so
  expanding `def.players` doesn't change anyone's stored pick.
- Card-import validation
  (`packages/schemas/src/card-io.ts:247`) only checks that referenced
  player IDs exist in the _current_ roster, so old cards still validate
  and a hypothetical new import would also validate against the expanded
  roster.
- Scoring is exact-ID equality; no card references the new player ID, so
  everyone correctly scores `missed`.

## Guardrail: cross-file validation in sync

Today `scripts/sync.ts` parses `tournament.json` and `results.json`
independently. Each player ID in `results.json` is brand-cast to
`PlayerId` without checking it exists in `tournament.json`'s `players[]`.

Add a cross-file check after both files parse, before
`upsertTournamentDef` / `upsertTournamentResults`:

- For each player-kind reference in `results.json`:
  - `answers.firstRedCardPlayer`
  - `answers.topScorerPlayer`
  - `finalMatch.decisiveGoalPlayer`
- Verify the ID exists in the parsed `tournament.players[]`. If not, fail
  the sync with a message naming the bet key, the unknown player ID, and
  a hint: _"Add the player to `tournament.json` → `players[]`, or fix the
  typo in `results.json`."_

This catches the failure mode "I edited `results.json` but forgot to add
the player to `tournament.json`" before bad data lands in the DB.

The check belongs in `scripts/sync.ts` (where the two files are first
held together), not in either schema in isolation — neither file knows
about the other on its own.

## Out of scope

- **Free-text player answers.** We're not allowing arbitrary strings as
  the actual answer; the answer must be a real `PlayerId` referencing a
  roster entry. The roster is the single source of truth for the
  flag + name display, and free-text would bypass it.
- **A structured `{ name, teamId }` non-roster shape.** Considered and
  rejected: doubles the representation, forces every consumer to handle
  both forms, with no benefit over just adding the player to the roster.
- **An admin UI for editing actual answers.** Out of scope for this
  change; the data-as-code workflow is the entry point.

## Testing

Two integration tests around `syncTournament` (the function exported from
`scripts/sync.ts`, tested via pglite):

1. **Happy path — non-roster player as actual answer.**
   - Fixture tournament with roster players `[A, B, C]` and a pool with a
     few cards, all predicting `firstRedCardPlayer = A` (or another
     existing roster ID — never `D`).
   - Call `syncTournament` with a `tournament.json` updated to include a
     new player `D` and a `results.json` setting
     `answers.firstRedCardPlayer = D`.
   - Assert via `getResultsView` for the pool: the special-bet row for
     `firstRedCardPlayer` shows `actualAnswerDisplay = "D"` (resolved
     through the roster, not the raw ID); every card's
     `firstRedCardPlayer` scores `hit: 'missed'` with
     `pointsAwarded: 0`.

2. **Guardrail — unknown player ID.**
   - `results.json` references `firstRedCardPlayer = "unknown-xyz"` that
     isn't in `tournament.json`'s `players[]`.
   - Assert: `syncTournament` rejects with an error that names the bet
     key and the unknown ID; nothing is persisted (DB state unchanged).

The happy-path test locks in the recurring workflow; the guardrail test
locks in the new validation.

## Documentation

Add a short _"recording a non-roster actual answer"_ section to
`docs/PROGRESS.md` (or a small admin guide), describing the three-step
workflow above and pointing at the happy-path test as the canonical
example. One paragraph is enough.

## Sequencing

Two separate commits, in this order:

1. **Sithole fix (independent).** Add `rsa-sithole` to
   `data/tournaments/wc-2026/tournament.json`'s `players[]`; set
   `answers.firstRedCardPlayer = "rsa-sithole"` in `results.json`. Run
   `pnpm sync -- wc-2026`. No code changes.
2. **Permanent solution (this spec).** Cross-file sync validation +
   integration tests + admin-workflow doc.

Order is deliberate: the immediate fix unblocks the results view today
and exercises the workflow once before the test suite encodes it.
