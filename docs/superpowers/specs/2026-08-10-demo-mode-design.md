# Demo mode

**Date:** 2026-08-10
**Status:** approved, not yet implemented

## Problem

The production app has no way for a prospective user (or anyone without a pool invite) to see what
the product actually looks like with real, populated data — a leaderboard, live-ish results,
individual prediction cards — without signing up and joining a pool. We want a public, read-only
"live demo" that showcases the app using **real** WC 2026 tournament data and **real** prediction
behavior (from the one real production pool, `f20e59af-63e8-4389-b101-8e5cf84656a1`, "DS MM 2026",
11 members), at a few different points in the tournament's lifecycle — group stage ongoing,
knockout stage ongoing, and completed — so a visitor can see the product at whichever stage is most
relevant to them.

Constraints:

- Real member display names in that pool are mostly pseudonyms already (`Tomi`, `Hexa`, `Sepi`,
  `TNH81`, `Paasio`, …) but every member has a real personal Gmail address attached, and one
  display name (`Paasio`) is a real surname. None of that may appear in the public demo.
- `matches`/results are stored **per tournament**, and a tournament can be referenced by multiple
  pools. Mutating a shared tournament's results to "rewind" it for a demo checkpoint would corrupt
  that view for any other pool using the same tournament — not viable for `wc-2026` since it's the
  tournament the real pool uses.
- Whatever we build must be safe to expose on the public internet with no auth, and must not open a
  mutating action to anonymous visitors.

## Non-goals

- Visitors do **not** log in, edit predictions, join the demo pools, or see any authenticated page
  (predict page, pool settings, owner tools). Read-only only.
- No dynamic "pick any date" slider. Three fixed checkpoints, chosen up front.
- No changes to the real `wc-2026` tournament, the real pool `f20e59af…`, or any real user account.

## Architecture

Three independent, statically-seeded tournament+pool pairs, each permanently viewable via the
**existing** unauthenticated `/view/[token]` route group (`apps/web/src/app/(view)/view/[token]/`,
already in production: pool home, results & points race, member cards). No new read-pipeline code —
every checkpoint is just a different pool pointed at a different tournament, both already-supported
shapes.

```
tournament wc-2026-demo-groups     ──┐
tournament wc-2026-demo-knockout   ──┼── each: pool "WC 2026 Demo — <stage>"
tournament wc-2026-demo-completed  ──┘        view_token = demo-groups / demo-knockout / demo-completed
                                               11 anonymized guest members, real (anonymized) predictions
```

Because each checkpoint is its own tournament row, all three are simultaneously and permanently
browsable — no runtime state to flip, nothing for concurrent visitors to clobber.

### 1. Three tournament fixtures (real data, truncated)

New folders under `data/tournaments/`, each pairing a copy of the real `wc-2026/tournament.json`
(unchanged: same 48 teams, 12 groups, bracket, players) with a `results.json` truncated to a real
cutoff moment from the actual 2026 World Cup calendar:

| Tournament id            | Cutoff (real kickoff time) | Shows                                              |
| ------------------------ | -------------------------- | -------------------------------------------------- |
| `wc-2026-demo-groups`    | `2026-06-20T00:00:00Z`     | Group stage partway through (~matchday 2 of 3)     |
| `wc-2026-demo-knockout`  | `2026-07-08T00:00:00Z`     | Groups done, R32+R16 resolved, QF/SF/Final open    |
| `wc-2026-demo-completed` | none (full real results)   | Full real tournament, identical to `wc-2026` today |

A generation script, `scripts/generate-demo-fixtures.ts`, builds the two truncated `results.json`
files from the real `data/tournaments/wc-2026/results.json`: keep `matchResults`/`knockout` entries
with `kickoff <= cutoff`, derive `groupOrder` only for groups whose all 6 matches are `<= cutoff`
(mirrors the existing dev-tools `applyGroupStageDayAction` truncation logic, but writing static
files instead of mutating a DB), and derive the `answers` fields that are safe to know at that point
(`highestMatchGoals` from played matches only; `groupTopScoringTeam`/`groupTopConcedingTeam` only
once all groups are done). The script is run once to produce the committed fixture files — it is
not part of the runtime app. `wc-2026-demo-completed` is simply a copy of the real files with the
`tournamentId` renamed.

These three tournaments are loaded via the **existing, unchanged** `pnpm sync -- <id>` pipeline —
no new sync/schema code.

### 2. Anonymized prediction fixture

The real pool's predictions are the interesting part of the demo (varied group scores, bracket
picks, special bets across 11 people) — we want to keep them, just detached from the real accounts.

- **Extraction (read-only, one-time):** use the existing `buildPoolExport` function
  (`apps/web/src/features/pools/application/pool-backup.ts`, the same code the owner-facing pool
  export button already calls) against production pool `f20e59af-63e8-4389-b101-8e5cf84656a1` to
  get its `PoolBackup` JSON — `{ userId, displayName, prediction }[]`. This mirrors exactly what an
  owner can already do from the UI; no new prod access path.
