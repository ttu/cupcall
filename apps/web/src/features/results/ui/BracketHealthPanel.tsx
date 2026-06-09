import type { ReactElement } from 'react';
import type { BracketHealth, KnockoutMatchView } from '../domain/types';

type Props = {
  health: BracketHealth;
  championPick: KnockoutMatchView | null;
};

export function BracketHealthPanel({ health, championPick }: Props): ReactElement {
  const pct = health.totalPicks > 0 ? (health.alivePicks / health.totalPicks) * 100 : 0;
  const champion = championPick?.pickedWinnerId;

  return (
    <div className="space-y-4">
      {/* Health card */}
      <div
        className="rounded-[var(--radius)] p-4"
        style={{ background: 'var(--green-050)', border: '1px solid var(--green-300)' }}
      >
        <div
          className="text-[10px] font-bold uppercase tracking-wider mb-2"
          style={{ color: 'var(--green-700)' }}
        >
          Bracket health
        </div>
        <div className="flex items-baseline gap-2 mb-3">
          <span
            className="font-black"
            style={{ fontFamily: 'var(--font-display)', fontSize: 40, color: 'var(--green-700)' }}
          >
            {health.alivePicks}
            <span style={{ fontSize: 22, color: 'var(--green-600)' }}>/{health.totalPicks}</span>
          </span>
          <span className="text-sm font-bold" style={{ color: 'var(--green-700)' }}>
            picks alive
          </span>
        </div>
        <div
          className="rounded-full overflow-hidden"
          style={{ height: 6, background: 'var(--green-300)' }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: 'var(--green-500)' }}
          />
        </div>
        {health.bustedPicks > 0 && (
          <p className="text-[11px] font-semibold mt-2" style={{ color: 'var(--ink-muted)' }}>
            {health.bustedPicks} pick{health.bustedPicks !== 1 ? 's' : ''} busted
          </p>
        )}
      </div>

      {/* Champion card */}
      {champion && (
        <div
          className="rounded-[var(--radius)] px-4 py-3"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line-soft)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span>🏆</span>
            <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
              Your champion
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center rounded text-[9px] font-black"
              style={{
                width: 26,
                height: 18,
                background: 'var(--surface-2)',
                color: 'var(--ink-soft)',
                boxShadow: 'inset 0 0 0 1px var(--line)',
                fontFamily: 'var(--font-display)',
              }}
            >
              {champion}
            </span>
            <span
              className="font-bold text-sm"
              style={{
                color:
                  championPick.pickStatus === 'alive'
                    ? 'var(--green-700)'
                    : championPick.pickStatus === 'busted'
                      ? 'var(--danger)'
                      : 'var(--ink-muted)',
              }}
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
