# Results page — smart default tab

**Date:** 2026-06-29

## Problem

The results page always opens on the "Group Stage" tab, even when the knockout stage is already
underway. Users navigating to results during the knockout phase see group data by default and have
to manually switch.

## Solution

Use `view.currentStage` (already present in `ResultsView`) to select the default tab at page
render time on the server.

- If the URL has a valid `?tab=` param (`group | knockout | specials | race`), respect it as an
  explicit override.
- Otherwise, default to `'knockout'` when `currentStage !== 'group'`; default to `'group'`
  during the group stage.

## Files changed

| File                                                           | Change                    |
| -------------------------------------------------------------- | ------------------------- |
| `apps/web/src/app/(authenticated)/pools/[id]/results/page.tsx` | Update `initialTab` logic |
| `apps/web/src/app/(view)/view/[token]/results/page.tsx`        | Same update               |

## Implementation

Replace the current tab-resolution expression in both pages:

```ts
// before
initialTab={tab === 'race' || tab === 'knockout' ? tab : 'group'}

// after
const VALID_TABS = ['group', 'knockout', 'specials', 'race'] as const;
type ValidTab = typeof VALID_TABS[number];
function isValidTab(t: string): t is ValidTab { return (VALID_TABS as readonly string[]).includes(t); }
const defaultTab = view.currentStage !== 'group' ? 'knockout' : 'group';
// ...
initialTab={isValidTab(tab) ? tab : defaultTab}
```

No new types, no client changes, no new state.

## Testing

Add unit/integration tests to `get-results-view` or the page component verifying:

- Group stage active → default tab is `'group'`
- Any knockout stage active → default tab is `'knockout'`
- Valid `?tab=group` during knockout stage → `'group'` respected
- Invalid `?tab=foo` → falls back to smart default
