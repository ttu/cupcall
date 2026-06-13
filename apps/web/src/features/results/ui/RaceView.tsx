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
    <div style={{ display: 'grid', gap: 0 }} className="md:grid-cols-[1fr_322px]">
      <div style={{ padding: '0 0 24px' }}>
        <div className="card" style={{ padding: '18px 20px 8px', marginBottom: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <RaceLegend players={race.chartPlayers} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <StatCard
              label="Banked so far"
              value={String(race.myBanked)}
              sub="your actual points scored"
              color="var(--ink)"
            />
            <StatCard
              label="Still live"
              value={`+${race.myStillLive}`}
              sub="if surviving picks hold"
              color={race.myStillLive > 0 ? 'var(--green-600)' : 'var(--ink-muted)'}
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

      <div
        style={{
          borderLeft: '1px solid var(--line)',
          padding: '0 0 24px 22px',
          background: 'transparent',
        }}
        className="md:bg-surface-2 md:pl-22"
      >
        <div
          style={{
            background: 'var(--surface-2)',
            borderRadius: 12,
            padding: '16px 0 0',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '0 18px 12px' }}>
            <div className="section-label" style={{ marginBottom: 4 }}>
              Projected final table
            </div>
            <p
              style={{
                fontSize: 12,
                color: 'var(--ink-muted)',
                margin: '6px 0 0',
                lineHeight: 1.5,
              }}
            >
              If every surviving bracket pick lands. Updates after each result.
            </p>
          </div>
          <ProjectedStandings entries={race.projectedEntries} />
          {!viewerMode && (
            <div style={{ padding: '14px 16px 16px' }}>
              <SwingCard entries={race.projectedEntries} stillLive={race.myStillLive} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RaceLegend({ players }: { players: RaceChartPlayer[] }): ReactElement {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap' }}>
      {players.map((p) => (
        <span
          key={p.userId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11.5,
            fontWeight: p.isCurrentUser ? 800 : 700,
            color: p.isCurrentUser ? 'var(--ink)' : 'var(--ink-soft, var(--ink-muted))',
          }}
        >
          <span
            style={{
              width: 14,
              height: p.isCurrentUser ? 4 : 3,
              borderRadius: 2,
              background: p.color,
              flexShrink: 0,
            }}
          />
          {p.isCurrentUser ? 'You' : p.displayName.split(' ')[0]}
        </span>
      ))}
    </span>
  );
}

function LegendKey({ solid, label }: { solid: boolean; label: string }): ReactElement {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11.5,
        fontWeight: 700,
        color: 'var(--ink-muted)',
      }}
    >
      <span
        style={{
          width: 16,
          height: 3,
          borderRadius: 2,
          background: solid
            ? 'var(--ink-muted)'
            : 'repeating-linear-gradient(90deg,var(--ink-muted) 0 2px,transparent 2px 6px)',
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}
