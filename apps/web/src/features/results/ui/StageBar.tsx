import type { ReactElement } from 'react';
import type { StageProgress } from '../domain/types';

type Props = { stages: StageProgress[] };

const fmt = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });

export function StageBar({ stages }: Props): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        marginBottom: 24,
        overflowX: 'auto',
        paddingBottom: 4,
      }}
    >
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1] : null;
        const leftFilled = prev != null && prev.state !== 'upcoming';
        const rightFilled = s.state === 'completed';

        return (
          <div
            key={s.key}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              flex: 1,
              minWidth: 72,
            }}
          >
            {/* Connector line + dot row */}
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', marginBottom: 8 }}>
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background:
                    i === 0 ? 'transparent' : leftFilled ? 'var(--green-300)' : 'var(--line)',
                }}
              />
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background:
                    s.state === 'active'
                      ? 'var(--green-500)'
                      : s.state === 'completed'
                        ? 'var(--green-400)'
                        : 'var(--line)',
                  boxShadow: s.state === 'active' ? '0 0 0 3px var(--green-050)' : undefined,
                }}
              />
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background:
                    i === stages.length - 1
                      ? 'transparent'
                      : rightFilled
                        ? 'var(--green-300)'
                        : 'var(--line)',
                }}
              />
            </div>

            {/* Label */}
            <span
              style={{
                fontSize: 11,
                fontWeight: s.state !== 'upcoming' ? 700 : 500,
                color:
                  s.state === 'active'
                    ? 'var(--ink)'
                    : s.state === 'completed'
                      ? 'var(--ink-soft)'
                      : 'var(--ink-muted)',
                fontFamily: 'var(--font-ui)',
                textAlign: 'center',
                lineHeight: 1.3,
              }}
            >
              {s.label}
            </span>

            {/* Date */}
            {s.startDate && (
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--ink-muted)',
                  fontWeight: 500,
                  marginTop: 2,
                  fontFamily: 'var(--font-ui)',
                }}
              >
                {fmt.format(s.startDate)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
