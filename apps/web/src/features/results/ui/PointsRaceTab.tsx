'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import { Avatar, Icon } from '@/shared/ui';
import type {
  PointsRaceView,
  RaceChartPlayer,
  ProjectedEntry,
  MatchMatrixEntry,
  MatrixMatch,
  MatchHit,
} from '../domain/types';
import { RaceChart } from './RaceChart';

type RaceSubTab = 'race' | 'by-match';

type Props = { race: PointsRaceView };

export function PointsRaceTab({ race }: Props): ReactElement {
  const [subTab, setSubTab] = useState<RaceSubTab>('race');

  return (
    <div>
      {/* Sub-tab row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['race', 'by-match'] as RaceSubTab[]).map((t) => {
          const active = subTab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setSubTab(t)}
              data-testid={`points-race-subtab-${t}`}
              style={{
                padding: '7px 16px',
                borderRadius: 9,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-ui)',
                fontSize: 13,
                fontWeight: 800,
                background: active ? 'var(--ink-900)' : 'var(--surface)',
                color: active ? '#fff' : 'var(--ink-muted)',
                boxShadow: active ? 'none' : 'inset 0 0 0 1px var(--line)',
                transition: 'background .15s',
              }}
            >
              {t === 'race' ? 'Race' : 'By match'}
            </button>
          );
        })}
      </div>

      {subTab === 'race' && <RaceView race={race} />}
      {subTab === 'by-match' && (
        <MatchMatrix entries={race.matchMatrix} matches={race.matrixMatches} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Race sub-view
// ---------------------------------------------------------------------------

function RaceView({ race }: { race: PointsRaceView }): ReactElement {
  return (
    <div style={{ display: 'grid', gap: 0 }} className="md:grid-cols-[1fr_322px]">
      {/* Left: chart + stat cards */}
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

        {/* Stat cards */}
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
      </div>

      {/* Right rail: projected standings */}
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
          <div style={{ padding: '14px 16px 16px' }}>
            <SwingCard entries={race.projectedEntries} stillLive={race.myStillLive} />
          </div>
        </div>
      </div>
    </div>
  );
}

function projectedSubLabel(entries: ProjectedEntry[]): string {
  const me = entries.find((e) => e.isCurrentUser);
  if (!me) return '';
  if (me.projectedRank === 1) return 'on track for 1st';
  return `enough for ${ordinal(me.projectedRank)} place`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}): ReactElement {
  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div className="eyebrow" style={{ color: 'var(--ink-muted)' }}>
        {label}
      </div>
      <div className="display" style={{ fontSize: 30, color, marginTop: 6 }}>
        {value}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', fontWeight: 600, marginTop: 2 }}>
        {sub}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Projected standings table
// ---------------------------------------------------------------------------

function ProjectedStandings({ entries }: { entries: ProjectedEntry[] }): ReactElement {
  return (
    <div style={{ overflow: 'hidden' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '58px 1fr 64px 76px',
          gap: 8,
          padding: '8px 16px',
          background: 'var(--surface-2)',
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        {(['Now → Fin', 'Player', 'Now', 'Proj.'] as const).map((hd, i) => (
          <span
            key={hd}
            className="eyebrow"
            style={{
              color: 'var(--ink-muted)',
              fontSize: 10,
              textAlign: i >= 2 ? 'right' : 'left',
            }}
          >
            {hd}
          </span>
        ))}
      </div>
      <div className="divide">
        {entries.map((e, idx) => (
          <ProjectedRow key={e.userId} entry={e} avatarIndex={idx} />
        ))}
      </div>
    </div>
  );
}

function ProjectedRow({
  entry,
  avatarIndex,
}: {
  entry: ProjectedEntry;
  avatarIndex: number;
}): ReactElement {
  const { rankDelta, projectedRank, currentPoints, projectedPoints, displayName, isCurrentUser } =
    entry;
  const isTop3 = projectedRank <= 3;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '58px 1fr 64px 76px',
        gap: 8,
        padding: '10px 16px',
        alignItems: 'center',
        background: isCurrentUser ? 'var(--green-050)' : 'transparent',
      }}
    >
      {/* Rank + delta */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span
          className="display"
          style={{
            fontSize: 16,
            color: isTop3 ? 'var(--gold, oklch(0.8 0.14 85))' : 'var(--ink-muted)',
            width: 18,
          }}
        >
          {projectedRank}
        </span>
        {rankDelta !== 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              fontSize: 10,
              fontWeight: 800,
              color: rankDelta > 0 ? 'var(--green-600)' : 'var(--danger, oklch(0.55 0.2 25))',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                transform: rankDelta > 0 ? 'rotate(180deg)' : 'none',
              }}
            >
              <Icon name="chevdown" size={11} stroke={2.8} color="currentColor" />
            </span>
            {Math.abs(rankDelta)}
          </span>
        )}
      </span>

      {/* Name + avatar */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <Avatar name={displayName} index={avatarIndex} size={28} />
        <span
          style={{
            fontWeight: 700,
            fontSize: 13,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: isCurrentUser ? 'var(--green-700)' : 'var(--ink)',
          }}
        >
          {displayName}
        </span>
      </span>

      {/* Current */}
      <span
        className="tnum"
        style={{ textAlign: 'right', fontWeight: 600, fontSize: 13, color: 'var(--ink-muted)' }}
      >
        {currentPoints}
      </span>

      {/* Projected */}
      <span
        className="display tnum"
        style={{
          textAlign: 'right',
          fontSize: 18,
          color: isCurrentUser ? 'var(--green-600)' : 'var(--ink)',
        }}
      >
        {projectedPoints}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Swing card
// ---------------------------------------------------------------------------

function SwingCard({
  entries,
  stillLive,
}: {
  entries: ProjectedEntry[];
  stillLive: number;
}): ReactElement {
  const me = entries.find((e) => e.isCurrentUser);
  const text = buildSwingText(me, entries, stillLive);

  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 13 }}>
        <Icon name="spark" size={15} color="var(--orange-500, oklch(0.65 0.2 55))" />
        The swing
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 8, lineHeight: 1.55 }}>
        {text}
      </p>
    </div>
  );
}

