# Design System — Implementation Plan

Source: Claude Design export at `docs/features/design-system/` (see tarball in project memory).
Design files referenced below are from `football-cup-prediction/project/` inside the export archive.

The design is **stadium-at-night**: pitch green + warm orange accent, Anton display font, Archivo UI
font, dark ink surfaces for sidebar/hero, light paper surfaces for card content.

---

## Step 1 — CSS utility classes → `globals.css`

**File:** `apps/web/src/app/globals.css`

The CSS variables are already correct. Add the missing component-level utility classes taken
directly from `styles.css` in the design export. Append them after the existing `.divide` rule.

Classes to add (in this order):

### Typography helpers

```css
.display {
  font-family: var(--font-display);
  font-weight: 400;
  letter-spacing: 0.01em;
  line-height: 0.92;
  text-transform: uppercase;
}
.eyebrow {
  font-family: var(--font-ui);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 11px;
}
.tnum {
  font-variant-numeric: tabular-nums;
}
```

### Logo

```css
.logo {
  display: inline-flex;
  align-items: center;
  gap: 9px;
}
.logo-mark {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--green-500);
  display: grid;
  place-items: center;
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.18);
  flex: 0 0 auto;
  position: relative;
}
.logo-mark::before {
  content: '';
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 2.5px solid var(--ink-950);
}
.logo-mark.lg {
  width: 44px;
  height: 44px;
  border-radius: 13px;
}
.logo-mark.lg::before {
  width: 22px;
  height: 22px;
  border-width: 3.5px;
}
.logo-word {
  font-family: var(--font-display);
  text-transform: uppercase;
  font-size: 19px;
  letter-spacing: 0.02em;
  line-height: 1;
  color: inherit;
}
.logo-word .b {
  color: var(--orange-500);
}
```

### Buttons

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 14px;
  border: none;
  border-radius: 11px;
  cursor: pointer;
  padding: 0 18px;
  height: 44px;
  white-space: nowrap;
  letter-spacing: -0.005em;
  transition: filter 0.15s;
}
.btn.sm {
  height: 36px;
  padding: 0 13px;
  font-size: 13px;
  border-radius: 9px;
}
.btn.lg {
  height: 52px;
  padding: 0 26px;
  font-size: 16px;
  border-radius: 13px;
}
.btn.block {
  display: flex;
  width: 100%;
}
.btn-primary {
  background: var(--green-500);
  color: oklch(0.18 0.02 160);
}
.btn-accent {
  background: var(--orange-500);
  color: oklch(0.22 0.03 50);
}
.btn-dark {
  background: var(--ink-900);
  color: var(--on-dark);
}
.btn-ghost {
  background: transparent;
  color: var(--ink);
  box-shadow: inset 0 0 0 1.5px var(--line);
}
.btn-ghost-dark {
  background: rgba(255, 255, 255, 0.08);
  color: var(--on-dark);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
}
.btn-soft {
  background: var(--green-050);
  color: var(--green-700);
}
```

### Chips & pills

```css
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 27px;
  padding: 0 11px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: -0.005em;
  background: var(--surface-2);
  color: var(--ink-soft);
  box-shadow: inset 0 0 0 1px var(--line);
  white-space: nowrap;
}
.chip.green {
  background: var(--green-050);
  color: var(--green-700);
  box-shadow: inset 0 0 0 1px var(--green-300);
}
.chip.orange {
  background: var(--orange-050);
  color: var(--orange-600);
  box-shadow: inset 0 0 0 1px oklch(0.86 0.07 60);
}
.chip.dark {
  background: rgba(255, 255, 255, 0.1);
  color: var(--on-dark-soft);
  box-shadow: none;
}
.chip.dot::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.pill-lock {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 700;
  padding: 5px 11px;
  border-radius: 999px;
  background: var(--orange-050);
  color: var(--orange-600);
}
```

### Team badges

```css
.badge {
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: 13px;
  letter-spacing: 0.02em;
  color: var(--on-dark);
  background: var(--ink-800);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}
