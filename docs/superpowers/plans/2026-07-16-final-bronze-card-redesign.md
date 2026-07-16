# Final / 3rd-Place Result Card Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `FinalResultCard` (Final + 3rd-place/Bronze ties) into a unified dark card with
per-team winner-row highlighting, a score line, and a separate "Your pick" pill signaling
correct/wrong, matching `tmp/clipboard-2026-07-16_07-01-02-200.png`.

**Architecture:** Pure UI restyle of one existing component plus one small domain-model addition
(`decidedBy` exposed on `KnockoutMatchView`, sourced from an already-existing DB column). No new
components outside `features/results`, no new dependencies. The card now owns its own header,
so the two call sites (`KnockoutRoundAccordion` for mobile, `KnockoutBracket` for desktop) drop
their now-redundant outer labels/wrappers around it.

**Tech Stack:** Next.js App Router, React, TypeScript (strict), Tailwind v4 (existing design
tokens only — no new tokens needed), Vitest for unit tests, Playwright for e2e.

## Global Constraints

- TypeScript strict, no `any`, no unsafe casts (spec: don't use `!` non-null assertions —
  narrow with `!== null` checks instead).
- No new Tailwind/CSS tokens — reuse existing `ink-900`, `on-dark`, `on-dark-soft`, `green-300`,
  `green-500`, `green-600`, `red-300`, `red-600`, `line-soft`, `rounded-cup`, `shadow-cup-sm`.
- Do not invent a per-team penalty shootout scoreline — `decidedBy` only, rendered as
  `· Decided on penalties` text.
- Preserve the existing pick-resolution fallback chain in `FinalResultCard`
  (`pickRowLeftId`/`pickRowRightId` derivation) verbatim — it encodes real bug fixes from recent
  commits (`e92697a`, `f6199b3`, `98ebc66`).
- Preserve existing `data-testid`s consumed by `apps/web/e2e/results.spec.ts`:
  `final-result-card` / `bronze-result-card`, `home-team-name`, `away-team-name`.
- **One commit per feature** (repo rule): do not commit after individual tasks. Accumulate all
  changes and commit once at the end of Task 5, spec included.

---

### Task 1: Expose `decidedBy` on `KnockoutMatchView`

**Files:**

- Modify: `apps/web/src/features/results/domain/types.ts`
- Modify: `apps/web/src/features/results/application/build-bracket-rounds.ts`
- Modify: `apps/web/src/features/results/application/build-bracket-rounds.test.ts`
- Modify (fixture builder only, one line each): `apps/web/src/features/results/domain/knockout-mobile-view.test.ts`, `apps/web/src/features/results/domain/knockout-match-detail.test.ts`, `apps/web/src/features/results/domain/bracket-health.test.ts`, `apps/web/src/features/results/ui/bracket-health-panel-utils.test.ts`, `apps/web/src/features/results/application/build-race-view.test.ts`

**Interfaces:**

- Produces: `KnockoutMatchView.decidedBy: 'regulation' | 'extraTime' | 'penalties' | null` —
  consumed by Task 2's `ScoreLine`.

- [ ] **Step 1: Write the failing tests in `build-bracket-rounds.test.ts`**

Add this `describe` block anywhere after the existing `describe` blocks (the file already
imports `buildBracketRounds`, `miniTournament`, and has a `makeMatch` helper — reuse both):

```ts
describe('buildBracketRounds — decidedBy propagation', () => {
  it('propagates decidedBy=penalties for a Final decided on penalties', () => {
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [
        makeMatch('final', 'Final', {
          homeTeamId: 'A1',
          awayTeamId: 'C1',
          winnerTeamId: 'A1',
          homeGoals: 1,
          awayGoals: 1,
          decidedBy: 'penalties',
          status: 'final',
        }),
      ],
      { knockoutPicks: [], finishScores: {} },
      [],
      [],
    );
    const finalRound = bracketRounds.find((r) => r.label === 'Final')!;
    expect(finalRound.matches[0]!.decidedBy).toBe('penalties');
  });

  it('propagates decidedBy=regulation for the Bronze match', () => {
    const { bronzeMatch } = buildBracketRounds(
      miniTournament,
      [
        makeMatch('bronze', 'bronze', {
          homeTeamId: 'B2',
          awayTeamId: 'D2',
          winnerTeamId: 'B2',
          homeGoals: 2,
          awayGoals: 1,
          decidedBy: 'regulation',
          status: 'final',
        }),
      ],
      { knockoutPicks: [], finishScores: {} },
      [],
      [],
    );
    expect(bronzeMatch!.decidedBy).toBe('regulation');
  });

  it('is null when the Final has not been played yet', () => {
    const { bracketRounds } = buildBracketRounds(
      miniTournament,
      [],
      { knockoutPicks: [], finishScores: {} },
      [],
      [],
    );
    const finalRound = bracketRounds.find((r) => r.label === 'Final')!;
    expect(finalRound.matches[0]!.decidedBy).toBeNull();
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm -C apps/web test build-bracket-rounds -- -t "decidedBy propagation"`
Expected: FAIL — `Property 'decidedBy' does not exist` (TS) or `undefined` not matching
`'penalties'`/`'regulation'`/`null`, since the field doesn't exist on `KnockoutMatchView` yet.

