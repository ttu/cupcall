---
name: invalid-invite-authenticated-pools
description: When an authenticated user hits an invalid invite link, show their pools and personal login link instead of a dead-end error page
metadata:
  type: project
---

# Invalid Invite — Authenticated User Recovery

## Problem

When a user with an existing session follows an expired or removed invite link, they currently see a dead-end "Invalid Invite" card with only a "Go home" button. The auth check is not reached because the page returns early before calling `getCurrentActor`. The user has no path to their pools.

## Goal

For authenticated users on an invalid invite, show:

1. The existing "Invalid Invite" error card (unchanged)
2. Their pool list (using `PoolListItem`)
3. Their personal login link (using `MyLoginLink`) — only if they have no email (guest auth)

Empty state (no pools) shows nothing extra below the error card.

## What Changes

### `apps/web/src/app/join/[token]/page.tsx`

**Reorder the auth check.** The current invalid-token early return fires before `getCurrentActor`. Move `getCurrentActor()` to the top of the page function so it runs for all paths, including the invalid-token case.

**New branch:** when `pool` is null and `actor` exists:

- Call `getUserPools(db, actor.userId)` to get the user's pool list
- If the user has no email: fetch/generate their login token (`getUserById`, `getLoginTokenByUserId`, `upsertLoginToken`) and pass it to `MyLoginLink`
- Render a recovery layout:
  1. "Invalid Invite" error card (same dark header + body as today)
  2. Pool list: `pools.map(p => <PoolListItem pool={p} isOwner={p.ownerId === actor.userId} />)`
  3. `MyLoginLink` if applicable

**Unauthenticated + invalid token** path is unchanged: same card, same "Go home" button.

## Data Dependencies

All required pieces are already exported:

| Import                                                     | Source             |
| ---------------------------------------------------------- | ------------------ |
| `getUserPools`                                             | `@/features/pools` |
| `PoolListItem`                                             | `@/features/pools` |
| `MyLoginLink`                                              | `@/features/pools` |
| `generateLoginToken`                                       | `@/features/pools` |
| `getUserById`, `getLoginTokenByUserId`, `upsertLoginToken` | `@cup/db`          |

No new components, API routes, or schema changes.

## Render Order (authenticated + invalid token)

```
[Invalid Invite card — dark header]
  "This invite link is invalid or has been removed."
  [Go home button]

[Your Pools section — if pools.length > 0]
  <PoolListItem> × N

[MyLoginLink — if user has no email]
```

## Error Handling

- `getUserPools` failure should not crash the page; the error card is still useful without the pool list. Wrap in try/catch and fall back to an empty list silently (this is a recovery path, not critical).

## Testing

- Integration test: authenticated user + invalid token → response includes pool names
- Integration test: unauthenticated user + invalid token → unchanged "Go home" card
- Integration test: authenticated guest user + invalid token → login link section present
- No E2E tests required; this is a low-traffic edge-case path
