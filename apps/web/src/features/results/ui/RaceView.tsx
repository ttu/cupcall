'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import type {
  PointsRaceView,
  RaceChartPlayer,
  ScoreBreakdown,
  Scoring,
  LeaderboardEntry,
} from '../domain/types';
import type { UserId } from '@cup/engine';
import { deriveTopByCategory } from './score-breakdown-utils';
import { cn } from '@/shared/ui';
import { RaceChart } from './RaceChart';
import { StatCard } from './StatCard';
import { ProjectedStandings, projectedSubLabel } from './ProjectedStandings';
import { SwingCard } from './SwingCard';
import { ScoreBreakdownCard } from './ScoreBreakdownCard';
import { FinalScenarioCard } from './FinalScenarioCard';
import { sliceToWindow, visibleZoomOptions, type ZoomDays } from './race-view-utils';

const ZOOM_LABELS: Record<string, string> = {
  all: 'All',
  '14': '14d',
  '7': '7d',
  '5': '5d',
};

export function RaceView({
  race,
  viewerMode,
  userBreakdown,
  scoring,
  leaderboard,
  currentUserId,
}: {
  race: PointsRaceView;
  viewerMode: boolean;
  userBreakdown: ScoreBreakdown | null;
  scoring: Scoring | null;
  leaderboard?: LeaderboardEntry[];
  currentUserId?: UserId;
}): ReactElement {
  const [zoomDays, setZoomDays] = useState<ZoomDays>('all');

  const topByCategory = leaderboard ? deriveTopByCategory(leaderboard, currentUserId) : undefined;

  // Strip projected stage — chartNowIndex is the last actual stage.
  const actualStages = race.chartStages.slice(0, race.chartNowIndex + 1);
  const actualPlayers: RaceChartPlayer[] = race.chartPlayers.map((p) => ({
    ...p,
    points: p.points.slice(0, race.chartNowIndex + 1),
  }));

  const { stages, players, nowIndex } = sliceToWindow(
    actualStages,
    actualPlayers,
    race.chartNowIndex,
    zoomDays,
  );

  const zoomOptions = visibleZoomOptions(race.chartNowIndex);

  return (
    <div className="grid gap-0 md:grid-cols-[1fr_322px]">
      <div className="pb-6">
        <FinalScenarioCard scenario={race.finalScenario} />
        <div className="card p-[18px_20px_8px] mb-4">
          <div className="flex items-center justify-between mb-2.5 gap-3.5 flex-wrap">
            <RaceLegend players={race.chartPlayers} />
            {zoomOptions.length > 1 && (
              <span className="flex items-center gap-1.5 shrink-0">
                {zoomOptions.map((opt) => {
                  const active = zoomDays === opt;
                  return (
                    <button
                      key={String(opt)}
                      type="button"
                      onClick={() => setZoomDays(opt)}
                      data-testid={`race-zoom-${opt}`}
                      className={cn(
                        'py-1 px-2.5 rounded-cup-sm border-0 cursor-pointer font-cup-ui text-[11px] font-extrabold transition-[background]',
                        active
                          ? 'bg-ink-900 text-white shadow-none'
                          : 'bg-surface text-ink-muted shadow-[inset_0_0_0_1px_var(--line)]',
                      )}
                    >
                      {ZOOM_LABELS[String(opt)] ?? String(opt)}
                    </button>
                  );
                })}
              </span>
            )}
          </div>
          <RaceChart stages={stages} nowIndex={nowIndex} players={players} />
        </div>

        {!viewerMode && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="Banked so far"
                value={String(race.myBanked)}
                sub="your actual points scored"
                color="var(--ink)"
              />
              <StatCard
                label="Still available"
                value={`+${race.myTotalCanStillGet}`}
                sub="max pts still attainable"
                color={race.myTotalCanStillGet > 0 ? 'var(--green-600)' : 'var(--ink-muted)'}
              />
              <StatCard
                label="Projected total"
                value={String(race.myProjected)}
                sub={projectedSubLabel(race.projectedEntries)}
                color={race.myStillLive > 0 ? 'var(--green-600)' : 'var(--ink)'}
              />
            </div>
            {userBreakdown && (
              <ScoreBreakdownCard
                breakdown={userBreakdown}
                scoring={scoring}
                {...(topByCategory !== undefined && { topByCategory })}
              />
            )}
          </>
        )}
      </div>

      <ProjectedFinalSidebar
        entries={race.projectedEntries}
        myStillLive={race.myStillLive}
        viewerMode={viewerMode}
      />
    </div>
  );
}

function ProjectedFinalSidebar({
  entries,
  myStillLive,
  viewerMode,
}: {
  entries: PointsRaceView['projectedEntries'];
  myStillLive: number;
  viewerMode: boolean;
}): ReactElement {
  return (
    <div className="border-l border-line pb-6 pl-5.5 bg-transparent md:bg-surface-2">
      <div className="bg-surface-2 rounded-xl pt-4 overflow-hidden">
        <div className="px-4.5 pb-3">
          <div className="section-label mb-1">Projected final table</div>
          <p className="text-xs text-ink-muted mt-1.5 leading-[1.5] m-0">
            If every surviving bracket pick lands. Updates after each result.
          </p>
        </div>
        <ProjectedStandings entries={entries} />
        {!viewerMode && (
          <div className="p-[14px_16px_16px]">
            <SwingCard entries={entries} stillLive={myStillLive} />
          </div>
        )}
      </div>
    </div>
  );
}

function RaceLegend({ players }: { players: RaceChartPlayer[] }): ReactElement {
  return (
    <span className="flex items-center gap-[13px] flex-wrap">
      {players.map((p) => (
        <span
          key={p.userId}
          className={
            p.isCurrentUser
              ? 'flex items-center gap-1.5 text-[11.5px] font-extrabold text-ink'
              : 'flex items-center gap-1.5 text-[11.5px] font-bold text-ink-soft'
          }
        >
          <span
            className="w-3.5 rounded-[2px] shrink-0"
            style={{ height: p.isCurrentUser ? 4 : 3, background: p.color }}
          />
          {p.isCurrentUser ? 'You' : p.displayName.split(' ')[0]}
        </span>
      ))}
    </span>
  );
}
