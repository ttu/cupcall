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
    <div className="card p-[14px_16px]">
      <div className="eyebrow text-ink-muted">{label}</div>
      <div className="display text-[30px] mt-[6px]" style={{ color }}>
        {value}
      </div>
      <div className="text-[11.5px] text-ink-muted font-semibold mt-0.5">{sub}</div>
    </div>
  );
}
