import type { ReactElement } from 'react';
import type { ProjectedEntry } from '../domain/types';
import { Icon, cn } from '@/shared/ui';

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function projectedSubLabel(entries: ProjectedEntry[]): string {
  const me = entries.find((e) => e.isCurrentUser);
  if (!me) return '';
  if (me.projectedRank === 1) return 'on track for 1st';
  return `enough for ${ordinal(me.projectedRank)} place`;
}

const GRID = 'grid-cols-[44px_1fr_52px_52px_64px]';

export function ProjectedStandings({ entries }: { entries: ProjectedEntry[] }): ReactElement {
  return (
    <div className="overflow-hidden">
      <div
        className={cn('grid gap-1.5 p-[8px_16px] bg-surface-2 border-t border-b border-line', GRID)}
      >
        {(['Now → Fin', 'Player', 'Now', '+Avail', 'Proj.'] as const).map((hd, i) => (
          <span
            key={hd}
            className={cn(
              'eyebrow text-ink-muted text-[10px]',
              i >= 2 ? 'text-right' : 'text-left',
            )}
          >
            {hd}
          </span>
        ))}
      </div>
      <div className="divide">
        {entries.map((e) => (
          <ProjectedRow key={e.userId} entry={e} />
        ))}
      </div>
    </div>
  );
}

function ProjectedRow({ entry }: { entry: ProjectedEntry }): ReactElement {
  const {
    rankDelta,
    projectedRank,
    currentPoints,
    projectedPoints,
    canStillGet,
    displayName,
    isCurrentUser,
  } = entry;
  const isTop3 = projectedRank <= 3;

  return (
    <div
      className={cn(
        'grid gap-1.5 p-[10px_16px] items-center',
        GRID,
        isCurrentUser ? 'bg-green-050' : 'bg-transparent',
      )}
    >
      <span className="flex items-center gap-1">
        <span className={cn('display text-base w-4.5', isTop3 ? 'text-gold' : 'text-ink-muted')}>
          {projectedRank}
        </span>
        {rankDelta !== 0 && (
          <span
            className={cn(
              'inline-flex items-center gap-px text-[10px] font-extrabold',
              rankDelta > 0 ? 'text-green-600' : 'text-danger',
            )}
          >
            <span className={cn('inline-flex', rankDelta > 0 ? 'rotate-180' : '')}>
              <Icon name="chevdown" size={11} stroke={2.8} color="currentColor" />
            </span>
            {Math.abs(rankDelta)}
          </span>
        )}
      </span>

      <span className="min-w-0">
        <span
          className={cn(
            'block font-bold text-[13px] truncate',
            isCurrentUser ? 'text-green-700' : 'text-ink',
          )}
        >
          {isCurrentUser ? 'You' : displayName.split(' ')[0]}
        </span>
        {!isCurrentUser && displayName.split(' ')[1] && (
          <span className="block text-[11px] font-medium text-ink-muted truncate">
            {displayName.split(' ').slice(1).join(' ')}
          </span>
        )}
      </span>

      <span className="tnum text-right font-semibold text-[13px] text-ink-muted">
        {currentPoints}
      </span>

      <span
        className={cn(
          'tnum text-right font-semibold text-[13px]',
          canStillGet > 0 ? 'text-green-600' : 'text-ink-muted',
        )}
      >
        {canStillGet > 0 ? `+${canStillGet}` : '–'}
      </span>

      <span
        className={cn(
          'display tnum text-right text-[18px]',
          isCurrentUser ? 'text-green-600' : 'text-ink',
        )}
      >
        {projectedPoints}
      </span>
    </div>
  );
}
