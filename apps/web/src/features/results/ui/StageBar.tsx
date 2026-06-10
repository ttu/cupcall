import type { ReactElement } from 'react';
import type { StageProgress } from '../domain/types';

type Props = { stages: StageProgress[] };

const fmt = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });

export function StageBar({ stages }: Props): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 4 }}>
      {stages.map((s, i) => (
        <div
          key={s.key}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 0',
            borderTop: i > 0 ? '1px solid var(--line-soft)' : undefined,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              flexShrink: 0,
              background:
                s.state === 'active'
                  ? 'var(--green-500)'
                  : s.state === 'completed'
                    ? 'var(--green-400)'
                    : 'var(--line)',
            }}
          />
          <span
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: s.state === 'upcoming' ? 500 : 700,
              color: s.state === 'upcoming' ? 'var(--ink-muted)' : 'var(--ink)',
              fontFamily: 'var(--font-ui)',
            }}
          >
            {s.label}
          </span>
          {s.startDate && (
            <span style={{ fontSize: 11, color: 'var(--ink-muted)', fontWeight: 500 }}>
              {fmt.format(s.startDate)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
