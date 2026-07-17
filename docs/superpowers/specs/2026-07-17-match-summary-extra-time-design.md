# Match summary: show when a knockout match was decided in extra time

## Problem

The knockout match summary sheet (`MatchSummarySheet`) already shows a line
under the score when a match was `decidedBy: 'penalties'` (e.g. "Argentina
won on penalties"), but a match decided in extra time (`decidedBy:
'extraTime'`, i.e. the winner scored in the 90+30 minutes without needing a
shootout) shows no indication at all — the score header looks identical to a
regulation-time result.

## Design

`KnockoutMatchView.decidedBy` already carries `'regulation' | 'extraTime' |
'penalties' | null` end-to-end (DB → engine → results view), so this is a
pure UI change in `apps/web/src/features/results/ui/MatchSummarySheet.tsx`.

In `SheetHeader`, add a sibling conditional to the existing penalty-winner
line:

```tsx
{
  match.decidedBy === 'extraTime' && (
    <span
      data-testid="match-summary-extra-time"
      className="text-xs font-semibold text-ink-muted text-center"
    >
      Decided in extra time
    </span>
  );
}
```

Placed directly after the existing penalty-winner block. The two conditions
are mutually exclusive (`decidedBy` is a single enum value), so no shared
wrapper or branching logic is needed — they're independent `&&` blocks that
never both render.

## Testing

No render test currently exists for `MatchSummarySheet`. Add
`MatchSummarySheet.test.tsx` (React Testing Library) covering the score
header for the three relevant `decidedBy` values:

- `'extraTime'` → renders `match-summary-extra-time` with text "Decided in
  extra time"; does not render `match-summary-penalty-winner`.
- `'penalties'` → renders `match-summary-penalty-winner` (existing
  behavior); does not render `match-summary-extra-time`.
- `'regulation'` / `null` → renders neither.

## Out of scope

- Other components that surface `decidedBy` (`FinalResultCard`,
  `BracketMatchCard`) already have their own penalties-only treatment and
  are not part of this change — the ask was specifically about the match
  summary sheet.
- No changes to data fetching, schemas, or the DB layer — `decidedBy` is
  already populated correctly.
