import type { BracketMatchKey } from '@cup/engine';

/**
 * Final/Bronze matches are rendered as multiple matrix columns (see buildKnockoutMatrix in
 * build-race-view.ts) — a 'teams' cell and/or a 'score' cell instead of one plain cell per match.
 * This is the single place that encodes/decodes that convention, so the producer (build-race-view)
 * and consumers that need "every cell for this match regardless of variant" (knockout-match-detail)
 * can't drift apart the way they did when the split was introduced ad hoc in each file.
 */

export type KnockoutCellVariant = 'teams' | 'score';

declare const knockoutCellKeyBrand: unique symbol;
/**
 * A knockout matrix column key: a base {@link BracketMatchKey}, optionally suffixed with a cell
 * variant (see {@link KnockoutCellVariant}). Branded separately from BracketMatchKey so a derived,
 * possibly-suffixed cell key can never be passed where a base match key is required (e.g. back into
 * `buildVariantCellKey`, which would silently double-suffix it).
 */
export type KnockoutCellKey = string & { readonly [knockoutCellKeyBrand]: 'KnockoutCellKey' };

const VARIANT_SEPARATOR = ':';

/** Producer side: builds a variant cell's column key from its underlying match key. */
export function buildVariantCellKey(
  matchKey: BracketMatchKey,
  variant: KnockoutCellVariant,
): KnockoutCellKey {
  return `${matchKey}${VARIANT_SEPARATOR}${variant}` as KnockoutCellKey;
}

/**
 * Widens a raw matrix cell key (e.g. a stored `KnockoutMatrixCell.bracketMatchKey`, which may or may
 * not carry a variant suffix) into a {@link KnockoutCellKey}. This is the only sanctioned way to
 * construct one outside `buildVariantCellKey` — keeps the brand's construction local to this module.
 */
export function asKnockoutCellKey(raw: string): KnockoutCellKey {
  return raw as KnockoutCellKey;
}

/** Consumer side: true when a matrix cell's key (plain or variant-suffixed) belongs to this match. */
export function cellBelongsToMatch(cellKey: KnockoutCellKey, matchKey: BracketMatchKey): boolean {
  return (
    (cellKey as string) === (matchKey as string) ||
    cellKey.startsWith(`${matchKey}${VARIANT_SEPARATOR}`)
  );
}
