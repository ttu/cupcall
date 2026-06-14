import type { ReactElement, ReactNode } from 'react';

type Props = {
  title: ReactNode;
  children: ReactNode;
};

export function TurfCard({ title, children }: Props): ReactElement {
  return (
    <div className="rounded-cup border border-line bg-white shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="px-4 py-2.5 turf">
        <span className="text-sm font-bold tracking-widest uppercase text-on-dark font-cup-display">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}
