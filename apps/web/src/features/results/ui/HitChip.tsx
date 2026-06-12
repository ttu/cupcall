import type { ReactElement } from 'react';
import type { MatchHit } from '../domain/types';

type Props = { hit: MatchHit; points?: number };

export function HitChip({ hit, points }: Props): ReactElement | null {
  if (hit === 'pending') return null;

  if (hit === 'exact') {
    return (
      <span
        className="chip"
        style={{
          background: 'var(--green-500)',
          color: 'oklch(0.2 0.02 160)',
          boxShadow: 'none',
          height: 24,
          fontSize: 11,
        }}
      >
        {points !== undefined ? `✓ Exact +${points}` : '✓ Exact'}
      </span>
    );
  }

  if (hit === 'outcome') {
    return (
      <span className="chip green" style={{ height: 24, fontSize: 11 }}>
        {points !== undefined ? `Correct +${points}` : 'Correct'}
      </span>
    );
  }

  return (
    <span className="chip red" style={{ height: 24, fontSize: 11 }}>
      {points !== undefined ? `Missed +0` : 'Missed'}
    </span>
  );
}
