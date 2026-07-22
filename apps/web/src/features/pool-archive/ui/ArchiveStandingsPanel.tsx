import type { ReactElement } from 'react';
import type { Scoring, ScoreBreakdown, UserId } from '@cup/engine';
import type { PoolArchiveEntryView } from '../domain/types';
import { ArchiveStandingRow } from './ArchiveStandingRow';

type Props = {
  entries: PoolArchiveEntryView[];
  currentUserId: UserId | null;
  scoring: Scoring | null;
  categoryMax: ScoreBreakdown | null;
};

export function ArchiveStandingsPanel({
  entries,
  currentUserId,
  scoring,
  categoryMax,
}: Props): ReactElement {
  return (
    <div className="card" data-testid="archive-standings-panel">
      <div className="grid grid-cols-[34px_1fr_auto] gap-3 px-4 pt-3 pb-2 border-b border-line-soft">
        <span />
        <span className="section-label">Final standings</span>
        <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wide">Points</span>
      </div>
      <div className="divide">
        {entries.map((entry, i) => (
          <ArchiveStandingRow
            key={entry.userId ?? entry.displayName}
            entry={entry}
            rank={entry.rank}
            avatarIndex={i}
            isCurrentUser={currentUserId !== null && entry.userId === currentUserId}
            scoring={scoring}
            categoryMax={categoryMax}
          />
        ))}
      </div>
    </div>
  );
}
