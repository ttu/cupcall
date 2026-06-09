import type { ReactElement } from 'react';
import type { StageProgress } from '../domain/types';

type Props = { stages: StageProgress[] };

export function StageBar({ stages }: Props): ReactElement {
  return (
    <div className="flex items-center gap-0 mt-2">
      {stages.map((s, i) => (
        <div key={s.key} className="flex items-center">
          <div className="flex items-center gap-2">
            <span
              className="flex-none rounded-full"
              style={{
                width: 11,
                height: 11,
                background:
                  s.state === 'active'
                    ? 'var(--green-500)'
                    : s.state === 'completed'
                      ? 'var(--green-400)'
                      : 'var(--line)',
                boxShadow: s.state === 'active' ? '0 0 0 4px var(--green-050)' : 'none',
              }}
            />
            <div style={{ lineHeight: 1.15 }}>
              <div
                className="text-[13px] font-black whitespace-nowrap"
                style={{
                  fontFamily: 'var(--font-display)',
                  color: s.state === 'upcoming' ? 'var(--ink-muted)' : 'var(--ink)',
                }}
              >
                {s.label}
              </div>
              {s.state === 'active' && (
                <div
                  className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                  style={{ color: 'var(--green-600)' }}
                >
                  Now
                </div>
              )}
            </div>
          </div>
          {i < stages.length - 1 && (
            <span
              className="flex-1 mx-3"
              style={{
                height: 2,
                minWidth: 20,
                background: s.state !== 'upcoming' ? 'var(--green-300)' : 'var(--line)',
                borderRadius: 2,
                marginBottom: 14,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
