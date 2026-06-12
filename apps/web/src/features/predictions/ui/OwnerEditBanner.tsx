import type { ReactElement } from 'react';
import { Icon, Chip } from '@/shared/ui';

type Props = {
  memberName?: string;
};

export function OwnerEditBanner({ memberName }: Props): ReactElement {
  const label = memberName
    ? `Owner mode — editing ${memberName}'s card. Logged.`
    : 'Owner mode — editing your own card. Logged.';

  return (
    <div
      role="status"
      style={{
        background: 'var(--ink-900)',
        color: 'var(--on-dark)',
        padding: '11px 34px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}
    >
      <span
        style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, fontWeight: 700 }}
      >
        <Icon name="edit" size={15} color="var(--orange-400)" />
        {label}
      </span>
      <Chip variant="dark">
        <Icon name="history" size={12} />
        View audit log
      </Chip>
    </div>
  );
}
