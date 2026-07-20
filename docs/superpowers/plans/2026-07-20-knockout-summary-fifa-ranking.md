# Knockout Match Summary FIFA Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each team's FIFA ranking (already present in tournament data as `Team.fifaRanking`) in the knockout match summary sheet (`MatchSummarySheet.tsx`), next to each team's name — matching the small-muted-`#N` style already used in `GroupTable.tsx`.

**Architecture:** `fifaRanking` already flows from `data/tournaments/*/tournament.json` through `packages/schemas` and `packages/engine`'s `Team` type into `Tournament.teams`, but the results feature's view-model (`KnockoutMatchView`) drops it — it only carries team id/name. Add `homeTeamFifaRanking`/`awayTeamFifaRanking: number | null` to `KnockoutMatchView`, populate them at the single construction site (`buildMatchView` inside `build-bracket-rounds.ts`) via a new `teamRankingMap` (mirrors the existing `teamMap`), then render them in `MatchSummarySheet`'s header.

**Tech Stack:** TypeScript strict, Vitest, React (Next.js App Router), Tailwind.

## Global Constraints

- TypeScript strict — no `any`, no unsafe casts.
- One commit per feature: implementation + tests landed together, no intermediate/partial commits.
- UI components in this codebase are not unit-tested with render tests (no `.test.tsx` files exist anywhere in `apps/web/src`) — application/domain logic is tested with Vitest; UI changes are verified by typecheck/lint/build plus a manual note. Do not introduce a new `.test.tsx` pattern for this change.
- Follow existing naming/formatting conventions exactly (see `teamNameOf`/`homeTeamName`/`awayTeamName` pattern already in the file).

---

### Task 1: Thread `fifaRanking` through `KnockoutMatchView` and render it in the match summary sheet

**Files:**

- Modify: `apps/web/src/features/results/domain/types.ts` (add two fields to `KnockoutMatchView`)
- Modify: `apps/web/src/features/results/application/build-bracket-rounds.ts` (populate the two fields)
- Modify: `apps/web/src/features/results/ui/MatchSummarySheet.tsx` (render them)
- Test: `apps/web/src/features/results/application/build-bracket-rounds.test.ts`

**Interfaces:**

- Consumes: `Tournament.teams: Team[]` where `Team = { id: TeamId; name: string; fifaRanking?: number | undefined }` (`packages/engine/src/types.ts`, unchanged).
- Produces: `KnockoutMatchView.homeTeamFifaRanking: number | null` and `KnockoutMatchView.awayTeamFifaRanking: number | null`, populated for every knockout match (all rounds, including the Bronze match, since all matches go through the same `buildMatchView` factory).

- [ ] **Step 1: Add the two new fields to `KnockoutMatchView`**

In `apps/web/src/features/results/domain/types.ts`, find the `KnockoutMatchView` type. Immediately after the existing pair:

```ts
homeTeamId: string | null;
homeTeamName: string | null;
awayTeamId: string | null;
awayTeamName: string | null;
```

add two more fields right after `awayTeamName`:

```ts
homeTeamId: string | null;
homeTeamName: string | null;
/** FIFA ranking (lower = stronger), when the tournament data provides one for this team. Null when unranked or the team slot is empty. */
homeTeamFifaRanking: number | null;
awayTeamId: string | null;
awayTeamName: string | null;
/** Same as {@link homeTeamFifaRanking} for the away team. */
awayTeamFifaRanking: number | null;
```

- [ ] **Step 2: Write the failing test**

Open `apps/web/src/features/results/application/build-bracket-rounds.test.ts`. Confirm the fixture used across the file, `miniTournament` (imported from `@cup/engine/testing`), assigns `fifaRanking` per team as `(groupIndex) * 4 + seedInGroup` (see `packages/engine/src/__fixtures__/mini-tournament.ts:81`) — so team `A1` has `fifaRanking: 1` and team `B2` has `fifaRanking: 6`.

Add this test at the end of the file (inside a new `describe` block):

```ts
describe('buildBracketRounds — FIFA ranking', () => {
  it('populates homeTeamFifaRanking/awayTeamFifaRanking from tournament team data', () => {
    const qf1 = makeMatch('qf1', 'QF', {
      homeTeamId: 'A1',
      awayTeamId: 'B2',
      winnerTeamId: 'A1',
      homeGoals: 1,
      awayGoals: 0,
      status: 'final',
    });
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [qf1],
      { knockoutPicks: [], finishScores: {} },
      [],
      [],
    );
    const qfRound = bracketRounds.find((r) => r.label === 'QF')!;
    const qf1Card = qfRound.matches.find((m) => m.bracketMatchKey === 'qf1')!;
    expect(qf1Card.homeTeamFifaRanking).toBe(1);
    expect(qf1Card.awayTeamFifaRanking).toBe(6);
  });

  it('returns null for an empty team slot', () => {
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [], // no matches played yet — sf1 has no confirmed participants
      { knockoutPicks: [], finishScores: {} },
      [],
      [],
    );
    const sfRound = bracketRounds.find((r) => r.label === 'SF')!;
    const sf1Card = sfRound.matches.find((m) => m.bracketMatchKey === 'sf1')!;
    expect(sf1Card.homeTeamId).toBeNull();
    expect(sf1Card.homeTeamFifaRanking).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter web test -- build-bracket-rounds.test.ts`
