/**
 * Final/Bronze matches are rendered as multiple matrix columns (see buildKnockoutMatrix in
 * build-race-view.ts) — a 'teams' cell and/or a 'score' cell instead of one plain cell per match.
 * This is the single place that encodes/decodes that convention, so the producer (build-race-view)
 * and consumers that need "every cell for this match regardless of variant" (knockout-match-detail)
 * can't drift apart the way they did when the split was introduced ad hoc in each file.
 */

export type KnockoutCellVariant = 'teams' | 'score';

const VARIANT_SEPARATOR = ':';

/** Producer side: builds a variant cell's column key from its underlying match key. */
export function buildVariantCellKey(matchKey: string, variant: KnockoutCellVariant): string {
  return `${matchKey}${VARIANT_SEPARATOR}${variant}`;
}

/** Consumer side: true when a matrix cell's key (plain or variant-suffixed) belongs to this match. */
export function cellBelongsToMatch(cellKey: string, matchKey: string): boolean {
  return cellKey === matchKey || cellKey.startsWith(`${matchKey}${VARIANT_SEPARATOR}`);
}
