import type { ReactElement } from 'react';
import Link from 'next/link';

export function SpecialsFooter({
  poolId,
  allFilled,
}: {
  poolId: string;
  allFilled: boolean;
}): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '14px 16px',
        borderRadius: 'var(--radius)',
        background: allFilled ? 'var(--green-050)' : 'var(--surface-2)',
        boxShadow: allFilled ? 'inset 0 0 0 1px var(--green-300)' : 'inset 0 0 0 1px var(--line)',
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: allFilled ? 'var(--green-700)' : 'var(--ink-muted)',
        }}
      >
        {allFilled ? 'All special bets saved ✓' : 'Fill in all special bets to complete your card'}
      </span>
      <Link
        href={`/pools/${poolId}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 40,
          padding: '0 18px',
          borderRadius: 11,
          background: allFilled ? 'var(--green-500)' : 'var(--ink-900)',
          color: allFilled ? 'oklch(0.18 0.02 160)' : 'var(--on-dark)',
          fontFamily: 'var(--font-ui)',
          fontSize: 13,
          fontWeight: 700,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Lock in my card
      </Link>
    </div>
  );
}
