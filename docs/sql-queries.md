# Common SQL queries

Reference of read-mostly SQL for support/debugging against the real database (Neon), run via
`psql "$DATABASE_URL"` or the `postgres` MCP tool. These are **not** application code — the app
always goes through `@cup/db` repositories (`packages/db/src/repositories/*`) with Drizzle's
parameterized query builder. Use these for one-off investigation only.

> **Quoting gotcha:** the Auth.js adapter tables (`user`, `account`, `session`, `verificationToken`)
> use camelCase column/table names required by `@auth/drizzle-adapter` (see
> `packages/db/src/schema/auth.ts`). Postgres folds unquoted identifiers to lowercase, so these
> **must** be double-quoted exactly as written, e.g. `"emailVerified"`, `"sessionToken"`,
> `"verificationToken"`. Every other table is plain snake_case and needs no quoting.

Schema source of truth: `packages/db/src/schema/*.ts`. Data model narrative: functional-spec §10.

---

## Users

### Find a user by email or display name

```sql
SELECT id, email, display_name, "emailVerified"
FROM "user"
WHERE email = 'someone@example.com'
   OR display_name ILIKE '%tomi%';
```

### Guest vs. linked-email users

Guests sign in without email (`features/auth/guest.ts`); `email` is `NULL` until they link one.

```sql
SELECT
  count(*) FILTER (WHERE email IS NULL)     AS guest_users,
  count(*) FILTER (WHERE email IS NOT NULL) AS linked_users
FROM "user";
```

### Stale users — not an owner or member of any pool

Candidates for cleanup: signed up (guest or linked) but never joined/created a pool.

```sql
SELECT u.id, u.display_name, u.email, u."emailVerified"
FROM "user" u
WHERE NOT EXISTS (SELECT 1 FROM pool_members pm WHERE pm.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM pools p WHERE p.owner_id = u.id)
ORDER BY u.display_name;
```

### Users who joined a pool but never submitted a prediction

Member row exists, but no `predictions` row for that pool.

```sql
SELECT u.id, u.display_name, pm.pool_id, pl.name AS pool_name, pm.joined_at
FROM pool_members pm
JOIN "user" u ON u.id = pm.user_id
JOIN pools pl ON pl.id = pm.pool_id
WHERE NOT EXISTS (
  SELECT 1 FROM predictions pr WHERE pr.pool_id = pm.pool_id AND pr.user_id = pm.user_id
)
ORDER BY pm.joined_at;
```

---

## Pools

### All pools with owner, tournament, and member count

```sql
SELECT
  p.id,
  p.name,
  p.tournament_id,
  u.display_name AS owner_name,
  p.created_at,
  (SELECT count(*) FROM pool_members pm WHERE pm.pool_id = p.id) AS member_count,
  p.invite_token_hash IS NOT NULL AS invite_enabled,
  p.view_token IS NOT NULL AS view_link_enabled
FROM pools p
JOIN "user" u ON u.id = p.owner_id
ORDER BY p.created_at DESC;
```

### Pools nobody ever joined (owner is the only member)

Useful to spot abandoned pools.

```sql
SELECT p.id, p.name, p.owner_id, p.created_at
FROM pools p
WHERE (SELECT count(*) FROM pool_members pm WHERE pm.pool_id = p.id) <= 1
ORDER BY p.created_at DESC;
```

### Pools with an expired invite token still set

`clearInviteToken` should null this out after expiry, but the field is only cleared lazily on lookup —
this finds tokens that are logically dead but still present.

```sql
SELECT id, name, owner_id, token_expires_at
FROM pools
WHERE invite_token_hash IS NOT NULL
  AND token_expires_at IS NOT NULL
  AND token_expires_at < now();
```

---

## Predictions

### All predictions for a user across every pool, with pool + tournament context

The "get all user predictions and info" query — one row per (pool, tournament) the user has a
card in, with completion counts per sub-table.

```sql
SELECT
  pr.id AS prediction_id,
  pl.name AS pool_name,
  t.id AS tournament_id,
  t.name AS tournament_name,
  pr.locked_at,
  (SELECT count(*) FROM prediction_group_scores gs WHERE gs.prediction_id = pr.id)      AS group_scores_filled,
  (SELECT count(*) FROM prediction_knockout_picks kp WHERE kp.prediction_id = pr.id)    AS knockout_picks_filled,
  (SELECT count(*) FROM prediction_finish_scores fs WHERE fs.prediction_id = pr.id)     AS finish_scores_filled,
  (SELECT count(*) FROM prediction_specials sp WHERE sp.prediction_id = pr.id)          AS specials_filled
FROM predictions pr
JOIN pools pl ON pl.id = pr.pool_id
JOIN tournaments t ON t.id = pr.tournament_id
WHERE pr.user_id = '<user-id>'
ORDER BY pr.locked_at NULLS FIRST;
```

