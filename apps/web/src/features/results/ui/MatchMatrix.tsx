import type { ReactElement } from 'react';
import type { MatchMatrixEntry, MatrixMatch, MatchHit } from '../domain/types';
import { Avatar, Icon, cn } from '@/shared/ui';

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
  if (matches.length === 0) {
    return (
      <div className="card p-[32px_24px] text-center">
        <p className="text-sm text-ink-muted m-0">No group matches found.</p>
      </div>
    );
  }

  const topPlayer = entries[0];
  const colTemplate = `50px 150px repeat(${matches.length}, ${MATCH_COL_W}px) 64px`;

  return (
    <div>
      <div className="card overflow-x-auto">
        {/* min-w-max forces the inner grids to their full track width so bg-surface-2 covers the entire scrollable area, not just the card's visible width */}
        <div className="min-w-max">
          <div
            className="grid items-center gap-1 bg-surface-2 border-b border-line"
            style={{ gridTemplateColumns: colTemplate }}
          >
            {/* Sticky placeholder — covers the avatar column so scrolling content doesn't bleed through */}
            <div className="sticky left-0 z-10 bg-surface-2 self-stretch" />
            <span className="eyebrow text-ink-muted text-[10px] py-3">Player</span>
            {matches.map((m) => (
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
            ))}
            <span className="eyebrow text-ink-muted text-[10px] text-right py-3 pr-4">Total</span>
          </div>

          <div className="divide">
            {entries.map((row, idx) => (
              <MatrixRow key={row.userId} row={row} avatarIndex={idx} colTemplate={colTemplate} />
            ))}
          </div>
        </div>
      </div>

      {topPlayer && topPlayer.totalPoints > 0 && (
        <p className="text-[12.5px] text-ink-muted mt-3.5 flex items-center gap-2">
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
  const stickyBg = row.isCurrentUser ? 'bg-green-050' : 'bg-surface';

  return (
    <div
      className={cn(
        'grid items-center gap-1',
        row.isCurrentUser ? 'bg-green-050' : 'bg-transparent',
      )}
      style={{ gridTemplateColumns: colTemplate }}
    >
      {/* Sticky avatar — stays visible while the player name scrolls out of view */}
      <div
        className={cn(
          'sticky left-0 z-10 flex items-center justify-center self-stretch py-[9px]',
          stickyBg,
        )}
      >
        <Avatar name={row.displayName} index={avatarIndex} size={30} />
      </div>

      {/* Player name — non-sticky, scrolls away horizontally */}
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
        <span key={cell.matchId} className="grid place-items-center py-[9px]">
          <MatrixCell
            hit={cell.hit}
            points={cell.points}
            predictedOutcome={cell.predictedOutcome}
          />
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
