# QA Verification Skill

**Description:** QA tester that verifies the full application — visual, functional, and interaction
testing using Playwright. Use after completing features, fixing bugs, refactoring, or before
committing/creating a PR.

---

## Prerequisites

- Dev server running at `http://localhost:3000` (run `pnpm dev` from the repo root if not running)
- DB seeded with ongoing tournament data (`pnpm seed:ongoing`)
- Playwright MCP available

## Setup

Create a screenshots folder for this run:

```
/tmp/qa-screenshots/
```

Take a screenshot at the end of every phase. Save as `phase-N-<short-description>.png`.

**ZERO TOLERANCE:** Any visible error, broken layout, console error, or wrong data is a finding.
Document every finding with a screenshot. Fix issues immediately before proceeding to the next phase.
Maximum 2 retries per phase before escalating to the user.

---

## Phase 1 — Server & seed check

1. Navigate to `http://localhost:3000/dev`.
2. If the page shows "No users found": stop, tell the user to run `pnpm seed:ongoing`, then retry.
3. Confirm the users list shows at least Alice, Bob, and other seeded users.
4. Note the current simulation checkpoint shown in the Cup Simulator.
5. Screenshot → `phase-1-dev-page.png`.

---

## Phase 2 — Unauthenticated home

1. Navigate to `http://localhost:3000/` in a fresh (not yet logged-in) state.
2. Verify the home page renders with **both** entry options:
   - "Join without email" (guest name form)
   - "Sign in with email" (magic-link form)
3. Verify there are no console errors.
4. Screenshot → `phase-2-home-unauthenticated.png`.

---

## Phase 3 — Join page (invite link)

1. Navigate to `http://localhost:3000/join/invalid-token`.
2. Verify the page renders (should show an error/invalid state, not a blank crash).
3. Screenshot → `phase-3-join-invalid-token.png`.

---

## Phase 4 — Login as Alice (pool owner)

1. Navigate to `http://localhost:3000/dev`.
2. Click the **Alice** button under "Login as User".
3. Wait for the redirect to complete (expect `/pools`).
4. Verify the pools page loads and Alice's pool is listed with a score badge.
5. Screenshot → `phase-4-pools-alice.png`.

---

## Phase 5 — Pools list

1. Confirm you are on `/pools`.
2. Verify at least one pool card is visible with: name, tournament name, score badge, member count.
3. Verify no console errors.
4. Screenshot → `phase-5-pools-list.png`.

---

## Phase 6 — Pool detail (owner perspective)

1. Click the pool card to navigate to `/pools/[id]`.
2. Verify the following sections are visible:
   - Leaderboard with at least one row (name, points, rank)
   - Navigation links: Predict, Results & standings, Scoring guide
   - Owner controls: invite link section, Export / Import buttons, Kick controls
3. Copy the pool ID from the URL for later use.
4. Screenshot → `phase-6-pool-detail-owner.png`.

---

## Phase 7 — Predict page

1. Click the **Predict** link (or navigate to `/pools/[id]/predict`).
2. Verify the stepper renders with at least one step.
3. Verify the completion bar (`[data-testid="completion-bar"]` or similar) shows a percentage.
4. On a group step: locate a score cell (`[data-testid^="score-"]`) and check it is interactive (editable).
5. On the bracket step: verify `[data-testid="bracket-section"]` is present and pick buttons render.
6. On the specials step: verify `[data-testid="specials-section"]` is present.
7. Make one small edit (e.g. enter a group score) and confirm it saves without an error toast.
8. Verify no console errors.
9. Screenshot → `phase-7-predict-page.png`.

---

## Phase 8 — Results & standings

1. Navigate back to the pool detail, then click **Results & standings** (or navigate to
   `/pools/[id]/results`).
2. Verify:
   - Stage bar (Group → R16 → QF → SF → Final) renders.
   - User score chip (points + rank) is visible.
   - The Group Stage tab is active by default.
   - At least one group match row OR a "no results yet" empty state is shown.
3. If group results exist: verify a hit chip (`exact` / `outcome` / `missed`) is shown per match row.
4. Switch to the Knockout tab; verify the bracket renders without layout breakage.
5. Screenshot → `phase-8-results-page.png`.

---

## Phase 9 — Member card (owner viewing a member)

1. Navigate back to the pool detail (`/pools/[id]`).
2. Click any member name in the leaderboard to reach `/pools/[id]/members/[memberId]`.
3. Verify the read-only card renders with bracket, groups, and specials sections.
4. Verify the audit log section is visible.
5. As the pool owner: verify import/export controls are present.
6. Screenshot → `phase-9-member-card.png`.

---

## Phase 10 — Switch user (member perspective)

1. Navigate to `http://localhost:3000/dev`.
2. Click a **non-Alice** user (e.g. Bob).
3. Wait for the redirect to `/pools`.
4. Navigate to the same pool detail.
5. Verify **owner controls are not shown** (no kick buttons, no export/import in owner position).
6. Navigate to Bob's own predict page; verify it is editable.
7. Navigate to Alice's member card from Bob's session; verify it is read-only and no owner controls.
8. Screenshot → `phase-10-member-perspective.png`.

---

## Phase 11 — Cross-cutting concerns

For each page visited:

1. **Console errors:** run `browser_console_messages` and confirm no `[error]` entries.
2. **Back navigation:** verify the browser back button returns to the previous page correctly.
3. **Loading states:** navigate between pages and confirm skeleton/spinner appears briefly then
   resolves (no indefinite spinners).
4. **Responsive layout:** resize to 375 × 812 (mobile) and verify no horizontal overflow or
   overlapping elements on the pools list, pool detail, and predict pages.
5. Screenshot → `phase-11-mobile-layout.png`.

---

## Phase 12 — Scoring guide

1. Navigate to `/pools/[id]/scoring`.
2. Verify the page renders with scoring rules (no 404 or crash).
3. Screenshot → `phase-12-scoring-guide.png`.

---

## Phase 13 — Settings page

1. Navigate to `http://localhost:3000/settings`.
2. Verify the page renders (user display name visible, no crash).
3. Screenshot → `phase-13-settings.png`.

---

## Phase 14 — Summary

Compile a final report with:

- **PASS** — phases with no findings
- **FAIL** — phases with findings; list each issue with its screenshot filename
- **Fixed** — issues fixed during this run
- **Deferred** — issues not fixed (needs user decision)

Print the summary clearly. If any FAIL items are deferred, ask the user what to do before closing.
