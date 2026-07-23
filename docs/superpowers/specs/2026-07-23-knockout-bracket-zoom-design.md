# Results knockout bracket zoom — design

**Date:** 2026-07-23
**Status:** Approved, not yet implemented

## Problem

The desktop results knockout bracket (`features/results/ui/KnockoutBracket.tsx`) lays out rounds
as fixed-pixel-width flex columns (`min-w-47.5` per round, `min-w-55` for the final/bronze column)
inside an `overflow-x-auto` wrapper. With 4+ rounds the full bracket is wider than most viewports,
so seeing Round of 16 through the Final at once requires horizontal scrolling — there's no way to
shrink the view to see the whole bracket at a glance.

## Goal

Add zoom controls to the desktop knockout bracket so the user can shrink the bracket to fit it
entirely in view, or zoom in for readability, without changing the underlying layout math.

## Approach

Wrap the bracket's existing content (label row + bracket row, currently two sibling divs inside
the `overflow-x-auto` container at `KnockoutBracket.tsx:159-207`) in one new content wrapper div.
Apply `transform: scale(factor)` / `transform-origin: top left` to that wrapper, and explicitly
size the wrapper's `width`/`height` to `naturalWidth * factor` / `naturalHeight * factor` so the
surrounding `overflow-x-auto` container's scrollable area matches the visually scaled size (no
dead space, no clipping).

This is a presentation-only change: `TIE_H`, `U`, `CONN_W`, `columnPaddingTop`, `columnItemGap`,
`matchCenterY`, and the SVG connectors are untouched. The SVG scales for free since it's inside
the transformed wrapper.

Rejected alternatives:

- **Recompute geometry constants per zoom level** — would thread a scale factor through the
  column-math functions and re-render natively at the scaled size. Touches significantly more of
  `KnockoutBracket.tsx`/`BracketMatchCard.tsx` for no visual benefit — `transform: scale` rasterizes
  crisply in modern browsers.
- **Pannable/virtualized canvas** — overkill; the ask is "see the whole bracket," not a full
  canvas navigation system.

## Zoom range & interaction

- Range: 50%–150%, in 10-point steps.
- **Auto-fit on load**: on mount (and on container resize via `ResizeObserver`), measure the
  content wrapper's natural unscaled width (`scrollWidth`, unaffected by `transform`) against the
  `overflow-x-auto` container's `clientWidth`, and compute
  `autoFitScale = clamp(clientWidth / naturalWidth, 0.5, 1.5)`. This is the initial scale.
- Only width drives auto-fit — no attempt to fit height; the page continues to scroll vertically
  as it does today.
- **Manual zoom**: `−`/`+` buttons step the scale by 10 points, clamped to [50, 150].
- **Reset button**: recomputes and restores `autoFitScale` (not hardcoded to 100%).
- **Resize behavior**: while the user hasn't manually zoomed since the last reset, window resize
  keeps recalculating auto-fit live. Once the user clicks `−`/`+`, the view "detaches" from
  auto-fit and stops following resize until Reset is pressed again — so a manual zoom choice isn't
  silently overwritten by a resize event.
- No persistence (localStorage/URL) — every page load starts at auto-fit. Stateless-across-sessions
  by design (YAGNI; can add later if requested).

## Components

**`BracketZoomControls`** — new component in `apps/web/src/features/results/ui/`.
Props: `zoomPercent: number`, `onZoomOut: () => void`, `onZoomIn: () => void`, `onReset: () => void`,
`canZoomOut: boolean`, `canZoomIn: boolean`.
Renders three `Button`s (`variant="ghost"`, `size="sm"`) — `−`, a `{zoomPercent}%` text readout,
`+` — plus a `Reset` button. `−`/`+` are `disabled` when `canZoomOut`/`canZoomIn` is false (caller
computes these from the clamp boundaries via `bracket-zoom-utils.ts`).

**`KnockoutBracket`** changes:

- Owns zoom state: `const [scale, setScale] = useState<number | null>(null)` (`null` = "not yet
  measured, use auto-fit once available") and `const [isManual, setIsManual] = useState(false)`.
- Adds `contentRef` (wraps label row + bracket row) and `containerRef` (the `overflow-x-auto` div).
- `BracketZoomControls` rendered in a header row above the label row, e.g. right-aligned next to
  the existing `BracketInfoBanner`.
- Pure helpers extracted to a co-located `features/results/ui/bracket-zoom-utils.ts` (this
  codebase's established convention: UI-adjacent pure logic lives in a `*-utils.ts` file next to
  the component and is unit-tested with vitest; there are no component-render tests anywhere in
  this codebase — no RTL, no jsdom, `vitest.config.ts` only includes `*.test.ts`, not `*.test.tsx`,
  and runs with `environment: 'node'`):
  ```ts
  export function computeAutoFitScale(containerWidth: number, contentWidth: number): number;
  export function stepZoomPercent(currentPercent: number, direction: 'in' | 'out'): number;
  export function canZoomOut(currentPercent: number): boolean;
  export function canZoomIn(currentPercent: number): boolean;
  ```
  All clamp to [50, 150]; `computeAutoFitScale` returns a 0–1 float, `stepZoomPercent` operates on
  whole percentage points and returns the next percentage, snapped to the nearest 10.

## Testing

- Unit tests (vitest) for `computeAutoFitScale`: clamps at 50%/150% boundaries, mid-range values,
  zero/near-zero container width doesn't divide-by-zero or return `NaN`/`Infinity`.
- Unit tests (vitest) for `stepZoomPercent`: steps by 10, clamps at both boundaries, doesn't step
  past the boundary.
- Unit tests (vitest) for `canZoomOut`/`canZoomIn`: true within range, false at/beyond boundaries.
- `BracketZoomControls` and the `KnockoutBracket` transform-wrapper behavior itself are not covered
  by an automated render test — matches this codebase's existing convention (e.g. `Avatar.tsx`
  only has its extracted `initials()` helper tested, never the rendered component). Verified
  manually in-browser as part of this feature's Definition of Done.
- No new E2E test — progressive-enhancement control on an already-covered results page, not a
  critical user flow per the technical spec's E2E scope.

## Out of scope

- No zoom for the mobile knockout view (`KnockoutMobileSummary`/`KnockoutRoundAccordion`) — this
  is desktop-only, matching the existing `hidden md:block` gating in `ResultsPageClient.tsx`.
- No changes to the predictions bracket (`features/predictions/ui/BracketSection.tsx`) — separate
  component, not in scope.
- No shared bracket-geometry module extraction — the results/predictions bracket duplication is
  pre-existing and unrelated to this feature.
- No persistence of zoom level across page loads.
