# Results knockout redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the results page Knockout tab look like the predict page bracket — rich team cards with flags, dark Final card with gold Champion pill, bronze 3rd-place card — and overlay actual results, the user's pick, and a hit chip per tie. Widen the page from 1100→1400.

**Architecture:** All work is inside the existing `features/results` vertical slice plus one page-shell width bump. We extend `KnockoutMatchView` with `predictedHome`, `predictedAway`, and `hit`; populate them in `get-results-view.ts`; rewrite `BracketMatchCard`; add `FinalResultCard`; update `KnockoutBracket` geometry and bronze placement; delete `PickStatusChip`. No cross-feature imports — `TeamBadge` and `Icon` are already in `@/shared/ui`.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict. Vitest + pglite for integration tests. Tailwind utility classes + design-system CSS tokens. Project ships a single squash commit per feature (CLAUDE.md), so this plan accumulates changes through all tasks and lands them in **one final commit at the end** (Task 8).

**Spec:** [`docs/superpowers/specs/2026-06-12-results-knockout-redesign-design.md`](../specs/2026-06-12-results-knockout-redesign-design.md)

---

## File Structure

**Modify:**

- `apps/web/src/features/results/domain/types.ts` — extend `KnockoutMatchView` with `predictedHome`, `predictedAway`, `hit`.
- `apps/web/src/features/results/application/get-results-view.ts` — load Final/Bronze finish-scores; derive `hit` per tie; populate the new fields.
- `apps/web/src/features/results/application/get-results-view.test.ts` — new and updated assertions for `hit`, `predictedHome`, `predictedAway`.
- `apps/web/src/features/results/ui/HitChip.tsx` — accept optional `points` prop so knockout-tie chips can render without `+N`.
- `apps/web/src/features/results/ui/BracketMatchCard.tsx` — rewrite to predict-style two team rows + `HitChip` header.
- `apps/web/src/features/results/ui/KnockoutBracket.tsx` — column geometry, banner, render `FinalResultCard` for Final + Bronze, bronze into Final column.
- `apps/web/src/app/(authenticated)/pools/[id]/results/page.tsx` — `maxWidth: 1100 → 1400`.

**Create:**

- `apps/web/src/features/results/ui/FinalResultCard.tsx` — read-only dark Final / bronze 3rd-place card with actual + predicted score.

**Delete:**

- `apps/web/src/features/results/ui/PickStatusChip.tsx` — fully replaced by `HitChip`. Verified only consumer is the old `BracketMatchCard.tsx` which we rewrite.

**Spec to commit alongside:**

- `docs/superpowers/specs/2026-06-12-results-knockout-redesign-design.md` (already on disk, currently untracked).

---

## Task 1: Extend `KnockoutMatchView` with `predictedHome`, `predictedAway`, `hit`

**Files:**

- Modify: `apps/web/src/features/results/domain/types.ts`

The type extension is harmless on its own: `get-results-view.ts` still compiles because existing callers populate every field except the new ones, and we'll set them in Task 2 before they're consumed by UI. We give them default `null` / `'pending'` semantics so partial implementations stay typesafe.

- [ ] **Step 1: Add fields to `KnockoutMatchView`**

Edit `apps/web/src/features/results/domain/types.ts`. Find the existing `KnockoutMatchView` block (it starts with `export type KnockoutMatchView = {`). Add three new fields immediately before the closing `};`:

```ts
export type KnockoutMatchView = {
  bracketMatchKey: string;
  round: string;
  homeTeamId: string | null;
  homeTeamName: string | null;
  awayTeamId: string | null;
  awayTeamName: string | null;
  actualHome: number | null;
  actualAway: number | null;
  actualWinnerId: string | null;
  actualWinnerName: string | null;
  kickoff: string | null;
  status: 'scheduled' | 'final';
  pickedWinnerId: string | null;
  pickedWinnerName: string | null;
  pickStatus: PickStatus;
  /** User's predicted score — only populated for Final and Bronze ties. */
  predictedHome: number | null;
  /** User's predicted score — only populated for Final and Bronze ties. */
  predictedAway: number | null;
  /** Per-tie hit:
   *   - Non-Final/Bronze: 'outcome' | 'missed' | 'pending' only ('exact' impossible — no score predicted).
   *   - Final/Bronze: any of 'exact' | 'outcome' | 'missed' | 'pending'.
   */
  hit: MatchHit;
};
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm -C apps/web typecheck`
Expected: Two errors in `get-results-view.ts` at the two `buildMatchView` `return` statements (missing `predictedHome`, `predictedAway`, `hit`). This is intentional — fixed in Task 2.

---

## Task 2: Populate `predictedHome`, `predictedAway`, `hit` in `get-results-view.ts`

**Files:**

- Modify: `apps/web/src/features/results/application/get-results-view.ts`
- Test: `apps/web/src/features/results/application/get-results-view.test.ts`

