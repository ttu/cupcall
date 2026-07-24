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

type TopCountry = {
  position: 1 | 2 | 3;
  teamId: string;
  teamName: string;
};

type TopEntry = {
  rank: number;
  displayName: string;
  points: number;
  isCurrentUser: boolean;
};

type Props = {
  final: FinalResult | null;
  topThree: TopCountry[];
  topEntries: TopEntry[];
};

export function ArchiveHeroCard({ final, topThree, topEntries }: Props): ReactElement {
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

  const topPredictor = topEntries[0] ?? null;
  const restPredictors = topEntries.slice(1);

  return (
    <div className="rounded-cup turf text-on-dark" data-testid="archive-hero-card">
      {champion && runnerUp ? (
        <div className="flex flex-col items-center gap-2 py-8 px-6">
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
          {topThree.length > 0 && (
            <div className="flex items-center gap-6 mt-2 text-sm text-on-dark/80">
              {topThree.map((country) => (
                <div key={country.teamId} className="flex items-center gap-1.5">
                  <span className="text-xs text-on-dark/50 font-medium">{country.position}</span>
                  <TeamBadge teamId={country.teamId} size="sm" />
                  <span>{country.teamName}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-on-dark/70 py-8 px-6 text-center">
          Final result not yet available.
        </p>
      )}

      {topPredictor && (
        <>
          <div className="border-t border-on-dark/20" />
          <div className="flex flex-col items-center gap-2 py-8 px-6">
            <span className="eyebrow text-on-dark/60">Top Predictor</span>
            <span className="display text-[28px]">{topPredictor.displayName.toUpperCase()}</span>
            <span className="text-sm font-medium uppercase tracking-wide text-on-dark/70">
              {topPredictor.points} PTS
            </span>
            {restPredictors.length > 0 && (
              <div className="mt-1 flex items-center gap-6 text-sm text-on-dark/80">
                {restPredictors.map((entry) => (
                  <div key={entry.rank} className="flex items-center gap-1.5">
                    <span className="text-xs text-on-dark/50 font-medium">{entry.rank}</span>
                    <span>{entry.isCurrentUser ? 'You' : entry.displayName}</span>
                    <span className="tnum font-bold">{entry.points}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
