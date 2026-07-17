'use client';

import type { ReactElement } from 'react';
import { deletePool } from '../api/actions';
import { DangerZoneCard } from '@/shared/ui';

export function DangerZone({ poolId }: { poolId: string }): ReactElement {
  return (
    <DangerZoneCard
      wrapperClassName="card p-4.5 border border-[oklch(0.85_0.08_25)] bg-[oklch(0.98_0.015_25)]"
      description="Deleting the pool is permanent and removes all members and predictions."
      actionLabel="Delete pool"
      onConfirm={() => deletePool({ poolId })}
    />
  );
}