We thread the tournament's `scoring` settings into `buildBracketRounds`, look up the user's Final and Bronze finish-scores from `inputs.finishScores`, and compute `hit` per tie. Reuse the existing `computeHit` helper for Final/Bronze score paths; add a `computeKnockoutHit` for non-Final/Bronze that compares winners only.

- [ ] **Step 1: Write failing integration tests for `hit` and predicted score**

Open `apps/web/src/features/results/application/get-results-view.test.ts`. The file already has knockout tests around `pickStatus` (lines ~280–344). Add the following block of new tests at the end of the existing top-level `describe('getResultsView', ...)` (just before its closing brace, alongside the existing knockout tests):

```ts
import { upsertFinishScore } from '@cup/db';

// (Above imports — only add `upsertFinishScore` if not already imported.)

it('sets hit=outcome on non-final knockout tie when picked winner matches actual', async () => {
  const pred = await getOrCreatePrediction(db, {
    poolId,
    userId,
    tournamentId: miniTournament.id,
  });
  await upsertKnockoutPick(db, pred.id, bracketMatchKey('qf1'), 'A1');
  await upsertKnockoutMatch(db, {
    id: 'qf1',
    tournamentId: miniTournament.id,
    stage: 'QF',
    homeTeamId: 'A1',
    awayTeamId: 'B2',
    homeGoals: 2,
    awayGoals: 0,
    winnerTeamId: 'A1',
    status: 'final',
  });

  const view = await getResultsView({ db, poolId, userId, now: NOW });
  const match = view!.bracketRounds
    .find((r) => r.label === 'QF')!
    .matches.find((m) => m.bracketMatchKey === 'qf1')!;
  expect(match.hit).toBe('outcome');
  expect(match.predictedHome).toBeNull();
  expect(match.predictedAway).toBeNull();
});

it('sets hit=missed on non-final knockout tie when picked winner lost', async () => {
  const pred = await getOrCreatePrediction(db, {
    poolId,
    userId,
    tournamentId: miniTournament.id,
  });
  await upsertKnockoutPick(db, pred.id, bracketMatchKey('qf1'), 'B2');
  await upsertKnockoutMatch(db, {
    id: 'qf1',
    tournamentId: miniTournament.id,
    stage: 'QF',
    homeTeamId: 'A1',
    awayTeamId: 'B2',
    homeGoals: 2,
    awayGoals: 0,
    winnerTeamId: 'A1',
    status: 'final',
  });

  const view = await getResultsView({ db, poolId, userId, now: NOW });
  const match = view!.bracketRounds
    .find((r) => r.label === 'QF')!
    .matches.find((m) => m.bracketMatchKey === 'qf1')!;
  expect(match.hit).toBe('missed');
});

it('sets hit=pending on non-final knockout tie when match has not yet finalized', async () => {
  const pred = await getOrCreatePrediction(db, {
    poolId,
    userId,
    tournamentId: miniTournament.id,
  });
  await upsertKnockoutPick(db, pred.id, bracketMatchKey('qf1'), 'A1');

  const view = await getResultsView({ db, poolId, userId, now: NOW });
  const match = view!.bracketRounds
    .find((r) => r.label === 'QF')!
    .matches.find((m) => m.bracketMatchKey === 'qf1')!;
  expect(match.hit).toBe('pending');
});

it('sets hit=exact on Final when predicted score matches actual score', async () => {
  const pred = await getOrCreatePrediction(db, {
    poolId,
    userId,
    tournamentId: miniTournament.id,
  });
  await upsertKnockoutPick(db, pred.id, bracketMatchKey('final'), 'A1');
  await upsertFinishScore(db, pred.id, 'final', 2, 1);
  await upsertKnockoutMatch(db, {
    id: 'final',
    tournamentId: miniTournament.id,
    stage: 'Final',
    homeTeamId: 'A1',
    awayTeamId: 'B1',
    homeGoals: 2,
    awayGoals: 1,
    winnerTeamId: 'A1',
    status: 'final',
  });

  const view = await getResultsView({ db, poolId, userId, now: NOW });
  const finalRound = view!.bracketRounds.find((r) => r.label === 'Final');
  const match = finalRound!.matches[0]!;
  expect(match.hit).toBe('exact');
  expect(match.predictedHome).toBe(2);
  expect(match.predictedAway).toBe(1);
});

it('sets hit=outcome on Final when winner matches but score differs', async () => {
  const pred = await getOrCreatePrediction(db, {
    poolId,
    userId,
    tournamentId: miniTournament.id,
  });
  await upsertKnockoutPick(db, pred.id, bracketMatchKey('final'), 'A1');
  await upsertFinishScore(db, pred.id, 'final', 3, 0);
  await upsertKnockoutMatch(db, {
    id: 'final',
    tournamentId: miniTournament.id,
    stage: 'Final',
    homeTeamId: 'A1',
    awayTeamId: 'B1',
    homeGoals: 2,
    awayGoals: 1,
    winnerTeamId: 'A1',
    status: 'final',
  });

  const view = await getResultsView({ db, poolId, userId, now: NOW });
  const match = view!.bracketRounds.find((r) => r.label === 'Final')!.matches[0]!;
  expect(match.hit).toBe('outcome');
  expect(match.predictedHome).toBe(3);
  expect(match.predictedAway).toBe(0);
});

it('sets hit=missed on Final when winner pick lost', async () => {
  const pred = await getOrCreatePrediction(db, {
    poolId,
    userId,
    tournamentId: miniTournament.id,
  });
  await upsertKnockoutPick(db, pred.id, bracketMatchKey('final'), 'B1');
  await upsertFinishScore(db, pred.id, 'final', 1, 2);
  await upsertKnockoutMatch(db, {
    id: 'final',
    tournamentId: miniTournament.id,
    stage: 'Final',
    homeTeamId: 'A1',
    awayTeamId: 'B1',
    homeGoals: 2,
    awayGoals: 1,
    winnerTeamId: 'A1',
    status: 'final',
  });

  const view = await getResultsView({ db, poolId, userId, now: NOW });
  const match = view!.bracketRounds.find((r) => r.label === 'Final')!.matches[0]!;
  expect(match.hit).toBe('missed');
});

it('sets hit=pending on Final before match finalizes, while still exposing predicted score', async () => {
  const pred = await getOrCreatePrediction(db, {
    poolId,
    userId,
    tournamentId: miniTournament.id,
  });
  await upsertKnockoutPick(db, pred.id, bracketMatchKey('final'), 'A1');
  await upsertFinishScore(db, pred.id, 'final', 2, 1);

  const view = await getResultsView({ db, poolId, userId, now: NOW });
  const match = view!.bracketRounds.find((r) => r.label === 'Final')!.matches[0]!;
  expect(match.hit).toBe('pending');
  expect(match.predictedHome).toBe(2);
  expect(match.predictedAway).toBe(1);
});

it('populates Bronze predictedHome/predictedAway from finish score', async () => {
  const pred = await getOrCreatePrediction(db, {
    poolId,
    userId,
    tournamentId: miniTournament.id,
  });
  await upsertFinishScore(db, pred.id, 'bronze', 1, 0);

  const view = await getResultsView({ db, poolId, userId, now: NOW });
  expect(view!.bronzeMatch?.predictedHome).toBe(1);
  expect(view!.bronzeMatch?.predictedAway).toBe(0);
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm -C apps/web vitest run src/features/results/application/get-results-view.test.ts -t "hit"`
Expected: All new `it("sets hit=...")` tests **fail** with `match.hit` being `undefined` or some other not-yet-implemented value.

