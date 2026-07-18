import type { ReactElement } from 'react';
import type { Scoring } from '@cup/engine';
import { ScoreBreakdownCard } from '@/features/results';
import type { PoolArchiveEntryView } from '../domain/types';

type Props = { entry: PoolArchiveEntryView; scoring: Scoring | null };

export function ArchiveMemberRow({ entry, scoring }: Props): ReactElement {
  return (
    <div className="card p-4" data-testid="archive-member-row">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="display text-[20px] text-ink-muted">#{entry.rank}</span>
          <span className="font-bold text-ink">{entry.displayName}</span>
        </div>
        <span className="display text-[20px] text-ink">{entry.pointsTotal} pts</span>
      </div>
      <ScoreBreakdownCard breakdown={entry.breakdown} scoring={scoring} />
    </div>
  );
}
