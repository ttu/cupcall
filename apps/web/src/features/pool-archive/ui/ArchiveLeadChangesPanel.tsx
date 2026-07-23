import type { ReactElement } from 'react';
import type { LeadChangeEvent } from '../domain/types';

type Props = { leadChanges: LeadChangeEvent[] };

export function ArchiveLeadChangesPanel({ leadChanges }: Props): ReactElement | null {
  if (leadChanges.length === 0) return null;

  return (
    <div className="card p-4" data-testid="archive-lead-changes-panel">
      <span className="section-label">Lead changes</span>
      <ul className="mt-3 space-y-3">
        {leadChanges.map((event) => (
          <li key={event.stageIndex} className="space-y-1.5">
            <span className="flex gap-1.5">
              <span className="chip">{event.stageName}</span>
              {event.stageLabel && <span className="chip">{event.stageLabel}</span>}
            </span>
            <div>
              <div className="font-bold text-sm">{event.leaderDisplayName} takes the lead</div>
              <p className="text-xs text-ink-muted">
                {event.reason ?? `${event.pointsAtStage} pts at ${event.stageName}`}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