- [ ] **Step 3: Thread `scoring`, `finishScores`, and the bronze key into `buildBracketRounds`**

Open `apps/web/src/features/results/application/get-results-view.ts`. Modify the call site of `buildBracketRounds` inside `getResultsView` to pass through `inputs?.finishScores ?? {}` and `def.scoring`. Find the line `const { bracketRounds, bronzeMatch } = buildBracketRounds(def, allMatches, inputs);` and change to:

```ts
const { bracketRounds, bronzeMatch } = buildBracketRounds(def, allMatches, inputs);
```

(No call-site change needed yet — keep `inputs` flowing in. Continue to the function below.)

Find the `buildBracketRounds` declaration. Update its signature and body so the function has access to scoring and to whether the current bracket key is `final` or `bronze`:

```ts
function buildBracketRounds(
  def: Tournament,
  allMatches: MatchRow[],
  inputs: Awaited<ReturnType<typeof getPredictionInputs>> | null,
): { bracketRounds: BracketRoundResultView[]; bronzeMatch: KnockoutMatchView | null } {
  const teamMap = new Map<string, string>(def.teams.map((t) => [t.id, t.name]));
  const matchByKey = new Map<string, MatchRow>(allMatches.map((m) => [m.id, m]));
  const pickMap = new Map<string, string>(
    (inputs?.knockoutPicks ?? []).map((kp) => [kp.bracketMatchKey, kp.winner]),
  );
  const finishScores = inputs?.finishScores ?? {};
  const finalKey = def.bracket.finalMatch;
  const bronzeKey = def.bracket.bronzeMatch;

  const buildMatchView = (key: BracketMatchKey, round: string): KnockoutMatchView => {
    const actual = matchByKey.get(key) ?? null;
    const pickedId = pickMap.get(key) ?? null;

    const homeId = actual?.homeTeamId ?? null;
    const awayId = actual?.awayTeamId ?? null;
    const winnerId = actual?.winnerTeamId ?? null;

    let pickStatus: KnockoutMatchView['pickStatus'] = 'no-pick';
    if (pickedId) {
      if (!winnerId) {
        pickStatus = 'pending';
      } else if (winnerId === pickedId) {
        pickStatus = 'alive';
      } else {
        pickStatus = 'busted';
      }
    }

    // Predicted score: only Final and Bronze have a finish score.
    let predictedHome: number | null = null;
    let predictedAway: number | null = null;
    if (key === finalKey && finishScores.final) {
      predictedHome = finishScores.final.home;
      predictedAway = finishScores.final.away;
    } else if (key === bronzeKey && finishScores.bronze) {
      predictedHome = finishScores.bronze.home;
      predictedAway = finishScores.bronze.away;
    }

    // Per-tie hit
    const isFinishMatch = key === finalKey || key === bronzeKey;
    const hit = computeKnockoutHit({
      isFinishMatch,
      pickedWinnerId: pickedId,
      actualWinnerId: winnerId,
      predictedHome,
      predictedAway,
      actualHome: actual?.homeGoals ?? null,
      actualAway: actual?.awayGoals ?? null,
    });

    return {
      bracketMatchKey: key,
      round,
      homeTeamId: homeId,
      homeTeamName: homeId ? (teamMap.get(homeId) ?? homeId) : null,
      awayTeamId: awayId,
      awayTeamName: awayId ? (teamMap.get(awayId) ?? awayId) : null,
      actualHome: actual?.homeGoals ?? null,
      actualAway: actual?.awayGoals ?? null,
      actualWinnerId: winnerId,
      actualWinnerName: winnerId ? (teamMap.get(winnerId) ?? winnerId) : null,
      kickoff: actual?.kickoff?.toISOString() ?? null,
      status: actual?.status === 'final' ? 'final' : 'scheduled',
      pickedWinnerId: pickedId,
      pickedWinnerName: pickedId ? (teamMap.get(pickedId) ?? pickedId) : null,
      pickStatus,
      predictedHome,
      predictedAway,
      hit,
    };
  };

  // ... rest of function body unchanged ...
}
```

