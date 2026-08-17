# Demo Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent full-width banner above the existing header on all demo routes (`/demo` and `/view/demo-groups`, `/view/demo-knockout`, `/view/demo-completed`) that labels the page as a live demo and lets the visitor jump between the three checkpoints, with the current checkpoint highlighted.

**Architecture:** A single `'use client'` `DemoBanner` component added to `ViewLayout` above the `<header>`. It calls `usePathname()` and returns `null` on non-demo routes, so it is invisible everywhere else. The path-to-stage mapping is extracted as a pure exported function (`getDemoStage`) for straightforward unit testing without React/jsdom.

**Tech Stack:** Next.js App Router, React (client component), `next/navigation` (`usePathname`), Tailwind CSS utility classes from the project design system (`turf`, `on-dark-*`, `eyebrow`), Vitest (unit), Playwright (E2E). See [`docs/superpowers/specs/2026-08-17-demo-banner-design.md`](../specs/2026-08-17-demo-banner-design.md) for the full design rationale.

## Global Constraints

- Banner appears on `/demo` and `/view/demo-groups`, `/view/demo-knockout`, `/view/demo-completed` — nowhere else.
- Returns `null` (renders nothing) on every other path — including non-demo `/view/<token>` pools.
- Uses `turf` dark-green background (same as the landing page hero) so it reads as "demo brand."
- Active checkpoint link: `text-on-dark font-bold`. Inactive: `text-on-dark-soft`.
- On `/demo` itself: no active stage — all three links equal weight.
- `data-testid="demo-banner"` on the root element; `data-testid="demo-banner-link-groups"`, `demo-banner-link-knockout`, `demo-banner-link-completed` on each stage link.
- No new server-side data fetching, no DB calls, no new packages.
- Unit test file must be `.test.ts` (not `.test.tsx`) — the root `vitest.config.ts` `include` glob only matches `*.test.ts`.
- **One commit** covering all tasks together — do not commit after each task.

---

### Task 1: `DemoBanner` component + unit test

**Files:**

- Create: `apps/web/src/app/(view)/DemoBanner.tsx`
- Create: `apps/web/src/app/(view)/DemoBanner.test.ts`

**Interfaces:**

- Produces: `getDemoStage(pathname: string): 'groups' | 'knockout' | 'completed' | 'demo' | null` — exported pure function consumed by the unit test. The default export `DemoBanner` is consumed by Task 2's layout change.

- [ ] **Step 1: Write the failing unit test**

Create `apps/web/src/app/(view)/DemoBanner.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getDemoStage } from './DemoBanner';

describe('getDemoStage', () => {
  it('returns null for non-demo paths', () => {
    expect(getDemoStage('/view/abc123')).toBeNull();
    expect(getDemoStage('/pools')).toBeNull();
    expect(getDemoStage('/')).toBeNull();
    expect(getDemoStage('/login')).toBeNull();
  });

  it('returns "demo" for /demo', () => {
    expect(getDemoStage('/demo')).toBe('demo');
  });

  it('returns the correct stage for each demo checkpoint root', () => {
    expect(getDemoStage('/view/demo-groups')).toBe('groups');
    expect(getDemoStage('/view/demo-knockout')).toBe('knockout');
    expect(getDemoStage('/view/demo-completed')).toBe('completed');
  });

  it('matches sub-paths within a demo checkpoint', () => {
    expect(getDemoStage('/view/demo-groups/member/demo-user-1')).toBe('groups');
    expect(getDemoStage('/view/demo-knockout/results')).toBe('knockout');
    expect(getDemoStage('/view/demo-completed/results')).toBe('completed');
  });

  it('does not match partial prefix collisions', () => {
    expect(getDemoStage('/view/demo-groups-extra')).toBeNull();
    expect(getDemoStage('/view/demo-knockout-extra')).toBeNull();
    expect(getDemoStage('/view/demo-completed-extra')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm vitest run apps/web/src/app/\(view\)/DemoBanner.test.ts
```

Expected: FAIL — `./DemoBanner` module does not exist.

- [ ] **Step 3: Implement `DemoBanner.tsx`**