.badge.sm {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  font-size: 11px;
}
.badge.lg {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  font-size: 17px;
}
.badge.xl {
  width: 56px;
  height: 56px;
  border-radius: 13px;
  font-size: 23px;
}
/* team colour variants — add as needed when teams are known */
.badge.c-mex {
  background: oklch(0.55 0.16 150);
}
.badge.c-arg {
  background: oklch(0.66 0.11 235);
}
.badge.c-bra {
  background: oklch(0.74 0.16 130);
  color: oklch(0.25 0.05 260);
}
.badge.c-fra {
  background: oklch(0.45 0.13 260);
}
.badge.c-esp {
  background: oklch(0.55 0.18 25);
}
.badge.c-eng {
  background: oklch(0.94 0.01 250);
  color: oklch(0.45 0.18 25);
}
.badge.c-ned {
  background: oklch(0.68 0.18 55);
}
.badge.c-por {
  background: oklch(0.52 0.17 22);
}
.badge.c-ger {
  background: oklch(0.28 0.02 160);
}
.badge.c-usa {
  background: oklch(0.94 0.01 250);
  color: oklch(0.35 0.12 25);
}
.badge.c-can {
  background: oklch(0.55 0.18 25);
}
```

(Add more country codes as the tournament definition expands. The `c-` prefix + lowercase 3-letter ISO code maps to team colours.)

### Cards & section labels

```css
.card {
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--line-soft);
}
.card.flat {
  box-shadow: none;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-ui);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 11px;
  color: var(--ink-muted);
}
.section-label::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--line);
}
```

### Score inputs

```css
.score-cell {
  width: 46px;
  height: 52px;
  border-radius: 10px;
  background: var(--surface);
  border: 1.5px solid var(--line);
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: 26px;
  color: var(--ink);
}
.score-cell.filled {
  border-color: var(--green-400);
  background: var(--green-050);
  color: var(--green-700);
}
.score-cell.focus {
  border-color: var(--green-500);
  box-shadow: 0 0 0 3px var(--green-050);
}
.score-sep {
  font-family: var(--font-display);
  font-size: 22px;
  color: var(--ink-muted);
}
```

### Progress bars

```css
.bar {
  height: 8px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--line);
}
.bar > i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--green-500);
}
.bar.thin {
  height: 5px;
}
.bar.dark {
  background: rgba(255, 255, 255, 0.12);
  box-shadow: none;
}
.bar.orange > i {
  background: var(--orange-500);
}
```

### Leaderboard & avatars

```css
.lb-row {
  display: grid;
  align-items: center;
  grid-template-columns: 34px 1fr auto;
  gap: 14px;
  padding: 13px 16px;
  border-radius: 12px;
  background: var(--surface);
}
.lb-rank {
  font-family: var(--font-display);
  font-size: 20px;
  color: var(--ink-muted);
  text-align: center;
}
.lb-rank.t1 {
  color: var(--gold);
}
.lb-rank.t2 {
  color: var(--silver);
}
.lb-rank.t3 {
  color: var(--bronze);
}
.lb-pts {
  font-family: var(--font-display);
  font-size: 22px;
  color: var(--ink);
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  font-weight: 800;
  font-size: 14px;
  color: var(--on-dark);
}
```

**After this step:** the full design system vocabulary is available as CSS utility classes.
Run `pnpm --filter web lint && pnpm --filter web typecheck` — no changes to TS files, so both
should pass cleanly.

---

## Step 2 — Shared React primitives → `shared/ui/`

Create five composable components in `apps/web/src/shared/ui/`. These implement the design tokens
and are the building blocks the feature UIs will reach for.

### `Logo.tsx`

```tsx
// Props: size?: 'sm' | 'lg'  dark?: boolean
// Renders: .logo > .logo-mark + .logo-word with "CUP<span class=b>CALL</span>"
// dark=true → color: var(--on-dark), default → color: var(--ink)
```

- Mark is `.logo-mark` (optionally `.logo-mark.lg`)
- Word is `CUP` + `<span className="b">CALL</span>` inside `.logo-word`

### `Button.tsx`

```tsx
// Props: variant: 'primary'|'accent'|'dark'|'ghost'|'ghost-dark'|'soft'
//         size?: 'sm'|'md'|'lg'    block?: boolean
//         asChild?: boolean  (renders children's element — for Link wrapping)
//         + all standard <button> attrs
// className build: "btn btn-{variant}" + optional "sm"/"lg" + "block"
```

- Default element is `<button type="button">`
- When `asChild` is true, clones children with the combined className (enables `<Button asChild><Link …>`).

### `Chip.tsx`

```tsx
// Props: variant?: 'default'|'green'|'orange'|'dark'   dot?: boolean
// Renders a <span className="chip [variant] [dot]">
```

### `Avatar.tsx`

```tsx
// Props: name: string   index?: number   size?: number (px, default 36)
// Derives initials from first two words. Cycles through 6 oklch avatar colours
// keyed by index % 6. Renders a <span className="avatar"> with inline
// background + width/height + font-size (size * 0.38).
```

Colour palette (same as ui-kit.jsx):

```
oklch(0.6 0.16 150) oklch(0.62 0.17 50) oklch(0.55 0.15 260)
oklch(0.58 0.18 25) oklch(0.6 0.14 200) oklch(0.55 0.16 320)
```

### `SectionLabel.tsx`

```tsx
// Props: children: ReactNode  icon?: ReactElement
// Renders: <div className="section-label">[icon] {children}</div>
// The ::after pseudo-element (trailing rule) is handled by CSS.
```

**Export all five from `shared/ui/index.ts`.** Update `shared/ui/PageSpinner.tsx` to also be
re-exported from the index if not already.

**After this step:** feature components can import `{ Logo, Button, Chip, Avatar, SectionLabel }`
from `@/shared/ui`. Run typecheck to confirm types are sound.

---

## Step 3 — Landing page (`app/page.tsx`)

**Reference:** `desktop-auth.jsx` → `LandingDesktop()` (desktop) and
`screens-mobile.jsx` → `MobileSignIn()` (mobile).

The design is a full-viewport turf hero on dark background — no white card wrapper.

**Replace** the current `app/page.tsx` layout with:

```
<main className="turf min-h-screen" style={{ color: 'var(--on-dark)', position: 'relative', overflow: 'hidden' }}>
  {/* radial glow: top-right green + bottom-left orange */}
  <div aria-hidden …>  {/* absolute positioned radial gradients */}

  {/* nav bar */}
  <nav>  <Logo dark />  <Button variant="ghost-dark" size="sm">Sign in</Button>  </nav>

  {/* hero grid: left copy + right floating leaderboard card */}
  <div style={{ display: 'grid', gridTemplateColumns: '…' }}>
    <div>
      <Chip variant="green" dot>World Cup 2026 · kicks off June 11</Chip>
      <h1 className="display" style={{ fontSize: 'clamp(48px,8vw,78px)' }}>
        Call every match. Then defend it.
      </h1>
      <p>…marketing copy…</p>

      {/* email form */}
      <div className="eyebrow">No password. Just your email.</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <EmailLoginForm />  {/* already has its own submit button */}
      </div>

      {/* guest form below, separated */}
      <GuestLoginForm />
    </div>

    {/* floating leaderboard preview card — desktop only, hidden on mobile */}
    <div style={{ position: 'relative' }}>
      <div className="card glow-green" style={{ transform: 'rotate(1.5deg)', padding: 18 }}>
        …static demo leaderboard rows using lb-row / lb-rank / lb-pts / Avatar…
      </div>
      {/* scoreboard chip overlay */}
      <div className="card" style={{ position: 'absolute', bottom: -26, left: -28, … }}>
        …static ARG 3–2 FRA chip…
      </div>
    </div>
  </div>
