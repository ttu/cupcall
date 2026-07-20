# Admin raw data view Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a pool owner view the raw, already-computed `CardView`/`ResultsView` JSON for any
member of their pool at `/pools/[id]/raw`, in production, for debugging.

**Architecture:** A single new server-component page composes two existing, already-tested
application functions (`getResultsView`, `getCardView`) and renders their output as pretty-printed
JSON. One new small client component (`RawJsonBlock`, copy-to-clipboard) is the only new UI
building block. No new domain/application logic, no schema change — access is gated by the
existing `pool.ownerId` check.

**Tech Stack:** Next.js 15 App Router (server components), existing `@cup/db` / `@cup/engine`
packages, existing design-system Tailwind utility classes (`.card`, `.turf`, `.display`,
`.eyebrow`), Playwright for e2e.

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-07-18-admin-raw-data-view-design.md`. Follow it exactly;
  this plan implements it task-by-task.
- **One commit per feature** (`CLAUDE.md`): do NOT commit after individual tasks below. All tasks
  land in a single commit at the very end (Task 4's final step), including the design spec and this
  plan file.
- **No unit tests for feature UI components** — this codebase has zero `*.test.tsx` files under any
  `features/*/ui/`; UI is validated via Storybook (only for `shared/ui`) or Playwright e2e (for
  page-level behavior). `RawJsonBlock` and the new page follow that existing convention: verified
  by typecheck/lint plus the e2e spec in Task 4, not a component-level test.
- TypeScript strict, no `any`. Reuse existing branded-type constructors (`poolId`, `userId` from
  `@cup/engine`) at every boundary — never pass a raw `string` where a branded type is expected.
- Run `pnpm format:check && pnpm lint && pnpm typecheck` after every task (not just at the end) so
  problems are caught immediately, per `CLAUDE.md`'s "format + lint automatically after each step."

---

### Task 1: `RawJsonBlock` UI component

**Files:**

- Create: `apps/web/src/features/admin/ui/RawJsonBlock.tsx`
- Create: `apps/web/src/features/admin/index.ts`

**Interfaces:**

- Consumes: `Button` from `@/shared/ui` (existing, `variant`/`size`/`disabled`/`data-testid` all
  pass through via `ButtonHTMLAttributes`).
- Produces: `RawJsonBlock(props: { title: string; json: unknown; testId: string }): ReactElement`,
  exported from `@/features/admin`. Task 2 imports this.

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/features/admin/ui/RawJsonBlock.tsx
'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import { Button } from '@/shared/ui';

type Props = {
  title: string;
  /** The already-assembled view-model to dump. `null`/`undefined` renders an empty state. */
  json: unknown;
  /** Base test id: the <pre> gets `testId`, the copy button gets `${testId}-copy-button`. */
  testId: string;
};

