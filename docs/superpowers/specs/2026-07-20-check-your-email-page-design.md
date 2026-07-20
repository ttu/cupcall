# Check your email page — design

## Problem

After submitting the sign-in email form, users are redirected to Auth.js's
built-in default "verify request" page — plain, unstyled HTML with no
branding. Replace it with a custom page matching the provided mockup.

## Scope

- New custom page for the **sign-in magic-link flow only**
  (`emailSignInAction` → `signIn('resend', …)`). The separate "connect email"
  flow (`ConnectEmailForm` / `link-email-actions.ts`) is untouched — different
  flow, different copy, not part of this mockup.
- Generic copy — no real email address shown. Auth.js's default flow doesn't
  pass the submitted email to the verify-request redirect (privacy-by-default),
  and surfacing it would require extra plumbing not justified by the mockup.
- No footer/buttons section — the card ends after the expiry pill. No
  "Resend link" / "Use a different email" actions for now.
- Magic-link token expiry shortened from 24h → 15 minutes, so the page's "15
  minutes" claim is actually true (previously the code granted 24h while the
  mockup said 15 minutes).

## Components

### `apps/web/src/app/login/verify-request/page.tsx` (new)

Route registered as Auth.js's `pages.verifyRequest`. Static server component,
no props/query dependency. Visual structure, following the same
self-contained-page convention as the sibling `login/invalid/page.tsx`:

- `turf` dark-green striped background, full viewport, centered content.
- White rounded card (`card` utility).
- Icon badge: mail icon (existing `Icon name="mail"`) inside a soft-green
  circle, with a small solid-green circular checkmark badge overlapping its
  bottom-right corner (white icon on green, white ring to create the cutout
  look from the mockup).
- `CHECK YOUR EMAIL` heading in the display font (`display` utility,
  uppercase).
- One line of generic body copy: "We sent a sign-in link to your inbox."
- Light-gray pill: "The link expires in 15 minutes."

### `auth.config.ts`

Add `pages.verifyRequest: '/login/verify-request'` so Auth.js redirects here
instead of rendering its default page.

### `auth.ts` + `email-provider.ts`

Introduce one shared constant, `MAGIC_LINK_MAX_AGE_SECONDS = 60 * 15`,
exported from `email-provider.ts`. Used as:

- The Resend provider's `maxAge` (`auth.ts`) — the actual token validity.
- The source for the "15 minutes" wording rendered into the sign-in email's
  html/text templates (`email-provider.ts`), so the copy and the real expiry
  can't silently drift apart.

## Testing

- New test for the `verify-request` page: renders the heading, the generic
  body copy, and the "15 minutes" expiry text; asserts no buttons are present.
- Update `email-provider.test.ts`: assert the email copy reflects
  `MAGIC_LINK_MAX_AGE_SECONDS` (15 minutes), not the old hardcoded 24 hours.

## Out of scope

- `ConnectEmailForm` / `link-email-actions.ts` — separate "connect email"
  flow with its own (24h) expiry; not part of this mockup.
- Any "resend" or "use a different email" functionality — explicitly dropped
  per user decision.
