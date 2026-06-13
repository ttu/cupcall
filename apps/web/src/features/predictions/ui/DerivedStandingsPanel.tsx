import type { ReactElement } from 'react';
import type { GroupView } from '../domain/types';
import { TeamBadge, Chip } from '@/shared/ui';

type DerivedEntry = GroupView['derivedOrder'][number];

export function DerivedStandingsPanel({
  derivedOrder,
}: {
  derivedOrder: DerivedEntry[];
}): ReactElement {
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div className="eyebrow" style={{ color: 'var(--ink-muted)', marginBottom: 10 }}>
        Auto-derived order
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {derivedOrder.map((entry, i) => (
          <div
            key={entry.teamId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '5px 8px',
              borderRadius: 8,
              background:
                entry.qualifies === 'auto'
                  ? 'var(--green-050)'
                  : entry.qualifies === 'best-third'
                    ? 'var(--orange-050)'
                    : undefined,
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--ink-muted)', width: 14, flexShrink: 0 }}>
              {i + 1}.
            </span>
            <TeamBadge teamId={entry.teamId} size="sm" />
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--ink)',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.teamName}
            </span>
            {entry.qualifies === 'auto' && (
              <Chip variant="green" style={{ height: 18, fontSize: 9, padding: '0 6px' }}>
                QUALIFIES
              </Chip>
            )}
            {entry.qualifies === 'best-third' && (
              <Chip variant="orange" style={{ height: 18, fontSize: 9, padding: '0 6px' }}>
                QUALIFIES
              </Chip>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
