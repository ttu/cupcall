---
name: settings-login-link-connect-email
description: Add MyLoginLink (all users) and ConnectEmailForm (guests only) to the Settings page
metadata:
  type: project
---

# Settings page: Login link + Connect email

## Goal

Add two existing components to the Settings page so users can manage their login options in one place, without navigating to the Pools page.

## Components involved

| Component          | Source           | Visibility                  |
| ------------------ | ---------------- | --------------------------- |
| `ConnectEmailForm` | `features/auth`  | Guests only (`!user.email`) |
| `MyLoginLink`      | `features/pools` | All users                   |

Both components already exist and are fully implemented; this is a wiring task only.

## Layout

```
/settings
  <h1>Settings</h1>
  <eyebrow>Your account</eyebrow>
  <SettingsForm />        ← unchanged (profile, email chip if set, danger zone)
  <ConnectEmailForm />    ← guests only, no email connected
  <MyLoginLink />         ← all users, always shown
```

## Changes to `settings/page.tsx`

1. Import `ConnectEmailForm` from `@/features/auth`.
2. Import `MyLoginLink`, `generateLoginToken` from `@/features/pools`.
3. Import `getLoginTokenByUserId`, `upsertLoginToken` from `@cup/db`.
4. Fetch/upsert login token for **all** users (not guest-gated as on the Pools page).
5. Pass `token` and `baseUrl` to `<MyLoginLink />`.
6. Render `<ConnectEmailForm />` only when `!email`.

## What does NOT change

- `SettingsForm` — untouched.
- `MyLoginLink` — untouched.
- `ConnectEmailForm` — untouched.
- Pools page behaviour — untouched.

## Difference from Pools page

On the Pools page, the login token is only fetched/created for guests. On Settings, it is fetched/created for **all** users because `MyLoginLink` is always shown.
