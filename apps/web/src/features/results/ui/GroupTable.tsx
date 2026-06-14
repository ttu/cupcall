import type { ReactElement } from 'react';
import type { GroupStandingRow } from '../domain/types';
import { TeamBadge, cn } from '@/shared/ui';

type Props = { standing: GroupStandingRow[] };

export function GroupTable({ standing }: Props): ReactElement {
  if (standing.length === 0) {
    return <p className="text-[13px] py-3 text-center text-ink-muted">No matches played yet</p>;
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="grid [grid-template-columns:20px_1fr_26px_26px_36px] p-[7px_12px] bg-surface-2 border-b border-line">
        <span />
        <span className="eyebrow text-[10px] tracking-[0.12em]">Team</span>
        <span className="eyebrow text-[10px] text-center tracking-[0.12em]">P</span>
        <span className="eyebrow text-[10px] text-center tracking-[0.12em]">GD</span>
        <span className="eyebrow text-[10px] text-center tracking-[0.12em]">Pts</span>
      </div>

      <div className="divide">
        {standing.map((row) => {
          const bg =
            row.qualifies === 'auto'
              ? 'bg-green-050'
              : row.qualifies === 'best-third'
                ? 'bg-orange-050'
                : 'bg-surface';
          const positionColor =
            row.qualifies === 'auto'
              ? 'text-green-600'
              : row.qualifies === 'best-third'
                ? 'text-orange-600'
                : 'text-ink-muted';
          return (
            <div
              key={row.teamId}
              className={cn(
                'grid [grid-template-columns:20px_1fr_26px_26px_36px] items-center p-[8px_12px]',
                bg,
              )}
            >
              <span className={cn('display text-sm', positionColor)}>{row.position}</span>
              <span className="flex items-center gap-[6px]">
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

      {(standing.some((r) => r.qualifies === 'auto') ||
        standing.some((r) => r.qualifies === 'best-third')) && (
        <div className="flex items-center gap-[14px] flex-wrap p-[7px_12px] bg-surface border-t border-line-soft text-[11px] font-semibold text-ink-muted">
          {standing.some((r) => r.qualifies === 'auto') && (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-[3px] bg-green-400 shrink-0 inline-block" />
              Through to the knockout round
            </span>
          )}
          {standing.some((r) => r.qualifies === 'best-third') && (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-[3px] bg-orange-400 shrink-0 inline-block" />
              Best third advances
            </span>
          )}
        </div>
      )}
    </div>
  );
}
