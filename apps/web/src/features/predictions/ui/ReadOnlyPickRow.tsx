import type { ReactElement } from 'react';
import { TeamBadge, Icon, cn } from '@/shared/ui';

export function ReadOnlyPickRow({
  teamId,
  teamName,
  isPick,
}: {
  teamId: string | null;
  teamName: string;
  isPick: boolean;
}): ReactElement {
  return (
    <div
      className={cn(
        'flex items-center gap-[6px] py-[5px] px-[7px] rounded-[7px]',
        isPick ? 'bg-green-050' : 'bg-transparent',
      )}
    >
      <TeamBadge teamId={teamId} size="sm" />
      <span
        className={cn(
          'flex-1 text-xs font-bold truncate',
          isPick ? 'text-green-700' : teamId ? 'text-ink' : 'text-ink-muted',
        )}
      >
        {teamName}
      </span>
      {isPick && <Icon name="check" size={11} color="var(--green-700)" />}
    </div>
  );
}
