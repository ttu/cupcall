import type { ReactElement } from 'react';
import type { MatchHit } from '../domain/types';

type Props = { hit: MatchHit; points: number };

export function HitChip({ hit, points }: Props): ReactElement | null {
  if (hit === 'pending') return null;

  if (hit === 'exact') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap"
        style={{ background: 'var(--green-500)', color: 'oklch(0.2 0.02 160)' }}
      >
        ✓ Exact +{points}
      </span>
    );
  }

  if (hit === 'outcome') {
    return (
      <span
        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap"
        style={{
          background: 'var(--green-050)',
          color: 'var(--green-700)',
          boxShadow: 'inset 0 0 0 1px var(--green-300)',
        }}
      >
        Outcome +{points}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap"
      style={{ color: 'var(--ink-muted)' }}
    >
      Missed +0
    </span>
  );
}