(The body below `buildMatchView` — `keysByRound`, `bracketRounds`, `finalRound`, `bronzeMatch` derivation — stays the same.)

- [ ] **Step 4: Add `computeKnockoutHit` helper**

In the same file, in the helpers section (after the existing `computeHit` near the bottom of the file), add:

```ts
function computeKnockoutHit(args: {
  isFinishMatch: boolean;
  pickedWinnerId: string | null;
  actualWinnerId: string | null;
  predictedHome: number | null;
  predictedAway: number | null;
  actualHome: number | null;
  actualAway: number | null;
}): MatchHit {
  const {
    isFinishMatch,
    pickedWinnerId,
    actualWinnerId,
    predictedHome,
    predictedAway,
    actualHome,
    actualAway,
  } = args;

  // Tie not yet decided → pending (regardless of whether the user has a pick).
  if (actualWinnerId === null) return 'pending';

  if (isFinishMatch) {
    // Final / Bronze: predicted score available → can return 'exact'.
    if (
      predictedHome !== null &&
      predictedAway !== null &&
      actualHome !== null &&
      actualAway !== null &&
      predictedHome === actualHome &&
      predictedAway === actualAway
    ) {
      return 'exact';
    }
    if (pickedWinnerId !== null && pickedWinnerId === actualWinnerId) return 'outcome';
    return 'missed';
  }

  // Non-Final/Bronze: only winner matters.
  if (pickedWinnerId !== null && pickedWinnerId === actualWinnerId) return 'outcome';
  return 'missed';
}
```

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `pnpm -C apps/web vitest run src/features/results/application/get-results-view.test.ts`
Expected: All tests **pass**, including the original `pickStatus` tests (unchanged behaviour) and the new `hit` / predicted-score tests.

- [ ] **Step 6: Run typecheck across the workspace**

Run: `pnpm typecheck`
Expected: PASS. The `KnockoutMatchView` type errors from Task 1 are now resolved.

---

## Task 3: Extend `HitChip` to support optional points

**Files:**

- Modify: `apps/web/src/features/results/ui/HitChip.tsx`

Knockout non-Final/Bronze ties don't have a per-tie points value (knockout scoring is per-team-correctness, not per-pick). The current `HitChip` always renders `Outcome +${points}` / `Missed +0`, which would be misleading. Make `points` optional; when omitted, render `Outcome` / `Missed` without the `+N` suffix.

- [ ] **Step 1: Update `HitChip` props and rendering**

Replace the entire file content of `apps/web/src/features/results/ui/HitChip.tsx`:

```tsx
import type { ReactElement } from 'react';
import type { MatchHit } from '../domain/types';

type Props = { hit: MatchHit; points?: number };

export function HitChip({ hit, points }: Props): ReactElement | null {
  if (hit === 'pending') return null;

  if (hit === 'exact') {
    return (
      <span
        className="chip"
        style={{
          background: 'var(--green-500)',
          color: 'oklch(0.2 0.02 160)',
          boxShadow: 'none',
          height: 24,
          fontSize: 11,
        }}
      >
        {points !== undefined ? `✓ Exact +${points}` : '✓ Exact'}
      </span>
    );
  }

  if (hit === 'outcome') {
    return (
      <span className="chip green" style={{ height: 24, fontSize: 11 }}>
        {points !== undefined ? `Outcome +${points}` : 'Outcome'}
      </span>
    );
  }

  return (
    <span className="chip red" style={{ height: 24, fontSize: 11 }}>
      {points !== undefined ? `Missed +0` : 'Missed'}
    </span>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm -C apps/web typecheck`
