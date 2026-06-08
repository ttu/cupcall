# Pools feature

## Overview

Pools are the social layer of the app. A pool groups players around a shared prediction tournament,
tracks scores on a leaderboard, and controls who can view cards. This document covers domain model,
application flows, UI components, and authorization rules.

## Domain model

```
Pool
├── id: PoolId
├── name: string
├── tournamentId: string
├── ownerId: UserId
├── inviteTokenHash: string  (raw 48-char hex token; name is legacy from v1)
├── tokenExpiresAt: Date
└── status: 'open' | 'locked' | 'finished'

Member
├── poolId: PoolId
├── userId: UserId
└── joinedAt: Date

Kick
├── poolId: PoolId
└── targetUserId: UserId   (soft-ban: kicked users cannot rejoin via invite)

Score
├── poolId: PoolId
├── userId: UserId
└── points: Points
```

### Token strategy

The `inviteTokenHash` column stores the **raw 48-char hex token** (not a hash), making it possible
to reconstruct the invite URL directly from the pool row. The column name is a legacy artefact from
an earlier design; the direct-equality lookup via `getPoolByInviteTokenHash` is still correct.

`generateInviteToken()` uses `crypto.randomBytes(24).toString('hex')` — 192 bits of entropy, no
external deps. Tokens have a 30-day TTL (`tokenExpiresAt`). Owners can rotate the token at any time.

## Application flows

### Create pool (`create-pool.ts`)

1. Check owner pool cap: `countPoolsOwnedBy(ownerId) ≤ 5`, else `pool_cap_exceeded`.
2. Check rate limit: `checkRateLimit(db, ownerId, 'createPool', now)`, else `rate_limited`.
3. Pick the first tournament by `listTournaments()` (v1 assumes one active tournament), else `no_tournament`.
4. `dbCreatePool({ name, tournamentId, ownerId, inviteTokenHash: token, tokenExpiresAt })`.
5. `addMember(db, poolId, ownerId)` — owner automatically joins their own pool.
6. `getOrCreatePrediction(db, poolId, ownerId, tournamentId)` — owner gets a card.
7. Return `{ ok: true; pool: PoolSummary }`.

### Join pool (`join-pool.ts`)

1. `getPoolByInviteTokenHash(db, token)` — not found → `not_found`.
2. Token expiry check — `pool.tokenExpiresAt < now` → `token_expired`.
3. `isKicked(db, poolId, userId)` → `kicked`.
4. `isMember(db, poolId, userId)` → return `{ ok: true; alreadyMember: true }` (idempotent).
5. `countPoolMembers(db, poolId) ≤ 100`, else `pool_full`.
6. `checkRateLimit(db, userId, 'joinPool', now)`, else `rate_limited`.
7. `addMember` + `getOrCreatePrediction`.
8. Return `{ ok: true; poolId; alreadyMember: false }`.

### Get user pools (`get-user-pools.ts`)

`listPoolsForUser(db, userId)` → for each pool, parallel `getLeaderboard` call → find user's score
entry → assemble `PoolSummary[]`.

### Get pool detail (`get-pool-detail.ts`)

`getPoolById` + `getLeaderboard` + `getTournamentById` → assemble `PoolDetail` (includes raw
`inviteToken` from `pool.inviteTokenHash` for URL display).

## API actions

All actions are `'use server'` functions in `features/pools/api/actions.ts`. All validate inputs
with Zod and return `{ ok: boolean; error?: string }` (except `deletePool` which redirects).

| Action                                 | Auth check       | Side effects                                                      |
| -------------------------------------- | ---------------- | ----------------------------------------------------------------- |
| `createPool({ name })`                 | `assertSignedIn` | calls `appCreatePool`, `revalidatePath('/pools')`                 |
| `joinPool({ token })`                  | `assertSignedIn` | calls `appJoinPool`, `revalidatePath('/pools')`                   |
| `kickMember({ poolId, targetUserId })` | `assertIsOwner`  | `removeMember` + `recordKick`, `revalidatePath`                   |
| `rotateToken({ poolId })`              | `assertIsOwner`  | `generateInviteToken` + `rotateInviteTokenHash`, `revalidatePath` |
| `deletePool({ poolId })`               | `assertIsOwner`  | `dbDeletePool`, `redirect('/pools')`                              |

## UI components

| Component        | File                    | Notes                                                                   |
| ---------------- | ----------------------- | ----------------------------------------------------------------------- |
| `PoolListItem`   | `ui/PoolListItem.tsx`   | Pool card: name, owner badge, tournament/member count, score, link      |
| `CreatePoolForm` | `ui/CreatePoolForm.tsx` | Client form; calls `createPool`; redirects to `/pools/:id` on success   |
| `Leaderboard`    | `ui/Leaderboard.tsx`    | Ranked table with medal badges; "View card" links (owner or after lock) |
| `InviteSection`  | `ui/InviteSection.tsx`  | Shows full invite URL, copy button, rotate button (owner only)          |
| `OwnerControls`  | `ui/OwnerControls.tsx`  | Member kick list, two-click delete-pool confirm                         |

## Pages

| Route           | Component                   | Notes                                                                      |
| --------------- | --------------------------- | -------------------------------------------------------------------------- |
| `/pools`        | `app/pools/page.tsx`        | Pool list + create form; redirect to `/` if unauthenticated                |
| `/pools/[id]`   | `app/pools/[id]/page.tsx`   | Leaderboard, invite section (owner), owner controls (owner)                |
| `/join/[token]` | `app/join/[token]/page.tsx` | Token lookup; join confirmation form; handles already-member/kicked states |
| `/`             | `app/page.tsx`              | Signed-in → redirect `/pools`; signed-out → magic-link sign-in form        |

## Authorization rules

- Only the pool owner can kick members, rotate the token, delete the pool, or inline-edit member cards.
- Card visibility follows `canViewCard` from `shared/authz`: owner sees all cards at any time;
  members see their own card; other members' cards are visible only after lock (first kickoff).
- Kicked users cannot view cards or rejoin.
- Pool creation cap: ≤ 5 pools per owner. Pool member cap: ≤ 100 members.

## Owner inline card editing

`features/predictions/ui/OwnerCardEditor.tsx` is a client component that lets the pool owner edit
any member's prediction card inline (bypassing the lock). It reuses `GroupScoresSection`,
`BracketSection`, and `SpecialsSection` with optional `onSave`/`onPick`/`onFinishSave` props wired
to the owner server actions (`ownerSaveGroupScore`, `ownerSaveKnockoutPick`, `ownerSaveFinishScore`,
`ownerSaveSpecialBet`). Owner edits are audited via `listEditsForPrediction`.
