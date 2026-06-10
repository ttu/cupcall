import type { ReactElement } from 'react';
import type { MatchHit } from '../domain/types';

type Props = { hit: MatchHit; points: number };

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
        ✓ Exact +{points}
      </span>
    );
  }

  if (hit === 'outcome') {
    return (
      <span className="chip green" style={{ height: 24, fontSize: 11 }}>
        Outcome +{points}
      </span>
    );
  }

  return (
    <span className="chip" style={{ height: 24, fontSize: 11, color: 'var(--ink-muted)' }}>
      Missed +0
    </span>
  );
}