</main>
```

Key details:

- Mobile: single column, preview card hidden (`hidden md:block`)
- The email form and guest form are the existing `EmailLoginForm` / `GuestLoginForm` components —
  wrap them visually rather than rewriting the form logic
- The floating preview card is **purely decorative static HTML**, not connected to real data
- Glow overlays: two `position:absolute` divs with `radial-gradient`, `pointer-events:none`,
  `aria-hidden="true"`

---

## Step 4 — App shell: authenticated nav header + mobile bottom nav

**New file:** `apps/web/src/app/(authenticated)/layout.tsx`

The app needs a persistent navigation shell for all authenticated pages (pools, predict, results,
settings). Group authenticated routes under an `(authenticated)` route group.

**Move (rename directories):**

- `app/pools/` → `app/(authenticated)/pools/`
- `app/settings/` → `app/(authenticated)/settings/`
- `app/view/` → `app/(authenticated)/view/`

**`(authenticated)/layout.tsx`** renders:

```tsx
<div className="min-h-screen flex flex-col">
  <AppNav /> {/* top bar — desktop */}
  <main className="flex-1 pb-16 md:pb-0">{children}</main>
  <MobileNav /> {/* bottom bar — mobile only */}
</div>
```

### `AppNav.tsx` (desktop top bar, server component)

```
<header className="turf sticky top-0 z-40 border-b border-[rgba(255,255,255,.06)] hidden md:block">
  <div style={{ maxWidth: 1200, padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <Link href="/pools"><Logo dark /></Link>
    <nav style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
      <Link href="/pools"   className="…active-underline…">Pools</Link>
      <Link href="/settings" className="…">Settings</Link>
      <form action={signOutAction}><Button variant="ghost-dark" size="sm">Sign out</Button></form>
    </nav>
  </div>
</header>
```

Active-underline: when `usePathname()` starts with the link's href, apply
`box-shadow: inset 0 -3px 0 var(--green-400)` + `color: var(--on-dark)` (default is
`var(--on-dark-soft)`).

### `MobileNav.tsx` (bottom tab bar, client component — mobile only)

From `screens-mobile.jsx` → `MTabs()`. Four tabs with icon + label:

| Tab     | Icon     | href                                       |
| ------- | -------- | ------------------------------------------ |
| Pools   | trophy   | `/pools`                                   |
| Predict | ball     | last visited predict page, or `/pools`     |
| Board   | users    | last visited pool leaderboard, or `/pools` |
| You     | settings | `/settings`                                |

```tsx
<nav
  className="fixed bottom-0 left-0 right-0 md:hidden z-40"
  style={{
    display: 'flex',
    borderTop: '1px solid var(--line)',
    background: 'var(--surface)',
    padding: '8px 6px 4px',
  }}
>
  {tabs.map((t) => {
    const on = pathname.startsWith(t.href);
    return (
      <Link
        key={t.label}
        href={t.href}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          color: on ? 'var(--green-600)' : 'var(--ink-muted)',
        }}
      >
        <Icon name={t.icon} size={22} stroke={on ? 2.2 : 1.8} />
        <span style={{ fontSize: 10.5, fontWeight: on ? 800 : 600 }}>{t.label}</span>
      </Link>
    );
  })}