- [ ] **Step 3: Add `decidedBy` to `KnockoutMatchView`**

In `apps/web/src/features/results/domain/types.ts`, inside the `KnockoutMatchView` type, insert
right after `actualWinnerName: string | null;` and before `kickoff: string | null;`:

```ts
/** How the match was decided. Null until the match is played. */
decidedBy: 'regulation' | 'extraTime' | 'penalties' | null;
```

- [ ] **Step 4: Populate it in `buildBracketRounds`**

In `apps/web/src/features/results/application/build-bracket-rounds.ts`, inside `buildMatchView`'s
returned object, insert right after `actualWinnerName: winnerId ? (teamMap.get(winnerId) ??
winnerId) : null,` and before `kickoff: actual?.kickoff?.toISOString() ?? null,`:

```ts
      decidedBy: actual?.decidedBy ?? null,
```

- [ ] **Step 5: Fix the five test fixture builders that construct full `KnockoutMatchView` literals**

TypeScript strict mode will now reject any object literal typed as `KnockoutMatchView` that's
missing the new required field. Each of these files has exactly one builder function ending in
`awaySlotFeederPickedId: null,` — add `decidedBy: null,` on the next line in each:

`apps/web/src/features/results/domain/knockout-mobile-view.test.ts`:

```ts
    homeSlotFeederPickedId: null,
    awaySlotFeederPickedId: null,
    decidedBy: null,
    ...overrides,
```

`apps/web/src/features/results/domain/knockout-match-detail.test.ts`:

```ts
    homeSlotFeederPickedId: null,
    awaySlotFeederPickedId: null,
    decidedBy: null,
    ...overrides,
```

`apps/web/src/features/results/domain/bracket-health.test.ts`:

```ts
    homeSlotFeederPickedId: null,
    awaySlotFeederPickedId: null,
    decidedBy: null,
  };
}
```

`apps/web/src/features/results/ui/bracket-health-panel-utils.test.ts`:

```ts
    homeSlotFeederPickedId: null,
    awaySlotFeederPickedId: null,
    decidedBy: null,
    ...partial,
```

`apps/web/src/features/results/application/build-race-view.test.ts`:

```ts
    homeSlotFeederPickedId: null,
    awaySlotFeederPickedId: null,
    decidedBy: null,
  };
}
```

- [ ] **Step 6: Run the full results-feature unit suite and typecheck**

Run: `pnpm -C apps/web typecheck && pnpm -C apps/web test results`
Expected: PASS — all three new `decidedBy propagation` tests pass, no other test in the
`results` feature regresses, no TS errors.

---

### Task 2: Redesign `FinalResultCard.tsx`

**Files:**

- Modify: `apps/web/src/features/results/ui/FinalResultCard.tsx` (full rewrite of the render
  layer; the pick-resolution fallback chain is preserved verbatim)

**Interfaces:**

- Consumes: `KnockoutMatchView.decidedBy` (Task 1), existing `KnockoutMatchView` fields
  (`actualWinnerId`, `hit`, `predictedHome`/`Away`, `pickedHomeTeamId`/`pickedAwayTeamId`, etc.),
  `TeamBadge`/`Icon`/`cn` from `@/shared/ui`.
- Produces: same public signature as before —
  `FinalResultCard({ match: KnockoutMatchView; matchKey: 'final' | 'bronze'; onSelect?: () =>
void }): ReactElement`. Same root `data-testid` (`${matchKey}-result-card`) and the same
  `home-team-name`/`away-team-name` testids on the two team name spans, so
  `KnockoutRoundAccordion`, `KnockoutBracket`, and `results.spec.ts` need no signature changes.