function buildSwingText(
  me: ProjectedEntry | undefined,
  entries: ProjectedEntry[],
  stillLive: number,
): string {
  if (!me) return 'Make predictions to see your projection.';
  if (stillLive === 0) return 'No bracket picks still live — your total is final.';

  const sortedByCurrent = [...entries].sort((a, b) => b.currentPoints - a.currentPoints);
  const myCurrentRank = sortedByCurrent.findIndex((e) => e.isCurrentUser) + 1;

  if (me.projectedRank === 1 && myCurrentRank === 1) {
    return `You're leading and ${stillLive > 0 ? `+${stillLive} pts still live in your bracket` : 'no more picks to play'}.`;
  }
  if (me.rankDelta > 0) {
    const closestRival = entries.find(
      (e) => !e.isCurrentUser && e.projectedRank === me.projectedRank - 1,
    );
    const gap = closestRival ? me.projectedPoints - closestRival.projectedPoints : 0;
    return `Your bracket picks project you to ${ordinal(me.projectedRank)}${closestRival ? `, ${gap} pts clear of ${closestRival.displayName.split(' ')[0]}` : ''}.`;
  }
  if (me.rankDelta < 0) {
    const leader = entries.find((e) => e.projectedRank === 1 && !e.isCurrentUser);
    const gap = leader ? leader.projectedPoints - me.projectedPoints : 0;
    return `You're projected ${ordinal(me.projectedRank)}${leader ? ` — ${gap} pts behind ${leader.displayName.split(' ')[0]}` : ''}. Every result counts.`;
  }
  return `You're holding ${ordinal(me.projectedRank)} — +${stillLive} still live from your bracket picks.`;
}

// ---------------------------------------------------------------------------
// Match matrix
// ---------------------------------------------------------------------------