export function RawJsonBlock({ title, json, testId }: Props): ReactElement {
  const [copied, setCopied] = useState(false);
  const text = json === null || json === undefined ? null : JSON.stringify(json, null, 2);

  function handleCopy(): void {
    if (text === null) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="card overflow-hidden">
      <div className="turf py-2 px-4 flex items-center justify-between gap-3">
        <span className="display text-[15px] text-on-dark">{title}</span>
        <Button
          variant="soft"
          size="sm"
          onClick={handleCopy}
          disabled={text === null}
          data-testid={`${testId}-copy-button`}
        >
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
      {text === null ? (
        <p className="py-3.5 px-4 text-[13px] text-ink-muted">
          No prediction saved for this member.
        </p>
      ) : (
        <pre
          data-testid={testId}
          className="p-4 text-[11px] font-mono text-ink-soft overflow-x-auto whitespace-pre-wrap break-words max-h-[600px] overflow-y-auto"
        >
          {text}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the feature barrel**

```ts
// apps/web/src/features/admin/index.ts
// Public interface for the admin feature.
// Other features and app routes import from here — never from internals.

export { RawJsonBlock } from './ui/RawJsonBlock';
```

- [ ] **Step 3: Verify**

Run: `pnpm format:check && pnpm lint && pnpm typecheck`
Expected: all pass, no errors referencing `features/admin`.

---

### Task 2: `/pools/[id]/raw` page

**Files:**

- Create: `apps/web/src/app/(authenticated)/pools/[id]/raw/page.tsx`

**Interfaces:**

- Consumes:
  - `RawJsonBlock` from `@/features/admin` (Task 1).
  - `getResultsView(params: { db, poolId, userId?: string, now: Date }): Promise<ResultsView | null>`
    from `@/features/results` (existing).
  - `getCardView(params: { db, poolId, userId: string, tournamentId, tournament, firstKickoff, now, createIfMissing?, joinedAt? }): Promise<CardView | null>`
    from `@/features/predictions` (existing).
  - `getPoolById(db, poolId): Promise<PoolRow | undefined>`, `getTournamentById(db, tournamentId): Promise<TournamentRow | undefined>`,
    `getMember(db, poolId, userId): Promise<MemberRow | null>` from `@cup/db` (existing).
  - `getCurrentActor()` from `@/features/auth` (existing).
  - `poolId as asPoolId`, `userId as asUserId` brand constructors from `@cup/engine` (existing).
  - `BackLink`, `cn` from `@/shared/ui` (existing).
- Produces: the page at route `/pools/[id]/raw`. Task 3 links to this route.

- [ ] **Step 1: Create the page**

```tsx
// apps/web/src/app/(authenticated)/pools/[id]/raw/page.tsx
import type { ReactElement } from 'react';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getPoolById, getTournamentById, getMember } from '@cup/db';
import { db } from '@/shared/db';
import { getCurrentActor } from '@/features/auth';
import { getResultsView } from '@/features/results';
import { getCardView } from '@/features/predictions';
import { RawJsonBlock } from '@/features/admin';
import { BackLink, cn } from '@/shared/ui';
import { poolId as asPoolId, userId as asUserId } from '@cup/engine';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ userId?: string }>;
};

export default async function RawDataPage({ params, searchParams }: Props): Promise<ReactElement> {
  const { id } = await params;
  const { userId: userIdParam } = await searchParams;
  const poolId = asPoolId(id);

  const actor = await getCurrentActor();
  if (!actor) redirect('/');

  const pool = await getPoolById(db, poolId);
  if (!pool) notFound();
  // Owner-only: 404 (not 403) so pool existence/ownership isn't leaked to non-owners.
  if (actor.userId !== pool.ownerId) notFound();

  const tournament = await getTournamentById(db, pool.tournamentId);
  if (!tournament?.definition) notFound();

  const now = new Date();
  const ownResultsView = await getResultsView({ db, poolId, userId: actor.userId, now });
  if (!ownResultsView) notFound();

  // ownResultsView.leaderboard doubles as the member picker's data source — no separate query.
  const validMemberIds = new Set(ownResultsView.leaderboard.map((m) => m.userId as string));
  const selectedUserId = asUserId(
    userIdParam !== undefined && validMemberIds.has(userIdParam) ? userIdParam : actor.userId,
  );

  const [resultsView, memberRecord] = await Promise.all([
    selectedUserId === actor.userId
      ? Promise.resolve(ownResultsView)
      : getResultsView({ db, poolId, userId: selectedUserId, now }),
    getMember(db, poolId, selectedUserId),
  ]);
  if (!resultsView) notFound();

  const cardView = await getCardView({
    db,
    poolId,
    userId: selectedUserId,
    tournamentId: pool.tournamentId,
    tournament: tournament.definition,
    firstKickoff: tournament.firstKickoff,
    now,
    createIfMissing: false,
    ...(memberRecord ? { joinedAt: memberRecord.joinedAt } : {}),
  });

  return (
    <main className="max-w-215 mx-auto p-[28px_20px] flex flex-col gap-5">
      <div>
        <div className="eyebrow text-ink-muted mb-2 flex items-center gap-1.5">
          <BackLink href={`/pools/${poolId}`}>{pool.name}</BackLink>
          <span>· Raw data (owner only)</span>
        </div>
        <h1 className="display text-[34px] m-0">Raw data</h1>
      </div>

      <div className="flex flex-wrap gap-2" data-testid="raw-member-picker">
        {ownResultsView.leaderboard.map((member) => (
          <Link
            key={member.userId}
            href={`/pools/${poolId}/raw?userId=${member.userId}`}
            data-testid={`raw-member-link-${member.userId}`}
            aria-current={member.userId === selectedUserId ? 'page' : undefined}
            className={cn(
              'inline-block text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors no-underline',
              member.userId === selectedUserId
                ? 'border-ink bg-ink text-white'
                : 'border-line bg-white text-ink-soft hover:text-ink hover:border-ink-muted',
            )}
          >
            {member.displayName}
          </Link>
        ))}
      </div>

      <RawJsonBlock title="Card view" json={cardView} testId="raw-card-json" />
      <RawJsonBlock title="Results view" json={resultsView} testId="raw-results-json" />
    </main>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm format:check && pnpm lint && pnpm typecheck`
Expected: all pass, no errors referencing the new page.

- [ ] **Step 3: Manual smoke check**

Run: `pnpm dev` (in `apps/web`), sign in as any pool owner, visit
`http://localhost:3010/pools/<your-pool-id>/raw`. Expected: page renders two JSON blocks (Card
view, Results view) and a row of member links. Visiting the same URL signed in as a non-owner
member of that pool should 404.

---

### Task 3: Entry-point link from the pool detail page

**Files:**

- Modify: `apps/web/src/app/(authenticated)/pools/[id]/page.tsx`

**Interfaces:**

- Consumes: nothing new — `Link` from `next/link` is already imported in this file; `poolId` and
  `isOwner` are already in scope.
- Produces: a discoverable link to the Task 2 page from the pool detail page, for pool owners only.

- [ ] **Step 1: Add the link**

In `apps/web/src/app/(authenticated)/pools/[id]/page.tsx`, find this existing block (owner
controls + backup, full width below the two-column layout):

```tsx
<PoolBackupControls poolId={poolId} isOwner={isOwner} />
```

Add the new link immediately after it:

```tsx
<PoolBackupControls poolId={poolId} isOwner={isOwner} />;
{
  isOwner && (
    <Link
      href={`/pools/${poolId}/raw`}
      data-testid="pool-raw-data-link"
      className="self-start inline-block text-xs font-medium px-3 py-1.5 rounded-lg border border-line bg-white text-ink-soft hover:text-ink hover:border-ink-muted transition-colors no-underline"
    >
      Raw data (debug)
    </Link>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm format:check && pnpm lint && pnpm typecheck`
Expected: all pass.

---

### Task 3b: Root `not-found.tsx` (added mid-implementation)

**Why:** Writing Task 4's e2e non-owner-404 test surfaced a pre-existing, app-wide gap: this app
has no `app/not-found.tsx` boundary, so `notFound()` called from any Server Component renders
Next's generic default fallback instead of a styled page. Worth fixing regardless of the status-code
investigation below.

**Status-code investigation (does NOT fix this file alone — kept as design-system polish only):**
initial expectation was that adding this file would also make `notFound()` return a real HTTP 404
status (it currently renders correct 404 _content_ with an HTTP 200 status, confirmed on both the
new `/pools/[id]/raw` page and the pre-existing `/pools/[id]/members/[memberId]` page). Verified
this file does NOT fix that: `/pools/[id]/raw` sits under two ancestor `loading.tsx` files
(`pools/loading.tsx`, `pools/[id]/loading.tsx`) that force Next.js streaming; once streaming starts,
the response status is locked at 200 regardless of a later `notFound()` call — an open Next.js App
Router limitation (not this app's bug), confirmed by reversibly removing both `loading.tsx` files
(status became 404) and restoring them (removing them app-wide is a UX regression, out of scope).
Decision: keep this file for the nicer 404 page; the e2e test (Task 4) asserts on rendered content
via `data-testid`, not `response.status()`.

**Files:**

- Create: `apps/web/src/app/not-found.tsx`

**Interfaces:**

- Consumes: `Link` from `next/link` (standard). No other feature code — this is a top-level Next.js
  App Router convention file, outside any feature slice.
- Produces: a styled 404 page for any `notFound()` call anywhere in the app, plus for genuinely
  unmatched routes. Does NOT change the HTTP status code (see investigation above) — Task 4's e2e
  test accounts for this.

- [ ] **Step 1: Create the file**

```tsx
// apps/web/src/app/not-found.tsx
import type { ReactElement } from 'react';
import Link from 'next/link';

export default function NotFound(): ReactElement {
  return (
    <main
      data-testid="not-found-page"
      className="max-w-md mx-auto px-4 py-12 text-center space-y-4"
    >
      <h1 className="text-2xl font-bold text-ink font-cup-display">Page not found</h1>
      <p className="text-sm text-ink-soft">
        The page you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Link
        href="/"
        className="inline-block px-4 py-2 rounded-lg bg-ink-900 text-on-dark text-sm font-medium hover:bg-ink-800 transition-colors"
      >
        Go home
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm format:check && pnpm lint && pnpm typecheck`
Expected: all pass.

---

### Task 4: E2E coverage and final commit

**Files:**

- Create: `apps/web/e2e/admin-raw-view.spec.ts`
- Create: `apps/web/src/app/not-found.tsx` (Task 3b, done first — the e2e non-owner-404 assertion
  depends on it)

**Interfaces:**

- Consumes: `apps/web/e2e/.e2e-fixture-ids.json` (`{ seededPoolId: string }`, written by
  `apps/web/e2e/global-setup.ts`), the pre-seeded login tokens `e2e-seeded-owner` (pool owner) and
  `e2e-seeded-late-joiner` (a non-owner member) — both already exist from prior e2e work, no new
  seeding needed. Uses the `data-testid`s introduced in Tasks 1–3:
  `pool-raw-data-link`, `raw-member-picker`, `raw-member-link-<userId>`, `raw-card-json`,
  `raw-card-json-copy-button`, `raw-results-json`.

- [ ] **Step 1: Write the e2e spec**

```ts
// apps/web/e2e/admin-raw-view.spec.ts
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureIds = JSON.parse(
  readFileSync(path.join(__dirname, '.e2e-fixture-ids.json'), 'utf-8'),
) as { seededPoolId: string };

test('pool owner can view raw CardView/ResultsView JSON and switch members', async ({ page }) => {
  await page.goto('/login/e2e-seeded-owner');
  await page.waitForURL('**/pools');
  await page.goto(`/pools/${fixtureIds.seededPoolId}`);

  await page.locator('[data-testid="pool-raw-data-link"]').click();
  await page.waitForURL(`**/pools/${fixtureIds.seededPoolId}/raw`);

  await expect(page.locator('[data-testid="raw-card-json"]')).toContainText('predictionId');
  await expect(page.locator('[data-testid="raw-results-json"]')).toContainText('poolName');
  await expect(page.locator('[data-testid="raw-card-json-copy-button"]')).toBeVisible();

  // Switch to a different member and confirm the picker navigates.
  const memberLinks = page.locator('[data-testid="raw-member-picker"] a');
  const otherHref = await memberLinks.nth(1).getAttribute('href');
  await memberLinks.nth(1).click();
  await page.waitForURL(`**${otherHref}`);
  await expect(page.locator('[data-testid="raw-results-json"]')).toContainText('poolName');
});

test('non-owner member gets 404 on the raw data page', async ({ page }) => {
  await page.goto('/login/e2e-seeded-late-joiner');
  await page.waitForURL('**/pools');

  await page.goto(`/pools/${fixtureIds.seededPoolId}/raw`);
  // Asserts on the rendered not-found page content, not response.status(): this app's
  // /pools/[id]/* routes stream under ancestor loading.tsx boundaries, and Next.js currently
  // locks the HTTP status at 200 once streaming starts even when notFound() fires correctly
  // (open Next.js App Router issue, not an app bug — see docs/PROGRESS.md "Admin raw data view").
  await expect(page.locator('[data-testid="not-found-page"]')).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e suite**

Run: `pnpm -C apps/web e2e admin-raw-view.spec.ts`
Expected: both tests PASS. If the picker's second member link happens to point back at the owner's
own id (shouldn't, since the seeded pool has 10 distinct members), re-check
`ownResultsView.leaderboard` ordering — no fix needed otherwise.

- [ ] **Step 3: Run the full gate**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm -C apps/web build`
Expected: all green.

- [ ] **Step 4: Update `docs/PROGRESS.md`**

Add a new dated section near the end of the "What exists" history (after the most recent entry)
following the existing format, e.g.:

```markdown
## Admin raw data view (2026-07-18)

Pool owners can now inspect the raw, already-computed `CardView`/`ResultsView` JSON for any member
of their pool in production, at `/pools/[id]/raw` — for debugging scoring/bracket discrepancies
without reading application code or hand-deriving state from SQL.

- **`apps/web/src/features/admin/`** — new minimal feature slice: `ui/RawJsonBlock.tsx` (JSON
  dump + copy-to-clipboard), `index.ts` barrel. No new domain/application logic — pure
  composition of the existing `getResultsView`/`getCardView`.
- **`apps/web/src/app/(authenticated)/pools/[id]/raw/page.tsx`** — owner-only (404 for
  non-owners), member picker built from `leaderboard`, dumps both view-models for the selected
  member.
- **Pool detail page** — "Raw data (debug)" link added next to `PoolBackupControls`, owner-only.
- **`apps/web/src/app/not-found.tsx`** — new styled root 404 boundary (was missing app-wide).
  Investigated whether this would also fix `notFound()` returning HTTP 200 instead of 404 — it
  doesn't: `/pools/[id]/*` streams under ancestor `loading.tsx` files, and Next.js currently locks
  the response status once streaming starts, regardless of a later `notFound()` (open Next.js
  App Router limitation, not an app bug). Fixing that properly means either dropping `loading.tsx`
  under `/pools/[id]/*` (UX regression) or adding middleware-level auth before streaming starts
  (real architecture change) — both out of scope here. The e2e test below asserts on rendered
  404 content via `data-testid`, not `response.status()`, until one of those is worth doing.
- **`apps/web/e2e/admin-raw-view.spec.ts`** — owner flow + non-owner sees the 404 page content.
- **Design/plan:** `docs/superpowers/specs/2026-07-18-admin-raw-data-view-design.md`,
  `docs/superpowers/plans/2026-07-18-admin-raw-data-view.md`.
```

Also add this to the "Deferred / known follow-ups" list near the end of the file:

```markdown
- **`notFound()` returns HTTP 200, not 404, under streaming routes** — `/pools/[id]/*` (and any
  other route tree with an ancestor `loading.tsx`) renders correct 404 content but keeps an HTTP
  200 status, because Next.js locks the response status once streaming starts. Open upstream
  issue, not unique to this app. Fix requires either removing `loading.tsx` there (UX regression)
  or middleware-level auth before the response starts streaming (real architecture change).
```

- [ ] **Step 5: Single commit for the whole feature**

```bash
git add \
  apps/web/src/features/admin \
  "apps/web/src/app/(authenticated)/pools/[id]/raw" \
  "apps/web/src/app/(authenticated)/pools/[id]/page.tsx" \
  apps/web/src/app/not-found.tsx \
  apps/web/e2e/admin-raw-view.spec.ts \
  docs/PROGRESS.md \
  docs/superpowers/specs/2026-07-18-admin-raw-data-view-design.md \
  docs/superpowers/plans/2026-07-18-admin-raw-data-view.md
git commit -m "$(cat <<'EOF'
feat(admin): add owner-only raw CardView/ResultsView JSON viewer

Pool owners can inspect the exact computed view-models for any member
at /pools/[id]/raw, for production debugging without hand-deriving
state from SQL.

Also adds a root not-found.tsx (was missing app-wide) for a styled 404
page. It does not fix notFound() returning HTTP 200 instead of 404 on
routes that stream under an ancestor loading.tsx (open Next.js App
Router limitation) — the e2e non-owner test asserts on rendered 404
content instead of response status; noted in PROGRESS.md as a known
follow-up.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** Access control ✅ (Task 2, owner check), Route & data flow ✅ (Task 2),
  UI/member picker/RawJsonBlock/entry point ✅ (Tasks 1–3), Testing ✅ (Task 4). Out-of-scope items
  (DB table browser, site-wide admin role, JSON tree viewer) are correctly not implemented anywhere.
- **Placeholder scan:** no TBD/TODO; every step has complete, runnable code.
- **Type consistency:** `RawJsonBlock({ title, json, testId })` (Task 1) matches its two call sites
  in Task 2 exactly (`title`, `json`, `testId` props, no others). `selectedUserId` is branded via
  `asUserId` once and reused consistently for `getResultsView`, `getMember`, `getCardView`, and the
  picker's `aria-current` comparison.
