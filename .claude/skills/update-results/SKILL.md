---
name: update-results
description: Fetch the latest World Cup 2026 match results from openfootball/Wikipedia and add any missing scores to results.json (both group stage and knockout stage). Use when the user says "update results", "update today's matches", "update latest matches", "fill missing knockout results", or similar.
---

# Update Match Results

Covers both group stage (`matchResults[]`) and knockout stage (`knockout[]`).

## Step 1 — find what's missing

```bash
python3 -c "
import json
from datetime import datetime, timezone

with open('data/tournaments/wc-2026/tournament.json') as f:
    t = json.load(f)
with open('data/tournaments/wc-2026/results.json') as f:
    r = json.load(f)

now = datetime.now(timezone.utc).isoformat()

# Group stage
done_group = {x['matchId'] for x in r['matchResults']}
missing_group = [(m['id'], m['home'], m['away'], m['kickoff'])
    for m in t['groupMatches'] if m['kickoff'] < now and m['id'] not in done_group]

# Knockout stage
done_ko = {x['matchId'] for x in r['knockout']}
all_ko = {s['match'] for s in t['bracket']['slots']}  # R32 only; add r16/qf/sf/final IDs as needed
missing_ko = sorted(all_ko - done_ko)

print('Missing group:', missing_group)
print('Missing knockout:', missing_ko)
"
```

## Step 2 — fetch sources

- **openfootball:** `https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json`  
  Ask: "List every match that has a completed score. For each: match number, team1, team2, score ft, score after extra time (if any), penalty shootout result (if any), date and UTC kickoff time."
- **Wikipedia knockout page** (fallback / confirm decidedBy):  
  `https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_knockout_stage`  
  Ask: "List all completed matches with final score, whether decided by regulation / extra time / penalties, and the penalty shootout score."

Only add what sources confirm. If openfootball lags, try Wikipedia. Never guess.

## Step 3 — group stage results

See [GROUP.md](GROUP.md) for the full group-stage workflow (team name mapping, conduct scoring, JSON format).

## Step 4 — knockout results

### 4a — resolve home/away teams from bracket slots

The slot for each matchId shows position codes (e.g. `"home": "1A", "away": "3E"`).  
Compute group standings from `matchResults` to resolve `1A → MEX`, `3E → ECU`, etc.

### 4b — map openfootball match number → matchId

openfootball match numbers align directly: `#77 → r32m77`, `#78 → r32m78`, etc.

### 4c — determine `decidedBy`

| Situation | `decidedBy` |
|---|---|
| Score differs after 90 min | `"regulation"` |
| Score level after 90, differs after 120 | `"extraTime"` |
| Score level after 120 min | `"penalties"` |

`homeGoals`/`awayGoals` always reflect the **final score**:
- `regulation`: 90-min score
- `extraTime`: score after 120 min (includes ET goals)
- `penalties`: score after ET (still tied; winner determined by `winner` field)

### 4d — append to `knockout[]`

```json
{
  "round": "R32",
  "matchId": "r32m79",
  "home": "MEX",
  "away": "ECU",
  "homeGoals": 2,
  "awayGoals": 0,
  "winner": "MEX",
  "decidedBy": "regulation",
  "kickoff": "2026-07-01T01:00:00Z"
}
```

No conduct fields in knockout entries.

Round values: `"R32"`, `"R16"`, `"QF"`, `"SF"`, `"Final"`.

## Step 5 — commit

```
git add data/tournaments/wc-2026/results.json
git commit -m "data(wc-2026): add results for <date> (<matches>)"
```
