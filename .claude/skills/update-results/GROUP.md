# Group Stage Results

## Team name mapping (our name → openfootball name)

| Our name | Openfootball name |
|---|---|
| Czechia | Czech Republic |
| Bosnia-Herzegovina | Bosnia & Herzegovina |
| Türkiye | Turkey / Türkiye |

Build a lookup: `(home team name, away team name)` → matchId from `tournament.json groupMatches`. Try both orderings in case openfootball swaps home/away.

## Conduct (card) data

For each group with new results, fetch:
```
https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_Group_A  (through Group L)
```
Ask: "List all matches played with yellow and red cards per team. For each card event: player name, team, card type."

Point deductions per card event:

| Card event | Points |
|---|---|
| Yellow card | −1 |
| Red card for two yellows | −3 |
| Straight red card | −4 |
| Yellow card + straight red card | −5 |

Sum all events per team per match. **Omit the field entirely when zero** (engine treats absent as 0).

Only player cards shown on the pitch are recorded; bench/staff cards are excluded.

## JSON format — append to `matchResults[]`

```json
{ "matchId": "mX9", "home": 2, "away": 1, "homeConduct": -1, "awayConduct": -3 }
```

`home`/`away` = goals for the team listed as home/away in `tournament.json`, not necessarily openfootball's team1.
