# Results & Standings Feature

Route: `/pools/[id]/results`

## What it does

Shows actual tournament results alongside each user's predictions so pool members can
track how they're scoring in real time as the tournament progresses.

## Two tabs

**Group Stage tab** — for each group:

- Completed match feed: actual score, user's predicted score, hit chip (Exact / Outcome / Missed)
- Live group table: P (played), GD, Pts with qualifying highlights

**Knockout tab** — bracket tracker:

- All knockout rounds (entry round → Final) with per-tie match cards
- Each card: actual score / upcoming date, your pick, pick status (alive / busted / upcoming)
- Third-place match displayed separately
- Right rail: bracket health (N/M picks alive + progress bar), champion pick status

## Data flow

```
ResultsPage (RSC)
  └── getCurrentActor() + isMember()          [auth/authz boundary]
  └── getResultsView(db, poolId, userId, now)
        └── Promise.all: getPoolById, getTournamentById, getLeaderboard,
                         getPrediction, getMatchesForTournament
        └── if prediction: getPredictionInputs
        └── buildUserRank()        → UserRankChip
        └── buildStageProgress()   → StageProgress[]
        └── buildGroupResults()    → GroupResultView[]
              └── inline hit detection per match
              └── stats accumulation for group standings
        └── buildBracketRounds()   → BracketRoundResultView[] + bronzeMatch
              └── matchByKey lookup (bracketMatchKey === matches.id)
        └── buildBracketHealth()   → BracketHealth
        → ResultsView
  └── <StageBar /> <UserScoreChip />           [server components]
  └── <ResultsPageClient />                    [client boundary — tab + group state]
```

## Hit detection

Inline in the application service (not via the engine's `scoreCard`):

- `exactScore` if predicted goals match actual goals exactly
- `correctOutcome` if the winning side matches (home win / draw / away win)
- `0` for a miss
- `pending` when the user has no prediction for a completed match

## Bracket tracking

Knockout matches are stored in the `matches` table with `id = bracketMatchKey`
(e.g. `'qf1'`, `'sf2'`, `'final'`). The service looks up each bracket slot's key
in the match map. A pick is:

- **alive** when `winnerTeamId === pickedWinnerId`
- **busted** when the match is final and the winner differs
- **pending** when the match has no result yet
- **no-pick** when the user never made a pick for that slot

## File locations

| Layer        | File                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| Domain types | `features/results/domain/types.ts`                                                                               |
| Application  | `features/results/application/get-results-view.ts`                                                               |
| Tests        | `features/results/application/get-results-view.test.ts`                                                          |
| UI           | `features/results/ui/*.tsx`                                                                                      |
| Barrel       | `features/results/index.ts`                                                                                      |
| Page         | `app/pools/[id]/results/page.tsx`                                                                                |
| DB helpers   | `packages/db/src/repositories/tournament.ts` (`getMatchesForTournament`, `finalizeMatch`, `upsertKnockoutMatch`) |