### Full card contents for one prediction (all four input tables)

Mirrors what `getPredictionInputs` (`packages/db/src/repositories/predictions.ts`) assembles.

```sql
SELECT 'group_score' AS kind, match_id AS key, home_goals::text || '-' || away_goals::text AS value
FROM prediction_group_scores WHERE prediction_id = '<prediction-id>'
UNION ALL
SELECT 'knockout_pick', bracket_match_key, winner_team_id
FROM prediction_knockout_picks WHERE prediction_id = '<prediction-id>'
UNION ALL
SELECT 'finish_score', match::text, home_goals::text || '-' || away_goals::text
FROM prediction_finish_scores WHERE prediction_id = '<prediction-id>'
UNION ALL
SELECT 'special', bet_key, value::text
FROM prediction_specials WHERE prediction_id = '<prediction-id>';
```

### Edit history (owner overrides / imports) for a prediction

```sql
SELECT pe.edited_at, u.display_name AS editor, pe.field_path, pe.old_value, pe.new_value, pe.source, pe.reason
FROM prediction_edits pe
JOIN "user" u ON u.id = pe.editor_user_id
WHERE pe.prediction_id = '<prediction-id>'
ORDER BY pe.edited_at DESC;
```

---

## Scores & leaderboard

### Leaderboard for a pool (points + rank, members without a score row included)

Raw-SQL equivalent of `getLeaderboard` (`packages/db/src/repositories/scores.ts`); members who
haven't been scored yet appear last at 0 points.

```sql
SELECT
  u.display_name,
  COALESCE(s.points_total, 0) AS points_total,
  RANK() OVER (ORDER BY COALESCE(s.points_total, 0) DESC) AS rank
FROM pool_members pm
JOIN "user" u ON u.id = pm.user_id
LEFT JOIN scores s ON s.pool_id = pm.pool_id AND s.user_id = pm.user_id
WHERE pm.pool_id = '<pool-id>'
ORDER BY COALESCE(s.points_total, 0) DESC, u.display_name ASC;
```

### Top scorer per pool, across a whole tournament

```sql
SELECT DISTINCT ON (p.id) p.id AS pool_id, p.name AS pool_name, u.display_name, s.points_total
FROM pools p
JOIN scores s ON s.pool_id = p.id
JOIN "user" u ON u.id = s.user_id
WHERE p.tournament_id = 'wc-2026'
ORDER BY p.id, s.points_total DESC;
```

---

## Tournament & results

### Matches that have kicked off but have no result yet

Flags sync-pipeline gaps — a match should move to `status = 'final'` with goals once the sync job
picks up results from `data/tournaments/<id>/results.json`.

```sql
SELECT tournament_id, id AS match_id, stage, home_team_id, away_team_id, kickoff, status
FROM matches
WHERE tournament_id = 'wc-2026'
  AND kickoff IS NOT NULL
  AND kickoff < now()
  AND status <> 'final'
ORDER BY kickoff;
```

### Sanity check counts after a sync run

```sql
SELECT
  (SELECT count(*) FROM teams WHERE tournament_id = 'wc-2026')        AS teams,
  (SELECT count(*) FROM players WHERE tournament_id = 'wc-2026')      AS players,
  (SELECT count(*) FROM matches WHERE tournament_id = 'wc-2026')      AS matches,
  (SELECT count(*) FROM matches WHERE tournament_id = 'wc-2026' AND status = 'final') AS matches_final;
```

---

## Housekeeping / expired data

### Expired Auth.js verification tokens (magic-link) not yet cleaned up

```sql
SELECT identifier, token, expires
FROM "verificationToken"
WHERE expires < now();
```

### Expired pending email-link requests (guest → email upgrade)

```sql
SELECT user_id, email, token, expires_at
FROM pending_email_link
WHERE expires_at < now();
```

### Stale rate-limit windows

`rate_limits` rows key on `(key, window_start)`; old windows are never deleted automatically.

```sql
SELECT key, window_start, count
FROM rate_limits
WHERE window_start < now() - interval '1 day'
ORDER BY window_start;
```

---

## Notes

- All ids (`user.id`, `pools.id`, `predictions.id`, etc.) are `text` UUIDs generated in the app
  layer (`crypto.randomUUID()`), not Postgres `uuid`/`serial` — copy them as plain strings, no
  casting needed.
- `matches`, `teams`, `players`, `stage_groups`, `actual_group_order`, `actual_answers` are keyed
  by natural ids scoped to `tournament_id` (composite PKs) — always filter by `tournament_id` too,
  not just the natural id, when a tournament may have more than one row with that id in dev/test data.
- Prefer read-only queries here. Any write (`UPDATE`/`DELETE`) against production data should go
  through a reviewed script or the app's repositories so cascades, rescoring, and audit logging
  (`prediction_edits`) stay consistent.
