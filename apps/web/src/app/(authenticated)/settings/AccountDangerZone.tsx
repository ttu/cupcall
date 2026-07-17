import type { ReactElement } from 'react';
import { deleteAccountAction } from '@/features/auth';
import { DangerZoneCard } from '@/shared/ui';

type Props = { ownedPoolCount: number };

export function AccountDangerZone({ ownedPoolCount }: Props): ReactElement {
  return (
    <DangerZoneCard
      wrapperClassName="p-4.5 rounded-[13px] border border-[oklch(0.85_0.08_25)] bg-[oklch(0.98_0.015_25)]"
      description={
        ownedPoolCount > 0
          ? `Deleting your account is permanent and will also delete ${ownedPoolCount} pool${ownedPoolCount === 1 ? '' : 's'} you own and all their data.`
          : 'Deleting your account is permanent and cannot be undone.'
      }
      actionLabel="Delete account"
      testId="delete-account-btn"
      onConfirm={deleteAccountAction}
    />
  );
}
