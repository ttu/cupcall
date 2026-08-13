# Group Stage Results

## Team name mapping (our name → openfootball name)

| Our name           | Openfootball name    |
| ------------------ | -------------------- |
| Czechia            | Czech Republic       |
| Bosnia-Herzegovina | Bosnia & Herzegovina |
| Türkiye            | Turkey / Türkiye     |

Build a lookup: `(home team name, away team name)` → matchId from `tournament.json groupMatches`. Try both orderings in case openfootball swaps home/away.

## Conduct (card) data

For each group with new results, fetch:

```
https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_Group_A  (through Group L)
```

Ask: "List all matches played with yellow and red cards per team. For each card event: player name, team, card type."

Apply **exactly one deduction per player per match** — pick the player's final card state, don't
stack a separate yellow-card deduction on top of a dismissal it led to. A second yellow that
produces a red card is one dismissal (−3 total), not a yellow (−1) plus a red (−3):

| Player's final state in the match                                                                                                       | Points |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Yellow card only (no dismissal)                                                                                                         | −1     |
| Sent off for a second yellow card                                                                                                       | −3     |
| Sent off for a straight red card                                                                                                        | −4     |
| Cautioned with a yellow card earlier, then separately sent off with a straight red card for an unrelated incident (two distinct events) | −5     |

Sum each player's single deduction across all players on a team to get that team's total for the
match. **Omit the field entirely when zero** (engine treats absent as 0).

Only player cards shown on the pitch are recorded; bench/staff cards are excluded.

## JSON format — append to `matchResults[]`

```json
{ "matchId": "mX9", "home": 2, "away": 1, "homeConduct": -1, "awayConduct": -3 }
```

`home`/`away` = goals for the team listed as home/away in `tournament.json`, not necessarily openfootball's team1.
