# Link-Email Success Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a dedicated success page when a user successfully confirms their email via the link-email flow, instead of silently redirecting to /pools.

**Architecture:** Add a `/link-email/success` page (server component, pure markup) mirroring the existing `/link-email/invalid` page, and update the route handler's success redirect to point there.

**Tech Stack:** Next.js App Router (server components), TypeScript, Tailwind CSS

## Global Constraints

- TypeScript strict — no `any`, no unsafe casts
- No new shared components — markup only
- Follow existing `/link-email/invalid` page styling patterns exactly
- One commit covering both changes

---

### Task 1: Add success page and update route handler redirect

**Files:**

- Create: `apps/web/src/app/link-email/success/page.tsx`
- Modify: `apps/web/src/app/link-email/[token]/route.ts` (line 25)

**Interfaces:**

- Produces: `/link-email/success` route accessible by the redirect

- [ ] **Step 1: Create the success page**

Create `apps/web/src/app/link-email/success/page.tsx`:

```tsx
import type { ReactElement } from 'react';
import Link from 'next/link';

export default function EmailLinkedPage(): ReactElement {
  return (
    <main className="max-w-md mx-auto px-4 py-12 text-center space-y-4">
      <h1 className="text-2xl font-bold text-ink font-cup-display">Email connected</h1>
      <p className="text-sm text-ink-soft">
        Your email address has been connected to your account.
      </p>
      <Link
        href="/pools"
        className="inline-block px-4 py-2 rounded-lg bg-ink-900 text-on-dark text-sm font-medium hover:bg-ink-800 transition-colors"
      >
        Go to My Pools
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: Update the route handler redirect**

In `apps/web/src/app/link-email/[token]/route.ts`, change line 25:

```ts
// Before
return NextResponse.redirect(new URL('/pools', request.url));

// After
return NextResponse.redirect(new URL('/link-email/success', request.url));
```

- [ ] **Step 3: Type-check**

Run: `pnpm -C apps/web typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/link-email/success/page.tsx \
        apps/web/src/app/link-email/[token]/route.ts \
        docs/superpowers/plans/2026-07-04-link-email-success-page.md \
        docs/superpowers/specs/2026-07-04-link-email-success-page-design.md
git commit -m "feat(auth): show success page after email is linked"
```
