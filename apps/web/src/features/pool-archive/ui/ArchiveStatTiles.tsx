import type { ReactElement } from 'react';
import type { PoolArchiveRecap } from '../domain/types';

type Props = { matchesPlayed: number; recap: PoolArchiveRecap | null };

function Tile({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="card p-4">
      <div className="eyebrow text-ink-muted">{label}</div>
      <div className="display text-[20px] mt-1">{value}</div>
    </div>
  );
}

export function ArchiveStatTiles({ matchesPlayed, recap }: Props): ReactElement {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="archive-stat-tiles">
      <Tile label="Matches played" value={String(matchesPlayed)} />
      <Tile label="Predictions made" value={recap ? recap.predictionsMade.toLocaleString() : '—'} />
      <Tile label="Pool exact-score rate" value={recap ? `${recap.exactScoreRatePercent}%` : '—'} />
      <Tile
        label="Biggest upset called"
        value={
          recap?.biggestUpset
            ? `${recap.biggestUpset.winnerTeam} over ${recap.biggestUpset.loserTeam}`
            : '—'
        }
      />
    </div>
  );
}
