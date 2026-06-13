import type { ReactElement } from 'react';
import type { ProjectedEntry } from '../domain/types';
import { Icon } from '@/shared/ui';

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function projectedSubLabel(entries: ProjectedEntry[]): string {
  const me = entries.find((e) => e.isCurrentUser);
  if (!me) return '';
  if (me.projectedRank === 1) return 'on track for 1st';
  return `enough for ${ordinal(me.projectedRank)} place`;
}

export function ProjectedStandings({ entries }: { entries: ProjectedEntry[] }): ReactElement {
  return (
    <div style={{ overflow: 'hidden' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '44px 1fr 52px 64px',
          gap: 6,
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
        {entries.map((e) => (
          <ProjectedRow key={e.userId} entry={e} />
        ))}
      </div>
    </div>
  );
}

function ProjectedRow({ entry }: { entry: ProjectedEntry }): ReactElement {
  const { rankDelta, projectedRank, currentPoints, projectedPoints, displayName, isCurrentUser } =
    entry;
  const isTop3 = projectedRank <= 3;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '44px 1fr 52px 64px',
        gap: 6,
        padding: '10px 16px',
        alignItems: 'center',
        background: isCurrentUser ? 'var(--green-050)' : 'transparent',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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

      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontWeight: 700,
            fontSize: 13,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: isCurrentUser ? 'var(--green-700)' : 'var(--ink)',
          }}
        >
          {isCurrentUser ? 'You' : displayName.split(' ')[0]}
        </span>
        {!isCurrentUser && displayName.split(' ')[1] && (
          <span
            style={{
              display: 'block',
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--ink-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {displayName.split(' ').slice(1).join(' ')}
          </span>
        )}
      </span>

      <span
        className="tnum"
        style={{ textAlign: 'right', fontWeight: 600, fontSize: 13, color: 'var(--ink-muted)' }}
      >
        {currentPoints}
      </span>

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