</nav>
```

The `Icon` component (SVG icons from `ui-kit.jsx`) needs to be ported to a React component in
`shared/ui/Icon.tsx` — it covers all icons used across the app: `lock`, `trophy`, `plus`, `share`,
`chevron`, `chevdown`, `check`, `checkcirc`, `mail`, `users`, `settings`, `ball`, `edit`,
`history`, `link`, `kick`, `rotate`, `trash`, `download`, `upload`, `flag`, `card`, `whistle`,
`arrow`, `spark`. This is a prerequisite for both `AppNav` and `MobileNav`.

**Note on sidebar:** The designs show a desktop sidebar listing the user's pools. The current
routing has no persistent shell. The sidebar requires fetching the user's pool list at layout
level (feasible in a Next.js server component layout). Implement the top nav first; the sidebar
can be added in a follow-up once the route group structure is stable.

---

## Step 5 — Pools list page (`app/(authenticated)/pools/page.tsx` + `PoolListItem`)

**Reference:** `desktop-auth.jsx` → `DashboardDesktop()`.

**`pools/page.tsx`** — replace the current `max-w-2xl` layout with:

```
<div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
    <h1 className="display" style={{ fontSize: 36 }}>Your Pools</h1>
    <Button variant="primary" href="/pools/new">+ Create a pool</Button>
  </div>

  {/* Countdown banner — only shown when tournament hasn't started */}
  <CountdownBanner lockTime={…} incompletePools={…} />

  {/* Pool list */}
  {pools.map(pool => <PoolListItem pool={pool} isOwner={…} />)}

  {/* Empty state */}
  …

  {/* Create form */}
  <CreatePoolForm />
</div>
```

**`PoolListItem.tsx`** — replace current layout with a card row from the design:

```
<Link href={…} className="card" style={{ display: 'flex', overflow: 'hidden', padding: 0 }}>
  <div style={{ width: 6, background: accentColor }} />   {/* colour accent bar */}
  <div style={{ flex: 1, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <span style={{ width: 52, height: 52, borderRadius: 13, background: accentColor, … }}>
        {initials}
      </span>
      <div>
        <h3 style={{ fontSize: 19, fontWeight: 800 }}>{pool.name}</h3>
        <div>  {/* chips: OWNER, locked/open status */}  </div>
        <div>  {/* members count + tournament name */}  </div>
      </div>
    </div>
    <div style={{ display: 'flex', gap: 28 }}>
      Rank display  |  Points display  |  chevron
    </div>
  </div>
</Link>
```

Accent colour: derive a deterministic oklch colour from `pool.id` (hash to one of 6 palette
values) so each pool has a consistent accent without storing it.

**New file:** `apps/web/src/features/pools/ui/CountdownBanner.tsx` — dark turf card showing
time until lockTime and count of incomplete cards (only renders when lockTime is in the future).

---

## Step 6 — Pool page + Leaderboard

**Reference:** `desktop-pool.jsx` → `LeaderboardDesktop()`.

### `app/(authenticated)/pools/[id]/page.tsx`

Replace `max-w-2xl` column layout with a two-column grid (`1fr 300px` on desktop, single column on
mobile). The left column holds the podium + ranked table; the right column holds the "Your
standing" card and tournament timeline.

Page header: pool name as `.display`, tab row (Leaderboard / My Card / Members), locked pill if
locked, "Invite" ghost button.

### `Leaderboard.tsx`

Two parts:

**Podium** (top 3, turf background, radial glow):

```
<div className="turf" style={{ borderRadius: 16, padding: '24px 30px 0', position: 'relative', overflow: 'hidden' }}>
  {/* glow overlay */}
  {podiumOrder.map(entry => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 130 }}>
      <Avatar name={entry.displayName} index={rank-1} size={rank===1?56:46} />
      <div className="display" style={{ fontSize: 22, color: rank===1?'var(--gold)':'var(--green-400)' }}>
        {entry.pointsTotal}
      </div>
      <div style={{ height: podiumHeight, background: rank===1?'linear-gradient(var(--gold),…)':'rgba(255,255,255,.1)', borderRadius: '8px 8px 0 0' }}>
        <span className="display" style={{ fontSize: 38 }}>{rank}</span>
      </div>
    </div>
  ))}
