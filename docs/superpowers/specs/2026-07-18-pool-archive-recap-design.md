# Pool Archive Recap — Design

## Purpose

Upgrade the plain `/pools/[id]/archive` standings list (shipped in the "Pool Result Archive" feature)
into a richer, magazine-style tournament recap: a champion hero card, four highlight stats, a points
race chart, a lead-changes timeline, and summary stat tiles — while preserving the original feature's
core guarantee that everything survives a member's future account deletion.

Reference: a mockup screenshot supplied by the user (hero card with champion/score, "Tournament
highlights" panel, "The race, start to finish" line chart, "Lead changes" timeline, 4 stat tiles).
Treated as a literal target for layout and feature set, with two explicit simplifications (see
Non-goals).

## Why this needs new frozen data, not just new UI

The shipped archive only stores `rank`/`pointsTotal`/`breakdown` per member — enough for a standings
list, not enough for this page. The race chart, "biggest riser," "lead changes," and "champion pick %"
all need per-member _prediction picks_ (final-winner pick, group-match guesses, knockout picks), which
only exist in the live `predictions`/`prediction_*` tables today. Reading those live at page-view time
would work at first but silently degrade once a member deletes their account (their prediction rows
cascade away with them) — defeating the point of an archive whose whole purpose is surviving exactly
that event.

So: everything derived from _this pool's members' picks_ is computed once, at archive time, and frozen
into the archive tables. Everything derived from _tournament-level facts_ (who won the final, the
final score, total matches played) is read live from `getActualResults`/`getTournamentById` —
tournament data is never deleted by any user action, so there's no permanence risk there, and reading
it live avoids duplicating it into every pool's archive.

## Data model (extends the existing `pool_archives` / `pool_archive_entries` tables)

New migration, two new nullable columns (nullable so any pool archived before this feature — or a
pool re-archived without race data available — degrades to "no recap yet" instead of needing a
backfill):

```sql
alter table pool_archives add column recap jsonb;
alter table pool_archive_entries add column points_history jsonb;
alter table pool_archive_entries add column stage_reasons jsonb;
```

```ts
export type ChampionPickHighlight = {
  teamId: TeamId;
  teamName: string;
  count: number;
  total: number;
};

export type BestSingleMatchHighlight = {
  matchId: MatchId;
  description: string; // e.g. "ARG 3-0 SEN"
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  exactCount: number;
  total: number;
};

export type BiggestUpsetHighlight = {
  matchId: MatchId;
  round: string; // e.g. "Round of 16"
  winnerTeam: string;
  loserTeam: string;
  pickCount: number; // how many members picked the (upset) winner
  total: number;
};

export type PoolArchiveRecap = {
  stages: string[]; // parallel to each entry's pointsHistory/stageReasons
  championPick: ChampionPickHighlight | null;
  bestSingleMatch: BestSingleMatchHighlight | null;
  biggestUpset: BiggestUpsetHighlight | null;
  predictionsMade: number;
  exactScoreRatePercent: number;
};
```

`pool_archive_entries` gains, per member:

- `pointsHistory: number[] | null` — cumulative points at each stage checkpoint (frozen output of the
  existing `buildRaceChartData`/`buildDailyChartPlayers` for that member, called once at archive
  time).
- `stageReasons: (string | null)[] | null` — one short, template-filled reason per stage transition
  (see "Stage reasons" below), `null` entries where nothing notable happened.

**Stage labels**: `buildRaceChartData` computes date-based labels (e.g. "Jul 19") when real match
dates are available (the normal case for a finished tournament being archived), not named milestones
("MD1"/"R16"/"QF"). This spec **reuses the existing, already-tested `buildRaceChartData` as-is** rather
than building a second named-milestone variant — the frozen race chart will show date labels, not
"MD1/MD2/MD3/R16/QF/SF/Final" as in the mockup. Flagged as a deliberate simplification (see
Non-goals), not an oversight.

## Archive-time computation

All of this runs once, inside `archivePool`, using repository functions that **already exist** (no new
`packages/db` query functions needed beyond passing the new columns through
`upsertPoolArchive`/`getPoolArchiveWithEntries`):

1. **Race chart freeze** — call the existing `buildRaceChartData(leaderboard, null, { allMatches,
poolGroupScores, def, knockoutPicks })` (already used live on the pool/results pages). Freeze
   `chartStages` into `recap.stages`, and each player's `chartPlayers[].points` into that member's
   `pointsHistory`.
2. **Champion pick** — from `getKnockoutPicksByPool`, filter
   `bracketMatchKey === tournament.definition.bracket.finalMatch` (not a hardcoded `'final'` string —
   the actual key, read from the tournament's own bracket definition), group by `winnerTeamId`, take
   the most-picked team and its count. (This is "most popular pick," matching the mockup's "6 of 10
   backed Argentina" — not "6 of 10 were correct.") Tie-break on equal counts: the team appearing first
   in `Tournament.teams` order (deterministic, matches no particular narrative significance — just
   needs to be stable). Team names for display come from `Tournament.teams.find(t => t.id ===
teamId)?.name`; `Team` has no separate short-code field — the `TeamId` string itself IS the 3-letter
   code the UI already uses (`TeamBadge`/`teamFlag` key directly off it).
3. **Best single match — group-stage matches only.** Knockout rounds before the Final only ever
   capture a _winner pick_ (`getKnockoutPicksByPool`), never a score guess — there is no "exact
   scoreline" to agree on for R16/QF/SF, and Final/Bronze score guesses (`getFinishScoresByPool`) carry
   their own team-identity resolution complexity (see `docs/PROGRESS.md`'s 2026-07-16 entry) that isn't
   worth taking on for a highlight stat. So: for every **group** match with a final score (via
   `getMatchesForTournament` filtered to `stage === 'group'` + `getGroupScoresByPool`), count members
   whose guess matches exactly (reusing the existing `computeHit` from `shared/race-chart.ts`); keep
   the highest-agreement match. Tie-break on equal counts: earliest `kickoff` wins. `null` if no group
   match has any exact guesses.
4. **Biggest upset called** — for every knockout match (`stage !== 'group'`) with `status === 'final'`,
   resolve the actual winner via the existing `resolveActualWinner(match)` helper (`apps/web/src/
features/results/domain/knockout-match-winner.ts`) — **not** `match.winnerTeamId` directly, which is
   only populated for penalty-shootout wins; `resolveActualWinner` already falls back to comparing
   goals for regulation/extra-time wins. Count members whose `getKnockoutPicksByPool` pick for that
   `bracketMatchKey` matches the resolved winner; keep the tie with the **lowest nonzero** count (least
   popular correct pick). The round label for display is `match.stage` mapped to a friendly name
   (`R16` → "Round of 16", `QF` → "Quarterfinal", `SF` → "Semifinal", `Final` → "Final", `bronze` →
   "Bronze Match"). Tie-break on equal counts: earliest `kickoff` wins. If every resolved tie has zero
   correct picks or there are no resolved knockout ties, `biggestUpset` is `null`.
5. **Predictions made** — sum of `getGroupScoresByPool` + `getKnockoutPicksByPool` +
   `getFinishScoresByPool` + `getSpecialBetsByPool` row counts for the pool.
6. **Exact-score rate** — exact-score group-match guesses ÷ total group-match guesses, pool-wide, as a
   percentage.
7. **Stage reasons** (per member, per stage transition) — template-filled, not free-text generated:
   - **Group-stage stages**: `"N exact score(s)"` — count of that member's exact hits among matches
     that went final within that stage's date window.
   - **Knockout-round stages** (R16/QF/SF-equivalent, whatever `buildRaceChartData`'s date-based
     windows land on): short team codes (the `TeamId` itself, e.g. `"ARG"`) of ties resolved in that
     window where this member's `getKnockoutPicksByPool` pick matches `resolveActualWinner(match)`
     (same helper as item 4 — never `match.winnerTeamId` directly), e.g. `"ARG, BRA advance as
picked"`; `null` if none.
   - **Final stage**: `"Champion pick correct"` if their pick for
     `tournament.definition.bracket.finalMatch` matches `resolveActualWinner` on that match; otherwise
     `null`.
   - Any stage with no applicable reason gets `null` (view-side falls back to a plain points-delta
     phrasing — see below).

New application-layer file: `apps/web/src/features/pool-archive/application/build-recap.ts` —
`buildPoolArchiveRecap(params): Promise<{ recap: PoolArchiveRecap; entryExtras: Map<UserId,
{ pointsHistory: number[]; stageReasons: (string | null)[] }> }>`, called from `archivePool` and merged
into the existing `upsertPoolArchive` call.

## Read-side derivations (from frozen data only, computed at view time)

Two mockup elements are fully derivable from `pointsHistory` + `stageReasons` — no extra storage:

- **Biggest riser** — compute rank-at-each-stage across all members from their `pointsHistory` (ties at
  a given stage broken by `displayName` ascending, matching `getLeaderboard`'s existing tiebreak
  convention for determinism); find the single stage-to-stage transition with the largest rank
  improvement pool-wide. Tie-break on equal-magnitude improvements: earliest stage index wins (the
  first such transition chronologically). Rendered as
  `"<name> climbed from <rank> to <rank> — <stageReason or '+N pts'>"`. `null` if no member's rank ever
  improves (e.g. a 2-member pool, or `recap` is absent).
- **Lead changes** — walk stages in order, track the #1-ranked member at each checkpoint (same
  `displayName`-ascending tiebreak for a stable single leader), emit an event whenever the leader
  changes. Rendered as `"<name> takes the lead — <stageReason or '+N pts'>"`. `[]` if `recap` is
  absent or the leader never changes.

Both live in a new pure-function module `apps/web/src/features/pool-archive/domain/race-history.ts`
(`computeLeadChanges`, `computeBiggestRiser`) — no DB access, unit-testable in isolation. Called from
`getPoolArchiveView`, which gains `recap: PoolArchiveRecap | null`, `leadChanges: LeadChangeEvent[]`,
and `biggestRiser: BiggestRiserEvent | null` on `PoolArchiveView`; `pointsHistory`/`stageReasons` on
`PoolArchiveEntryView`. All degrade gracefully (`recap: null`, empty arrays) for a pool archived before
this feature, until it's re-archived.

## UI

New components in `apps/web/src/features/pool-archive/ui/`:

- **`ArchiveHeroCard.tsx`** — dark hero card: "Archived · `<date>`" + tournament name (top strip),
  trophy icon, champion team badge + name, final score line ("ARG 3–1 FRA"), no venue/city (see
  Non-goals). Champion/score/opponent read **live** via `getActualResults`/`getTournamentById` — not
  frozen.
- **`ArchiveHighlightsPanel.tsx`** — the 4 highlight rows: champion pick %, biggest riser, best single
  match, biggest upset called. From frozen `recap` + derived `biggestRiser`.
- **`ArchiveLeadChangesPanel.tsx`** — timeline of derived `leadChanges` events.
- **`ArchiveStatTiles.tsx`** — 4 tiles: matches played (live, from `getMatchesForTournament` final
  count), predictions made (frozen), pool exact-score rate (frozen), biggest upset called (frozen,
  restated compactly).
- Race chart: reuse the existing `RaceChart` component + a thin adapter turning `recap.stages` +
  each entry's `pointsHistory` into the `RaceChartData` shape it already expects. No new charting code.
- The existing `ArchiveMemberRow` list (rank/points/`ScoreBreakdownCard` per member) stays, rendered
  **below** this new recap section as the detailed per-member standings — not replaced.

**Copy fix carried over from the prior feature's final review**: `ArchivePoolCard`'s description text
("This snapshot survives future name changes or account deletions") gets softened to make clear it
doesn't survive the _owner's own_ account deletion, per the accepted limitation already documented.

## Authorization & access

Unchanged from the shipped feature: archiving is owner-only; viewing is any current pool member.

## Testing

Per the test diamond: mostly integration tests against pglite.

- `build-recap.test.ts` — champion pick counts correctly, best-single-match picks the highest-agreement
  match, biggest-upset picks the lowest-nonzero-count resolved tie, predictions-made sums correctly,
  exact-score-rate percentage is correct; a pool with no knockout picks yet gets `championPick: null`
  (not a crash).
- `race-history.test.ts` (pure, no DB) — lead-change detection across a few synthetic `pointsHistory`
  arrays (no changes, one change, ties handled by stable ordering); biggest-riser picks the single
  largest rank-improvement transition.
- `archive-pool.test.ts` (extended) — archiving now also populates `recap` and each entry's
  `pointsHistory`/`stageReasons`.
- `get-pool-archive.test.ts` (extended) — a pool archived before this feature (recap/pointsHistory/
  stageReasons all `null` in the DB) returns `recap: null`, `leadChanges: []`, `biggestRiser: null`
  without error.

No new E2E spec — this remains a non-critical-path feature per the original feature's precedent.

## Non-goals / explicit simplifications

- **No "Download recap"** in this pass (deferred, no spec yet for image/PDF export).
- **Race chart uses date-based stage labels** ("Jul 19"), not named milestones ("MD1/R16/QF/SF/Final")
  — reuses the existing, already-tested `buildRaceChartData` rather than building a second
  milestone-based variant.
- **Stage reasons are template-filled from bounded per-stage aggregates** (exact-hit counts, correctly-
  picked-advancing team codes, champion-pick correctness) — not free-text/NLG-generated prose. They
  will not match the mockup's hand-crafted specificity in every case (e.g., no attempt to detect "a
  perfect Matchday" as a distinct narrative category beyond stating the exact-score count).
- **No hero card venue/city** — champion, score, and date only; no tournament data model change.
- Everything else about the original archive feature (owner-only archiving, member-only viewing,
  one-archive-per-pool upsert semantics, non-owner-only anonymization limitation) is unchanged.
