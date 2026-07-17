import type { ReactElement, ReactNode } from 'react';
import { Icon } from '@/shared/ui';

/** Title block shared by the owner/member and view-only pool pages. */
export function PoolHeader({
  eyebrow,
  name,
  tournamentName,
  locked,
}: {
  eyebrow: ReactNode;
  name: string;
  tournamentName: string;
  locked: boolean;
}): ReactElement {
  return (
    <div className="mb-6">
      <div className="eyebrow text-ink-muted mb-2.5">{eyebrow}</div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-[34px] m-0">{name}</h1>
          <div className="eyebrow text-ink-muted mt-1">{tournamentName}</div>
        </div>
        {locked && (
          <span className="pill-lock">
            <Icon name="lock" size={14} />
            Locked
          </span>
        )}
      </div>
    </div>
  );
}
