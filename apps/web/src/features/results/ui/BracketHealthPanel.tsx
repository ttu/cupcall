import type { ReactElement } from 'react';
import type { BracketHealth, KnockoutMatchView } from '../domain/types';
import { cn } from '@/shared/ui';

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
        {health.bustedPicks > 0 && (
          <p className="text-[11px] font-semibold mt-2 text-ink-muted">
            {health.bustedPicks} pick{health.bustedPicks !== 1 ? 's' : ''} busted
          </p>
        )}
      </div>

      {/* Champion card */}
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