Expected: PASS. All existing call sites pass `points={n}` and keep their behaviour; new omitted-points usage is now valid.

- [ ] **Step 3: Run unit/integration tests**

Run: `pnpm -C apps/web vitest run`
Expected: PASS (no test currently asserts on chip text content).

---

## Task 4: Rewrite `BracketMatchCard` to mirror predict's `TieCard`

**Files:**

- Modify: `apps/web/src/features/results/ui/BracketMatchCard.tsx`

Goal: two stacked team rows with `TeamBadge` flags, picked row gets green tint (matches predict), actual winner row gets a right-edge green check when the tie is final, `HitChip` in the header strip, card border color from `hit`. Drop the `PickStatusChip` import. Add a `data-testid` to the root and to each team row.

- [ ] **Step 1: Replace the file content**

Replace the entire content of `apps/web/src/features/results/ui/BracketMatchCard.tsx`:

```tsx
import type { ReactElement } from 'react';
import type { KnockoutMatchView, MatchHit } from '../domain/types';
import { HitChip } from './HitChip';
import { TeamBadge, Icon } from '@/shared/ui';

type Props = { match: KnockoutMatchView };

function borderColorForHit(hit: MatchHit): string {
  if (hit === 'outcome' || hit === 'exact') return 'var(--green-300)';
  if (hit === 'missed') return 'oklch(0.85 0.08 25)';
  return 'var(--line-soft)';
}

function TeamRow({
  teamId,
  teamName,
  isPick,
  isActualWinner,
}: {
  teamId: string | null;
  teamName: string | null;
  isPick: boolean;
  isActualWinner: boolean;
}): ReactElement {
  return (
    <div
      data-testid="bracket-tie-team-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 7px',
        borderRadius: 7,
        background: isPick ? 'var(--green-050)' : 'transparent',
      }}
    >
      <TeamBadge teamId={teamId} size="sm" />
      <span
        style={{
          flex: 1,
          fontSize: 12,
          fontWeight: 700,
          color: isPick ? 'var(--green-700)' : teamId ? 'var(--ink)' : 'var(--ink-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {teamName ?? teamId ?? '?'}
      </span>
      {isPick && <Icon name="check" size={11} color="var(--green-700)" />}
      {isActualWinner && (
        <span
          style={{ fontSize: 11, fontWeight: 700, color: 'var(--green-600)', marginLeft: 2 }}
          aria-label="winner"
        >
          ✓
        </span>
      )}
    </div>
  );
}

export function BracketMatchCard({ match }: Props): ReactElement {
  const noTeams = !match.homeTeamId && !match.awayTeamId;
  const hasScore = match.actualHome !== null && match.actualAway !== null;
  const isFinal = match.status === 'final';

  return (
    <div
      data-testid="bracket-tie-row"
      className="card"
      style={{
        border: `1px solid ${borderColorForHit(match.hit)}`,
        overflow: 'hidden',
        minWidth: 150,
        padding: 4,
      }}
    >
      {/* Header strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          padding: '2px 4px 4px',
        }}
      >
        {hasScore ? (
          <span
            className="tnum"
            style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)' }}
          >
            {match.actualHome}–{match.actualAway}
          </span>
        ) : match.kickoff ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)' }}>
            {new Date(match.kickoff).toLocaleDateString('en-GB', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)' }}>
            {match.round}
          </span>
        )}
        <HitChip hit={match.hit} />
      </div>

      {/* Team rows */}
      {!noTeams ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TeamRow
            teamId={match.homeTeamId}
            teamName={match.homeTeamName}
            isPick={match.pickedWinnerId === match.homeTeamId && match.pickedWinnerId !== null}
            isActualWinner={isFinal && match.actualWinnerId === match.homeTeamId}
          />
          <TeamRow
            teamId={match.awayTeamId}
            teamName={match.awayTeamName}
            isPick={match.pickedWinnerId === match.awayTeamId && match.pickedWinnerId !== null}
            isActualWinner={isFinal && match.actualWinnerId === match.awayTeamId}
          />
        </div>
      ) : (
        <div
          style={{
            padding: '10px 8px',
            textAlign: 'center',
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--ink-muted)',
          }}
        >
          To be determined
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify `PickStatusChip` is now unreferenced**

Run: `grep -rn "PickStatusChip" /workspaces/football-cup-prediction/apps/web/src`
Expected: Only one match — the definition file `PickStatusChip.tsx` itself. No other imports.

- [ ] **Step 3: Run typecheck and tests**

Run: `pnpm -C apps/web typecheck && pnpm -C apps/web vitest run`
Expected: PASS.

---

## Task 5: Add `FinalResultCard` — dark Final / bronze 3rd-place card

**Files:**

- Create: `apps/web/src/features/results/ui/FinalResultCard.tsx`

Mirrors predict's `FinalCard` visually: dark `var(--ink-900)` background for Final + gold Champion pill; lighter `var(--surface)` background for Bronze + bronze pill. Shows actual score large with the user's predicted score smaller beneath. Read-only — no `ScoreCell`, no tiebreak picker.

- [ ] **Step 1: Create the file**

Create `apps/web/src/features/results/ui/FinalResultCard.tsx` with the following content:

```tsx
import type { ReactElement } from 'react';
import type { KnockoutMatchView } from '../domain/types';
import { HitChip } from './HitChip';
import { TeamBadge, Icon } from '@/shared/ui';

