import type { ReactElement } from 'react';
import type { SpecialBetResultRow } from '../domain/types';
import { SpecialBetRow } from './SpecialBetRow';

type Props = { specialBets: SpecialBetResultRow[]; viewerMode?: boolean };

export function SpecialBetsPanel({ specialBets, viewerMode = false }: Props): ReactElement {
  const totalAwarded = specialBets.reduce((sum, b) => sum + b.pointsAwarded, 0);
  const totalPossible = specialBets.reduce((sum, b) => sum + b.points, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-[14px_16px] flex items-baseline gap-2">
        <span className="display tnum text-[36px] text-ink leading-none">{totalAwarded}</span>
        <span className="text-[13px] font-bold text-ink-muted">/ {totalPossible} pts</span>
      </div>

      <div className="flex flex-col gap-2">
        {specialBets.map((bet) => (
          <SpecialBetRow key={bet.key} bet={bet} showUserPick={!viewerMode} />
        ))}
      </div>
    </div>
  );
}
