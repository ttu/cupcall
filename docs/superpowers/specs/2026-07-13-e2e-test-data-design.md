# E2E test data: static fixtures + varied seeded pool

**Date:** 2026-07-13
**Status:** approved, not yet implemented

## Problem

`apps/web/e2e/global-setup.ts` syncs the **real, live** `wc-2026` tournament data
(`pnpm sync -- wc-2026`) before every Playwright run. That data has `firstKickoff` in the past and
group+R32+R16+QF results already recorded (as of today). Consequences:

- `guest-full-prediction.spec.ts` only survives because it fills group scores via a dev-only
  no-lock-check bypass button.
- `bracket-picks.spec.ts` clicks real pick buttons, which are already `disabled` for R32/R16/QF
  ties that have recorded results — **this spec is broken today** on a genuinely fresh DB (which is
  what CI's Postgres service actually provides).
- The suite has no coverage at all for leaderboard, results, points-race, or the late-joiner
  partial-prediction UI, because every spec creates a single fresh user/pool and never sees
  another member's predictions.
- The dev seed scripts (`scripts/seed.ts` and friends) hand-craft a handful of users at fixed
  "accuracy tiers" — realistic-looking but not _varied_ the way real predictions are.

This work is **e2e-only** (not touching `scripts/seed*.ts` or dev-tools). It replaces the live
`wc-2026` sync with two static, date-independent fixtures and adds a seeded multi-member pool plus
new specs that exercise it.

## Production data reference (informs the generator, not queried at runtime)

Pulled read-only from the production DB (1 real pool, 11 predictions) to ground the variety
generator in real behavior:

- **Group scores**: frequency-weighted toward realistic low-scoring lines — top entries were 2-0
  (116), 2-1 (92), 1-1 (91), 0-2 (74), 1-2 (66), 3-0 (56), 0-1 (47), 1-0 (40), 0-3 (38), 3-1 (37),
  2-2 (31), 4-0 (27)… blowouts (5-0, 6-0) and 0-0 draws are rare tails.
- **Knockout picks**: concentrated on a "favorite" per tie but never unanimous — e.g. one QF had
  9 picks for the eventual winner vs 1-2 scattered upset picks; typical split across an 11-person
  pool was roughly 8:3 or 10:1, not 11:0.
- **Specials**: team-based bets (`groupTopScoringTeam`, `tournamentTopConcedingTeam`, …) cluster on
  2-4 popular answers; player-based bets (`topScorerPlayer`, `firstRedCardPlayer`,
  `finalDecisiveGoalPlayer`) are almost all distinct, weighted toward star players with a long
  tail; `finalDecidedByPenalties` split ~8:3 false:true; numeric bets (`highestMatchGoals`,
  `penaltyShootoutCount`) clustered in a small plausible range with rare outliers.

## Fixtures

Both copy the **full real shape** of `data/tournaments/wc-2026/` (48 teams, 12 groups, full R32
bracket, `players[]`) — same team/group/bracket/player data, just repointed to new tournament IDs
with different `firstKickoff` and `results.json` contents. No trimming: existing specs already
assume 12 groups / 16 R32 ties etc.

### `data/tournaments/e2e-open/`

- `tournament.json`: copy of wc-2026's, `firstKickoff` overridden to a far-future date
  (`2099-01-01T00:00:00Z`) so it can never elapse.
- `results.json`: empty (`matchResults: []`, no `knockout`, no `groupOrder`, no `answers`).
- Purpose: backs `guest-full-prediction.spec.ts` and `bracket-picks.spec.ts` — every pool created
  against it is `editable` forever, regardless of what real-world date CI runs on. Replaces
  `wc-2026` in `global-setup.ts`.

### `data/tournaments/e2e-seeded/`

- `tournament.json`: same copy, `firstKickoff` overridden to a far-past date
  (`2000-01-01T00:00:00Z`) — permanently locked, regardless of CI run date.
- `results.json`: the real wc-2026 group+R32+R16+QF results (already realistic, already copied)
  **plus synthesized SF/Final/Bronze** results carried forward consistently from the real QF
  winners (FRA, ESP, ENG, ARG per current production data) to produce a champion. SF pairings
  must follow the actual bracket feeder structure in `tournament.json` (determined at
  implementation time, not hardcoded here).
- `answers.firstRedCardPlayer` is deliberately **left unset** — a legitimate real state (no red
  card shown in the whole tournament) — so late joiners have exactly one genuinely open item to
  predict, instead of a tournament where literally everything is locked.
- Purpose: backs a seeded, pre-populated multi-member pool for leaderboard/results/points-race/
  late-joiner specs.

## Variety generator

A deterministic (fixed-seed PRNG, e.g. mulberry32) pure-function generator, informed by the
production stats above — not by live-querying production at seed time:

- **Group scores**: per match, per user, sample from a weighted scoreline table built from the
  observed histogram (2-0, 1-1, 2-1, 0-2, 1-2, 3-0, 0-1, 1-0, 0-3, 3-1, 2-2, 4-0, …). Independent
  per user, so variety emerges from sampling rather than hand-authored per-user tiers.
- **Bracket picks**: per tie, per user, weighted coin flip (~75/25 favorite/underdog, matching the
  8:3/10:1-ish splits observed) — not a fixed "this user always picks upsets" profile.
- **Specials**: team/player bets drawn from a weighted candidate pool (a few popular answers
  weighted heavier, long tail included); numeric bets sampled around an observed plausible center;
  `finalDecidedByPenalties` at ~70/30.

This generator gets a unit test (pure function, deterministic): same seed → same output; output
respects distribution shape (e.g., no user ever gets an impossible scoreline, bracket picks only
choose between the two actual participants).

## Seeded pool composition

`scripts/seed-e2e.ts` (new script, mirrors `scripts/seed.ts`'s structure/API usage):

1. Runs `syncTournament` for both `e2e-open` and `e2e-seeded`.
2. Creates one pool under `e2e-seeded` with **10 members**:
   - 1 fixed dev-login viewer (same pattern as `scripts/seed.ts`'s `DEV_CREATOR_TOKEN`), so new
     specs can log in deterministically.
   - 7 on-time members (`joinedAt` before `firstKickoff`) with full, generator-produced
     predictions across all categories.
   - 2 late joiners (`joinedAt` after `firstKickoff`) with predictions only for the one open item
     (`firstRedCardPlayer`) — everything else is locked for them by definition.
3. Rescoring runs as part of `syncTournament`'s existing rescore step, so `scores` are populated
   and the leaderboard reflects real point totals.

## New specs

Added to `apps/web/e2e/`:

- `leaderboard.spec.ts` — member ordering matches score totals; viewer sees own rank highlighted.
- `results.spec.ts` — results/points-race page renders resolved bracket, group order, and special
  bet outcomes for the completed `e2e-seeded` tournament.
- `late-joiner.spec.ts` — a late-joiner member sees the partial-prediction banner, only
  `firstRedCardPlayer` is editable, everything else shows as locked.

`global-setup.ts` is updated to sync `e2e-open` (for the two existing fill-in specs) and run
`seed-e2e.ts` (for the three new specs), replacing the `wc-2026` sync entirely.

## Out of scope

- `scripts/seed.ts` / `seed-current.ts` / `seed-ongoing.ts` (dev/demo seeding) are untouched.
- No changes to lock/late-joiner domain logic itself — this only exercises existing behavior with
  better fixture data.
