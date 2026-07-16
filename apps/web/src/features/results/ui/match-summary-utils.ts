import type { KnockoutMatchDetailPrediction, MatchHit } from '../domain/types';

export type PredictionHitDisplay =
  | { kind: 'matchHit'; hit: MatchHit }
  | { kind: 'custom'; label: string; tone: 'muted' | 'red' };

/**
 * Adapts the winner-pick-oriented KnockoutMatchHit into either a MatchHit (reusing HitChip
 * for the common exact/outcome/missed cases) or a small custom chip for the two states
 * HitChip doesn't model (no-pick, impossible).
 */
export function resolvePredictionHitDisplay(
  prediction: KnockoutMatchDetailPrediction,
  isFinaleTie: boolean,
): PredictionHitDisplay {
  switch (prediction.hit) {
    case 'pending':
      return { kind: 'custom', label: 'Pending', tone: 'muted' };
    case 'no-pick':
      return { kind: 'custom', label: 'No pick', tone: 'muted' };
    case 'impossible':
      return { kind: 'custom', label: 'Impossible', tone: 'red' };
    case 'miss':
      return { kind: 'matchHit', hit: 'missed' };
    case 'hit':
      return {
        kind: 'matchHit',
        hit: isFinaleTie && prediction.isExactScore ? 'exact' : 'outcome',
      };
  }
}
