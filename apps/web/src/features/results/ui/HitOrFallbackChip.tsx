import type { ReactElement } from 'react';
import type { PredictionHitDisplay } from './match-summary-utils';
import { HitChip } from './HitChip';
import { cn } from '@/shared/ui';

type Props = { display: PredictionHitDisplay; points: number };

/** Renders a resolved match hit as the HitChip, or a small fallback chip for non-hit states. */
export function HitOrFallbackChip({ display, points }: Props): ReactElement | null {
  if (display.kind === 'matchHit') {
    return <HitChip hit={display.hit} points={points} />;
  }

  return (
    <span className={cn('chip text-[11px] h-6', display.tone === 'red' && 'red')}>
      {display.label}
    </span>
  );
}
