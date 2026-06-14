import type { ReactElement } from 'react';
import type { MatchHit } from '../domain/types';

type Props = { hit: MatchHit; points?: number };

export function HitChip({ hit, points }: Props): ReactElement | null {
  if (hit === 'pending') return null;

  if (hit === 'exact') {
    return (
      <span className="chip text-[11px] h-6 bg-green-500 text-[oklch(0.2_0.02_160)] shadow-none">
        {points !== undefined ? `✓ Exact +${points}` : '✓ Exact'}
      </span>
    );
  }

  if (hit === 'outcome') {
    return (
      <span className="chip green text-[11px] h-6">
        {points !== undefined ? `Correct +${points}` : 'Correct'}
      </span>
    );
  }

  return (
    <span className="chip red text-[11px] h-6">
      {points !== undefined ? `Missed +0` : 'Missed'}
    </span>
  );
}
