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
      className="bg-ink-900 text-on-dark py-[11px] px-8.5 flex items-center justify-between flex-wrap gap-3"
    >
      <span className="flex items-center gap-2.5 text-[13px] font-bold">
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
