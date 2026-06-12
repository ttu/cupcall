import type { ReactElement } from 'react';
import type { RaceChartPlayer } from '../domain/types';

const PAD = { l: 44, r: 96, t: 22, b: 38 } as const;
const VIEW_W = 780;
const VIEW_H = 320;
const PLOT_W = VIEW_W - PAD.l - PAD.r;
const PLOT_H = VIEW_H - PAD.t - PAD.b;

export function RaceChart({
  stages,
  nowIndex,
  players,
}: {
  stages: string[];
  nowIndex: number;
  players: RaceChartPlayer[];
}): ReactElement {
  const n = stages.length - 1;
  if (n === 0 || players.length === 0) return <div style={{ height: 160 }} />;

  const allValues = players.flatMap((p) => p.points);
  const rawMax = Math.max(...allValues, 50);
  const yMax = Math.ceil(rawMax / 50) * 50;

  const X = (i: number) => PAD.l + (n > 0 ? (i / n) * PLOT_W : 0);
  const Y = (v: number) => PAD.t + (1 - v / yMax) * PLOT_H;
  const nowX = X(nowIndex);

  const gridLines = buildGridLines(yMax);

  // Declutter end labels: enforce min 15px vertical gap.
  const endLabelGap = 15;
  const byY = players.map((p) => ({ p, y0: Y(p.points[n] ?? 0) })).sort((a, b) => a.y0 - b.y0);
  let prev = -Infinity;
  for (const o of byY) {
    o.y0 = Math.max(o.y0, prev + endLabelGap);
    prev = o.y0;
  }
  const labelY = new Map(byY.map((o) => [o.p.userId, o.y0]));

  const polyPts = (p: RaceChartPlayer, from: number, to: number) =>
    p.points
      .slice(from, to + 1)
      .map((v, k) => `${X(from + k).toFixed(1)},${Y(v).toFixed(1)}`)
      .join(' ');

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      aria-label="Points race chart"
      role="img"
    >
      {/* Projection backdrop */}
      <rect
        x={nowX}
        y={PAD.t}
        width={X(n) - nowX}
        height={PLOT_H}
        fill="var(--surface-2)"
        opacity="0.7"
      />
      {/* NOW / PROJECTED divider */}
      <line
        x1={nowX}
        y1={PAD.t - 4}
        x2={nowX}
        y2={PAD.t + PLOT_H}
        stroke="var(--ink)"
        strokeOpacity="0.2"
        strokeWidth="1.5"
        strokeDasharray="3 4"
      />
      <text
        x={nowX - 6}
        y={PAD.t + 4}
        textAnchor="end"
        fontFamily="Archivo"
        fontSize="10"
        fontWeight="800"
        fill="var(--ink-muted)"
        letterSpacing="1"
      >
        NOW
      </text>
      {nowIndex < n && (
        <text
          x={nowX + 8}
          y={PAD.t + 4}
          textAnchor="start"
          fontFamily="Archivo"
          fontSize="10"
          fontWeight="800"
          fill="var(--orange-600, oklch(0.55 0.16 50))"
          letterSpacing="1"
        >
          PROJECTED
        </text>
      )}

      {/* Grid */}
      {gridLines.map((g) => (
        <g key={g}>
          <line
            x1={PAD.l}
            y1={Y(g)}
            x2={PAD.l + PLOT_W}
            y2={Y(g)}
            stroke="var(--line)"
            strokeWidth="1"
          />
          <text
            x={PAD.l - 8}
            y={Y(g) + 3.5}
            textAnchor="end"
            fontFamily="Archivo"
            fontSize="11"
            fontWeight="700"
            fill="var(--ink-muted)"
          >
            {g}
          </text>
        </g>
      ))}

      {/* X-axis labels */}
      {stages.map((s, i) => (
        <text
          key={s}
          x={X(i)}
          y={VIEW_H - 10}
          textAnchor="middle"
          fontFamily="Archivo"
          fontSize="11"
          fontWeight={i <= nowIndex ? 800 : 600}
          fill={i === nowIndex ? 'var(--ink)' : 'var(--ink-muted)'}
        >
          {s}
        </text>
      ))}

      {/* Player lines (current user last = on top) */}
      {players.map((p) => {
        const lw = p.isCurrentUser ? 3.4 : 2;
        const fy = labelY.get(p.userId) ?? Y(p.points[n] ?? 0);
        const endVal = p.points[n] ?? 0;
        return (
          <g key={p.userId}>
            {/* Actual segment */}
            <polyline
              points={polyPts(p, 0, nowIndex)}
              fill="none"
              stroke={p.color}
              strokeWidth={lw}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Projected segment */}
            {nowIndex < n && (
              <polyline
                points={polyPts(p, nowIndex, n)}
                fill="none"
                stroke={p.color}
                strokeWidth={lw}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="2 6"
                opacity={p.isCurrentUser ? 0.95 : 0.65}
              />
            )}
            {/* Now dot */}
            <circle
              cx={X(nowIndex)}
              cy={Y(p.points[nowIndex] ?? 0)}
              r={p.isCurrentUser ? 5 : 3.5}
              fill="#fff"
              stroke={p.color}
              strokeWidth={p.isCurrentUser ? 3 : 2}
            />
            {/* End dot */}
            {n > nowIndex && (
              <circle
                cx={X(n)}
                cy={Y(p.points[n] ?? 0)}
                r={p.isCurrentUser ? 4 : 3}
                fill={p.color}
                opacity={p.isCurrentUser ? 1 : 0.7}
              />
            )}
            {/* End label */}
            <line
              x1={X(n) + 4}
              y1={Y(endVal)}
              x2={X(n) + 10}
              y2={fy}
              stroke={p.color}
              strokeWidth="1"
              opacity="0.5"
            />
            <text
              x={X(n) + 13}
              y={fy + 4}
              fontFamily="Anton, var(--font-display, sans-serif)"
              fontSize={p.isCurrentUser ? 16 : 13}
              fill={p.color}
            >
              {endVal}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function buildGridLines(yMax: number): number[] {
  const step = yMax <= 200 ? 50 : yMax <= 400 ? 100 : 100;
  const lines: number[] = [];
  for (let v = 0; v <= yMax; v += step) lines.push(v);
  return lines;
}
