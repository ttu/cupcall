# Remove linked email — design spec

**Date:** 2026-07-04  
**Status:** approved

## Overview

Users who have linked an email address to their account (originally guest accounts) can remove it from the Settings page. After removal they revert to guest status and sign in via their personal login link.

## User flow

1. User opens `/settings`. Their email is shown in a read-only row with a "Verified" chip and a new **Remove** button.
2. Clicking **Remove** switches the row to confirm mode: "Remove email? [Confirm] [Cancel]" inline below the email row — same two-click pattern as "Delete account".
3. Clicking **Confirm** calls `unlinkEmailAction`. On success the page re-renders (via `revalidatePath`): the email row disappears and `ConnectEmailForm` reappears.
4. Clicking **Cancel** returns to the normal state with no change.

## Components

### DB — `clearUserEmail` (`packages/db/src/repositories/users.ts`)

```ts
export async function clearUserEmail(db, id: UserId): Promise<UserRow | undefined>;
```

- Updates `email = null, emailVerified = null` on the matching user row.
- Returns the updated row, or `undefined` if no row matched (user not found).
- Auto-exported via `repositories/index.ts` barrel — no barrel changes needed.

### Server action — `unlinkEmailAction` (`apps/web/src/features/auth/actions.ts`)

```ts
export async function unlinkEmailAction(): Promise<{ ok: boolean; error?: string }>;
```

1. `getCurrentActor()` — throws `ForbiddenError` if unauthenticated.
2. `getUserById` — verifies the user currently has an email (early-return `{ ok: false }` if not, to handle double-calls gracefully).
3. `clearUserEmail(db, actor.userId)`.
4. `logger.info` + `revalidatePath('/settings')`.
5. Returns `{ ok: true }`.

Auth.js uses `strategy: 'database'` — each `auth()` call reads fresh user data from the DB, so no manual session invalidation is needed.

Export added to `apps/web/src/features/auth/index.ts`.

### UI — `SettingsForm.tsx`

State added (client component):

| state var            | type                 | purpose                        |
| -------------------- | -------------------- | ------------------------------ |
| `confirmRemoveEmail` | `boolean`            | whether confirm row is visible |
| `isRemovingEmail`    | from `useTransition` | pending indicator              |
| `removeEmailError`   | `string \| null`     | inline error display           |

The email section (currently lines 97–109 of `SettingsForm.tsx`) is extended:

- **Normal:** email row + Verified chip + small **Remove** button (`ghost-danger`, `size="sm"`).
- **Confirm:** email row (chip hidden), then inline row: "Remove email?" text + **Confirm** button (`danger`, `size="sm"`) + **Cancel** plain text button.
- On success: `revalidatePath` causes a server re-render; `ConnectEmailForm` becomes visible automatically.

No new component or file is needed; the pattern follows the existing delete-account confirm flow in the same file.

## Error handling

- Unauthenticated: `ForbiddenError` (thrown, caught by Next.js error boundary).
- No email on account (double-call): `{ ok: false, error: 'No email linked.' }` — shown inline.
- DB failure: `{ ok: false, error: 'Could not remove email. Please try again.' }` — shown inline.

## Tests

### `packages/db/src/repositories/users.test.ts`

- `clearUserEmail` — success: sets email and emailVerified to null, returns updated row.
- `clearUserEmail` — no-op: returns undefined when user id not found.

### `apps/web/src/features/auth/actions.test.ts`

- `unlinkEmailAction` — success: clears email, returns `{ ok: true }`.
- `unlinkEmailAction` — unauthenticated: throws `ForbiddenError`.
- `unlinkEmailAction` — no email on account: returns `{ ok: false }` without touching the DB.

## Definition of done

- [ ] `clearUserEmail` repo function with tests.
- [ ] `unlinkEmailAction` server action with tests.
- [ ] `SettingsForm` shows Remove button + confirm flow.
- [ ] `unlinkEmailAction` exported from `auth/index.ts`.
- [ ] Format, lint, typecheck pass.
- [ ] Settings page is in a working state after the change.
