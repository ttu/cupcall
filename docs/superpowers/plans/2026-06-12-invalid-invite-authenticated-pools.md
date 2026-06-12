# Invalid Invite — Authenticated User Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an authenticated user hits an invalid invite link, show their pool list and (for guest users) their personal login link instead of a dead-end error page.

**Architecture:** One file changes — `apps/web/src/app/join/[token]/page.tsx`. Move `getCurrentActor()` to before the invalid-token check so we can branch on auth state. Add an `InvalidInviteAuthenticated` server component rendered inline in that file. No new application functions; all needed pieces (`getUserPools`, `getUserById`, `getLoginTokenByUserId`, `upsertLoginToken`, `PoolListItem`, `MyLoginLink`) are already exported and tested.

**Tech Stack:** Next.js 15 server components, TypeScript strict, existing `@/features/pools` and `@cup/db` exports.

---

### Task 1: Modify the join page

**Files:**

- Modify: `apps/web/src/app/join/[token]/page.tsx`

The full updated file. Key changes:

1. Move `getCurrentActor()` call to the top of `JoinPage`, before the `pool` null check.
2. Replace the existing invalid-token early return with a branch: unauthenticated → same "Go home" card; authenticated → fetch pools + optional login token, render recovery layout.
3. Add an `InvalidInviteAuthenticated` inline server component.

- [ ] **Step 1: Update imports at the top of the file**

Replace the existing import block with:

```ts
import type { ReactElement } from 'react';
import Link from 'next/link';
import { getCurrentActor } from '@/features/auth';
import { db } from '@/shared/db';
import {
  getPoolByInviteTokenHash,
  isMember,
  isKicked,
  getUserById,
  getLoginTokenByUserId,
  upsertLoginToken,
} from '@cup/db';
import {
  joinPool,
  joinAsGuest,
  getUserPools,
  PoolListItem,
  MyLoginLink,
  generateLoginToken,
} from '@/features/pools';
import { redirect } from 'next/navigation';
import { Icon } from '@/shared/ui';
import { JoinSubmitButton } from './JoinSubmitButton';
```

- [ ] **Step 2: Reorder auth check and add the authenticated invalid-invite branch**

Replace the current `JoinPage` function body — from the opening `const { token }` down to where the `actor` const is declared — with:

```ts
export default async function JoinPage({ params, searchParams }: Props): Promise<ReactElement> {
  const { token } = await params;
  const { error } = await searchParams;

  const [pool, actor] = await Promise.all([
    getPoolByInviteTokenHash(db, token),
    getCurrentActor(),
  ]);

  if (!pool) {
    if (actor) {
      // Authenticated user with invalid invite — show their pools so they're not stuck.
      let pools: Awaited<ReturnType<typeof getUserPools>> = [];
      try {
        pools = await getUserPools(db, actor.userId);
      } catch {
        // Non-critical; error card remains useful without the list.
      }

      let myLoginToken: string | null = null;
      const user = await getUserById(db, actor.userId);
      if (user && !user.email) {
        const existing = await getLoginTokenByUserId(db, actor.userId);
        const loginToken = existing?.token ?? generateLoginToken();
        if (!existing) await upsertLoginToken(db, actor.userId, loginToken);
        myLoginToken = loginToken;
      }

      const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? '';

      return (
        <main
          className="turf min-h-screen"
          style={{ display: 'grid', placeItems: 'center', padding: '24px 16px' }}
        >
          <div style={{ width: 'min(460px, 100%)', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ overflow: 'hidden' }}>
              <div
                style={{
                  background: 'var(--ink-900)',
                  padding: '26px 30px 22px',
                  color: 'var(--on-dark)',
                }}
              >
                <h2 className="display" style={{ fontSize: 34, marginBottom: 8 }}>
                  Invalid Invite
                </h2>
                <p style={{ fontSize: 13, color: 'var(--on-dark-soft)', lineHeight: 1.5 }}>
                  This invite link is invalid or has been removed.
                </p>
              </div>
              <div style={{ padding: 30 }}>
                <Link href="/pools" className="btn btn-dark block" style={{ textDecoration: 'none' }}>
                  Go to My Pools
                </Link>
              </div>
            </div>

            {pools.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pools.map((p) => (
                  <PoolListItem key={p.id} pool={p} isOwner={p.ownerId === actor.userId} />
                ))}
              </div>
            )}

            {myLoginToken && <MyLoginLink token={myLoginToken} baseUrl={baseUrl} />}
          </div>
        </main>
      );
    }

    // Unauthenticated + invalid token — unchanged dead-end card.
    return (
      <main
        className="turf min-h-screen"
        style={{ display: 'grid', placeItems: 'center', padding: '24px 16px' }}
      >
        <div className="card" style={{ width: 'min(460px, 100%)', overflow: 'hidden' }}>
          <div
            style={{
              background: 'var(--ink-900)',
              padding: '26px 30px 22px',
              color: 'var(--on-dark)',
            }}
          >
            <h2 className="display" style={{ fontSize: 34, marginBottom: 8 }}>
              Invalid Invite
            </h2>
            <p style={{ fontSize: 13, color: 'var(--on-dark-soft)', lineHeight: 1.5 }}>
              This invite link is invalid or has been removed.
            </p>
          </div>
          <div style={{ padding: 30 }}>
            <Link href="/" className="btn btn-dark block" style={{ textDecoration: 'none' }}>
              Go home
            </Link>
          </div>
        </div>
      </main>
    );
  }
```

Then remove the now-redundant `const actor = await getCurrentActor();` line that previously appeared after the `pool` null check (it no longer exists — `actor` is already declared above).

- [ ] **Step 3: Verify the rest of the file is unchanged**

The signed-in path (`actor` truthy + `pool` found: `alreadyMember`, `kicked`, join form), the guest path, `SignedInJoinForm`, and `GuestJoinForm` are all unchanged. Confirm they still compile.

- [ ] **Step 4: Run typecheck**

```bash
cd /workspaces/football-cup-prediction && pnpm --filter web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run lint**

```bash
cd /workspaces/football-cup-prediction && pnpm --filter web exec eslint src/app/join/
```

Expected: no errors.

- [ ] **Step 6: Run existing integration tests to verify nothing regressed**

```bash
cd /workspaces/football-cup-prediction && pnpm test
```

Expected: all tests pass (no pool/auth tests were changed).

- [ ] **Step 7: Manual smoke test**

Start the dev server (`pnpm dev`) and visit `/join/invalid-token-xyz` while:

- Logged out → should see "Invalid Invite" card with "Go home" button
- Logged in (with pools) → should see "Invalid Invite" card + pool list below
- Logged in as guest (no email) → should also see personal login link section below pools
