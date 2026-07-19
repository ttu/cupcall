import type { GroupMatchDetailPrediction } from '../domain/types';
import type { PredictionHitDisplay } from './match-summary-utils';

/**
 * Adapts a GroupMatchDetailPrediction into either a MatchHit (reusing HitChip for the
 * exact/outcome/missed cases) or a small custom chip for "no pick" and "still pending" — group
 * predictions carry no separate no-pick/impossible states like knockout picks do.
 */
export function resolveGroupPredictionHitDisplay(
  prediction: GroupMatchDetailPrediction,
): PredictionHitDisplay {
  if (prediction.predictedHome === null) {
    return { kind: 'custom', label: 'No pick', tone: 'muted' };
  }
  if (prediction.hit === 'pending') {
    return { kind: 'custom', label: 'Pending', tone: 'muted' };
  }
  return { kind: 'matchHit', hit: prediction.hit };
}
