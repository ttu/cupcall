import { describe, expect, it } from 'vitest';
import { bracketMatchKey as bmk } from '@cup/engine';
import { buildVariantCellKey, cellBelongsToMatch, asKnockoutCellKey } from './knockout-cell-key';

describe('buildVariantCellKey', () => {
  it('suffixes the match key with the variant', () => {
    expect(buildVariantCellKey(bmk('final'), 'score')).toBe('final:score');
    expect(buildVariantCellKey(bmk('bronze'), 'teams')).toBe('bronze:teams');
  });
});

describe('cellBelongsToMatch', () => {
  it('matches a plain (non-variant) cell key exactly', () => {
    expect(cellBelongsToMatch(asKnockoutCellKey('qf1'), bmk('qf1'))).toBe(true);
    expect(cellBelongsToMatch(asKnockoutCellKey('qf1'), bmk('qf2'))).toBe(false);
  });

  it('matches a variant-suffixed cell key against its base match key', () => {
    expect(cellBelongsToMatch(buildVariantCellKey(bmk('final'), 'score'), bmk('final'))).toBe(true);
    expect(cellBelongsToMatch(buildVariantCellKey(bmk('bronze'), 'teams'), bmk('bronze'))).toBe(
      true,
    );
  });

  it('does not match a different match key that happens to share a prefix', () => {
    expect(cellBelongsToMatch(buildVariantCellKey(bmk('qf10'), 'score'), bmk('qf1'))).toBe(false);
  });
});
