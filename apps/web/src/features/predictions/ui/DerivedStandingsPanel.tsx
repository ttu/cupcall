import type { ReactElement } from 'react';
import type { GroupView } from '../domain/types';
import { TeamBadge, Chip } from '@/shared/ui';
import { cn } from '@/shared/ui';

type DerivedEntry = GroupView['derivedOrder'][number];

export function DerivedStandingsPanel({
  derivedOrder,
}: {
  derivedOrder: DerivedEntry[];
}): ReactElement {
  return (
    <div className="card px-[14px] py-3">
      <div className="eyebrow text-ink-muted mb-[10px]">Auto-derived order</div>
      <div className="flex flex-col gap-[3px]">
        {derivedOrder.map((entry, i) => (
          <div
            key={entry.teamId}
            className={cn(
              'flex items-center gap-[7px] py-[5px] px-2 rounded-lg',
              entry.qualifies === 'auto' && 'bg-green-050',
              entry.qualifies === 'best-third' && 'bg-orange-050',
            )}
          >
            <span className="text-[11px] text-ink-muted w-[14px] shrink-0">{i + 1}.</span>
            <TeamBadge teamId={entry.teamId} size="sm" />
            <span className="text-xs font-bold text-ink flex-1 truncate">{entry.teamName}</span>
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
