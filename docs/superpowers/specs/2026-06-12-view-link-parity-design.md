# View-link parity with member view

## Problem

The view-link page (`/view/[token]`) is a stripped-down placeholder: it shows only a
header and the leaderboard, with Tailwind-only styling that visually diverges from the rest
of the app. Members visiting `/pools/[id]` get a much richer landing — race chart preview,
tournament timeline, action shortcuts, design-token styling. A pool owner who shares the
view link expects the recipient to see something equivalent to what members see (minus
member-only controls), not a bare list.

This spec brings the view-link surface to parity with the member surface for the things a
spectator can meaningfully see — leaderboard, race chart, tournament timeline, full results
page — while omitting everything that requires user identity (own card, own standing,
invite/owner/backup/leave controls).

## Scope

In scope:

- Rebuild `/view/[token]` to mirror the layout, sections, and styling of
  `/pools/[id]/page.tsx`, adapted for an anonymous viewer.
- Add `/view/[token]/results` as a view-mode mirror of `/pools/[id]/results/page.tsx`.
- Make `getResultsView` and `buildRaceChartData` accept null/absent user identity.
- Thread an optional `viewToken` through `ResultsPageClient` and any child component that
  builds member-card or back-to-pool hrefs.

Out of scope:

- `/view/[token]/predict`, `/scoring`, `/members` index, edit/owner/backup actions — these
  belong to members or owners only.
- New E2E coverage (flagged as a follow-up; existing E2Es already exercise the relevant
  components in member mode, and the view-mode flow has no destructive actions).
- Any change to the join/invite flow (`/join/[token]`) — that is a separate concern with
  its own in-flight spec.

## Routes

```
/view/[token]                                rebuilt
/view/[token]/results                        new
/view/[token]/members/[memberId]             existing, unchanged
```

All three resolve the pool via `getPoolByViewToken(db, token)` from `@cup/db`. There is no
auth or membership check — the view token itself is the capability. An unknown token →
`notFound()`. The pages remain under the `(authenticated)` route group; the existing layout
already tolerates a null actor (it renders the sidebar/mobile-nav shell with no pool list)
so anonymous visitors are handled.

## `/view/[token]` landing page

Visual structure mirrors `/pools/[id]/page.tsx` (same hero, same two-column grid at
`md:grid-cols-[1fr_300px]`, same design-token classes: `.display`, `.eyebrow`, `.pill-lock`,
`.card`, `turf`, etc.).

### Header

- Eyebrow: plain text `Leaderboard` (no `Pools ·` link — viewers have no pool index).
- `h1.display` pool name.
- `.eyebrow` tournament name.
- `.pill-lock` "Locked" pill on the right when `now >= detail.lockTime`.

### Left column

- `<Leaderboard entries={detail.leaderboard} currentUserId={null} poolId={pool.id}
isOwner={false} locked={true} viewToken={token} />`.
  - `locked={true}` keeps card links enabled (matching today's view-mode behavior — a
    viewer who has the token can see member cards).
  - `currentUserId={null}` suppresses the "(you)" badge and the `isSelf` highlighting.
- Race Chart preview card, rendered only when `now >= detail.lockTime`. Built with
  `buildRaceChartData(detail.leaderboard, null)`. Wrapping link points to
  `/view/${token}/results?tab=race`. Same card chrome, "View full →" affordance, and
  `RaceChart` component as the member page.

### Right rail

- No "Your standing" card.
- One large orange action shortcut: "Results & standings" → `/view/${token}/results`. Same
  visual treatment as on the member page (icon + headline + sub-line + arrow).
- No "My predictions" shortcut.
- `<StageBar stages={detail.stageProgress} />` inside a `.card` with `overflowX: auto`,
  rendered only when `detail.stageProgress.length > 0`.
- No Invite, View, Owner, Backup, or Leave sections.

The bottom-of-page owner-controls + backup region is omitted.

## `/view/[token]/results` page

Mirrors `/pools/[id]/results/page.tsx` with the changes below.

### Data

`getResultsView` is changed so `userId` is optional. When omitted:

- `userRank = null`.
- `userBreakdown = null`.
- `getPrediction` / `getPredictionInputs` are skipped, so `inputs = null`. Downstream
  builders (`buildGroupResults`, `buildBracketRounds`) already tolerate null `inputs` for
  members who haven't filled a card, so no further change is required.
- `pointsRaceView` is built with `userId = null` so no player line is highlighted.

This matches the existing null-tolerance pattern inside the function (it already tolerates
a member with no prediction). No new branching at call sites — the member-mode call signature
is unchanged.

### Header

- Eyebrow `<pool name>` link points to `/view/${token}` (instead of `/pools/${poolId}`).
- Title `The Cup, as it unfolds` unchanged.
- Right-side chip: replace the "Your points / Rank" two-cell with a "Leader" two-cell:
  `Leader` eyebrow + leader display name; divider; `Points` eyebrow + leader points. Built
  from `view.leaderboard[0]`. Omit the chip when `leaderboard` is empty.

### Tabs and panels

`ResultsPageClient` receives the same `view` object. It must tolerate `userRank: null` and
`userBreakdown: null` — verification step during implementation will confirm and add
fallbacks where any child currently assumes non-null. An optional `viewToken` prop is
threaded through so any internal `Link` that targets `/pools/${poolId}/members/${memberId}`
or `/pools/${poolId}` uses the view URL instead. Helper:

```ts
const memberCardHref = (memberId: string) =>
  viewToken ? `/view/${viewToken}/members/${memberId}` : `/pools/${poolId}/members/${memberId}`;
```

Pool page passes nothing (existing behavior); view results page passes `viewToken`.

## Domain changes

### `getResultsView` (`features/results/application/get-results-view.ts`)

`Params.userId` becomes `string | undefined`. Inside the function:

- Skip `getPrediction` and `getPredictionInputs` when `userId` is undefined.
- `buildUserRank(leaderboard, userId)` becomes `userId ? buildUserRank(...) : null`.
- `userBreakdown` becomes `userId ? leaderboard.find(...)?.breakdown ?? null : null`.
- `buildPointsRaceView` receives `userId: userId ?? null`.

### `buildRaceChartData` (`features/results/domain/race-chart.ts`)

Accept `userId: UserId | null`. When null, no player line is marked as the highlighted
self. The shape of `RaceChartData` is unchanged; only the `isSelf` flag on each player
defaults to `false` for all players.

### `ResultsPageClient` and children (`features/results/ui/*`)

Audit result: the results UI components contain no `/pools/${poolId}/...` Link hrefs, so
no `viewToken` prop threading is needed for routing. They do, however, contain per-user
panels keyed off `breakdown` / `isCurrentUser`:

- `KnockoutPointsPanel` already returns null when `breakdown === null` — no change needed;
  passing `userBreakdown: null` from view mode hides it automatically.
- `PointsRaceTab` renders three "your stats" cards (Banked / Still live / Projected total)
  and a Swing card that all assume a current user. With `userId: null` in `getResultsView`,
  `myBanked`, `myStillLive`, `myProjected` all collapse to `0`, which would render as
  "0 points scored, +0 still live" — misleading for a spectator.

To address `PointsRaceTab`: add an optional `viewerMode?: boolean` prop. When true:

- Suppress the three "your stats" `StatCard`s (left column shows only the chart card).
- Suppress the `SwingCard` (right rail still shows the projected standings).
- The `RaceLegend` keeps rendering — without a current user, every legend entry uses the
  real display name and the chart highlights nobody.

`ResultsPageClient` accepts `viewerMode?: boolean` and passes it to `PointsRaceTab`. The
member page passes nothing (existing behavior); the view results page passes `true`.

## Link routing in shared components

`Leaderboard` already supports `viewToken` and routes member rows to
`/view/${viewToken}/members/${memberId}`. No change.

No results-UI component builds a `/pools/${poolId}/...` URL today (audited), so no further
prop threading for routing is required.

## Testing

This codebase tests pages through their underlying application-layer functions (pglite
integration) rather than by rendering `page.tsx`. The vitest include pattern is
`*.test.ts` only — no `.test.tsx`. Tests follow that convention:

- **Integration — `get-results-view.test.ts`** (extend). New cases for `userId: undefined`:
  - `userRank` and `userBreakdown` are null.
  - Group results render without per-user pick highlights (no `predicted*` fields).
  - Race view is built without a highlighted player (`chartPlayers.every(p => !p.isCurrentUser)`).
  - `getPrediction` / `getPredictionInputs` are not called (verified by the absence of
    user-specific data in the output when no prediction was seeded).
- **Unit — `race-chart.test.ts`** (new). Two cases: `userId: someUid` highlights one
  player; `userId: null` highlights none. Asserts `chartPlayers.every(p => !p.isCurrentUser)`
  when null.

Page-level wiring (URL routing, leader chip in header, anonymous render) is verified by
manual browser walkthrough at the end of the plan. E2E coverage is deferred — existing
member-mode E2Es already exercise every rendered component, and the view-mode flow has no
destructive actions.

In addition, `PointsRaceTab` gains a `viewerMode` prop that suppresses the "your stats"
panel (Banked/Still live/Projected total cards + Swing card) — these are inherently
per-user. `ResultsPageClient` accepts `viewerMode?: boolean` and threads it down. The
member page passes nothing (existing behavior); the view results page passes `true`. No
new test is needed for the prop itself — the manual browser walkthrough confirms the
panel is hidden.

## Files touched

New:

- `apps/web/src/app/(authenticated)/view/[token]/results/page.tsx`
- `apps/web/src/app/(authenticated)/view/[token]/results/loading.tsx`

Modified:

- `apps/web/src/app/(authenticated)/view/[token]/page.tsx`
- `apps/web/src/features/results/application/get-results-view.ts`
- `apps/web/src/features/results/domain/race-chart.ts`
- `apps/web/src/features/results/ui/ResultsPageClient.tsx` (+ any child components surfaced
  by the audit)

Tests added/extended as listed above.

## Non-goals / risks

- The `(authenticated)` route group is reused for convenience. A future cleanup could split
  view-token pages into their own group with a layout that omits the sidebar/mobile-nav
  shell, but that is not required for parity and is out of scope here.
- View tokens grant read access to the leaderboard, race chart, member cards (post-lock),
  and results. This matches the existing behavior — `/view/[token]/members/[memberId]`
  already exposes member cards via the token. No new authorization surface is introduced.
