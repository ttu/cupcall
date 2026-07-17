'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { deletePool } from '../api/actions';
import { Button, SectionLabel, Icon } from '@/shared/ui';

export function DangerZone({ poolId }: { poolId: string }): ReactElement {
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
    <div className="card p-4.5 border border-[oklch(0.85_0.08_25)] bg-[oklch(0.98_0.015_25)]">
      <SectionLabel icon={<Icon name="trash" size={13} color="var(--danger)" />}>
        <span className="text-danger">Danger zone</span>
      </SectionLabel>
      <p className="text-xs text-ink-soft mt-2.5 mb-3.5">
        Deleting the pool is permanent and removes all members and predictions.
      </p>
      <div className="flex items-center gap-2.5 flex-wrap">
        <Button
          variant={confirmDelete ? 'danger' : 'ghost-danger'}
          size="sm"
          disabled={isPendingDelete}
          onClick={handleDeleteClick}
        >
          {isPendingDelete ? 'Deleting…' : confirmDelete ? 'Confirm delete' : 'Delete pool'}
        </Button>
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
