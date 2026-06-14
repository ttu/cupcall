'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deletePool } from '../api/actions';
import { SectionLabel, Icon, cn } from '@/shared/ui';

export function DangerZone({ poolId }: { poolId: string }): ReactElement {
  const router = useRouter();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPendingDelete, startDeleteTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleDeleteClick() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deletePool({ poolId });
      if (!result.ok) {
        setDeleteError(result.error);
        setConfirmDelete(false);
      }
      // On success, deletePool redirects to /pools via server-side redirect.
    });
  }

  return (
    <div className="card p-[18px] border border-[oklch(0.85_0.08_25)] bg-[oklch(0.98_0.015_25)]">
      <SectionLabel icon={<Icon name="trash" size={13} color="var(--danger)" />}>
        <span className="text-danger">Danger zone</span>
      </SectionLabel>
      <p className="text-xs text-ink-soft mt-[10px] mb-[14px]">
        Deleting the pool is permanent and removes all members and predictions.
      </p>
      <div className="flex items-center gap-[10px] flex-wrap">
        <button
          type="button"
          disabled={isPendingDelete}
          onClick={handleDeleteClick}
          className={cn(
            'text-[13px] font-bold py-2 px-4 rounded-cup-sm border-0 cursor-pointer',
            confirmDelete
              ? 'bg-danger text-white'
              : 'bg-transparent text-danger shadow-[inset_0_0_0_1.5px_oklch(0.78_0.12_25)]',
          )}
        >
          {isPendingDelete ? 'Deleting…' : confirmDelete ? 'Confirm delete' : 'Delete pool'}
        </button>
        {confirmDelete && !isPendingDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="text-xs bg-transparent border-0 text-ink-muted cursor-pointer"
          >
            Cancel
          </button>
        )}
      </div>
      {deleteError && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {deleteError}
        </p>
      )}
    </div>
  );
}
