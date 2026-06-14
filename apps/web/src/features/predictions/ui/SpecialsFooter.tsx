import type { ReactElement } from 'react';
import Link from 'next/link';
import { cn } from '@/shared/ui';

export function SpecialsFooter({
  poolId,
  allFilled,
}: {
  poolId: string;
  allFilled: boolean;
}): ReactElement {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 py-3.5 px-4 rounded-cup',
        allFilled
          ? 'bg-green-050 shadow-[inset_0_0_0_1px_var(--green-300)]'
          : 'bg-surface-2 shadow-[inset_0_0_0_1px_var(--line)]',
      )}
    >
      <span
        className={cn('text-[13px] font-bold', allFilled ? 'text-green-700' : 'text-ink-muted')}
      >
        {allFilled ? 'All special bets saved ✓' : 'Fill in all special bets to complete your card'}
      </span>
      <Link
        href={`/pools/${poolId}`}
        className={cn(
          'inline-flex items-center gap-1.5 h-10 px-4.5 rounded-cup-btn font-cup-ui text-[13px] font-bold no-underline whitespace-nowrap',
          allFilled ? 'bg-green-500 text-[oklch(0.18_0.02_160)]' : 'bg-ink-900 text-on-dark',
        )}
      >
        Lock in my card
      </Link>
    </div>
  );
}
