# Design: Link-Email Success Page

**Date:** 2026-07-04  
**Status:** Approved

## Summary

When a user clicks the email-confirmation link and it is valid, show a dedicated success page instead of silently redirecting to `/pools`. The success page confirms the email was connected and provides a "Go to My Pools" button.

## Background

The `/link-email/[token]` route handler validates the token, links the email to the user's account, then redirects. Currently the success path redirects directly to `/pools` with no feedback. The failure path already redirects to a dedicated `/link-email/invalid` page. This change adds the symmetric success counterpart.

## Changes

### 1. Route handler (`apps/web/src/app/link-email/[token]/route.ts`)

Change the success redirect target from `/pools` to `/link-email/success`. The failure redirect to `/link-email/invalid` is unchanged.

```diff
- return NextResponse.redirect(new URL('/pools', request.url));
+ return NextResponse.redirect(new URL('/link-email/success', request.url));
```

### 2. New success page (`apps/web/src/app/link-email/success/page.tsx`)

A server component. Mirrors the layout and styling of the existing `/link-email/invalid/page.tsx`:

- Centered card layout (`max-w-md mx-auto px-4 py-12 text-center`)
- Heading: "Email connected"
- Body: "Your email address has been connected to your account."
- Link button to `/pools`: "Go to My Pools"

No new shared components. No client-side code.

## Testing

The route handler already has test coverage. Update the expected success-path redirect URL in `link-email-actions.test.ts` (or wherever the route handler redirect is asserted) from `/pools` to `/link-email/success`.

The success page is pure markup — no separate unit test required.

## Out of scope

- Auto-redirect or timed forward from the success page
- Showing the linked email address on the success page
- Toast/banner on the pools page
