import type { ReactElement } from 'react';
import type { PoolArchiveRecap } from '../domain/types';

type Props = { recap: PoolArchiveRecap | null };

function StatRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="font-bold text-sm">{value}</span>
    </li>
  );
}

export function ArchivePoolStatsPanel({ recap }: Props): ReactElement {
  if (!recap || typeof recap.overallAccuracyPercent !== 'number') {
    return (
      <div className="card p-4">
        <span className="section-label">Pool statistics</span>
        <p className="text-xs text-ink-muted mt-2">
          Statistics aren&apos;t available for this archive yet — re-archive to generate them.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4" data-testid="archive-pool-stats-panel">
      <span className="section-label">Pool statistics</span>
      <ul className="mt-3 space-y-2">
        <StatRow label="Overall prediction accuracy" value={`${recap.overallAccuracyPercent}%`} />
        <StatRow
          label="Group stage leader"
          value={
            recap.groupStageLeader
              ? `${recap.groupStageLeader.displayName} (${recap.groupStageLeader.points} pts)`
              : '—'
          }
        />
        <StatRow
          label="Knockout stage leader"
          value={
            recap.knockoutStageLeader
              ? `${recap.knockoutStageLeader.displayName} (${recap.knockoutStageLeader.points} pts)`
              : '—'
          }
        />
      </ul>
    </div>
  );
}
