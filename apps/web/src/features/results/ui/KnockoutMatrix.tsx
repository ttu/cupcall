import type { ReactElement } from 'react';
import type {
  KnockoutMatrixEntry,
  KnockoutMatrixMatch,
  KnockoutMatrixCell,
  KnockoutMatchHit,
} from '../domain/types';
import { cn } from '@/shared/ui';
import { MatrixTable } from './MatrixTable';

const COL_W = 48;

function formatKickoff(isoString: string | null): string {
  if (!isoString) return '?';
  return new Date(isoString).toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function TeamLabel({ id, winnerId }: { id: string; winnerId: string | null }): ReactElement {
  if (winnerId === id) {
    return <span className="font-extrabold text-ink">{id}</span>;
  }
  return <>{id}</>;
}

const VARIANT_LABEL: Record<'teams' | 'score', string> = {
  teams: 'Teams',
  score: 'Score',
};

export function KnockoutMatrix({
  entries,
  matches,
}: {
  entries: KnockoutMatrixEntry[];
  matches: KnockoutMatrixMatch[];
}): ReactElement {
  return (
    <MatrixTable<KnockoutMatrixMatch, KnockoutMatrixCell, { standingsPoints: number }>
      columns={matches}
      entries={entries}
      colWidth={COL_W}
      emptyMessage="No knockout matches yet."
      getCellKey={(cell) => cell.bracketMatchKey}
      renderColumnHeader={(m) => (
        <div
          key={m.bracketMatchKey}
          className="flex flex-col items-center gap-0.5 text-[11px] py-3"
        >
          <span className="font-extrabold text-ink font-cup-display text-[10px]">{m.round}</span>
          {m.variant ? (
            <span className="text-[9.5px] font-bold text-ink-muted">
              {VARIANT_LABEL[m.variant]}
            </span>
          ) : m.homeTeamId && m.awayTeamId ? (
            <span className="text-[9.5px] font-bold text-ink-muted">
              <TeamLabel id={m.homeTeamId} winnerId={m.actualWinnerId} />
              {'·'}
              <TeamLabel id={m.awayTeamId} winnerId={m.actualWinnerId} />
            </span>
          ) : (
            <span className="font-bold text-ink-muted font-cup-display text-[9.5px]">
              {formatKickoff(m.kickoff)}
            </span>
          )}
        </div>
      )}
      renderCell={(cell) => (
        <KnockoutCell hit={cell.hit} points={cell.points} pickedWinnerId={cell.pickedWinnerId} />
      )}
      extraColumn={{
        header: 'Standings',
        width: 56,
        renderCell: (row) => row.standingsPoints,
      }}
      leaderNote={(top) =>
        top.isCurrentUser ? (
          <>
            You lead the knockout matrix with{' '}
            <strong className="text-ink">{top.totalPoints} pts</strong>.
          </>
        ) : (
          <>
            <strong className="text-ink">{top.displayName.split(' ')[0]}</strong> leads with{' '}
            {top.totalPoints} pts from knockout picks.
          </>
        )
      }
    />
  );
}

function KnockoutCell({
  hit,
  points,
  pickedWinnerId,
}: {
  hit: KnockoutMatchHit;
  points: number;
  pickedWinnerId: string | null;
}): ReactElement {
  if (hit === 'pending') {
    return (
      <span
        className={cn(
          'w-10 h-8 rounded-lg grid place-items-center text-[11px] font-bold font-cup-display',
          pickedWinnerId !== null
            ? 'bg-surface text-[oklch(0.62_0_0)] shadow-[inset_0_0_0_1px_var(--line-strong)]'
            : 'bg-surface-2 text-ink-muted',
        )}
      >
        {pickedWinnerId ?? '·'}
      </span>
    );
  }

  if (hit === 'no-pick') {
    return (
      <span className="w-10 h-8 rounded-lg grid place-items-center text-[11px] font-bold font-cup-display bg-transparent shadow-[inset_0_0_0_1px_var(--line)] text-ink-muted">
        —
      </span>
    );
  }

  if (hit === 'impossible') {
    return (
      <span className="w-10 h-8 rounded-lg grid place-items-center text-[11px] font-bold font-cup-display bg-red-100 text-red-400 line-through">
        {pickedWinnerId ?? '?'}
      </span>
    );
  }

  if (hit === 'miss') {
    return (
      <span className="w-10 h-8 rounded-lg grid place-items-center text-[11px] font-bold font-cup-display bg-surface-2 text-ink-muted">
        ·
      </span>
    );
  }

  // hit
  return (
    <span className="w-10 h-8 rounded-lg grid place-items-center text-[11px] font-bold font-cup-display bg-green-500 text-[oklch(0.2_0.02_160)]">
      +{points}
    </span>
  );
}