</div>
```

Podium order is [2nd, 1st, 3rd]; heights [96, 130, 74]px.

**Ranked list** (rank 4+, inside a `.card`):
Grid columns `34px 1fr 70px 70px 70px 76px` with column headers (eyebrow style). Each row shows
Avatar + name, group pts, knockout pts, bets pts, total as `.display`.

**Right-rail "Your standing" card:**

```
<div className="card" style={{ background: 'var(--green-050)', border: '1px solid var(--green-300)', padding: 18 }}>
  <div className="eyebrow" style={{ color: 'var(--green-700)' }}>Your standing</div>
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
    <span className="display" style={{ fontSize: 44, color: 'var(--green-700)' }}>#{rank}</span>
    <span className="display" style={{ fontSize: 24 }}>{points}</span>
    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-700)' }}>pts</span>
  </div>
  {/* gap to next player */}
</div>
```

**Tournament timeline** (below standing card): stage list with live/upcoming dots and chips.

---

## Step 7 — Prediction flow: Group scores

**Reference:** `desktop-predict.jsx` → `GroupScoresDesktop()` and `screens-mobile.jsx` → group
scores mobile screen.

### `PredictStepper.tsx`

Replace the current pill-tabs nav with the step indicator from the design:

```
{STEPS.map(step => (
  <div key={step.id} style={{ padding: '11px 18px 14px', boxShadow: active===step.id ? 'inset 0 -3px 0 var(--green-500)' : 'none' }}>
    <span style={{
      width: 22, height: 22, borderRadius: '50%',
      background: active===step.id ? 'var(--green-500)' : done ? 'var(--green-050)' : 'var(--surface-2)',
      …
    }}>
      {done && !active ? <CheckIcon /> : step.n}
    </span>
    {step.label}
  </div>
))}
```

The page header area (above the stepper tabs) shows:

- Eyebrow: "Pool name · Your card"
- `<h1 className="display">Make your call</h1>`
- Completion bar + percentage on the right
- Saved chip (green dot)

### `CompletionBar.tsx`

Replace with the design's `.bar` class:

```tsx
<div className="bar" style={{ flex: 1 }} role="progressbar" …>
  <i style={{ width: `${percent}%` }} />
