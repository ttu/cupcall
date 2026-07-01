# Design spec: "Your top 4" panel

**Date:** 2026-07-01
**Status:** Approved

## Problem

The Knockout sidebar shows only the user's champion pick ("Your champion" card in `BracketHealthPanel`). Users also want to see their 2nd, 3rd, and 4th place picks and whether each team is still alive.

## Solution

Replace the "Your champion" card with a "Your top 4" card showing all four finish picks in a compact ranked list, each with an inline alive/eliminated status.

## Visual

```
🏆 Your top 4
1st  [ESP] Spain · still alive
2nd  [FRA] France · still alive
3rd  [GER] Germany · eliminated
4th  [BRA] Brazil · eliminated
```

Position labels are fixed-width muted text. Team is shown as `<span class="badge sm">` (team ID) + team name. Status uses existing colour conventions: green for alive, red for eliminated, muted for pending.

## Data

All data is already available in `ResultsView`. No backend changes needed.

| Position | Source field                                          | Status derivation                                                                                                                                                 |
| -------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1st      | `finalMatch.pickedWinnerId` / `pickedWinnerName`      | `finalMatch.pickStatus`                                                                                                                                           |
| 2nd      | `finalMatch.pickedOpponentId` / `pickedOpponentName`  | `alive` if `pickedOpponentId` matches `homeTeamId` or `awayTeamId` on `finalMatch`; `busted` if both finalists confirmed and neither matches; `pending` otherwise |
| 3rd      | `bronzeMatch.pickedWinnerId` / `pickedWinnerName`     | `bronzeMatch.pickStatus`                                                                                                                                          |
| 4th      | `bronzeMatch.pickedOpponentId` / `pickedOpponentName` | Same pattern as 2nd, applied to `bronzeMatch`                                                                                                                     |

`pickedOpponentId` is already populated on `KnockoutMatchView` (derived from SF bracket picks).

## Component changes

**`BracketHealthPanel.tsx`** — only file changed.

- Add `bronzeMatch: KnockoutMatchView | null` prop (already on `ResultsView`, already passed to `KnockoutBracket`; wire it through in `ResultsPageClient`).
- Extract pure helper `deriveOpponentStatus(match: KnockoutMatchView, pickedOpponentId: string): PickStatus` for the 2nd/4th status logic.
- Replace the "Your champion" block with a "Your top 4" block rendering four rows.
- Card renders only when at least one of the four team IDs is non-null.

No new files. No Storybook story (results page component, not shared UI).

## Out of scope

- Showing predicted scores for Final/Bronze in this card (already shown in the match cards below).
- Any backend changes.
