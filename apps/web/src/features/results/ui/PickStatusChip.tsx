import type { ReactElement } from 'react';
import type { PickStatus } from '../domain/types';

type Props = { status: PickStatus };

export function PickStatusChip({ status }: Props): ReactElement | null {
  if (status === 'no-pick') return null;

  if (status === 'alive') {
    return (
      <span className="chip green" style={{ height: 18, fontSize: 9.5, padding: '0 7px' }}>
        ✓ pick alive
      </span>
    );
  }

  if (status === 'busted') {
    return (
      <span
        className="chip"
        style={{
          height: 18,
          fontSize: 9.5,
          padding: '0 7px',
          background: 'oklch(0.96 0.02 25)',
          color: 'var(--danger)',
          boxShadow: 'inset 0 0 0 1px oklch(0.85 0.08 25)',
        }}
      >
        ✗ busted
      </span>
    );
  }

  // pending
  return (
    <span className="chip orange" style={{ height: 18, fontSize: 9.5, padding: '0 7px' }}>
      · upcoming
    </span>
  );
}