- [ ] **Step 1: Replace the full file contents**

```tsx
import type { ReactElement } from 'react';
import type { KnockoutMatchView, MatchHit } from '../domain/types';
import { TeamBadge, Icon, cn } from '@/shared/ui';

type Props = {
  match: KnockoutMatchView;
  matchKey: 'final' | 'bronze';
  onSelect?: (() => void) | undefined;
};

function teamLabel(name: string | null, id: string | null): string {
  return name ?? id ?? '—';
}

function formatDate(kickoff: string): string {
  return new Date(kickoff).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

function CardHeader({
  matchKey,
  match,
}: {
  matchKey: 'final' | 'bronze';
  match: KnockoutMatchView;
}): ReactElement {
  const hasActualScore = match.actualHome !== null && match.actualAway !== null;
  const title = matchKey === 'final' ? 'THE FINAL' : '3RD-PLACE PLAYOFF';
  const subtitle = hasActualScore
    ? match.kickoff !== null
      ? `FT · ${formatDate(match.kickoff)}`
      : 'FT'
    : match.kickoff !== null
      ? formatDate(match.kickoff)
      : null;

  return (
    <div className="flex flex-col items-center gap-0.5 pb-2 text-center">
      <span
        data-testid="final-card-title"
        className="text-[12px] font-extrabold tracking-[0.12em] text-green-600 uppercase"
      >
        {title}
      </span>
      {subtitle !== null && (
        <span className="text-[11px] font-semibold text-ink-muted">{subtitle}</span>
      )}
    </div>
  );
}

function TeamRow({
  teamId,
  teamName,
  isWinner,
  nameTestId,
}: {
  teamId: string | null;
  teamName: string | null;
  isWinner: boolean;
  nameTestId: string;
}): ReactElement {
  return (
    <div
      className={cn(
        'flex items-center gap-2 p-[8px_10px] rounded-[8px]',
        isWinner && 'bg-green-600/15',
      )}
    >
      <TeamBadge teamId={teamId} size="sm" />
      <span
        data-testid={nameTestId}
        className={cn(
          'flex-1 text-[13px] font-bold truncate',
          isWinner ? 'text-on-dark' : 'text-on-dark-soft',
        )}
      >
        {teamLabel(teamName, teamId)}
      </span>
      {isWinner && <Icon name="check" size={13} color="var(--green-500)" />}
    </div>
  );
}

function ScoreLine({ match }: { match: KnockoutMatchView }): ReactElement | null {
  if (match.actualHome === null || match.actualAway === null) return null;
  return (
    <div className="text-center pt-2">
      <span className="tnum text-[15px] font-extrabold text-on-dark">
        {match.actualHome}–{match.actualAway}
      </span>
      {match.decidedBy === 'penalties' && (
        <span className="text-[11px] font-semibold text-on-dark-soft">
          {' '}
          &middot; Decided on penalties
        </span>
      )}
    </div>
  );
}

function borderClassForPickHit(hit: MatchHit): string {
  if (hit === 'exact' || hit === 'outcome') return 'border-green-300';
  if (hit === 'missed') return 'border-red-300';
  return 'border-line-soft';
}

function PickBadge({ hit }: { hit: MatchHit }): ReactElement | null {
  if (hit === 'exact' || hit === 'outcome') {
    return (
      <span className="absolute -right-1.5 -top-1.5 grid place-items-center w-5 h-5 rounded-full bg-green-500">
        <Icon name="check" size={11} color="var(--on-dark)" />
      </span>
    );
  }
  if (hit === 'missed') {
    return (
      <span className="absolute -right-1.5 -top-1.5 grid place-items-center w-5 h-5 rounded-full bg-red-600">
        <Icon name="close" size={11} color="var(--on-dark)" />
      </span>
    );
  }
  return null;
}

function PickPill({
  leftId,
  rightId,
  predictedHome,
  predictedAway,
  hit,
}: {
  leftId: string | null;
  rightId: string | null;
  predictedHome: number;
  predictedAway: number;
  hit: MatchHit;
}): ReactElement {
  return (
    <div
      data-testid="final-card-pick-pill"
      className={cn(
        'relative flex items-center gap-1.5 mt-2.5 p-[8px_14px] rounded-full border bg-surface w-fit mx-auto',
        borderClassForPickHit(hit),
      )}
    >
      <span className="text-[11px] font-bold text-ink-muted">Your pick:</span>
      {leftId !== null && <TeamBadge teamId={leftId} size="sm" />}
      <span className="tnum text-[12px] font-extrabold text-ink">
        {predictedHome}–{predictedAway}
      </span>
      {rightId !== null && <TeamBadge teamId={rightId} size="sm" />}
      <PickBadge hit={hit} />
    </div>
  );
}

export function FinalResultCard({ match, matchKey, onSelect }: Props): ReactElement {
  // pickedHomeTeamId/pickedAwayTeamId reflect the user's own SF/QF bracket picks, never
  // substituted with actual results, so "Your pick" keeps showing what the user predicted even
  // after the real bracket resolves to different teams. That chain can come up empty for one
  // side even though the user did pick a team there — e.g. an entry-round pick that collides
  // with a different real bracket slot breaks the validated home/away walk. pickedWinnerId/
  // pickedOpponentId are derived directly from the raw picks without that validation, so try
  // them next. Only fall back to the actual/derived participants (and finally the generic
  // predicted-slot fields) when no user-prediction signal exists for this match at all —
  // falling back to them any earlier would silently replace "Your pick" with the real bracket.
  const pickLeftId = match.pickedHomeTeamId;
  const pickRightId = match.pickedAwayTeamId;
  // When the predicted participant chain is broken (e.g. the team was eliminated before
  // reaching this match), pickedWinnerId or pickedOpponentId carry the user's original picks.
  // Try pickedWinnerId first: when the implicit winner (derived from the finish score) is the
  // home-side SF loser, pickedOpponentId equals predictedAwayTeamId, so the standard
  // pickedOpponentId fallback silently drops the left-side team. Prefer pickedWinnerId here.
  const pickRowLeftId =
    pickLeftId ??
    (match.pickedWinnerId !== null && match.pickedWinnerId !== pickRightId
      ? match.pickedWinnerId
      : null) ??
    (match.pickedOpponentId !== null && match.pickedOpponentId !== pickRightId
      ? match.pickedOpponentId
      : null) ??
    match.homeTeamId ??
    match.predictedHomeTeamId;
  const pickRowRightId =
    pickRightId ??
    (match.pickedOpponentId !== null && match.pickedOpponentId !== pickRowLeftId
      ? match.pickedOpponentId
      : null) ??
    match.awayTeamId ??
    match.predictedAwayTeamId;

  // A tie is only worth opening once at least one side is a confirmed (non-TBD) team.
  const isTappable =
    onSelect !== undefined && (match.homeTeamId !== null || match.awayTeamId !== null);
  const Root = isTappable ? 'button' : 'div';

  return (
    <div className="flex flex-col items-center w-full">
      <CardHeader matchKey={matchKey} match={match} />
      <Root
        type={isTappable ? 'button' : undefined}
        onClick={isTappable ? onSelect : undefined}
        data-testid={`${matchKey}-result-card`}
        className={cn(
          'rounded-cup overflow-hidden shadow-cup-sm w-full text-left bg-ink-900 border-0 p-2.5',
          isTappable && 'cursor-pointer',
        )}
      >
        <div className="flex flex-col gap-1">
          <TeamRow
            teamId={match.homeTeamId}
            teamName={match.homeTeamName}
            isWinner={match.actualWinnerId !== null && match.actualWinnerId === match.homeTeamId}
            nameTestId="home-team-name"
          />
          <TeamRow
            teamId={match.awayTeamId}
            teamName={match.awayTeamName}
            isWinner={match.actualWinnerId !== null && match.actualWinnerId === match.awayTeamId}
            nameTestId="away-team-name"
          />
        </div>
        <ScoreLine match={match} />
      </Root>
      {match.predictedHome !== null && match.predictedAway !== null && (
        <PickPill
          leftId={pickRowLeftId}
          rightId={pickRowRightId}
          predictedHome={match.predictedHome}
          predictedAway={match.predictedAway}
          hit={match.hit}
        />
      )}
    </div>
  );
}
```

