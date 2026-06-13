import type { ReactElement } from 'react';
import type { SpecialBetResultRow } from '../domain/types';
import { SpecialBetRow } from './SpecialBetRow';

type Props = { specialBets: SpecialBetResultRow[]; viewerMode?: boolean };

export function SpecialBetsPanel({ specialBets, viewerMode = false }: Props): ReactElement {
  const totalAwarded = specialBets.reduce((sum, b) => sum + b.pointsAwarded, 0);
  const totalPossible = specialBets.reduce((sum, b) => sum + b.points, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        className="card"
        style={{ padding: '14px 16px', display: 'flex', alignItems: 'baseline', gap: 8 }}
      >
        <span className="display tnum" style={{ fontSize: 36, color: 'var(--ink)', lineHeight: 1 }}>
          {totalAwarded}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-muted)' }}>
          / {totalPossible} pts
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {specialBets.map((bet) => (
          <SpecialBetRow key={bet.key} bet={bet} showUserPick={!viewerMode} />
        ))}
      </div>
    </div>
  );
}