type Props = {
  match: KnockoutMatchView;
  matchKey: 'final' | 'bronze';
};

function teamLabel(name: string | null, id: string | null): string {
  return name ?? id ?? '—';
}

export function FinalResultCard({ match, matchKey }: Props): ReactElement {
  const isFinal = matchKey === 'final';
  const hasActualScore = match.actualHome !== null && match.actualAway !== null;
  const hasPredictedScore = match.predictedHome !== null && match.predictedAway !== null;

  const championId = match.actualWinnerId ?? match.pickedWinnerId;
  const championName =
    (match.actualWinnerId
      ? (match.actualWinnerName ?? match.actualWinnerId)
      : match.pickedWinnerId
        ? (match.pickedWinnerName ?? match.pickedWinnerId)
        : null) ?? null;

  const pillBackground = isFinal ? 'var(--gold)' : 'oklch(0.80 0.06 55)';
  const pillTextColor = isFinal ? 'oklch(0.28 0.06 80)' : 'oklch(0.32 0.06 55)';

  return (
    <div
      data-testid={`${matchKey}-result-card`}
      style={{
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        background: isFinal ? 'var(--ink-900)' : 'var(--surface)',
        border: isFinal ? 'none' : '1px solid var(--line-soft)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Header strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          padding: '8px 10px 6px',
        }}
      >
        {hasActualScore ? (
          <span
            className="tnum"
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: isFinal ? 'var(--on-dark)' : 'var(--ink)',
            }}
          >
            {match.actualHome}–{match.actualAway}
          </span>
        ) : match.kickoff ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isFinal ? 'var(--on-dark-soft)' : 'var(--ink-muted)',
            }}
          >
            {new Date(match.kickoff).toLocaleDateString('en-GB', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        ) : (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isFinal ? 'var(--on-dark-soft)' : 'var(--ink-muted)',
            }}
          >
            {isFinal ? 'Final' : '3rd Place'}
          </span>
        )}
        <HitChip hit={match.hit} />
      </div>

      {/* Predicted-score line (only when the user predicted) */}
      {hasPredictedScore && (
        <div
          style={{
            padding: '0 10px 6px',
            fontSize: 11,
            fontWeight: 700,
            color: isFinal ? 'var(--on-dark-soft)' : 'var(--ink-muted)',
            letterSpacing: '0.02em',
          }}
        >
          Your pick: {match.predictedHome}–{match.predictedAway}
        </div>
      )}

      {/* Teams */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px 10px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 5,
            minWidth: 0,
          }}
        >
          <span
            data-testid="home-team-name"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isFinal ? 'var(--on-dark-soft)' : 'var(--ink-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'right',
            }}
          >
            {teamLabel(match.homeTeamName, match.homeTeamId)}
          </span>
          <TeamBadge teamId={match.homeTeamId} size="sm" />
          {match.pickedWinnerId !== null && match.pickedWinnerId === match.homeTeamId && (
            <Icon name="check" size={11} color="var(--green-600)" />
          )}
        </div>

        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: isFinal ? 'var(--on-dark-soft)' : 'var(--ink-muted)',
            letterSpacing: '0.04em',
          }}
        >
          vs
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          <TeamBadge teamId={match.awayTeamId} size="sm" />
          <span
            data-testid="away-team-name"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isFinal ? 'var(--on-dark-soft)' : 'var(--ink-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {teamLabel(match.awayTeamName, match.awayTeamId)}
          </span>
          {match.pickedWinnerId !== null && match.pickedWinnerId === match.awayTeamId && (
            <Icon name="check" size={11} color="var(--green-600)" />
          )}
        </div>
      </div>

      {/* Champion pill */}
      {championId !== null && championName !== null && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0 8px 10px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px 4px 6px',
              borderRadius: 999,
              background: pillBackground,
            }}
          >
            <TeamBadge teamId={championId} size="sm" />
            <span
              className="display"
              style={{ fontSize: 11, color: pillTextColor, letterSpacing: '0.04em' }}
            >
              {championName}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm -C apps/web typecheck`
Expected: PASS.

---

## Task 6: Update `KnockoutBracket` — column geometry, banner, render `FinalResultCard`, bronze into Final column

**Files:**

- Modify: `apps/web/src/features/results/ui/KnockoutBracket.tsx`

Use the same column geometry constants as predict (`TIE_H = 80`, `TIE_GAP = 8`); bump round-column width to 190; render `FinalResultCard` for the Final round; place the bronze tie under the Final card in the right-most column rather than as a separate row below the bracket.

- [ ] **Step 1: Replace the file content**

Replace the entire content of `apps/web/src/features/results/ui/KnockoutBracket.tsx`:

```tsx
import type { ReactElement } from 'react';
import type { BracketRoundResultView, KnockoutMatchView } from '../domain/types';
import { BracketMatchCard } from './BracketMatchCard';
import { FinalResultCard } from './FinalResultCard';