Note what was deliberately dropped from the old file: the `ChampionPill` sub-component (the
winner-row highlight now conveys "who won" inline), the `HitChip` usage (points are no longer
shown on the card face — `MatchSummarySheet` still covers that on tap), and the per-team
tie-checkmark logic (`isTiePrediction`/`leftIsWinner`/`rightIsWinner`/`pickWinnerId`) — superseded
by `PickPill`'s single border-color + corner-badge driven directly by `match.hit`.

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm -C apps/web typecheck && pnpm -C apps/web lint`
Expected: PASS — no unused imports (`HitChip` import is gone), no type errors.

- [ ] **Step 3: Start the dev server and visually verify both states**

Run: `pnpm -C apps/web dev`, then open the seeded pool's results page, Knockout tab (the
`e2e-seeded` fixture's Final is France 0–1 Argentina decided by regulation; Bronze is Spain 2–1
England decided by regulation — use `/pools/<seeded-pool-id>/results`, owner login
`e2e-seeded-owner`). Confirm:

- Header shows `THE FINAL` / `3RD-PLACE PLAYOFF` in green caps with `FT · Jul 19` /
  `FT · Jul 18` beneath.
- Argentina's row (winner) has the green-tinted background + check icon; France's row plain.
- Score line reads `0–1` with no penalties suffix (this fixture is `regulation`).
- The "Your pick" pill renders below the card with a green or red border + corner badge
  matching the owner's actual pick correctness.
- To eyeball the `· Decided on penalties` text, temporarily edit
  `data/tournaments/e2e-seeded/results.json`'s `knockout` entry for `"round": "Final"` to
  `"decidedBy": "penalties"`, re-run `pnpm seed:e2e`, refresh, then revert the file and
  re-seed again afterward (do not leave the fixture file modified).

---

### Task 3: Stop wrapping Final/3rd-Place in the mobile accordion

**Files:**

- Modify: `apps/web/src/features/results/ui/KnockoutRoundAccordion.tsx`

**Interfaces:**

- Consumes: `FinalResultCard` (Task 2, unchanged public signature), existing
  `pickDefaultExpandedRound`/`getRoundPlayedCount` from `../domain/knockout-mobile-view` (both
  unchanged — only their call-site input changes here).

- [ ] **Step 1: Restructure the component**

In `apps/web/src/features/results/ui/KnockoutRoundAccordion.tsx`, replace the entire
`export function KnockoutRoundAccordion(...) { ... }` function (everything from its signature
through its closing brace) with:

```tsx
export function KnockoutRoundAccordion({
  rounds,
  bronzeMatch,
  userPredictedKnockoutTeamIds,
  onOpenMatch,
}: Props): ReactElement {
  // The Final round no longer renders inside a collapsible AccordionSection (FinalResultCard now
  // owns its own header), so it's excluded from both the accordion list and the auto-expand pick —
  // otherwise a fully-played Final would "consume" the default-expand slot and leave every other
  // round collapsed with nothing open.
  const mainRounds = rounds.filter((r) => r.label !== 'Final');
  const finalRound = rounds.find((r) => r.label === 'Final') ?? null;

  const [openLabels, setOpenLabels] = useState<Set<string>>(() => {
    const defaultLabel = pickDefaultExpandedRound(mainRounds);
    return new Set(defaultLabel ? [defaultLabel] : []);
  });

  if (rounds.length === 0) {
    return (
      <div className="card p-[32px_24px] text-center">
        <p className="text-[13px] font-semibold text-ink-muted">
          Knockout stage bracket will appear here once teams are confirmed.
        </p>
      </div>
    );
  }

  const predictedQualifierIds = new Set<string>(userPredictedKnockoutTeamIds ?? []);

  function toggle(label: string): void {
    setOpenLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {mainRounds.map((round, i) => (
        <AccordionSection
          key={round.label}
          label={round.label}
          statusChip={<RoundStatusChip round={round} />}
          isOpen={openLabels.has(round.label)}
          onToggle={() => toggle(round.label)}
        >
          {round.matches.map((match) => (
            <BracketMatchCard
              key={match.bracketMatchKey}
              match={match}
              predictedQualifierIds={i === 0 ? predictedQualifierIds : new Set()}
              onSelect={onOpenMatch ? () => onOpenMatch(match.bracketMatchKey) : undefined}
            />
          ))}
        </AccordionSection>
      ))}

      {finalRound && (
        <FinalResultCard
          match={finalRound.matches[0]!}
          matchKey="final"
          onSelect={
            onOpenMatch ? () => onOpenMatch(finalRound.matches[0]!.bracketMatchKey) : undefined
          }
        />
      )}

      {bronzeMatch && (
        <FinalResultCard
          match={bronzeMatch}
          matchKey="bronze"
          onSelect={onOpenMatch ? () => onOpenMatch(bronzeMatch.bracketMatchKey) : undefined}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -C apps/web typecheck`
Expected: PASS.

- [ ] **Step 3: Run the mobile-view domain unit tests (unchanged, confirm no regression)**

Run: `pnpm -C apps/web test knockout-mobile-view`
Expected: PASS — `pickDefaultExpandedRound`/`getRoundPlayedCount` themselves are untouched, only
their caller's input changed.

---

### Task 4: Drop the redundant "Final"/"3rd Place" labels from the desktop bracket

**Files:**

- Modify: `apps/web/src/features/results/ui/KnockoutBracket.tsx`

**Interfaces:**

- Consumes: `FinalResultCard` (Task 2, unchanged public signature).

- [ ] **Step 1: Simplify `FinalCards`**

In `apps/web/src/features/results/ui/KnockoutBracket.tsx`, replace the `FinalCards` function body:

```tsx
function FinalCards({
  finalMatch,
  bronzeMatch,
  paddingTop,
  onOpenMatch,
}: FinalCardsProps): ReactElement | null {
  if (!finalMatch && !bronzeMatch) return null;
  return (
    <div className="min-w-55" style={{ paddingTop }}>
      {finalMatch && (
        <FinalResultCard
          match={finalMatch}
          matchKey="final"
          onSelect={onOpenMatch ? () => onOpenMatch(finalMatch.bracketMatchKey) : undefined}
        />
      )}
      {bronzeMatch && (
        <div className="mt-4">
          <FinalResultCard
            match={bronzeMatch}
            matchKey="bronze"
            onSelect={onOpenMatch ? () => onOpenMatch(bronzeMatch.bracketMatchKey) : undefined}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -C apps/web typecheck`
Expected: PASS.

---

### Task 5: Full verification and single feature commit

**Files:** none (verification + commit only)

- [ ] **Step 1: Run the full web unit/integration suite**

Run: `pnpm -C apps/web test`
Expected: PASS — all existing tests plus the three new `decidedBy` tests from Task 1.

- [ ] **Step 2: Run lint and typecheck across the repo**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Run the results e2e spec**

Run: `pnpm -C apps/web exec playwright test results.spec.ts`
Expected: PASS — the existing "results page shows a fully resolved bracket..." and "tapping the
Final result card opens the match summary sheet..." tests both pass unchanged against the new
card markup (they only assert on `final-result-card`, `home-team-name`, `away-team-name`, and the
`match-summary-sheet`, all of which are preserved).

- [ ] **Step 4: Manual browser pass on both surfaces**

With `pnpm -C apps/web dev` running, check the seeded pool's results page at both a mobile
viewport width (confirms `KnockoutRoundAccordion`'s Final/3rd Place render without a
collapse/expand chevron, always visible) and a desktop viewport width (confirms
`KnockoutBracket`'s `FinalCards` column shows the two cards stacked with no `Final`/`3rd Place`
label above them, own header only).

- [ ] **Step 5: Single commit for the whole feature**

Per this repo's one-commit-per-feature rule, stage the spec, the domain change, the redesigned
component, and both call-site updates together:

```bash
git add docs/superpowers/specs/2026-07-16-final-bronze-card-redesign-design.md \
  apps/web/src/features/results/domain/types.ts \
  apps/web/src/features/results/application/build-bracket-rounds.ts \
  apps/web/src/features/results/application/build-bracket-rounds.test.ts \
  apps/web/src/features/results/domain/knockout-mobile-view.test.ts \
  apps/web/src/features/results/domain/knockout-match-detail.test.ts \
  apps/web/src/features/results/domain/bracket-health.test.ts \
  apps/web/src/features/results/ui/bracket-health-panel-utils.test.ts \
  apps/web/src/features/results/application/build-race-view.test.ts \
  apps/web/src/features/results/ui/FinalResultCard.tsx \
  apps/web/src/features/results/ui/KnockoutRoundAccordion.tsx \
  apps/web/src/features/results/ui/KnockoutBracket.tsx
git commit -m "$(cat <<'EOF'
feat(results): redesign Final/3rd-place cards with winner-row highlight

Unifies Final and Bronze into one dark card style with per-team winner
highlighting, a score line (with a penalties note when applicable), and a
separate "Your pick" pill whose border/badge signals hit correctness —
replacing the old inline pick row, gold champion pill, and per-card HitChip.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
