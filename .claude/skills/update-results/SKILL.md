---
name: update-results
description: Fetch the latest World Cup 2026 match results from openfootball and add any missing scores to results.json. Use when the user says "update results", "update today's matches", "update latest matches", or similar.
---

# Update Match Results

## What this does

1. Find which group matches are missing from `data/tournaments/wc-2026/results.json`
2. Fetch the openfootball feed for scores
3. Fetch Wikipedia group pages for conduct (card) data
4. Map completed matches to our match IDs
5. Write new results into `results.json`

## Step 1 — find missing matches

Run this to see which matches should have been played but lack a result:

```bash
python3 -c "
import json
from datetime import datetime, timezone

with open('data/tournaments/wc-2026/tournament.json') as f:
    t = json.load(f)
with open('data/tournaments/wc-2026/results.json') as f:
    r = json.load(f)

done = {x['matchId'] for x in r['matchResults']}
now = datetime.now(timezone.utc).isoformat()

for m in t['groupMatches']:
    if m['kickoff'] < now and m['id'] not in done:
        print(m['id'], m['home'], 'vs', m['away'], m['kickoff'])
"
```

## Step 2 — fetch openfootball

Fetch: `https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json`

Ask: "List every match with a completed score (ft field). For each: team1, team2, score.ft[0], score.ft[1], date."

## Step 3 — map team names to IDs

Our team names (from `tournament.json` `teams[].name`) versus openfootball names differ in a few cases:

| Our name | Openfootball name |
|---|---|
| Czechia | Czech Republic |
| Bosnia-Herzegovina | Bosnia & Herzegovina |
| DR Congo | DR Congo |
| Ivory Coast | Ivory Coast |
| Türkiye | Turkey / Türkiye |

Build a lookup: for each of our `groupMatches`, the pair `(home team name, away team name)` → match ID. Match openfootball entries by team name pair (try both orderings in case home/away is swapped in openfootball).

## Step 4 — fetch conduct (card) data

For each group with new results, fetch the corresponding Wikipedia page:

```
https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_Group_A
https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_Group_B
... (through Group L)
```

Ask: "List all matches played with yellow and red cards per team. For each card event show: player name, team, card type (yellow, second yellow/indirect red, straight red, yellow+straight red)."

Compute a `homeConduct` and `awayConduct` integer per match using these point deductions:

| Card event | Points |
|---|---|
| Yellow card | −1 |
| Red card for two yellows | −3 |
| Straight red card | −4 |
| Yellow card + straight red card | −5 |

Sum all card events per team per match. **Only include the field in the JSON when the value is non-zero** (omit the field entirely for a clean team, since the engine treats absent as 0).

## Step 5 — add missing results

For each openfootball match that maps to one of our missing match IDs, append to `matchResults`:

```json
{ "matchId": "mX9", "home": 2, "away": 1, "homeConduct": -1, "awayConduct": -3 }
```

`home`/`away` = goals for the team listed as `home`/`away` in our `tournament.json` (not necessarily openfootball's `team1`). Same applies to `homeConduct`/`awayConduct`.

## Step 6 — commit

```
git add data/tournaments/wc-2026/results.json
git commit -m "data(wc-2026): add match results for <date> (<groups>)"
```

## Notes

- Openfootball may lag 1–12 hours behind live results. If a match is missing there, note it and move on.
- Do not guess scores or card data. Only add what is present in the sources.
- Wikipedia group pages may not list cards for the bench/technical staff — only player cards shown on the pitch are recorded.
- Knockout matches use a different results structure — this skill covers group stage only.
