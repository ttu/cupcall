import type { ReactElement } from 'react';
import type { BracketHealth, BracketRoundHealth, KnockoutMatchView } from '../domain/types';
import { cn } from '@/shared/ui';

function RoundHealthRow({ round }: { round: BracketRoundHealth }): ReactElement {
  const possible = round.alivePicks + round.pendingPicks;
  const hasPicks = round.alivePicks + round.pendingPicks + round.bustedPicks > 0;
  const allBusted = hasPicks && possible === 0;
  const someBusted = hasPicks && round.bustedPicks > 0 && possible > 0;
  const color = allBusted ? 'text-danger' : someBusted ? 'text-amber-600' : 'text-green-700';

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-bold text-green-800 w-8 shrink-0">{round.label}</span>
      <div className="flex-1 h-1 rounded-full bg-green-100 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            allBusted ? 'bg-danger' : someBusted ? 'bg-amber-400' : 'bg-green-500',
          )}
          style={{ width: `${round.totalPicks > 0 ? (possible / round.totalPicks) * 100 : 0}%` }}
        />
      </div>
      <span className={cn('text-[11px] font-semibold tabular-nums shrink-0', color)}>
        {possible}/{round.totalPicks}
      </span>
      {round.maxPossiblePoints > 0 && (
        <span className={cn('text-[10px] font-semibold shrink-0', color)}>
          · {round.maxPossiblePoints} pts
        </span>
      )}
    </div>
  );
}

type Props = {
  health: BracketHealth;
  championPick: KnockoutMatchView | null;
};

export function BracketHealthPanel({ health, championPick }: Props): ReactElement {
  const pct = health.totalPicks > 0 ? (health.alivePicks / health.totalPicks) * 100 : 0;
  const champion = championPick?.pickedWinnerId;

  return (
    <div className="flex flex-col gap-3">
      {/* Health card */}
      <div className="card bg-green-050 border border-green-300 py-3.5 px-4">
        <div className="eyebrow text-green-700 mb-2.5">Bracket health</div>
        <div className="flex items-baseline gap-2 mb-2.5">
          <span className="display text-green-700 text-[44px] leading-none">
            {health.alivePicks}
            <span className="text-[24px] text-green-600">/{health.totalPicks}</span>
          </span>
          <span className="text-[13px] font-bold text-green-700">picks alive</span>
        </div>
        <div className="bar mt-1">
          <i style={{ width: `${pct}%` }} />
        </div>
        {(health.bustedPicks > 0 || health.missedPicks > 0) && (
          <p className="text-[11px] font-semibold mt-2 text-ink-muted">
            {[
              health.bustedPicks > 0 &&
                `${health.bustedPicks} pick${health.bustedPicks !== 1 ? 's' : ''} busted`,
              health.missedPicks > 0 && `${health.missedPicks} missed`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        {health.perRound.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-green-200 flex flex-col gap-1">
            {health.perRound.map((r) => (
              <RoundHealthRow key={r.label} round={r} />
            ))}
          </div>
        )}
      </div>

      {/* Champion pick */}
      {champion && (
        <div className="card py-3 px-3.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span>🏆</span>
            <span className="text-[13px] font-extrabold text-ink">Your champion</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge sm">{champion}</span>
            <span
              className={cn(
                'font-bold text-[13px]',
                championPick.pickStatus === 'alive'
                  ? 'text-green-700'
                  : championPick.pickStatus === 'busted'
                    ? 'text-danger'
                    : 'text-ink-muted',
              )}
            >
              {championPick.pickedWinnerName ?? champion}
              {championPick.pickStatus === 'alive' && ' · still alive'}
              {championPick.pickStatus === 'busted' && ' · eliminated'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
