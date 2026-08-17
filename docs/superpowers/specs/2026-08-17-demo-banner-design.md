# Demo banner

**Date:** 2026-08-17
**Status:** implemented

## Problem

Once a visitor clicks into one of the demo pool views (`/view/demo-groups`, `/view/demo-knockout`,
`/view/demo-completed`), there is no persistent UI element that (a) signals they are in a demo and
(b) lets them jump to the other two checkpoints without backtracking to `/demo`. The banner fills
both gaps.

## Non-goals

- No dismiss/close button — the banner is permanent while inside demo routes.
- No new auth, data-fetching, or DB interaction — purely path-driven UI.
- Does not appear on any non-demo route (e.g. a real pool's `/view/<token>`).

## Architecture

### New file

`apps/web/src/app/(view)/DemoBanner.tsx` — a `'use client'` component co-located with
`layout.tsx` in the `(view)` route group. Not placed in `shared/ui` because it is demo-specific
and not generically reusable.

### Layout change

`apps/web/src/app/(view)/layout.tsx` adds `<DemoBanner />` above `<header>`. `DemoBanner`
returns `null` on any route that is not a demo path, so the existing header is unchanged
everywhere else.

### Active-path detection

`DemoBanner` calls `usePathname()` and maps the result to one of five states:

| Path                   | Active stage |
| ---------------------- | ------------ |
| `/demo`                | none         |
| `/view/demo-groups`    | `groups`     |
| `/view/demo-knockout`  | `knockout`   |
| `/view/demo-completed` | `completed`  |
| anything else          | return null  |

## Visual design

A full-width strip using the `turf` dark-green background, so it reads as "part of the demo
brand." Height ~36–40 px (compact announcement bar).

```
[ ⚽ Live demo   Group stage · Knockout stage · Completed ]
```

- **Left:** small icon + "Live demo" label in `on-dark-muted` eyebrow style.
- **Stage links:** "Group stage", "Knockout stage", "Completed" separated by dots.
  - Active link (current checkpoint): white text, `font-bold`.
  - Inactive links: `on-dark-soft` color, normal weight.
  - On `/demo`: all three equal weight (no active stage).
- **Link hrefs:** `/view/demo-groups`, `/view/demo-knockout`, `/view/demo-completed`.

## Testing

- **Unit** (`DemoBanner.test.ts`): mock `usePathname()`; assert renders `null` outside demo paths,
  renders all 3 links on `/demo`, highlights the correct link on each `/view/demo-*` path.
- **E2E** (`demo.spec.ts`): extend the existing demo spec to assert the banner is visible on
  `/demo` and each `/view/demo-*` route, and absent on a non-demo pool view.