</div>
<span className="display" style={{ fontSize: 17, color: 'var(--green-600)' }}>{percent}%</span>
```

### `GroupScoresSection.tsx`

The current component renders groups; update visuals:

- Group selector: pill buttons `38×38` with `.display` font, active = ink-900 bg
- Incomplete matches: `background: var(--orange-050)` row tint + "Needs a score" `.chip.orange`
- Match row layout: `grid-template-columns: 1fr auto 1fr` with right-aligned home team, score
  cells in centre, left-aligned away team

### `ScoreCell.tsx`

Update input styling to match `.score-cell` from the design system:

- Base: `width: 46px; height: 52px; border-radius: 10px; font-family: var(--font-display); font-size: 26px`
- Filled: `border-color: var(--green-400); background: var(--green-050); color: var(--green-700)`
- Focus: `border-color: var(--green-500); box-shadow: 0 0 0 3px var(--green-050)`
- Separator (`:` or `–`): `.score-sep` class

**Right rail "Auto-derived order":** new sub-component inside `GroupScoresSection` — a `.card`
showing the derived group standings fed automatically from scores. Top 2 rows get
`background: var(--green-050)` and a "QUALIFIES" `.chip.green`.

---

## Step 8 — Prediction flow: Knockout bracket

**Reference:** `desktop-predict.jsx` → `BracketDesktop()`.

### `BracketSection.tsx`

The current component renders the bracket; update layout and visuals:

- Info banner at top: green-050 background, spark icon, explanatory text that picks flow forward
  automatically
- Bracket columns: flex row, each column `flex: 1`, with eyebrow column label
- Each tie card: `.card` with `padding: 4px; width: 132px`; filled ties → green border
  (`border: 1px solid var(--green-300)`); unpicked → `border: 1px dashed var(--line)`
- Tie row: `.badge.sm` + team name + check icon for the winner
- Final column: dark card (`.card` with `background: var(--ink-900)`) with score entry and
  champion pill (`.display` + badge in a gold pill `borderRadius: 999px; background: var(--gold)`)
- Bronze match display below the champion pill

---

## Step 9 — Prediction flow: Special bets

**Reference:** `desktop-predict.jsx` → `SpecialsDesktop()`.

### `SpecialsSection.tsx`

Replace current layout with a 4-column grid of bet cards:

```
grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))
```

Each bet card (`.card`, `padding: 16px`):

- Empty bet: `border: 1px dashed var(--orange-400); background: var(--orange-050)`
- Filled bet: standard `.card` border
- Icon in a `34×34` `border-radius: 9px; background: var(--surface-2)` container
- Points value shown as `.display` right-aligned
- Question label in `font-size: 12.5px; font-weight: 700; color: var(--ink-soft)`
- Value selector: `padding: 9px 12px; border-radius: 9px` with orange box-shadow when empty

Footer row:

- Left: lock reminder (lock icon + copy)
- Right: "Lock in my card" `.btn.btn-primary.lg` (only shown before lockTime; after lock, this
  becomes a "Saved" read-only state)

---

## Step 10 — Member card (read-only view)

**Reference:** `desktop-predict.jsx` → `BracketDesktop()` (read-only variant) and
`desktop-pool.jsx` → `MemberCardDesktop()`.

### `ReadOnlyCard.tsx`

Currently a full card display. Update:

- Page header: pool name + member display name as `.display` (large)
- Owner edit banner (if owner): dark ink-900 bar with orange "edit" icon + descriptive text +
  "View audit log" chip
- Sections use `.section-label` dividers
- Score rows use `.score-cell.filled` (read-only, no inputs)
- Bracket ties: same `.card` style as in BracketSection but no click handlers

### `OwnerEditBanner.tsx`

Replace current minimal banner with:

```
<div style={{ background: 'var(--ink-900)', color: 'var(--on-dark)', padding: '11px 34px',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
  <span>  {/* edit icon (orange) + "Owner mode — editing {name}'s card. Logged." */}  </span>
  <Chip variant="dark">  {/* history icon + "View audit log" */}  </Chip>
</div>
```

---

## Step 11 — Pool management (owner controls)

**Reference:** `desktop-pool.jsx` → `PoolManageDesktop()`.

### `OwnerControls.tsx`

Redesign the owner controls section into cards:

**Invite link card** (`.card`, `padding: 18px`):

- `SectionLabel` with link icon
- URL pill: `background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--line)`
- "Copy" `.btn.btn-soft.sm`
- "Rotate token" `.btn.btn-ghost.sm.block`

**Members management** (`.card`):

- Each member row: `Avatar` + name + points (`.display`) + "Edit card" button + kick button
- "Edit card" → links to `/pools/{id}/members/{userId}`
- Kick button: small danger-coloured button (see design's `color: var(--danger)`)

**Danger zone card:**

```
border: 1px solid oklch(0.85 0.08 25); background: oklch(0.98 0.015 25)
```

- `SectionLabel` in `var(--danger)` colour
- "Delete pool" button with `color: var(--danger); box-shadow: inset 0 0 0 1.5px oklch(0.78 0.12 25)`

---

## Step 12 — Join page (`app/join/[token]/page.tsx`)

**Reference:** `desktop-auth.jsx` → `JoinDesktop()` and `screens-mobile.jsx` → `MobileJoin()`.

Replace current `max-w-md` layout with:

```
<main className="turf min-h-screen" style={{ display: 'grid', placeItems: 'center', … }}>
  <div className="card" style={{ width: 'min(460px,100%)', overflow: 'hidden' }}>

    {/* green header */}
    <div style={{ background: 'var(--green-500)', padding: '26px 30px 22px', color: 'oklch(0.2 0.02 160)' }}>
      <div className="eyebrow">  {/* users icon + "You're invited to a pool" */}  </div>
      <h2 className="display" style={{ fontSize: 38 }}>{pool.name}</h2>
      <div>  {/* members count + tournament */}  </div>
    </div>

    {/* card body */}
    <div style={{ padding: 30 }}>
      {/* invite copy */}
      <div style={{ background: 'var(--orange-050)', borderRadius: 12, padding: '12px 14px' }}>
        {/* lock icon + "Locks in X days" */}
      </div>
      <Button variant="primary" size="lg" block>Join pool & start predicting</Button>
      {/* "Signed in as email" or guest name form */}
    </div>
  </div>
</main>
```

For the **invalid invite** and **already a member** states: replace plain `<main>` with a centred
dark card on turf background, using `.display` heading and appropriate CTAs.

---

## Step 13 — Settings page (`app/(authenticated)/settings/page.tsx`)

**Reference:** `desktop-pool.jsx` → `SettingsDesktop()`.

Replace the `// TODO(design)` placeholder with a styled settings form:

```
<div style={{ maxWidth: 560, margin: '32px auto', padding: '0 24px' }}>
  <h1 className="display" style={{ fontSize: 36, marginBottom: 28 }}>Settings</h1>
  <div className="eyebrow" style={{ color: 'var(--ink-muted)', marginBottom: 4 }}>Your account</div>

  <div className="card" style={{ padding: 24 }}>
    <SectionLabel>Profile</SectionLabel>

    {/* Avatar + description */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '18px 0 22px' }}>
      <Avatar name={displayName} index={0} size={56} />
      <div>
        <div style={{ fontWeight: 800, fontSize: 16 }}>Shown on every leaderboard</div>
        <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Your email stays private.</div>
      </div>
    </div>

    <label className="eyebrow" style={{ color: 'var(--ink-muted)', display: 'block', marginBottom: 8 }}>
      Display name
    </label>
    <div style={{ display: 'flex', gap: 10 }}>
      <input style={{ flex: 1, height: 48, borderRadius: 11, … focused green border … }} />
      <Button variant="primary">Save</Button>
    </div>

    <hr style={{ margin: '24px 0', background: 'var(--line)', border: 'none', height: 1 }} />

    <label className="eyebrow" …>Email</label>
    <div style={{ height: 48, borderRadius: 11, background: 'var(--surface-2)', padding: '0 15px', … }}>
      {/* mail icon + email address + "Verified" chip.green.dot */}
    </div>
  </div>
</div>
```

Wire up `useActionState` to display validation/server errors inline (the current TODO in the file).

---

## Step 14 — Results page (`app/(authenticated)/pools/[id]/results/page.tsx`)

**Reference:** `screens-live.jsx` → `LiveDesktop()` (group stage tab) and
`KnockoutTrackerDesktop()` (knockout tab), plus mobile equivalents `MobileLive()` and
`MobileKnockoutTracker()`.

### Page header

The results page has the same header layout as the pool/predict pages:

```
eyebrow: "Pool name · Results & standings"
h1 (.display, fontSize 34): "The Cup, as it unfolds"
right side: LivePointsReadout — your points total + rank + "change" chip
```

`LivePointsReadout` sub-component:

```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
  <div style={{ textAlign: 'right' }}>
    <div className="eyebrow" style={{ color: 'var(--ink-muted)' }}>
      Your points
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
      <span className="display" style={{ fontSize: 26 }}>
        {points}
      </span>
      <Chip variant="green" style={{ height: 21, fontSize: 11 }}>
        +{delta} this MD
      </Chip>
    </div>
  </div>
  <div style={{ width: 1, height: 38, background: 'var(--line)' }} />
  <div style={{ textAlign: 'right' }}>
    <div className="eyebrow" style={{ color: 'var(--ink-muted)' }}>
      Rank
    </div>
    <span className="display" style={{ fontSize: 26, color: 'var(--green-600)' }}>
      #{rank}
    </span>
  </div>
</div>
```

### `StageBar.tsx`

Replace current bar with the design's stage progress timeline — a horizontal flex row of stage
nodes connected by coloured lines:

```
● Group Stage ——————————— ◌ Round of 16 ——— … — Final
  Now · MD 3 of 3           Jun 28
```

- Current stage: green filled dot (`background: var(--green-500)`) with green halo
  (`box-shadow: 0 0 0 4px var(--green-050)`)
- Next stage: lighter green dot (`var(--green-300)`)
- Future stages: grey line dot (`var(--line)`)
- Connector lines: filled green for completed spans, grey for future
- Label: `fontWeight: 800; fontSize: 13` for stage name; below it `eyebrow`-style detail
  ("Now · MD 3 of 3", "Jun 28", "Jul 3"…) in `var(--green-600)` for current, `var(--ink-muted)`
  for others

### Two tabs: Group Stage / Knockout

Same underline tab pattern as throughout the app (Step 7). Use `useSearchParams` or a client
state to switch between tabs.

---

### Tab 1: Group Stage

**Layout:** `grid-template-columns: 1fr 326px` desktop, single col mobile.

**Left column — Featured result card + match feed:**

Featured result (turf card, dark):

```
<div className="turf" style={{ borderRadius: 16, padding: '18px 24px 20px', position: 'relative', overflow: 'hidden' }}>
  {/* radial glow: top-right */}
  <Chip variant="dark">✓ Result of the day</Chip>
  <span>Group C · Matchday 3 · FT</span>
  {/* score row: grid 1fr auto 1fr */}
  <Team code="ARG" size="lg" />  2 – 1  <Team code="BRA" size="lg" />
  {/* your prediction + hit chip */}
  Your call: 2–1  <Chip variant="green" dot>Exact call · +5</Chip>
</div>
```

Match feed below the featured card:

- `SectionLabel` with "Matchday 3 · results" + "+9 pts banked" right-aligned
- `.card` with `.divide` rows
- Each row: `grid-template-columns: 44px 1fr auto 1fr 132px`
  - Group chip (`.chip` width 30px)
  - Home team (right-aligned): Badge.sm + name (bold if winner)
  - Score: `.display.tnum` fontSize 19
  - Away team (left-aligned)
  - Right: "you {ph}–{pa}" + `HitChip`

**`HitChip.tsx`** — three states from design:

```tsx
// exact: solid green chip
<span className="chip" style={{ background: 'var(--green-500)', color: 'oklch(.2 .02 160)', boxShadow: 'none', height: 24 }}>✓ Exact +{pts}</span>
// result (right outcome, wrong score): chip.green
<Chip variant="green" style={{ height: 24 }}>Outcome +{pts}</Chip>
// miss: plain chip, muted
<span className="chip" style={{ height: 24, color: 'var(--ink-muted)' }}>Missed +0</span>
```

**Right rail — Live group tables:**

- Group selector: same pill buttons as GroupScoresSection (Step 7)
- Group table: `.card` with header row (`.eyebrow` style) + team rows
  - Columns: `20px 1fr 26px 26px 36px` → # / Team / P / GD / Pts
  - Top-2 rows: `background: var(--green-050)`
  - Pts column: `.display.tnum` fontSize 16
  - Team column: `.badge.sm` + code
- Legend: green square swatch + "Through to the Round of 16"
- "You called this group" card: `.card` with spark icon + prose comparing your prediction to
  actual order + points earned

---

### Tab 2: Knockout tracker

**Reference:** `KnockoutTrackerDesktop()` and `MobileKnockoutTracker()`.

**Layout:** `grid-template-columns: 1fr 300px` desktop, single col mobile.

Info banner at top (green-050):

```
spark icon + "Results drop into your bracket as we enter them. Green = pick survived, red = it's out."
```

**Bracket columns** (same flex layout as BracketSection prediction view, but showing real results):

`KOTie` card (`.card`, `padding: 4px`, `width: 150px`):

- Status header row: score (e.g. "2–0") left + status chip right
  - Pick survived: `<Chip variant="green" style={{ height: 18 }}>✓ pick alive</Chip>`
  - Busted: chip with `background: oklch(0.96 0.02 25); color: var(--danger)` + "✗ busted"
  - Upcoming: `<Chip variant="orange" dot style={{ height: 18 }}>upcoming</Chip>`
- Border: green (`var(--green-300)`) when pick alive, danger (`oklch(0.85 0.08 25)`) when busted,
  default `var(--line-soft)` when upcoming
- Each team row: `.badge.sm` + name + "PICK" label (small eyebrow) if this was your pick +
  check icon on the winner

Undecided future rounds: dashed border `.card` with "To be decided" or "Winner of A/B" text.

**Right rail — Bracket health:**

```
<div className="card" style={{ background: 'var(--green-050)', border: '1px solid var(--green-300)' }}>
  <div className="eyebrow" style={{ color: 'var(--green-700)' }}>Bracket health</div>
  <div>
    <span className="display" style={{ fontSize: 44, color: 'var(--green-700)' }}>3<span style={{ fontSize: 24 }}>/4</span></span>
    <span>R16 picks survived</span>
  </div>
  <div className="bar" style={{ marginTop: 12 }}><i style={{ width: '75%' }} /></div>
</div>
```

Points from knockout breakdown: `SectionLabel` + list rows (round name left, points right as
`.display` — green if scored, muted if pending).

"Your champion" status card at bottom: trophy icon (gold) + prose about potential points if
champion survives.

---

### `GroupTable.tsx`

Update to use design system classes:

- Header: `eyebrow` class + `fontSize: 10`
- Team code: `.badge.sm`
- Numeric cells: `.tnum`
- Points: `.display.tnum` fontSize 16
- Top-2 row tint: `background: var(--green-050)`

### `GroupMatchFeed.tsx`

Update each match row to the 5-column grid layout described above. Use `HitChip` for the result
indicator.

### `KnockoutBracket.tsx`

Port `KOTie` pattern from the design. Reuse the tie card structure from BracketSection (Step 8)
but add the pick-status overlay (score header row, border colour, pick label, busted chip).

### `BracketMatchCard.tsx`

The "Final" card in knockout: dark card style (`background: var(--ink-900)`) with score row for
each finalist. Same pattern as BracketSection's final card (Step 8).

### `BracketHealthPanel.tsx`

New right-rail component showing the `3/4 picks survived` card + bar + points breakdown table +
champion status card. Corresponds to the right column in `KnockoutTrackerDesktop()`.

---

## Definition of done (per step)

Each step is complete when:

1. Visual output matches the corresponding design screen
2. `pnpm --filter web typecheck` passes
3. `pnpm --filter web lint` passes
4. Existing tests still pass (`pnpm test`)
5. The page/component is functional at runtime (not just styled)

Steps 1–3 are the foundation; steps 4–14 can be done in any order once step 3 is complete since
each targets an isolated feature slice.
