import type { ReactElement } from 'react';
import type { GroupResultView } from '../domain/types';
import { HitChip } from './HitChip';

type Props = { group: GroupResultView };

export function GroupMatchFeed({ group }: Props): ReactElement {
  if (group.completedMatches.length === 0) {
    return (
      <p className="text-sm py-4 text-center" style={{ color: 'var(--ink-muted)' }}>
        No results yet for Group {group.groupId}
      </p>
    );
  }

  return (
    <div
      className="rounded-[var(--radius)] overflow-hidden"
      style={{
        background: 'var(--surface)',
        boxShadow: 'var(--shadow-sm)',
        border: '1px solid var(--line-soft)',
      }}
    >
      <div className="divide">
        {group.completedMatches.map((m) => (
          <div
            key={m.matchId}
            className="grid items-center gap-2 px-3 py-3"
            style={{ gridTemplateColumns: '32px 1fr auto 1fr auto' }}
          >
            {/* Group badge */}
            <span
              className="inline-flex items-center justify-center rounded-lg text-[11px] font-bold"
              style={{
                height: 24,
                width: 28,
                background: 'var(--surface-2)',
                color: 'var(--ink-muted)',
                boxShadow: 'inset 0 0 0 1px var(--line)',
              }}
            >
              {m.groupId}
            </span>

            {/* Home team */}
            <div className="flex items-center justify-end gap-2">
              <span
                className="text-sm font-bold truncate"
                style={{ color: m.actualHome > m.actualAway ? 'var(--ink)' : 'var(--ink-muted)' }}
              >
                {m.homeTeamName}
              </span>
            </div>

            {/* Score + prediction */}
            <div className="flex flex-col items-center gap-0.5">
              <span
                className="font-black tabular-nums"
                style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink)' }}
              >
                {m.actualHome}
                <span style={{ color: 'var(--ink-muted)', margin: '0 3px', fontSize: 14 }}>–</span>
                {m.actualAway}
              </span>
              {m.predictedHome !== null && (
                <span className="text-[10.5px] font-semibold" style={{ color: 'var(--ink-muted)' }}>
                  you {m.predictedHome}–{m.predictedAway}
                </span>
              )}
            </div>

            {/* Away team */}
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-bold truncate"
                style={{ color: m.actualAway > m.actualHome ? 'var(--ink)' : 'var(--ink-muted)' }}
              >
                {m.awayTeamName}
              </span>
            </div>

            {/* Hit chip */}
            <div className="flex justify-end">
              <HitChip hit={m.hit} points={m.pointsAwarded} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
