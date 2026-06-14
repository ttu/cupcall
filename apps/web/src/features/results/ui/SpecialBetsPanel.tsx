import type { ReactElement } from 'react';
import type { SpecialBetResultRow } from '../domain/types';
import { SpecialBetRow } from './SpecialBetRow';

type Props = { specialBets: SpecialBetResultRow[]; viewerMode?: boolean };

export function SpecialBetsPanel({ specialBets, viewerMode = false }: Props): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      {specialBets.map((bet) => (
        <SpecialBetRow key={bet.key} bet={bet} showUserPick={!viewerMode} />
      ))}
    </div>
  );
}
