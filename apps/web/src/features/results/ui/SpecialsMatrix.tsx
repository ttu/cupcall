import type { ReactElement } from 'react';
import type { SpecialsMatrixEntry, SpecialsMatrixBet, SpecialsMatrixCell } from '../domain/types';
import { Avatar, Icon, cn } from '@/shared/ui';

const COL_W = 56;

export function SpecialsMatrix({
  entries,
  bets,
}: {
  entries: SpecialsMatrixEntry[];
  bets: SpecialsMatrixBet[];
}): ReactElement {
  if (bets.length === 0) {
    return (
      <div className="card p-[32px_24px] text-center">
        <p className="text-sm text-ink-muted m-0">No special bets configured.</p>
      </div>
    );
  }

  const topPlayer = entries[0];
  const colTemplate = `50px 150px repeat(${bets.length}, ${COL_W}px) 64px`;

  return (
    <div>
      <div className="card overflow-x-auto">
        <div className="min-w-max">
          <div
            className="grid items-end gap-1 bg-surface-2 border-b border-line"
            style={{ gridTemplateColumns: colTemplate }}
          >
            <div className="sticky left-0 z-10 bg-surface-2 self-stretch" />
            <span className="eyebrow text-ink-muted text-[10px] py-3">Player</span>
            {bets.map((bet) => (
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
            ))}
            <span className="eyebrow text-ink-muted text-[10px] text-right py-3 pr-4">Total</span>
          </div>

          <div className="divide">
            {entries.map((row, idx) => (
              <SpecialsMatrixRow
                key={row.userId}
                row={row}
                avatarIndex={idx}
                colTemplate={colTemplate}
              />
            ))}
          </div>
        </div>
      </div>

      {topPlayer && topPlayer.totalPoints > 0 && (
        <p className="text-[12.5px] text-ink-muted mt-3.5 flex items-center gap-2">
          <Icon name="spark" size={15} color="var(--orange-500, oklch(0.65 0.2 55))" />
          {topPlayer.isCurrentUser ? (
            <>
              You lead the specials with{' '}
              <strong className="text-ink">{topPlayer.totalPoints} pts</strong>.
            </>
          ) : (
            <>
              <strong className="text-ink">{topPlayer.displayName.split(' ')[0]}</strong> leads with{' '}
              {topPlayer.totalPoints} pts from special bets.
            </>
          )}
        </p>
      )}
    </div>
  );
}

function SpecialsMatrixRow({
  row,
  avatarIndex,
  colTemplate,
}: {
  row: SpecialsMatrixEntry;
  avatarIndex: number;
  colTemplate: string;
}): ReactElement {
  const stickyBg = row.isCurrentUser ? 'bg-green-050' : 'bg-surface';

  return (
    <div
      className={cn(
        'grid items-center gap-1',
        row.isCurrentUser ? 'bg-green-050' : 'bg-transparent',
      )}
      style={{ gridTemplateColumns: colTemplate }}
    >
      <div
        className={cn(
          'sticky left-0 z-10 flex items-center justify-center self-stretch py-[9px]',
          stickyBg,
        )}
      >
        <Avatar name={row.displayName} index={avatarIndex} size={30} />
      </div>

      <span className="flex items-center min-w-0 py-[9px]">
        <span
          className={cn(
            'font-bold text-[13px] truncate',
            row.isCurrentUser ? 'text-green-700' : 'text-ink',
          )}
        >
          {row.displayName}
          {row.isCurrentUser && (
            <span className="chip green h-4.5 ml-[7px] text-[9.5px] align-middle">YOU</span>
          )}
        </span>
      </span>

      {row.cells.map((cell) => (
        <span key={cell.betKey} className="grid place-items-center py-[9px]">
          <SpecialsCell cell={cell} />
        </span>
      ))}

      <span
        className={cn(
          'display tnum text-right text-[18px] py-[9px] pr-4',
          row.isCurrentUser ? 'text-green-600' : 'text-ink',
        )}
      >
        {row.totalPoints}
      </span>
    </div>
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
      <span className="w-11 h-8 rounded-lg grid place-items-center text-[11px] font-bold font-cup-display bg-surface-2 text-ink-muted">
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