const TIE_H = 80;
const TIE_GAP = 8;
const U = TIE_H + TIE_GAP;

function columnPaddingTop(n: number): number {
  return ((Math.pow(2, n) - 1) * U) / 2;
}

function columnItemGap(n: number): number {
  return Math.pow(2, n) * U - TIE_H;
}

type Props = {
  rounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
};

export function KnockoutBracket({ rounds, bronzeMatch }: Props): ReactElement {
  if (rounds.length === 0) {
    return (
      <div className="card" style={{ padding: '32px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-muted)' }}>
          Knockout stage bracket will appear here once teams are confirmed.
        </p>
      </div>
    );
  }

  // Split off the Final round so we can render the special FinalResultCard in
  // the right-most column alongside the bronze tie.
  const finalRound = rounds.find((r) => r.label === 'Final') ?? null;
  const finalMatch = finalRound?.matches[0] ?? null;
  const mainRounds = rounds.filter((r) => r.label !== 'Final');
  const finalColumnIndex = mainRounds.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Info banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '10px 14px',
          borderRadius: 10,
          background: 'var(--green-050)',
          border: '1px solid var(--green-300)',
          fontSize: 13,
          color: 'var(--green-700)',
        }}
      >
        <span style={{ fontWeight: 800 }}>⚡</span>
        <span>
          Results drop into your bracket as we enter them.{' '}
          <strong>Green = your pick survived, red = it&apos;s out.</strong>
        </span>
      </div>

      {/* Bracket columns */}
      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <div
          style={{
            display: 'flex',
            gap: 16,
            alignItems: 'flex-start',
            minWidth: 'max-content',
          }}
        >
          {mainRounds.map((round, i) => (
            <div
              key={round.label}
              data-testid={`bracket-round-${round.label}`}
              style={{
                minWidth: 190,
                paddingTop: columnPaddingTop(i),
              }}
            >
              <div
                className="eyebrow"
                style={{ color: 'var(--ink-muted)', marginBottom: 8, paddingLeft: 2 }}
              >
                {round.label}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: columnItemGap(i),
                }}
              >
                {round.matches.map((match) => (
                  <BracketMatchCard key={match.bracketMatchKey} match={match} />
                ))}
              </div>
            </div>
          ))}

          {/* Final + Bronze column */}
          {(finalMatch || bronzeMatch) && (
            <div
              style={{
                minWidth: 220,
                paddingTop: columnPaddingTop(finalColumnIndex),
              }}
            >
              {finalMatch && (
                <>
                  <div
                    className="eyebrow"
                    style={{ color: 'var(--ink-muted)', marginBottom: 8, paddingLeft: 2 }}
                  >
                    Final
                  </div>
                  <FinalResultCard match={finalMatch} matchKey="final" />
                </>
              )}
              {bronzeMatch && (
                <>
                  <div
                    className="eyebrow"
                    style={{ color: 'var(--ink-muted)', margin: '16px 0 8px', paddingLeft: 2 }}
                  >
                    3rd Place
                  </div>
                  <FinalResultCard match={bronzeMatch} matchKey="bronze" />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck and tests**

Run: `pnpm -C apps/web typecheck && pnpm -C apps/web vitest run`
Expected: PASS.

---

## Task 7: Widen the results page container and delete `PickStatusChip`

**Files:**

- Modify: `apps/web/src/app/(authenticated)/pools/[id]/results/page.tsx`
- Delete: `apps/web/src/features/results/ui/PickStatusChip.tsx`

- [ ] **Step 1: Bump the page container width**

Open `apps/web/src/app/(authenticated)/pools/[id]/results/page.tsx`. Find the return-statement root div (around line 29):

```tsx
<div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px' }}>
```

Change to:

```tsx
<div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 20px' }}>
```

- [ ] **Step 2: Verify `PickStatusChip` is unreferenced anywhere in `apps/web/src`**

Run: `grep -rn "PickStatusChip" /workspaces/football-cup-prediction/apps/web/src`
Expected: Only the definition file. No imports.

- [ ] **Step 3: Delete `PickStatusChip.tsx`**

Run: `rm apps/web/src/features/results/ui/PickStatusChip.tsx`

- [ ] **Step 4: Run typecheck, lint, and the full test suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS across the workspace.

---

## Task 8: Final verification, build, and single commit

**Files:**

- Stage and commit: all modified files plus the spec doc.

Per CLAUDE.md ("One commit per feature") this is the **only** commit for this work. It includes the spec, the application/domain changes, all UI changes, the page width bump, and the deletion of `PickStatusChip`.

- [ ] **Step 1: Run the full quality gate**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm -C apps/web build`
Expected: All PASS.

If `pnpm format:check` fails, run `pnpm format` and re-run the gate.

- [ ] **Step 2: Manual smoke (UI)**

Start the dev server: `pnpm -C apps/web dev`
Navigate to a pool's results page → Knockout tab. Verify visually:

- Page is visibly wider (1400px max-width).
- Each tie card shows two team rows with flag badges.
- Your picked winner row is green-tinted with a green check.
- When a tie is final, the actual winner row shows a right-edge `✓`.
- Each tie card shows a `HitChip` (`Outcome` / `Missed` / `Exact +N` / hidden when pending).
- Final card has dark background and a gold Champion pill.
- 3rd-place card has light background and a bronze pill, placed directly under the Final card in the right column.
- Below the actual score on Final/Bronze, "Your pick: X–Y" appears when you have a finish-score prediction.
- Right-rail Bracket Health panel still renders next to the bracket.

Use `/dev` simulation checkpoints (`r16-done`, `qf-done`, `finals-done`) to exercise different bracket states.

- [ ] **Step 3: Inspect the diff**

Run: `git status` and `git diff --stat`
Expected status — modified:

- `apps/web/src/app/(authenticated)/pools/[id]/results/page.tsx`
- `apps/web/src/features/results/application/get-results-view.ts`
- `apps/web/src/features/results/application/get-results-view.test.ts`
- `apps/web/src/features/results/domain/types.ts`
- `apps/web/src/features/results/ui/BracketMatchCard.tsx`
- `apps/web/src/features/results/ui/HitChip.tsx`
- `apps/web/src/features/results/ui/KnockoutBracket.tsx`

Untracked / new:

- `apps/web/src/features/results/ui/FinalResultCard.tsx`
- `docs/superpowers/specs/2026-06-12-results-knockout-redesign-design.md`
- `docs/superpowers/plans/2026-06-12-results-knockout-redesign.md`

Deleted:

- `apps/web/src/features/results/ui/PickStatusChip.tsx`

- [ ] **Step 4: Stage and commit (single commit)**

Run:

```bash
git add \
  apps/web/src/app/\(authenticated\)/pools/\[id\]/results/page.tsx \
  apps/web/src/features/results/application/get-results-view.ts \
  apps/web/src/features/results/application/get-results-view.test.ts \
  apps/web/src/features/results/domain/types.ts \
  apps/web/src/features/results/ui/BracketMatchCard.tsx \
  apps/web/src/features/results/ui/HitChip.tsx \
  apps/web/src/features/results/ui/KnockoutBracket.tsx \
  apps/web/src/features/results/ui/FinalResultCard.tsx \
  apps/web/src/features/results/ui/PickStatusChip.tsx \
  docs/superpowers/specs/2026-06-12-results-knockout-redesign-design.md \
  docs/superpowers/plans/2026-06-12-results-knockout-redesign.md
```

Then:

```bash
git commit -m "$(cat <<'EOF'
feat(results): redesign knockout tab to mirror predict bracket

- Widen the results page from 1100 → 1400.
- New BracketMatchCard with TeamBadge flags, picked-winner highlight,
  actual-winner marker, HitChip per tie.
- New FinalResultCard with dark Final + gold Champion pill and bronze
  3rd-place card; predicted score rendered under actual score.
- Bronze moves into the Final column.
- KnockoutMatchView gains predictedHome, predictedAway, hit; populated
  in get-results-view (Final/Bronze finish scores plus per-tie hit).
- HitChip accepts optional points so non-Final/Bronze ties render
  without a +N suffix.
- PickStatusChip deleted (fully replaced by HitChip).
EOF
)"
```

- [ ] **Step 5: Verify post-commit state**

Run: `git status && git log -1 --stat`
Expected: Clean working tree, one new commit with all the files above.

---

## Self-Review

1. **Spec coverage:**
   - §1 Page shell width bump → Task 7 Step 1. ✓
   - §2 ResultsPageClient grid (no change) → no task needed. ✓
   - §3 KnockoutBracket geometry + bronze move → Task 6. ✓
   - §4 BracketMatchCard rewrite → Task 4. ✓
   - §5 FinalResultCard → Task 5. ✓
   - §6 Delete PickStatusChip → Task 7 Step 3 (and verified unreferenced in Task 4 Step 2). ✓
   - §7 BracketHealthPanel unchanged → no task needed. ✓
   - §8 Domain + application changes → Tasks 1 + 2. ✓
   - §9 Files touched list → all listed in File Structure and Task 8 Step 3. ✓
   - §10 Integration tests for hit + predicted scores → Task 2 Steps 1–5. ✓

2. **Placeholder scan:** No TBD / TODO / "implement later" / "similar to" / vague "add validation" patterns. All code blocks are complete.

3. **Type consistency:** `KnockoutMatchView` field names are identical across types.ts, get-results-view.ts (`predictedHome`, `predictedAway`, `hit`), HitChip props, BracketMatchCard, FinalResultCard. `computeKnockoutHit` parameter names match call site.

4. **Commit policy:** One commit at Task 8 — no intermediate commits, per CLAUDE.md "One commit per feature" and project memory. Spec file commits with implementation, per the user feedback memory.
