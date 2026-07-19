import type { ReactElement } from 'react';
import { TeamBadge, Icon } from '@/shared/ui';

type FinalResult = {
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  homeGoals: number;
  awayGoals: number;
  winnerTeamId: string;
};

type Props = {
  poolName: string;
  tournamentName: string;
  archivedAt: Date;
  final: FinalResult | null;
};

export function ArchiveHeroCard({
  poolName,
  tournamentName,
  archivedAt,
  final,
}: Props): ReactElement {
  const champion =
    final && final.winnerTeamId === final.homeTeamId
      ? { teamId: final.homeTeamId, name: final.homeTeamName, goals: final.homeGoals }
      : final
        ? { teamId: final.awayTeamId, name: final.awayTeamName, goals: final.awayGoals }
        : null;
  const runnerUp =
    final && final.winnerTeamId === final.homeTeamId
      ? { teamId: final.awayTeamId, name: final.awayTeamName, goals: final.awayGoals }
      : final
        ? { teamId: final.homeTeamId, name: final.homeTeamName, goals: final.homeGoals }
        : null;

  return (
    <div className="rounded-cup turf p-6 text-on-dark" data-testid="archive-hero-card">
      <div className="flex items-center justify-between text-xs text-on-dark/70 mb-4">
        <span>
          Archived · {archivedAt.toLocaleDateString()} · {poolName}
        </span>
        <span>{tournamentName}</span>
      </div>

      {champion && runnerUp ? (
        <div className="flex flex-col items-center gap-2 py-4">
          <Icon name="trophy" size={32} color="var(--orange-500)" />
          <span className="eyebrow text-orange-400">Champion</span>
          <div className="flex items-center gap-2.5">
            <TeamBadge teamId={champion.teamId} size="lg" />
            <span className="display text-[28px]">{champion.name}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-on-dark/80">
            <TeamBadge teamId={champion.teamId} size="sm" />
            <span className="tnum">{champion.goals}</span>
            <span>–</span>
            <span className="tnum">{runnerUp.goals}</span>
            <TeamBadge teamId={runnerUp.teamId} size="sm" />
            <span>{runnerUp.name}</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-on-dark/70 py-4 text-center">Final result not yet available.</p>
      )}
    </div>
  );
}
