import type { ReactElement } from 'react';
import type { FinalScenarioOutcome, FinalScenarioView } from '../domain/final-scenario';
import { TeamBadge, cn } from '@/shared/ui';

export function FinalScenarioCard({
  scenario,
}: {
  scenario: FinalScenarioView;
}): ReactElement | null {
  if (scenario === null) return null;

  return (
    <div className="card p-[18px_20px] mb-4">
      <div className="section-label mb-3">If the Final goes either way…</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ScenarioColumn
          teamId={scenario.homeTeamId}
          teamName={scenario.homeTeamName}
          outcome={scenario.home}
        />
        <ScenarioColumn
          teamId={scenario.awayTeamId}
          teamName={scenario.awayTeamName}
          outcome={scenario.away}
        />
      </div>
    </div>
  );
}

function ScenarioColumn({
  teamId,
  teamName,
  outcome,
}: {
  teamId: string;
  teamName: string;
  outcome: FinalScenarioOutcome;
}): ReactElement {
  return (
    <div className="rounded-xl bg-surface-2 p-[14px_16px]">
      <div className="flex items-center gap-2 mb-2">
        <TeamBadge teamId={teamId} size="sm" />
        <span className="text-[12px] font-extrabold text-ink-muted uppercase tracking-[0.08em]">
          If {teamName} win
        </span>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="display text-[20px] text-gold">{outcome.projectedWinnerDisplayName}</span>
        <span className="tnum text-[13px] font-bold text-ink-muted">
          {outcome.projectedPoints} pts
        </span>
      </div>
      <ScenarioStatus outcome={outcome} />
    </div>
  );
}

function ScenarioStatus({ outcome }: { outcome: FinalScenarioOutcome }): ReactElement {
  if (outcome.status === 'clinched') {
    return (
      <span className={cn('chip text-[11px] font-extrabold text-green-700 bg-green-050')}>
        Already clinched
      </span>
    );
  }

  const intro = outcome.status === 'too-close' ? 'Too close to call — also needs:' : 'Still needs:';

  return (
    <div>
      <p className="text-[11px] font-bold text-ink-muted mb-1">{intro}</p>
      <ul className="flex flex-col gap-1">
        {outcome.mustHit.map((item) => (
          <li
            key={item.label}
            className="flex items-center justify-between text-[12px] font-semibold text-ink"
          >
            <span>{item.label}</span>
            <span className="tnum text-ink-muted">+{item.points}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
