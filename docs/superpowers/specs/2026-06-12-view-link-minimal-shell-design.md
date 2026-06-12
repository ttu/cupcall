# View-link minimal shell

## Problem

After the [view-link parity](./2026-06-12-view-link-parity-design.md) work, the
`/view/[token]` routes still live under the `(authenticated)` route group and inherit
its layout — a desktop sidebar listing the viewer's own pools plus "New pool",
"Settings", and "Sign out", and a mobile bottom nav with "Pools / Predict / Board / You"
shortcuts. None of those affordances are meaningful to a spectator who arrived through a
view link. The parity spec explicitly flagged this as a follow-up
(["A future cleanup could split view-token pages into their own group with a layout that
omits the sidebar/mobile-nav shell"](./2026-06-12-view-link-parity-design.md#non-goals--risks)).

This spec is that follow-up: replace the member shell with a minimal viewer shell on
view-link pages.

## Scope

In scope:

- Move every route under `apps/web/src/app/(authenticated)/view/[token]/...` into a new
  `(view)` route group so it no longer inherits the member layout.
- Add `apps/web/src/app/(view)/layout.tsx` that renders a thin top bar containing only
  the logo, with no sidebar and no mobile bottom nav.
- The change applies to every view-link route: landing, results, and member-card.

Out of scope:

- Any edit to the moved page components themselves — files move; contents are unchanged.
- The desktop sidebar and mobile bottom nav for member routes — unchanged.
- Authentication state on view-link pages — the token is the capability, as today.
- A "Sign in" affordance on the viewer shell — out of scope here; can be revisited later
  if there is demand.

## URLs

URLs are unchanged. Next.js route groups (`(name)`) do not appear in the URL, so:

```
/view/[token]                          unchanged
/view/[token]/results                   unchanged
/view/[token]/members/[memberId]        unchanged
```

## File reorganisation

```
apps/web/src/app/
  (authenticated)/
    layout.tsx                          (sidebar + mobile nav — unchanged)
    pools/...                           (unchanged)
    settings/...                        (unchanged)
    view/[token]/...                    REMOVE: subtree moves out
  (view)/                               NEW group
    layout.tsx                          NEW: minimal viewer shell
    view/[token]/                       MOVED from (authenticated)
      page.tsx                          (no edits)
      loading.tsx                       (no edits)
      results/                          (no edits)
      members/                          (no edits)
```

The move is a pure filesystem operation — no content edits to the page files. URLs are
preserved because route group names are stripped by Next.js.

## Viewer shell

`apps/web/src/app/(view)/layout.tsx` renders a single top bar above its children:

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

Design notes:

- The logo uses the light variant (not the `dark` prop) because the top bar sits on
  `var(--surface)`, matching the page body below it.
- The logo is not wrapped in a `Link`. A spectator has no notion of a "home" inside this
  app, so the logo is identity-only.
- No `getCurrentActor()` call. Viewers do not need an actor; reading the pool by view
  token is the capability, exactly as the existing pages already do.
- The layout does **not** introduce a `pl-[220px]` desktop offset or a `pb-[64px]` mobile
  offset — there is no sidebar and no bottom nav to make room for.

## Behaviour

- Anonymous viewers opening any `/view/[token]/...` URL see only the top bar (logo) +
  page content. No "Your Pools", no "New pool", no "Settings", no "Sign out", no mobile
  bottom nav.
- An authenticated user (including a pool owner) who opens a view-link URL also sees the
  minimal shell. View-link mode is defined by the URL, not by the viewer's identity. This
  is consistent with the existing data layer, which already ignores the viewer's identity
  on these pages.

## Risks and edge cases

- **Layout composition**: Next.js composes nested layouts with the root `app/layout.tsx`
  but does not compose layouts across sibling route groups. Moving the routes from
  `(authenticated)` to `(view)` cleanly replaces the inherited chrome.
- **Internal links**: `Sidebar.tsx` and `MobileNav.tsx` are not used by view-link pages
  and contain no references to view-link URLs, so no link audit is required there. The
  view-link pages already build their own `/view/${token}/...` URLs and continue to work
  unchanged.
- **Authenticated viewer surprise**: a member who clicks a view link no longer sees their
  sidebar. This is intentional — view links are a different mode — and is easy to recover
  from by going to `/pools` directly.

## Testing

- **Manual browser walkthrough** (the same kind used for the parity work):
  1. Open `/view/[token]` anonymously: confirm only the logo top bar is visible, no
     sidebar (desktop) and no bottom nav (mobile).
  2. Navigate to `/view/[token]/results` and `/view/[token]/members/[memberId]`: confirm
     the shell stays minimal across all three routes.
  3. Open the same URL while logged in as a member or owner: confirm the same minimal
     shell appears.
  4. Open `/pools` and `/settings`: confirm the member shell (sidebar + mobile nav) is
     intact and unchanged.
- **No new automated tests.** This is a layout/file-organisation change; the existing
  integration and E2E coverage validates everything that renders inside the shell. The
  page bodies are not edited.

## Files touched

Moved (no content edits):

- `apps/web/src/app/(authenticated)/view/[token]/page.tsx`
  → `apps/web/src/app/(view)/view/[token]/page.tsx`
- `apps/web/src/app/(authenticated)/view/[token]/loading.tsx`
  → `apps/web/src/app/(view)/view/[token]/loading.tsx`
- `apps/web/src/app/(authenticated)/view/[token]/results/`
  → `apps/web/src/app/(view)/view/[token]/results/` (whole subtree)
- `apps/web/src/app/(authenticated)/view/[token]/members/`
  → `apps/web/src/app/(view)/view/[token]/members/` (whole subtree)

New:

- `apps/web/src/app/(view)/layout.tsx`

Not modified:

- `apps/web/src/app/(authenticated)/layout.tsx`
- `apps/web/src/app/(authenticated)/Sidebar.tsx`
- `apps/web/src/app/(authenticated)/MobileNav.tsx`
- Any moved page file's contents.
