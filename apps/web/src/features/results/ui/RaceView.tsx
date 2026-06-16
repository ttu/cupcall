import type { ReactElement } from 'react';
import type { PointsRaceView, RaceChartPlayer } from '../domain/types';
import { RaceChart } from './RaceChart';
import { StatCard } from './StatCard';
import { ProjectedStandings, projectedSubLabel } from './ProjectedStandings';
import { SwingCard } from './SwingCard';

export function RaceView({
  race,
  viewerMode,
}: {
  race: PointsRaceView;
  viewerMode: boolean;
}): ReactElement {
  return (
    <div className="grid gap-0 md:grid-cols-[1fr_322px]">
      <div className="pb-6">
        <div className="card p-[18px_20px_8px] mb-4">
          <div className="flex items-center justify-between mb-2.5 gap-3.5 flex-wrap">
            <RaceLegend players={race.chartPlayers} />
            <span className="flex items-center gap-3.5 shrink-0">
              <LegendKey solid label="Actual" />
              <LegendKey solid={false} label="Projected" />
            </span>
          </div>
          <RaceChart
            stages={race.chartStages}
            nowIndex={race.chartNowIndex}
            players={race.chartPlayers}
          />
        </div>

        {!viewerMode && (
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

function LegendKey({ solid, label }: { solid: boolean; label: string }): ReactElement {
  return (
    <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-ink-muted">
      <span
        className="w-4 h-[3px] rounded-[2px] shrink-0"
        style={{
          background: solid
            ? 'var(--ink-muted)'
            : 'repeating-linear-gradient(90deg,var(--ink-muted) 0 2px,transparent 2px 6px)',
        }}
      />
      {label}
    </span>
  );
}