Create `apps/web/src/app/(view)/DemoBanner.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const STAGES = [
  { key: 'groups' as const, label: 'Group stage', href: '/view/demo-groups' },
  { key: 'knockout' as const, label: 'Knockout stage', href: '/view/demo-knockout' },
  { key: 'completed' as const, label: 'Completed', href: '/view/demo-completed' },
];

type DemoStage = 'groups' | 'knockout' | 'completed';

export function getDemoStage(pathname: string): DemoStage | 'demo' | null {
  if (pathname === '/demo') return 'demo';
  if (pathname.startsWith('/view/demo-groups/') || pathname === '/view/demo-groups')
    return 'groups';
  if (pathname.startsWith('/view/demo-knockout/') || pathname === '/view/demo-knockout')
    return 'knockout';
  if (pathname.startsWith('/view/demo-completed/') || pathname === '/view/demo-completed')
    return 'completed';
  return null;
}

export default function DemoBanner() {
  const pathname = usePathname();
  const stage = getDemoStage(pathname);

  if (stage === null) return null;

  return (
    <div data-testid="demo-banner" className="turf flex items-center gap-4 px-5 py-2.5 text-sm">
      <span className="eyebrow text-on-dark-muted flex items-center gap-1.5 shrink-0">
        ⚽ Live demo
      </span>
      <nav className="flex items-center flex-wrap">
        {STAGES.map((s, i) => (
          <span key={s.key} className="flex items-center">
            {i > 0 && (
              <span className="text-on-dark-muted mx-1.5 select-none" aria-hidden>
                ·
              </span>
            )}
            <Link
              href={s.href}
              data-testid={`demo-banner-link-${s.key}`}
              className={
                stage === s.key
                  ? 'text-on-dark font-bold'
                  : 'text-on-dark-soft hover:text-on-dark transition-colors'
              }
            >
              {s.label}
            </Link>
          </span>
        ))}
      </nav>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm vitest run apps/web/src/app/\(view\)/DemoBanner.test.ts
```

Expected: PASS — all 5 test cases green.

---

### Task 2: Wire `DemoBanner` into `ViewLayout`

**Files:**

- Modify: `apps/web/src/app/(view)/layout.tsx`

**Interfaces:**

- Consumes: `DemoBanner` default export from `./DemoBanner` (Task 1).

- [ ] **Step 1: Add `DemoBanner` to the layout**

Read the current file at `apps/web/src/app/(view)/layout.tsx`:

```tsx
import type { ReactElement, ReactNode } from 'react';
import { Logo } from '@/shared/ui';

export default function ViewLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="min-h-screen">
      <header className="p-[14px_20px] border-b border-line bg-surface">
        <Logo />
      </header>
      <main>{children}</main>
    </div>
  );
}
```

Replace it with:

```tsx
import type { ReactElement, ReactNode } from 'react';
import { Logo } from '@/shared/ui';
import DemoBanner from './DemoBanner';

export default function ViewLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="min-h-screen">
      <DemoBanner />
      <header className="p-[14px_20px] border-b border-line bg-surface">
        <Logo />
      </header>
      <main>{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Manual browser verification**

Start the dev server (`pnpm dev` from repo root) and verify:

1. `http://localhost:3000/demo` — dark green banner visible above logo header; all three stage links ("Group stage", "Knockout stage", "Completed") are equal weight (no bold).
2. `http://localhost:3000/view/demo-groups` — banner visible; "Group stage" is bold/white; the other two are muted.
3. `http://localhost:3000/view/demo-knockout` — "Knockout stage" highlighted.
4. `http://localhost:3000/view/demo-completed` — "Completed" highlighted.
5. Clicking a stage link in the banner navigates to the correct `/view/demo-*` route and the highlight updates.
6. Any non-demo route (e.g. `http://localhost:3000/login`) — banner is absent.

(The `/view/demo-*` pool views will 404 or show empty if `pnpm seed:demo` hasn't been run — that's expected. Just verify the banner renders at the top of the page before the 404 content.)

---

### Task 3: E2E coverage

**Files:**

- Modify: `apps/web/e2e/demo.spec.ts`

**Interfaces:**

- Consumes: `data-testid="demo-banner"` and `data-testid="demo-banner-link-{groups,knockout,completed}"` from Task 1.

- [ ] **Step 1: Extend the demo E2E spec**

Replace the contents of `apps/web/e2e/demo.spec.ts` with:

