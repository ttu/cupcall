import type { ReactElement } from 'react';
import { TeamBadge, Icon } from '@/shared/ui';

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
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 7px',
        borderRadius: 7,
        background: isPick ? 'var(--green-050)' : 'transparent',
      }}
    >
      <TeamBadge teamId={teamId} size="sm" />
      <span
        style={{
          flex: 1,
          fontSize: 12,
          fontWeight: 700,
          color: isPick ? 'var(--green-700)' : teamId ? 'var(--ink)' : 'var(--ink-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {teamName}
      </span>
      {isPick && <Icon name="check" size={11} color="var(--green-700)" />}
    </div>
  );
}
