# Deployment guide — Vercel + Neon + Resend

Stack: **Vercel** (Next.js hosting) · **Neon** (managed Postgres) · **Resend** (magic-link email)

---

## Overview

```
GitHub repo
  └─ push to main ──► Vercel (auto-deploy) + GitHub Action (db:migrate → sync)
  └─ PR branch   ──► Vercel preview deploy (shared Neon DB, or Neon branch per PR)

browser ──► Vercel (Next.js) ──► Neon Postgres (pooled connection)
GitHub Action (sync/migrate) ──► Neon Postgres (direct connection)
```

Required env vars (all four must be set):

| Variable         | Used by                              |
| ---------------- | ------------------------------------ |
| `DATABASE_URL`   | App (pooled), migrations, sync job   |
| `AUTH_SECRET`    | Auth.js — signs sessions             |
| `AUTH_URL`       | Auth.js — magic-link callback domain |
| `RESEND_API_KEY` | Sending magic-link emails            |

---

## 1. Neon

### 1a. Create a project

1. Go to [neon.tech](https://neon.tech) → **Sign up** (free tier is sufficient).
2. **New project** → give it a name (e.g. `cup-prediction`) → choose a region close to your Vercel deployment (e.g. `aws-eu-west-1` for Europe).
3. Neon creates a default branch called `main` — this is your production database.

### 1b. Grab connection strings

In the Neon console, open your project → **Connection Details**.

You need **two** connection strings:

| Purpose                        | Where to use                                  | String type                 |
| ------------------------------ | --------------------------------------------- | --------------------------- |
| **App / serverless functions** | `DATABASE_URL` in Vercel production + preview | **Pooled** (uses PgBouncer) |
| **Migrations + sync script**   | `DATABASE_URL` in GitHub Actions secrets      | **Direct** (non-pooled)     |

- Pooled URL looks like: `postgresql://user:pass@ep-xxx.pooler.neon.tech/neondb?sslmode=require`
- Direct URL looks like: `postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require`

> **Why two?** Vercel serverless functions use short-lived connections; PgBouncer handles that.
> Drizzle Kit migrations and the sync script need a direct connection (PgBouncer doesn't support DDL transactions).

### 1c. Run the initial migration

With your direct connection string, run this once locally to create the schema:

```bash
DATABASE_URL="<direct-connection-string>" pnpm db:migrate
```

Verify it worked by checking the Neon console → **Tables** — you should see `users`, `sessions`, `pools`, `cards`, `scores`, etc.

### 1d. (Optional) Neon branch per PR

Neon's free tier supports database branching. You can configure the Neon GitHub integration to automatically create a branch for each PR and delete it when the PR closes — giving each preview deploy its own isolated database.

- In the Neon console → **Integrations** → **GitHub** → follow the setup wizard.
- Once installed, Neon injects `DATABASE_URL` into each Vercel preview environment automatically, overriding the one you set manually.

This is optional but recommended once the app is in active use.

---

## 2. Resend

### 2a. Create account and verify domain

1. Go to [resend.com](https://resend.com) → **Sign up**.
2. **Domains** → **Add Domain** → enter your sending domain (e.g. `cupp.app` or your own domain).
3. Add the DNS records Resend gives you (DKIM, SPF, DMARC) to your domain registrar.
4. Wait for verification (usually a few minutes).

> **No domain yet?** During early testing you can use `onboarding@resend.dev` as the `from` address — no domain needed, but it only sends to the account owner's email. Switch to a real domain before sharing with users.

### 2b. Get an API key

**API Keys** → **Create API Key** → name it `cup-prediction-production` → **Full access** → **Create**.

Copy the key — it starts with `re_`. You won't see it again.

### 2c. Update the `from` address

The app sends from `noreply@cupcall.app` (hardcoded in `apps/web/src/features/auth/auth.ts:24,38`).

---

## 3. Vercel

### 3a. Create account and import repo

1. Go to [vercel.com](https://vercel.com) → **Sign up** (use GitHub login for easiest integration).
2. **Add New Project** → **Import Git Repository** → select your GitHub repo.

### 3b. Configure project settings

On the import screen, expand **Build and Output Settings** and set:

| Setting              | Value                            |
| -------------------- | -------------------------------- |
| **Framework Preset** | Next.js                          |
| **Root Directory**   | `apps/web`                       |
| **Build Command**    | `pnpm -C apps/web build`         |
| **Output Directory** | `apps/web/.next`                 |
| **Install Command**  | `pnpm install --frozen-lockfile` |

> `vercel.json` (redirects, headers, etc.) must live in `apps/web/`, not the repo root — Vercel only reads it from the configured Root Directory.

### 3c. Set environment variables

In **Environment Variables**, add these four (set for **Production**, **Preview**, and **Development**):

| Key              | Value                             | Notes                                  |
| ---------------- | --------------------------------- | -------------------------------------- |
| `DATABASE_URL`   | Neon **pooled** connection string | All environments                       |
| `AUTH_SECRET`    | Random 32+ char string            | Generate: `openssl rand -base64 32`    |
| `AUTH_URL`       | `https://your-app.vercel.app`     | Update to custom domain if you add one |
| `RESEND_API_KEY` | `re_xxxx…` from Resend            |                                        |

> **`AUTH_URL`** must be the exact public URL including `https://`. For preview deploys this needs to match the preview URL, which changes per PR. The simplest fix is to only set `AUTH_URL` for the **Production** environment and rely on Auth.js's auto-detection for previews (it reads `VERCEL_URL` automatically when `AUTH_URL` is unset).

### 3d. Deploy

Click **Deploy**. The first deploy will take ~2 minutes. Once green, your app is live.

Every subsequent push to `main` redeploys automatically. PRs get a preview URL.

---

## 4. GitHub Actions secrets

The sync workflow (`sync.yml`) and CI e2e job need database access. Add these in:
**GitHub repo → Settings → Secrets and variables → Actions**

| Secret         | Value                                          |
| -------------- | ---------------------------------------------- |
| `DATABASE_URL` | Neon **direct** (non-pooled) connection string |

> CI e2e uses a local Postgres Docker service so it doesn't need the real DB — only the sync job does.

---

## 5. Database migrations on deploy

Migrations are **not** run automatically by Vercel's build step. Two options:

**Option A — Manual (simplest for now):**  
Run `DATABASE_URL="<direct-url>" pnpm db:migrate` locally whenever you add migrations before deploying.

**Option B — CI-driven (recommended once in active use):**  
Add a migration step to `.github/workflows/ci.yml` that runs on push to `main`, before Vercel picks up the build:

```yaml
- name: Run migrations
  run: pnpm db:migrate
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

Add this after the `pnpm install` step in a new `migrate` job that runs before `quality`, then make the Vercel deployment wait for CI to pass (Vercel → Settings → Git → **Required checks**).

---

## 6. Seed tournament data

After the schema is up, load the tournament data:

```bash
DATABASE_URL="<direct-url>" pnpm sync -- mini-2026
```

Or trigger it via the GitHub Actions manual dispatch on `sync.yml`.

---

## 7. Checklist

- [ ] Neon project created, region chosen
- [ ] Schema migrated (`pnpm db:migrate` with direct URL)
- [ ] Tournament data synced (`pnpm sync -- <id>`)
- [ ] Resend account created, domain verified, API key copied
- [ ] `from` address in `auth.ts` updated to your domain
- [ ] Vercel project imported, build settings configured
- [ ] All four env vars set in Vercel
- [ ] `DATABASE_URL` secret added to GitHub Actions
- [ ] First deploy successful, app loads at Vercel URL
- [ ] Magic-link email arrives when you sign in
- [ ] `AUTH_URL` updated if you attach a custom domain
