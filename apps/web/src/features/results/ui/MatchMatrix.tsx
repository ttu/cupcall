import type { ReactElement } from 'react';
import type { MatchMatrixEntry, MatchMatrixCell, MatrixMatch, MatchHit } from '../domain/types';
import { cn } from '@/shared/ui';
import { MatrixTable } from './MatrixTable';

const MATCH_COL_W = 52;

function formatKickoff(isoString: string | null): string {
  if (!isoString) return '?';
  return new Date(isoString).toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function MatchMatrix({
  entries,
  matches,
}: {
  entries: MatchMatrixEntry[];
  matches: MatrixMatch[];
}): ReactElement {
  return (
    <MatrixTable<MatrixMatch, MatchMatrixCell, { groupOrderPoints: number }>
      columns={matches}
      entries={entries}
      colWidth={MATCH_COL_W}
      emptyMessage="No group matches found."
      getCellKey={(cell) => cell.matchId}
      renderColumnHeader={(m) => (
        <div key={m.matchId} className="flex flex-col items-center gap-0.5 text-[11px] py-3">
          {m.status === 'final' ? (
            <span className="font-extrabold text-ink font-cup-display">
              {m.actualHome}–{m.actualAway}
            </span>
          ) : (
            <span className="font-bold text-ink-muted font-cup-display text-[10px]">
              {formatKickoff(m.kickoff)}
            </span>
          )}
          <span className="text-[9.5px] font-bold text-ink-muted">
            {m.homeTeamId}·{m.awayTeamId}
          </span>
        </div>
      )}
      renderCell={(cell) => (
        <MatrixCell hit={cell.hit} points={cell.points} predictedOutcome={cell.predictedOutcome} />
      )}
      extraColumn={{
        header: 'Standings',
        width: 56,
        renderCell: (row) => row.groupOrderPoints,
      }}
      leaderNote={(top) =>
        top.isCurrentUser ? (
          <>
            You lead the group-stage matrix with{' '}
            <strong className="text-ink">{top.totalPoints} pts</strong>.
          </>
        ) : (
          <>
            <strong className="text-ink">{top.displayName.split(' ')[0]}</strong> leads with{' '}
            {top.totalPoints} pts from these matches.
          </>
        )
      }
    />
  );
}

function MatrixCell({
  hit,
  points,
  predictedOutcome,
}: {
  hit: MatchHit;
  points: number;
  predictedOutcome: '1' | 'X' | '2' | null;
}): ReactElement {
  if (hit === 'pending') {
    return (
      <span
        className={cn(
          'w-9 h-8 rounded-lg grid place-items-center text-sm font-cup-display',
          predictedOutcome !== null
            ? 'bg-surface text-[oklch(0.62_0_0)] shadow-[inset_0_0_0_1px_var(--line-strong)]'
            : 'bg-surface-2 text-ink-muted',
        )}
      >
        {predictedOutcome ?? '·'}
      </span>
    );
  }
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
