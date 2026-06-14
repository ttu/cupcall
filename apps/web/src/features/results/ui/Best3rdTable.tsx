import type { ReactElement } from 'react';
import type { Best3rdStandingRow } from '../domain/types';
import { TeamBadge, cn } from '@/shared/ui';

type Props = { rows: Best3rdStandingRow[] };

export function Best3rdTable({ rows }: Props): ReactElement {
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-[20px_28px_1fr_26px_26px_36px] p-[7px_12px] bg-surface-2 border-b border-line">
        <span />
        <span className="eyebrow text-[10px] tracking-[0.12em]">Grp</span>
        <span className="eyebrow text-[10px] tracking-[0.12em]">Team</span>
        <span className="eyebrow text-[10px] text-center tracking-[0.12em]">P</span>
        <span className="eyebrow text-[10px] text-center tracking-[0.12em]">GD</span>
        <span className="eyebrow text-[10px] text-center tracking-[0.12em]">Pts</span>
      </div>

      <div className="divide">
        {rows.map((row) => {
          const bg = row.qualifies ? 'bg-orange-050' : 'bg-surface';
          const rankColor = row.qualifies ? 'text-orange-600' : 'text-ink-muted';
          return (
            <div
              key={row.teamId}
              className={cn(
                'grid grid-cols-[20px_28px_1fr_26px_26px_36px] items-center p-[8px_12px]',
                bg,
              )}
            >
              <span className={cn('display text-sm', rankColor)}>{row.rank}</span>
              <span className="font-cup-display text-[11px] font-bold text-ink-muted">
                {row.groupId}
              </span>
              <span className="flex items-center gap-1.5">
                <TeamBadge teamId={row.teamId} size="sm" />
                <span className="text-[13px] font-bold text-ink truncate">{row.teamName}</span>
              </span>
              <span className="tnum text-[13px] text-center text-ink-muted">{row.played}</span>
              <span className="tnum text-[13px] text-center text-ink-soft">
                {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
              </span>
              <span className="display tnum text-base text-center text-ink">{row.points}</span>
            </div>
          );
        })}
      </div>

      {rows.some((r) => r.qualifies) && (
        <div className="flex items-center gap-3.5 flex-wrap p-[7px_12px] bg-surface border-t border-line-soft text-[11px] font-semibold text-ink-muted">
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-[3px] bg-orange-400 shrink-0 inline-block" />
            Best third advances
          </span>
        </div>
      )}
    </div>
  );
}
