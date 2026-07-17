import type { ReactElement } from 'react';
import type { SpecialsMatrixEntry, SpecialsMatrixBet, SpecialsMatrixCell } from '../domain/types';
import { cn } from '@/shared/ui';
import { MatrixTable } from './MatrixTable';

const COL_W = 56;

export function SpecialsMatrix({
  entries,
  bets,
}: {
  entries: SpecialsMatrixEntry[];
  bets: SpecialsMatrixBet[];
}): ReactElement {
  return (
    <MatrixTable
      columns={bets}
      entries={entries}
      colWidth={COL_W}
      headerAlign="end"
      emptyMessage="No special bets configured."
      getCellKey={(cell) => cell.betKey}
      renderColumnHeader={(bet) => (
        <div
          key={bet.betKey}
          className="flex flex-col items-center gap-1 py-3 px-1"
          title={bet.label}
        >
          <span className="text-[9px] font-bold text-ink-muted text-center leading-[1.3] line-clamp-3">
            {bet.label}
          </span>
          <span className="text-[9px] text-ink-muted">{bet.points} pts</span>
          {bet.actualPickLabel !== null && (
            <span className="chip bg-green-500 text-[oklch(0.2_0.02_160)] shadow-none h-4 text-[9px] px-1.5">
              {bet.actualPickLabel}
            </span>
          )}
        </div>
      )}
      renderCell={(cell) => <SpecialsCell cell={cell} />}
      leaderNote={(top) =>
        top.isCurrentUser ? (
          <>
            You lead the specials with <strong className="text-ink">{top.totalPoints} pts</strong>.
          </>
        ) : (
          <>
            <strong className="text-ink">{top.displayName.split(' ')[0]}</strong> leads with{' '}
            {top.totalPoints} pts from special bets.
          </>
        )
      }
    />
  );
}

function SpecialsCell({ cell }: { cell: SpecialsMatrixCell }): ReactElement {
  if (cell.hit === 'hit') {
    return (
      <span className="w-11 h-8 rounded-lg grid place-items-center text-[11px] font-bold font-cup-display bg-green-500 text-[oklch(0.2_0.02_160)]">
        +{cell.points}
      </span>
    );
  }

  if (cell.hit === 'no-pick') {
    return (
      <span className="w-11 h-8 rounded-lg grid place-items-center text-[11px] font-bold font-cup-display bg-transparent shadow-[inset_0_0_0_1px_var(--line)] text-ink-muted">
        —
      </span>
    );
  }

  if (cell.hit === 'missed') {
    return (
      <span className="w-11 h-8 rounded-lg grid place-items-center text-[11px] font-bold font-cup-display bg-red-100 text-red-400 line-through">
        {cell.pickLabel ?? '·'}
      </span>
    );
  }

  // pending
  return (
    <span
      className={cn(
        'w-11 h-8 rounded-lg grid place-items-center text-[11px] font-bold font-cup-display',
        cell.pickLabel !== null
          ? 'bg-surface text-[oklch(0.62_0_0)] shadow-[inset_0_0_0_1px_var(--line-strong)]'
          : 'bg-surface-2 text-ink-muted',
      )}
    >
      {cell.pickLabel ?? '·'}
    </span>
  );
}