- **Anonymization:** a fixed mapping from each real `userId` to a brand-new synthetic id
  (e.g. `demo-user-1` … `demo-user-11`) and a football-themed nickname (e.g. "El Nino", "Falcon9",
  "OffsideOllie", …). Real `displayName`s and `userId`s are discarded entirely; the schema carries
  no email field to begin with. The result is committed as
  `data/demo/demo-pool-backup.json`, matching the existing `PoolBackupSchema` shape exactly.
- This one file is **reused unchanged across all three checkpoints** — predictions don't change
  between checkpoints, only which results are known/scored does.

### 3. Seeding script

`scripts/seed-demo.ts`, following the shape of `scripts/seed-e2e.ts`:

1. Run `pnpm sync` for the 3 demo tournament ids (via the same sync module `scripts/sync.ts`
   exports, not a shell-out).
2. For each of the 3 tournaments:
   - `createGuestUser` a dedicated demo-owner (display name "Demo Host").
   - `createPool(db, { tournamentId, ownerId: demoHost.id, name: 'WC 2026 Demo — <stage>' })` (no
     invite token — invite-based joining stays disabled for these pools).
   - `rotateViewToken(db, pool.id, '<fixed-token>')` — sets the human-readable, permanent tokens
     `demo-groups` / `demo-knockout` / `demo-completed` (existing function, arbitrary string,
     enforced unique by the existing DB index).
   - `addMember(db, pool.id, demoHost.id, …)` so the pool has a valid owner-member.
   - `restorePoolFromBackup(db, pool.id, tournamentId, demoBackup, demoHost.id)` — the **existing**
     restore function already used by pool import: because every `userId` in the fixture is new,
     this creates 11 fresh guest users (same 11 nicknames in every one of the 3 pools) and writes
     their group scores / knockout picks / finish scores / special bets verbatim.
   - Rescore every restored prediction (`deriveCard` + `scoreCard` + `upsertScore`, same pattern
     `importPool`'s action already runs after a restore) against that tournament's actual results.
3. Idempotent: reruns should reset-and-reseed each demo pool rather than duplicate it (delete demo
   pools by their fixed view tokens if present, then recreate) — same "wipe and reseed" pattern
   `scripts/seed.ts` already uses for its dev pool.

This script is **not** run automatically. It's a `pnpm seed:demo` command you run yourself against
production when ready — same trust boundary as any other prod-writing script in this repo.

### 4. Front end

- **`apps/web/src/app/(view)/DemoBanner.tsx`** — a persistent banner rendered above every
  `/view/demo-*` page with stage links (Group stage / Knockout stage / Completed); the current
  checkpoint's link is highlighted. This is the only stage switcher —
  `apps/web/src/app/(view)/demo/page.tsx` redirects to `/view/demo-completed` (kept for old
  links/bookmarks), since the banner already exposes all three checkpoints on every demo page.
- **Landing page** (`apps/web/src/app/page.tsx`) — add a "View live demo" link/button pointing at
  `/demo`, alongside the existing guest/email sign-in options.
- The three `/view/<token>` destinations need **zero** changes — pool home, results & points race,
  and member cards already work for any pool reachable by view token.

## Testing

- **`scripts/generate-demo-fixtures.ts`** — unit tests: given a fixed real `results.json` fixture
  and a cutoff, verifies match/knockout truncation and `groupOrder`/`answers` derivation (same shape
  of test as the existing `prediction-variety.ts` generator tests).
- **`scripts/seed-demo.ts`** — one integration test against the pglite test DB: runs the seed flow
  end-to-end (sync fixtures + seed one demo tournament/pool) and asserts the pool is reachable by
  its fixed view token, has 11 members with the anonymized names, and predictions are scored.
- **E2E**: one Playwright spec, `apps/web/e2e/demo.spec.ts`, using the same static `wc-2026-demo-*`
  fixtures seeded into the E2E database (extending `global-setup.ts`'s existing seed step) —
  navigates `/demo` → each checkpoint link → asserts leaderboard renders, no auth required, no
  edit controls present.
- No changes needed to existing tests — the `(view)` route group and pool backup/restore code are
  exercised as-is, not modified.

## Rollout

1. Land the fixture-generation script + 3 committed tournament fixtures + anonymized prediction
   fixture + seed script + `/demo` page + landing-page link, all in one commit (per this repo's
   one-commit-per-feature convention), with tests.
2. You run `pnpm seed:demo` against production yourself once ready.
3. If real WC 2026 results in `data/tournaments/wc-2026/` are ever corrected retroactively (via the
   `update-results` skill), the demo fixtures are **not** auto-updated — they're a frozen snapshot
   by design. Re-run `scripts/generate-demo-fixtures.ts` + `pnpm seed:demo` manually if a refresh is
   ever wanted.
