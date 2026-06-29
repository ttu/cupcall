# Knockout Round Prediction Percentages

**Date:** 2026-06-29

## Goal

Show, on every bracket match card in the knockout bracket, the percentage of pool members who predicted each team would be playing in that round. Currently only the entry round (R32) shows this stat; this extends it uniformly to R16, QF, SF, and Final.

## Semantics

> **"% predicted in this round"** = % of pool members who predicted this team would advance this far into the tournament.

- **Entry round (R32):** % who predicted the team to qualify from the group stage (derived from group score predictions). Unchanged.
- **R16:** % who picked the team to win their R32 match (i.e., advance to R16).
- **QF:** % who picked the team to win their R16 match.
- **SF:** % who picked the team to win their QF match.
- **Final:** % who picked the team to win their SF match.
- **Bronze:** % who picked the team to be in the bronze match (SF loser path — not computed, left null).

The percentage is null when the team slot is unknown (TBD) or no pool picks exist.

## Data layer — `KnockoutMatchView`

Rename fields:

- `homeTeamR32Pct` → `homeTeamPredictedPct`
- `awayTeamR32Pct` → `awayTeamPredictedPct`

Same type (`number | null`), same display semantics. All consumers updated to use the new names.

## Application layer — `buildBracketRounds`

### New parameter

```ts
buildBracketRounds(
  def: Tournament,
  allMatches: MatchRow[],
  inputs: ... | null,
  poolGroupScores: PoolGroupScore[],
  poolKnockoutPicks: PoolKnockoutPick[],   // NEW
)
```

`getResultsView` already fetches `poolKnockoutPicks`; pass it through.

### New computation: `computeKnockoutRoundPcts`

Builds `Map<bracketMatchKey, Map<teamId, pct>>` from `poolKnockoutPicks`:

1. Count picks per `(bracketMatchKey, winnerTeamId)`.
2. `totalUsers` = distinct user count in `poolKnockoutPicks` (users who submitted at least one knockout pick).
3. Divide counts by `totalUsers`, round to nearest integer.

### Feeder match lookup

For each progression match M (R16+):

- `prog.from = [feeder0, feeder1]`
- `derivedParticipants` already maps every match key to its `[homeId, awayId]`.
- For the home team of M: find which feeder (`feeder0` or `feeder1`) has homeTeamId as a participant → look up `knockoutRoundPcts[feeder][homeTeamId]`.
- For the away team: same, using awayTeamId.

If the feeder cannot be determined (team not yet known), the pct is null.

### Entry round path

Unchanged — `computeEntryRoundPredictionPcts` populates pcts from group score predictions; stored under the renamed `homeTeamPredictedPct`/`awayTeamPredictedPct`.

## UI layer — `BracketMatchCard`

`TeamRow` already renders the percentage field (`r32Pct` prop). Rename prop to `predictedPct`. No logic changes to the component.

## Testing

New tests in `build-bracket-rounds.test.ts`:

- Given known pool knockout picks, verify that `homeTeamPredictedPct` and `awayTeamPredictedPct` are correctly computed for R16, QF, SF, and Final match views.
- Verify null is returned when the team slot is unknown.
- Verify entry-round pcts are unaffected (still derive from group scores).
