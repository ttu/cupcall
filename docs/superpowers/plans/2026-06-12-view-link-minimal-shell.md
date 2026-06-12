# View-link minimal shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the member sidebar + mobile bottom nav with a minimal logo-only top bar on all `/view/[token]/...` routes by moving them out of the `(authenticated)` route group.

**Architecture:** Move the entire `view/[token]` subtree from `apps/web/src/app/(authenticated)/` into a new `apps/web/src/app/(view)/` route group, then add a small `(view)/layout.tsx` that renders just a top bar containing the `Logo`. URLs are unchanged because route group names are stripped by Next.js. No edits to the moved page files.

**Tech Stack:** Next.js App Router (route groups), React Server Components, existing `Logo` component from `@/shared/ui`.

Spec: `docs/superpowers/specs/2026-06-12-view-link-minimal-shell-design.md`.

---

## File Structure

After this plan:

```
apps/web/src/app/
  (authenticated)/
    layout.tsx                          unchanged (sidebar + mobile nav)
    Sidebar.tsx                         unchanged
    MobileNav.tsx                       unchanged
    pools/...                           unchanged
    settings/...                        unchanged
    view/                               DELETED (moved out)
  (view)/                               NEW
    layout.tsx                          NEW (minimal viewer shell)
    view/[token]/
      page.tsx                          moved, no edits
      loading.tsx                       moved, no edits
      results/
        page.tsx                        moved, no edits
        loading.tsx                     moved, no edits
      members/[memberId]/
        page.tsx                        moved, no edits
        loading.tsx                     moved, no edits
```

---

## Task 1: Move the `view/[token]` subtree into a new `(view)` route group

**Files:**

- Move: `apps/web/src/app/(authenticated)/view/[token]/` → `apps/web/src/app/(view)/view/[token]/` (whole subtree, no content edits)

This is the foundation: getting the routes out from under the member layout. We do the move first so that, once the new `(view)/layout.tsx` is added in Task 2, the moved pages immediately render under the new shell.

- [ ] **Step 1: Confirm the source subtree contents**

Run:

```bash
find 'apps/web/src/app/(authenticated)/view' -type f
```

Expected output (six files):

```
apps/web/src/app/(authenticated)/view/[token]/page.tsx
apps/web/src/app/(authenticated)/view/[token]/loading.tsx
apps/web/src/app/(authenticated)/view/[token]/results/page.tsx
apps/web/src/app/(authenticated)/view/[token]/results/loading.tsx
apps/web/src/app/(authenticated)/view/[token]/members/[memberId]/page.tsx
apps/web/src/app/(authenticated)/view/[token]/members/[memberId]/loading.tsx
```

If this differs, stop and reconcile with the spec before moving on.

- [ ] **Step 2: Create the destination directory**

Run:

```bash
mkdir -p 'apps/web/src/app/(view)'
```

Confirm:

```bash
ls -d 'apps/web/src/app/(view)'
```

Expected: directory exists, empty.

- [ ] **Step 3: Move the entire `view` subtree using `git mv`**

Use `git mv` so history is preserved on the moved files.

Run:

```bash
git mv 'apps/web/src/app/(authenticated)/view' 'apps/web/src/app/(view)/view'
```

- [ ] **Step 4: Verify the new layout on disk**

Run:

```bash
find 'apps/web/src/app/(view)' -type f
```

Expected output (six files, all under the new path):

```
apps/web/src/app/(view)/view/[token]/page.tsx
apps/web/src/app/(view)/view/[token]/loading.tsx
apps/web/src/app/(view)/view/[token]/results/page.tsx
apps/web/src/app/(view)/view/[token]/results/loading.tsx
apps/web/src/app/(view)/view/[token]/members/[memberId]/page.tsx
apps/web/src/app/(view)/view/[token]/members/[memberId]/loading.tsx
```

And confirm the old location is gone:

```bash
[ ! -e 'apps/web/src/app/(authenticated)/view' ] && echo "removed" || echo "still present"
```

Expected: `removed`.

- [ ] **Step 5: Verify `git status` shows pure renames**

Run:

```bash
git status
```

Expected: every file under `apps/web/src/app/(authenticated)/view/[token]/...` shows as `renamed:` to `apps/web/src/app/(view)/view/[token]/...`. No `modified` files.

If any file shows as `modified`, stop — the content was changed inadvertently.

- [ ] **Step 6: Do NOT commit yet**

We commit at the end of the plan, as a single atomic "view-link minimal shell" feature commit per the repository's "one commit per feature" rule. The intermediate state (moved routes, no `(view)` layout yet) is still functionally fine because Next.js will inherit from the root `app/layout.tsx` until Task 2 adds the group layout — but we close the window quickly by going straight to Task 2.

---

## Task 2: Add the minimal `(view)/layout.tsx`

**Files:**

- Create: `apps/web/src/app/(view)/layout.tsx`

This is the only new file. It renders a single top bar with the `Logo` and nothing else, then renders `children`. It is a Server Component (no `'use client'` needed — no hooks, no event handlers).

- [ ] **Step 1: Create the file**

Write `apps/web/src/app/(view)/layout.tsx` with this exact content:

```tsx
import type { ReactNode } from 'react';
import { Logo } from '@/shared/ui';

export default function ViewLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh' }}>
      <header
        style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--surface)',
        }}
      >
        <Logo />
      </header>
      <main>{children}</main>
    </div>
  );
}
```

Notes for the implementer:

- The `Logo` import is the same one used by `Sidebar.tsx` (`@/shared/ui` barrel). Verify with `grep -n "from '@/shared/ui'" apps/web/src/app/(authenticated)/Sidebar.tsx`.
- No `'use client'` directive: this is a Server Component and stays one. No hooks, no events, no state.
- No `getCurrentActor()` call: viewers do not need an actor, and the page-level components already resolve everything through `getPoolByViewToken`.
- The logo uses the **light** variant (no `dark` prop) because the top bar background is `var(--surface)` (light theme), matching the page body below it. This is intentionally different from `Sidebar.tsx`, which uses `<Logo dark />` over the dark `turf` background.
- The logo is **not** wrapped in a `Link` — viewer has no notion of an in-app "home".

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm --filter web typecheck
```

Expected: no new errors. If `pnpm --filter web typecheck` is not the command used in this repo, fall back to the repo's standard typecheck command (look in the root `package.json` `scripts`).

- [ ] **Step 3: Lint the new file**

Run:

```bash
pnpm --filter web exec eslint 'apps/web/src/app/(view)/layout.tsx'
```

Expected: no errors.

(If `pnpm --filter web exec eslint ...` is not how this repo invokes eslint, fall back to whatever `pnpm lint` / equivalent does at the workspace root.)

---

## Task 3: Verify the dev build, then commit

This task verifies the move + new layout work together, then lands the feature as a single commit.

- [ ] **Step 1: Start the dev server**

Run:

```bash
pnpm --filter web dev
```

(Or the repo's equivalent — check `apps/web/package.json` scripts or root `package.json`.)

Wait for "Ready" / "Local:" output.

- [ ] **Step 2: Walk through view-link routes in a browser**

Pick any pool with a known view token. Look in dev fixtures or query the local DB if needed:

```bash
pnpm --filter db drizzle-kit studio
```

(or `psql` / the repo's standard local-DB inspection method) to find a `pools.view_token`.

Open each of these and visually confirm what's described:

1. `http://localhost:3000/view/<token>` — landing page renders. The page shows **only** a thin top bar with the logo and the page body. **No** desktop sidebar on the left. **No** mobile bottom bar (resize the window narrow to confirm).
2. `http://localhost:3000/view/<token>/results` — results page renders under the same minimal shell.
3. `http://localhost:3000/view/<token>/members/<memberId>` — member-card page renders under the same minimal shell. Pick a `memberId` from the leaderboard rendered on the landing page.

In all three: no "Your Pools", no "New pool", no "Settings", no "Sign out".

- [ ] **Step 3: Walk through member routes to confirm no regression**

Open these and confirm the **member** shell is unchanged:

1. `http://localhost:3000/pools` — sidebar visible on desktop with "Your Pools" list + "New pool" + "Settings" + "Sign out"; mobile bottom nav visible on narrow viewport.
2. `http://localhost:3000/pools/<some-pool-id>` — same shell intact.
3. `http://localhost:3000/settings` — same shell intact.

If anything regresses, stop and diagnose before committing.

- [ ] **Step 4: Stop the dev server**

`Ctrl-C` the dev server.

- [ ] **Step 5: Run the full quality gates**

Run, in order, stopping on first failure:

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
```

(Substitute the repo's equivalents if these are not the exact script names.)

Expected: all pass. No new tests are introduced by this plan — existing tests must continue passing.

- [ ] **Step 6: Verify `git status` is clean apart from the intended change**

Run:

```bash
git status
```

Expected staged + unstaged changes:

- Six `renamed:` entries under `apps/web/src/app/(authenticated)/view/[token]/...` → `apps/web/src/app/(view)/view/[token]/...`
- One new file: `apps/web/src/app/(view)/layout.tsx`
- One new file: `docs/superpowers/specs/2026-06-12-view-link-minimal-shell-design.md` (the design doc, if not already committed)
- One new file: `docs/superpowers/plans/2026-06-12-view-link-minimal-shell.md` (this plan, if not already committed)
- Nothing else.

If unrelated files appear modified, stop and investigate before staging.

- [ ] **Step 7: Stage and commit as one atomic feature commit**

Per the repo's "one commit per feature" rule, the spec, plan, file moves, and new layout all land together.

Run:

```bash
git add 'apps/web/src/app/(view)/layout.tsx' \
        'apps/web/src/app/(authenticated)/view' \
        'apps/web/src/app/(view)/view' \
        docs/superpowers/specs/2026-06-12-view-link-minimal-shell-design.md \
        docs/superpowers/plans/2026-06-12-view-link-minimal-shell.md
git commit -m "$(cat <<'EOF'
feat(view): minimal viewer shell on view-link pages

Move /view/[token]/... routes from the (authenticated) group into a new
(view) route group. The new (view)/layout.tsx renders only a top bar with
the logo, replacing the member sidebar and mobile bottom nav for viewers
who arrive through a view link.

URLs are unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Confirm the commit landed**

Run:

```bash
git log -1 --stat
git status
```

Expected:

- The commit shows the six renames, the new layout file, and the two docs files.
- `git status` reports a clean working tree.

---

## Self-review notes

Spec coverage:

- "Move every route under `(authenticated)/view/[token]/...` into a new `(view)` route group" → Task 1.
- "Add `apps/web/src/app/(view)/layout.tsx` that renders a thin top bar containing only the logo" → Task 2.
- "URLs are unchanged" → confirmed by Next.js route-group behaviour; visually verified in Task 3 Step 2.
- "No edit to the moved page components themselves" → enforced by `git mv` and the `git status` check in Task 1 Step 5 (no `modified` files allowed) and Task 3 Step 6.
- "The desktop sidebar and mobile bottom nav for member routes — unchanged" → verified in Task 3 Step 3.
- "An authenticated user opening a view-link URL sees the minimal shell" → naturally true because the route no longer inherits the `(authenticated)` layout; verified manually if a logged-in test session is available, but not separately gated.

No placeholders. All code blocks contain final code. All commands are concrete. The plan lands as a single commit per the repo's "one commit per feature" rule.
