import { describe, expect, it } from 'vitest';
import { buildVariantCellKey, cellBelongsToMatch } from './knockout-cell-key';

describe('buildVariantCellKey', () => {
  it('suffixes the match key with the variant', () => {
    expect(buildVariantCellKey('final', 'score')).toBe('final:score');
    expect(buildVariantCellKey('bronze', 'teams')).toBe('bronze:teams');
  });
});

describe('cellBelongsToMatch', () => {
  it('matches a plain (non-variant) cell key exactly', () => {
    expect(cellBelongsToMatch('qf1', 'qf1')).toBe(true);
    expect(cellBelongsToMatch('qf1', 'qf2')).toBe(false);
  });

  it('matches a variant-suffixed cell key against its base match key', () => {
    expect(cellBelongsToMatch(buildVariantCellKey('final', 'score'), 'final')).toBe(true);
    expect(cellBelongsToMatch(buildVariantCellKey('bronze', 'teams'), 'bronze')).toBe(true);
  });

  it('does not match a different match key that happens to share a prefix', () => {
    expect(cellBelongsToMatch(buildVariantCellKey('qf10', 'score'), 'qf1')).toBe(false);
  });
});