Expected: FAIL — `Property 'homeTeamFifaRanking' does not exist` (TypeScript) or the returned value is `undefined` rather than `1`/`6`/`null`, depending on where the type error surfaces. Either way, it must not pass yet.

- [ ] **Step 4: Populate the fields in `build-bracket-rounds.ts`**

In `apps/web/src/features/results/application/build-bracket-rounds.ts`, find the existing `teamMap` declaration (around line 43):

```ts
const teamMap = new Map<string, string>(def.teams.map((t) => [t.id, t.name]));
```

Add a sibling map right after it:

```ts
const teamMap = new Map<string, string>(def.teams.map((t) => [t.id, t.name]));
const teamRankingMap = new Map<string, number>(
  def.teams.filter((t) => t.fifaRanking !== undefined).map((t) => [t.id, t.fifaRanking!]),
);
```

Add a helper function next to `teamNameOf` (around line 320):

```ts
/** FIFA ranking for a team ID; null when the slot is empty or the team has no ranking. */
function teamRankingOf(teamRankingMap: Map<string, number>, teamId: string | null): number | null {
  return teamId ? (teamRankingMap.get(teamId) ?? null) : null;
}
```

In the `buildMatchView` return object, add the two fields right after `homeTeamName`/`awayTeamName` (around line 196-198):

```ts
      homeTeamId: homeId,
      homeTeamName: teamNameOf(teamMap, homeId),
      homeTeamFifaRanking: teamRankingOf(teamRankingMap, homeId),
      awayTeamId: awayId,
      awayTeamName: teamNameOf(teamMap, awayId),
      awayTeamFifaRanking: teamRankingOf(teamRankingMap, awayId),
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter web test -- build-bracket-rounds.test.ts`
Expected: PASS (all tests in the file, including the two new ones).

- [ ] **Step 6: Render the ranking in `MatchSummarySheet`'s header**

In `apps/web/src/features/results/ui/MatchSummarySheet.tsx`, inside `SheetHeader`, replace:

```tsx
<div className="flex items-center gap-2.5 flex-wrap justify-center">
  <span className="text-[14px] font-bold text-ink truncate">
    {match.homeTeamName ?? match.homeTeamId ?? 'TBD'}
  </span>
  <TeamBadge teamId={match.homeTeamId} size="md" />
  {hasScore ? (
    <span className="display tnum text-[32px] leading-none text-ink shrink-0">
      {match.actualHome}–{match.actualAway}
    </span>
  ) : (
    <span className="text-xs font-bold text-ink-muted shrink-0">vs</span>
  )}
  <TeamBadge teamId={match.awayTeamId} size="md" />
  <span className="text-[14px] font-bold text-ink truncate">
    {match.awayTeamName ?? match.awayTeamId ?? 'TBD'}
  </span>
</div>
```

with:

```tsx
<div className="flex items-center gap-2.5 flex-wrap justify-center">
  <span className="flex flex-col items-end">
    <span className="text-[14px] font-bold text-ink truncate">
      {match.homeTeamName ?? match.homeTeamId ?? 'TBD'}
    </span>
    {match.homeTeamFifaRanking !== null && (
      <span className="text-[10px] text-ink-muted">#{match.homeTeamFifaRanking}</span>
    )}
  </span>
  <TeamBadge teamId={match.homeTeamId} size="md" />
  {hasScore ? (
    <span className="display tnum text-[32px] leading-none text-ink shrink-0">
      {match.actualHome}–{match.actualAway}
    </span>
  ) : (
    <span className="text-xs font-bold text-ink-muted shrink-0">vs</span>
  )}
  <TeamBadge teamId={match.awayTeamId} size="md" />
  <span className="flex flex-col items-start">
    <span className="text-[14px] font-bold text-ink truncate">
      {match.awayTeamName ?? match.awayTeamId ?? 'TBD'}
    </span>
    {match.awayTeamFifaRanking !== null && (
      <span className="text-[10px] text-ink-muted">#{match.awayTeamFifaRanking}</span>
    )}
  </span>
</div>
```

- [ ] **Step 7: Typecheck, lint, and full test run**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all three pass clean (typecheck catches any other `KnockoutMatchView` literal that might need the two new required fields — there should be none, since `buildMatchView` is the sole construction site, but this step confirms it).

- [ ] **Step 8: Manual verification note**

This codebase doesn't have a running-browser verification step baked into this plan (no reachable dev DB assumed). If a dev Postgres is available in your environment, start the app (`pnpm -C apps/web dev`), open a pool's Results page, switch to the Knockout tab, tap into any match card with both teams known, and confirm the `#N` ranking renders under each team name and is hidden when a team has no `fifaRanking` in `tournament.json`. If no dev DB is reachable, say so explicitly rather than claiming this was browser-verified.

- [ ] **Step 9: Update `docs/PROGRESS.md`**

Add a short new section (after the most recent entry) documenting this change, following the existing terse style of the file — one paragraph plus a bullet naming the two touched files and the new `KnockoutMatchView` fields.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/features/results/domain/types.ts \
  apps/web/src/features/results/application/build-bracket-rounds.ts \
  apps/web/src/features/results/application/build-bracket-rounds.test.ts \
  apps/web/src/features/results/ui/MatchSummarySheet.tsx \
  docs/PROGRESS.md
git commit -m "feat(results): show FIFA ranking in knockout match summary"
```