```typescript
import { test, expect } from '@playwright/test';

test('demo page links to all three checkpoints with no auth required', async ({ page }) => {
  await page.goto('/demo');

  await expect(page.locator('[data-testid="demo-link-groups"]')).toBeVisible();
  await expect(page.locator('[data-testid="demo-link-knockout"]')).toBeVisible();
  await expect(page.locator('[data-testid="demo-link-completed"]')).toBeVisible();
});

test('demo banner is visible on /demo with all three stage links, none active', async ({
  page,
}) => {
  await page.goto('/demo');

  await expect(page.locator('[data-testid="demo-banner"]')).toBeVisible();
  await expect(page.locator('[data-testid="demo-banner-link-groups"]')).toBeVisible();
  await expect(page.locator('[data-testid="demo-banner-link-knockout"]')).toBeVisible();
  await expect(page.locator('[data-testid="demo-banner-link-completed"]')).toBeVisible();

  // No link should be bold (no active stage on the /demo selector page).
  for (const testId of [
    'demo-banner-link-groups',
    'demo-banner-link-knockout',
    'demo-banner-link-completed',
  ]) {
    await expect(page.locator(`[data-testid="${testId}"]`)).not.toHaveClass(/font-bold/);
  }
});

for (const { token, activeKey, inactiveKeys } of [
  { token: 'demo-groups', activeKey: 'groups', inactiveKeys: ['knockout', 'completed'] },
  { token: 'demo-knockout', activeKey: 'knockout', inactiveKeys: ['groups', 'completed'] },
  { token: 'demo-completed', activeKey: 'completed', inactiveKeys: ['groups', 'knockout'] },
]) {
  test(`${token} checkpoint renders a read-only leaderboard with no edit controls`, async ({
    page,
  }) => {
    await page.goto(`/view/${token}`);
    await expect(page).toHaveURL(new RegExp(`/view/${token}$`));

    const rows = page.locator('[data-testid^="leaderboard-row-"], [data-testid^="podium-entry-"]');
    await expect(rows.first()).toBeVisible();

    // Owner-only / member-only controls must never render on the public view route.
    await expect(page.locator('[data-testid="leave-pool-btn"]')).toHaveCount(0);
  });

  test(`${token}: demo banner highlights the current stage and links to the other two`, async ({
    page,
  }) => {
    await page.goto(`/view/${token}`);

    await expect(page.locator('[data-testid="demo-banner"]')).toBeVisible();

    // Active stage link is bold.
    await expect(page.locator(`[data-testid="demo-banner-link-${activeKey}"]`)).toHaveClass(
      /font-bold/,
    );

    // Inactive links are not bold.
    for (const key of inactiveKeys) {
      await expect(page.locator(`[data-testid="demo-banner-link-${key}"]`)).not.toHaveClass(
        /font-bold/,
      );
    }
  });
}
```

- [ ] **Step 2: Run the demo E2E suite**

```bash
pnpm -C apps/web run e2e -- demo.spec.ts
```

Expected: PASS — all tests green (2 for `/demo`, 3×2 = 6 for the checkpoints).

---

### Task 4: Final checks and single commit

- [ ] **Step 1: Run the full local gate**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all pass. New passing test suite: `apps/web/src/app/(view)/DemoBanner.test.ts`.

- [ ] **Step 2: Stage and commit**

```bash
git add \
  apps/web/src/app/\(view\)/DemoBanner.tsx \
  apps/web/src/app/\(view\)/DemoBanner.test.ts \
  apps/web/src/app/\(view\)/layout.tsx \
  apps/web/e2e/demo.spec.ts \
  docs/superpowers/specs/2026-08-17-demo-banner-design.md \
  docs/superpowers/plans/2026-08-17-demo-banner.md

git commit -m "$(cat <<'EOF'
feat: add persistent demo banner with stage switcher on demo routes

Adds a full-width dark-green strip above the logo header on /demo and
/view/demo-{groups,knockout,completed} that labels the page as a live
demo and lets visitors jump between the three checkpoints without
backtracking. The current checkpoint is highlighted bold; non-demo routes
are unaffected.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Verify the commit**

```bash
git log -1 --stat
```

Expected: one new commit listing the 6 files above.