function MatchMatrix({
  entries,
  matches,
}: {
  entries: MatchMatrixEntry[];
  matches: MatrixMatch[];
}): ReactElement {
  if (matches.length === 0) {
    return (
      <div className="card" style={{ padding: '32px 24px', textAlign: 'center' }}>
        <p style={{ color: 'var(--ink-muted)', fontSize: 14, margin: 0 }}>
          No completed matches yet — come back after the first results are in.
        </p>
      </div>
    );
  }

  // Find the player with the highest totalPoints for the insight line.
  const topPlayer = entries[0];

  const colTemplate = `200px repeat(${matches.length}, 1fr) 64px`;

  return (
    <div>
      <div className="card" style={{ overflow: 'hidden' }}>
        {/* Match header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: colTemplate,
            alignItems: 'center',
            padding: '12px 16px',
            background: 'var(--surface-2)',
            borderBottom: '1px solid var(--line)',
            gap: 4,
          }}
        >
          <span className="eyebrow" style={{ color: 'var(--ink-muted)', fontSize: 10 }}>
            Player
          </span>
          {matches.map((m) => (
            <div
              key={m.matchId}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                fontSize: 11,
              }}
            >
              <span
                style={{ fontWeight: 800, color: 'var(--ink)', fontFamily: 'var(--font-display)' }}
              >
                {m.actualHome}–{m.actualAway}
              </span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink-muted)' }}>
                {m.homeTeamId}·{m.awayTeamId}
              </span>
            </div>
          ))}
          <span
            className="eyebrow"
            style={{ color: 'var(--ink-muted)', fontSize: 10, textAlign: 'right' }}
          >
            Total
          </span>
        </div>

        {/* Player rows */}
        <div className="divide">
          {entries.map((row, idx) => (
            <MatrixRow key={row.userId} row={row} avatarIndex={idx} colTemplate={colTemplate} />
          ))}
        </div>
      </div>

      {/* Insight line */}
      {topPlayer && topPlayer.totalPoints > 0 && (
        <p
          style={{
            fontSize: 12.5,
            color: 'var(--ink-muted)',
            marginTop: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="spark" size={15} color="var(--orange-500, oklch(0.65 0.2 55))" />
          {topPlayer.isCurrentUser ? (
            <>
              You lead the group-stage matrix with{' '}
              <strong style={{ color: 'var(--ink)' }}>{topPlayer.totalPoints} pts</strong>.
            </>
          ) : (
            <>
              <strong style={{ color: 'var(--ink)' }}>{topPlayer.displayName.split(' ')[0]}</strong>{' '}
              leads with {topPlayer.totalPoints} pts from these matches.
            </>
          )}
        </p>
      )}
    </div>
  );
}

function MatrixRow({
  row,
  avatarIndex,
  colTemplate,
}: {
  row: MatchMatrixEntry;
  avatarIndex: number;
  colTemplate: string;
}): ReactElement {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: colTemplate,
        alignItems: 'center',
        padding: '9px 16px',
        background: row.isCurrentUser ? 'var(--green-050)' : 'transparent',
        gap: 4,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <Avatar name={row.displayName} index={avatarIndex} size={30} />
        <span
          style={{
            fontWeight: 700,
            fontSize: 13,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: row.isCurrentUser ? 'var(--green-700)' : 'var(--ink)',
          }}
        >
          {row.displayName}
          {row.isCurrentUser && (
            <span
              className="chip green"
              style={{ height: 18, marginLeft: 7, fontSize: 9.5, verticalAlign: 'middle' }}
            >
              YOU
            </span>
          )}
        </span>
      </span>
      {row.cells.map((cell) => (
        <span key={cell.matchId} style={{ display: 'grid', placeItems: 'center' }}>
          <MatrixCell hit={cell.hit} points={cell.points} />
        </span>
      ))}
      <span
        className="display tnum"
        style={{
          textAlign: 'right',
          fontSize: 18,
          color: row.isCurrentUser ? 'var(--green-600)' : 'var(--ink)',
        }}
      >
        {row.totalPoints}
      </span>
    </div>
  );
}

function MatrixCell({ hit, points }: { hit: MatchHit; points: number }): ReactElement {
  const style: React.CSSProperties =
    hit === 'exact'
      ? {
          background: 'var(--green-500)',
          color: 'oklch(0.2 0.02 160)',
        }
      : hit === 'outcome'
        ? {
            background: 'var(--green-050)',
            color: 'var(--green-700)',
            boxShadow: 'inset 0 0 0 1px var(--green-300)',
          }
        : {
            background: 'var(--surface-2)',
            color: 'var(--ink-muted)',
          };

  return (
    <span
      style={{
        width: 36,
        height: 32,
        borderRadius: 8,
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'var(--font-display)',
        fontSize: 14,
        ...style,
      }}
    >
      {points === 0 ? '·' : points}
    </span>
  );
}
