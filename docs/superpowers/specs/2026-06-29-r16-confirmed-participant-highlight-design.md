# Design: Confirmed-participant green highlight for R16+ bracket cards

**Date:** 2026-06-29  
**Status:** Approved

## Problem

In bracket match cards for R16 and later rounds (QF, SF, Final), a team that has been confirmed as a participant — meaning they won their previous round match — does not receive a green background even if the user correctly predicted they would advance. Green is only shown when the user picked that team to **win** the current match, not when they predicted the team to **reach** it.

The ✓ (confirmed) badge already appears correctly for these teams (because their slot is not "soft"). The gap is purely the green row background.

## Desired behaviour

For every progression round (R16, QF, SF, Final), a team row shows a green background when **both** conditions hold:

1. The team is a confirmed participant in this match (their slot is not soft / TBD).
2. The user's pick chain predicted this team would be in this slot — i.e., the user correctly picked the winner of the match that fed this slot.

Entry-round (R32) behaviour is unchanged: green there still comes from `predictedQualifierIds`.

## Design

### Approach

Compute a "user-only pick chain" — what team the user predicted would occupy each bracket slot — without ever substituting actual match results. Compare against the confirmed team to set a per-slot boolean on the view model.

### `build-bracket-rounds.ts` — new function `computeUserPickedParticipants`

A private function with the same signature and structure as the existing `computeUserPredictedParticipants`, with one key difference: it never uses `actual.winnerTeamId` to override user picks. The actual results are only used to determine confirmed participants for the cross-slot entry-round adjustment.

```
computeUserPickedParticipants(
  def: Tournament,
  allMatches: MatchRow[],
  pickMap: Map<string, string>,
  derivedParticipants: Map<BracketMatchKey, [string, string]>,
): Map<string, [string | null, string | null]>
```

Walk order:

1. **Entry rounds (R32):** same cross-slot adjustment as today — prefer a direct pick that matches the projected/actual slot participants; fall back to a cross-slot pick from `allEntryPickedTeams`. Do **not** substitute `actual.winnerTeamId`.
2. **Progression rounds (R16+):** `getUserPickedWinner(feederKey)` returns the user's pick for `feederKey` if it validates against the predicted participants of that feeder match. Do **not** substitute `actual.winnerTeamId` here either.

Returns: `Map<matchKey, [predictedHome, predictedAway]>` — what the user predicted in each slot.

### `buildMatchView` — two new fields

```ts
const userPickedPair = userPickedParticipants.get(key);

homeTeamUserPredictedParticipant:
  !isEntryRound && homeId !== null && userPickedPair?.[0] === homeId,

awayTeamUserPredictedParticipant:
  !isEntryRound && awayId !== null && userPickedPair?.[1] === awayId,
```

`false` for entry rounds (green is handled by `predictedQualifierIds`), and `false` when no team is confirmed yet.

### `domain/types.ts` — extend `KnockoutMatchView`

```ts
/** True when the confirmed home-slot team matches the user's predicted participant for this round (progression rounds only). */
homeTeamUserPredictedParticipant: boolean;
/** True when the confirmed away-slot team matches the user's predicted participant for this round. */
awayTeamUserPredictedParticipant: boolean;
```

### `BracketMatchCard.tsx` — update `isPick` condition

```tsx
// Home team row
isPick={
  effectiveHomeId !== null &&
  (match.pickedWinnerId === effectiveHomeId ||
   predictedQualifierIds.has(effectiveHomeId) ||
   match.homeTeamUserPredictedParticipant)
}

// Away team row — symmetric
isPick={
  effectiveAwayId !== null &&
  (match.pickedWinnerId === effectiveAwayId ||
   predictedQualifierIds.has(effectiveAwayId) ||
   match.awayTeamUserPredictedParticipant)
}
```

No changes to `isSoft`, `showConfirmedBadge`, `showProjectedBadge`, or any other styling logic.

## Data flow

```
buildBracketRounds()
  └─ computeUserPickedParticipants()   ← new, picks-only chain
  └─ buildMatchView()
       └─ homeTeamUserPredictedParticipant  ← new field on KnockoutMatchView
       └─ awayTeamUserPredictedParticipant

KnockoutBracket → BracketMatchCard
  └─ isPick uses homeTeamUserPredictedParticipant / awayTeamUserPredictedParticipant
```

## Error handling

- No pick made: `pickMap.get(feederKey)` returns undefined → `getUserPickedWinner` returns null → `homeTeamUserPredictedParticipant = false`. Safe default.
- Team slot TBD (no actual or derived participant): `homeId = null` → field is `false`. No stale green.
- Incorrect pick (user picked wrong team): predicted team ≠ confirmed team → field is `false`. No false green.

## Testing

All in `build-bracket-rounds.test.ts` (unit):

- **R16 correct pick:** User picks actual R32 winner → `homeTeamUserPredictedParticipant = true` on resulting R16 card.
- **R16 wrong pick:** User picks loser → `homeTeamUserPredictedParticipant = false`.
- **R16 no pick:** No entry in pickMap → `false`.
- **QF correct chain:** User correctly picks through R32 and R16 → `homeTeamUserPredictedParticipant = true` on QF card.
- **Entry round unaffected:** `isEntryRound = true` → both fields are always `false`.
- **TBD slot:** `homeId = null` → `false`.
- **Viewer mode (null inputs):** `computeUserPickedParticipants` is not called; fields default to `false`.

No E2E changes required — the styling is covered by existing snapshot/visual tests and the unit tests above verify the field values.
