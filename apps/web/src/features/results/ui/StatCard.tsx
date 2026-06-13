import type { ReactElement } from 'react';

export function StatCard({
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
