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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Health card */}
      <div
        className="card"
        style={{
          background: 'var(--green-050)',
          border: '1px solid var(--green-300)',
          padding: '14px 16px',
        }}
      >
        <div className="eyebrow" style={{ color: 'var(--green-700)', marginBottom: 10 }}>
          Bracket health
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
          <span
            className="display"
            style={{ fontSize: 44, color: 'var(--green-700)', lineHeight: 1 }}
          >
            {health.alivePicks}
            <span style={{ fontSize: 24, color: 'var(--green-600)' }}>/{health.totalPicks}</span>
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green-700)' }}>
            picks alive
          </span>
        </div>
        <div className="bar" style={{ marginTop: 4 }}>
          <i style={{ width: `${pct}%` }} />
        </div>
        {health.bustedPicks > 0 && (
          <p style={{ fontSize: 11, fontWeight: 600, marginTop: 8, color: 'var(--ink-muted)' }}>
            {health.bustedPicks} pick{health.bustedPicks !== 1 ? 's' : ''} busted
          </p>
        )}
      </div>

      {/* Champion card */}
      {champion && (
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span>🏆</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>
              Your champion
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="badge sm">{champion}</span>
            <span
              style={{
                fontWeight: 700,
                fontSize: 13,
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
