import type { ReactElement } from 'react';
import type { PickStatus } from '../domain/types';

type Props = { status: PickStatus };

export function PickStatusChip({ status }: Props): ReactElement | null {
  if (status === 'no-pick') return null;

  if (status === 'alive') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold"
        style={{
          background: 'var(--green-050)',
          color: 'var(--green-700)',
          boxShadow: 'inset 0 0 0 1px var(--green-300)',
        }}
      >
        ✓ pick alive
      </span>
    );
  }

  if (status === 'busted') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold"
        style={{ background: 'oklch(0.96 0.02 25)', color: 'var(--danger)' }}
      >
        ✗ busted
      </span>
    );
  }

  // pending
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold"
      style={{ background: 'var(--orange-050)', color: 'var(--orange-600)' }}
    >
      · upcoming
    </span>
  );
}
