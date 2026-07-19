import type { ReactElement } from 'react';
import type { SpecialBetResultRow, SpecialBetPoolStats } from '../domain/types';
import { Icon, TeamBadge, cn } from '@/shared/ui';

const KIND_ICON = {
  team: 'flag',
  player: 'kick',
  number: 'ball',
  bool: 'whistle',
} as const;

export function SpecialBetRow({
  bet,
  showUserPick,
}: {
  bet: SpecialBetResultRow;
  showUserPick: boolean;
}): ReactElement {
  const icon = KIND_ICON[bet.kind] ?? 'ball';
  const isPending = bet.hit === 'pending';
  const isHit = bet.hit === 'hit';
  const isMissed = bet.hit === 'missed';

  return (
    <div
      data-testid={`special-bet-result-${bet.key}`}
      className={cn(
        'rounded-cup shadow-cup-sm p-[12px_14px] grid grid-cols-[34px_1fr_auto] gap-2.5 items-start border',
        isPending || (!isHit && !isMissed)
          ? 'border-line-soft bg-surface'
          : isHit
            ? 'border-green-300 bg-green-050'
            : 'border-red-300 bg-red-050',
      )}
    >
      <div className="w-8.5 h-8.5 rounded-cup-sm bg-surface-2 shadow-[inset_0_0_0_1px_var(--line)] grid place-items-center text-ink-muted">
        <Icon name={icon} size={16} stroke={1.8} />
      </div>

      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-[12.5px] font-bold text-ink-soft leading-[1.4]">{bet.label}</span>
        <div className="flex gap-1.5 flex-wrap items-center">
          {showUserPick && (
            <PickDisplay
              value={bet.userPickDisplay}
              label="Your pick"
              teamIds={bet.userPickTeamId ? [bet.userPickTeamId] : []}
            />
          )}
          {bet.actualAnswerDisplay !== null && (
            <>
              {showUserPick && <span className="text-[11px] text-ink-muted">→</span>}
              <PickDisplay
                value={bet.actualAnswerDisplay}
                label="Actual"
                actual
                teamIds={bet.actualAnswerTeamIds}
              />
            </>
          )}
        </div>
        {bet.currentLeader !== null && (
          <CurrentLeaderLine betKey={bet.key} leader={bet.currentLeader} />
        )}
        {bet.poolStats && <PoolPicksRow stats={bet.poolStats} />}
      </div>

      <div className="flex flex-col items-end gap-1 pt-0.5">
        {isPending ? (
          <span className="chip" style={{ height: 24, fontSize: 11 }}>
            Pending
          </span>
        ) : isHit ? (
          <span
            className="chip bg-green-500 text-[oklch(0.2_0.02_160)] shadow-none"
            style={{ height: 24, fontSize: 11 }}
          >
            +{bet.pointsAwarded}
          </span>
        ) : isMissed ? (
          <span className="chip red" style={{ height: 24, fontSize: 11 }}>
            +0
          </span>
        ) : null}
        <span className="display tnum text-[11px] text-ink-muted">{bet.points} pts</span>
      </div>
    </div>
  );
}

function PickDisplay({
  value,
  label,
  actual = false,
  teamIds = [],
}: {
  value: string | number | boolean | null;
  label: string;
  actual?: boolean;
  teamIds?: string[];
}): ReactElement {
  if (value === null) {
    return <span className="text-xs text-ink-muted italic">{label}</span>;
  }

  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);

  return (
    <span className="inline-flex items-center gap-[5px]">
      {teamIds.map((tid) => (
        <TeamBadge key={tid} teamId={tid} size="sm" />
      ))}
      <span className={cn('text-xs', actual ? 'font-bold text-ink' : 'font-normal text-ink-soft')}>
        {display}
      </span>
    </span>
  );
}

function PoolPicksRow({ stats }: { stats: SpecialBetPoolStats }): ReactElement {
  const top = stats.topValues.slice(0, 3);
  const shownCount = top.reduce((sum, v) => sum + v.count, 0);
  const restCount = stats.totalPredictions - shownCount;

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
      <span className="text-[10px] font-bold text-ink-muted uppercase tracking-[0.05em] shrink-0">
        Pool
      </span>
      {top.map((v) => (
        <span key={v.displayValue} className="inline-flex items-center gap-[3px]">
          <span className="text-[11px] text-ink-soft">{v.displayValue}</span>
          <span className="text-[11px] font-bold text-ink">{v.pct}%</span>
        </span>
      ))}
      {restCount > 0 && <span className="text-[10px] text-ink-muted">+{restCount}</span>}
    </div>
  );
}

function CurrentLeaderLine({
  betKey,
  leader,
}: {
  betKey: string;
  leader: NonNullable<SpecialBetResultRow['currentLeader']>;
}): ReactElement {
  const prefix = betKey === 'penaltyShootoutCount' ? 'So far:' : 'Currently leading:';
  const parenthetical = leader.detail.length > 0 ? ` (${leader.detail})` : '';
  return (
    <div
      data-testid={`special-bet-current-leader-${betKey}`}
      className="flex items-center gap-[5px] flex-wrap text-[11px] text-ink-muted mt-0.5"
    >
      <span>{prefix}</span>
      {leader.teamIds.map((tid) => (
        <TeamBadge key={tid} teamId={tid} size="sm" />
      ))}
      <span>
        {leader.display}
        {parenthetical}
      </span>
    </div>
  );
}
