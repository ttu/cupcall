import type { ReactElement } from 'react';
import type { MatchMatrixEntry, MatrixMatch, MatchHit } from '../domain/types';
import { Avatar, Icon, cn } from '@/shared/ui';

export function MatchMatrix({
  entries,
  matches,
}: {
  entries: MatchMatrixEntry[];
  matches: MatrixMatch[];
}): ReactElement {
  if (matches.length === 0) {
    return (
      <div className="card p-[32px_24px] text-center">
        <p className="text-sm text-ink-muted m-0">
          No completed matches yet — come back after the first results are in.
        </p>
      </div>
    );
  }

  const topPlayer = entries[0];
  const colTemplate = `200px repeat(${matches.length}, 1fr) 64px`;

  return (
    <div>
      <div className="card overflow-hidden">
        <div
          className="grid items-center p-[12px_16px] bg-surface-2 border-b border-line gap-1"
          style={{ gridTemplateColumns: colTemplate }}
        >
          <span className="eyebrow text-ink-muted text-[10px]">Player</span>
          {matches.map((m) => (
            <div key={m.matchId} className="flex flex-col items-center gap-0.5 text-[11px]">
              <span className="font-extrabold text-ink font-cup-display">
                {m.actualHome}–{m.actualAway}
              </span>
              <span className="text-[9.5px] font-bold text-ink-muted">
                {m.homeTeamId}·{m.awayTeamId}
              </span>
            </div>
          ))}
          <span className="eyebrow text-ink-muted text-[10px] text-right">Total</span>
        </div>

        <div className="divide">
          {entries.map((row, idx) => (
            <MatrixRow key={row.userId} row={row} avatarIndex={idx} colTemplate={colTemplate} />
          ))}
        </div>
      </div>

      {topPlayer && topPlayer.totalPoints > 0 && (
        <p className="text-[12.5px] text-ink-muted mt-[14px] flex items-center gap-2">
          <Icon name="spark" size={15} color="var(--orange-500, oklch(0.65 0.2 55))" />
          {topPlayer.isCurrentUser ? (
            <>
              You lead the group-stage matrix with{' '}
              <strong className="text-ink">{topPlayer.totalPoints} pts</strong>.
            </>
          ) : (
            <>
              <strong className="text-ink">{topPlayer.displayName.split(' ')[0]}</strong> leads with{' '}
              {topPlayer.totalPoints} pts from these matches.
            </>
          )}
        </p>
      )}
    </div>
  );
}

function MatrixRow({
  row,
  avatarIndex,
  colTemplate,
}: {
  row: MatchMatrixEntry;
  avatarIndex: number;
  colTemplate: string;
}): ReactElement {
  return (
    <div
      className={cn(
        'grid items-center p-[9px_16px] gap-1',
        row.isCurrentUser ? 'bg-green-050' : 'bg-transparent',
      )}
      style={{ gridTemplateColumns: colTemplate }}
    >
      <span className="flex items-center gap-[10px] min-w-0">
        <Avatar name={row.displayName} index={avatarIndex} size={30} />
        <span
          className={cn(
            'font-bold text-[13px] truncate',
            row.isCurrentUser ? 'text-green-700' : 'text-ink',
          )}
        >
          {row.displayName}
          {row.isCurrentUser && (
            <span className="chip green h-[18px] ml-[7px] text-[9.5px] align-middle">YOU</span>
          )}
        </span>
      </span>
      {row.cells.map((cell) => (
        <span key={cell.matchId} className="grid place-items-center">
          <MatrixCell hit={cell.hit} points={cell.points} />
        </span>
      ))}
      <span
        className={cn(
          'display tnum text-right text-[18px]',
          row.isCurrentUser ? 'text-green-600' : 'text-ink',
        )}
      >
        {row.totalPoints}
      </span>
    </div>
  );
}

function MatrixCell({ hit, points }: { hit: MatchHit; points: number }): ReactElement {
  return (
    <span
      className={cn(
        'w-9 h-8 rounded-lg grid place-items-center text-sm font-cup-display',
        hit === 'exact'
          ? 'bg-green-500 text-[oklch(0.2_0.02_160)]'
          : hit === 'outcome'
            ? 'bg-green-050 text-green-700 shadow-[inset_0_0_0_1px_var(--green-300)]'
            : 'bg-surface-2 text-ink-muted',
      )}
    >
      {points === 0 ? '·' : points}
    </span>
  );
}
