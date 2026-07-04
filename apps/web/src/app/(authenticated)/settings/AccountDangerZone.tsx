'use client';

import { useState, useTransition } from 'react';
import type { ReactElement } from 'react';
import { deleteAccountAction } from '@/features/auth/actions';
import { Button, Icon, SectionLabel } from '@/shared/ui';

type Props = { ownedPoolCount: number };

export function AccountDangerZone({ ownedPoolCount }: Props): ReactElement {
  const [isPendingDelete, startDeleteTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleDeleteClick() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteAccountAction();
      if (!result.ok) {
        setDeleteError(result.error);
        setConfirmDelete(false);
      }
      // On success, deleteAccountAction redirects to /.
    });
  }

  return (
    <div className="p-4.5 rounded-[13px] border border-[oklch(0.85_0.08_25)] bg-[oklch(0.98_0.015_25)]">
      <SectionLabel icon={<Icon name="trash" size={13} color="var(--danger)" />}>
        <span className="text-danger">Danger zone</span>
      </SectionLabel>
      <p className="text-xs text-ink-soft mt-2.5 mb-3.5">
        {ownedPoolCount > 0
          ? `Deleting your account is permanent and will also delete ${ownedPoolCount} pool${ownedPoolCount === 1 ? '' : 's'} you own and all their data.`
          : 'Deleting your account is permanent and cannot be undone.'}
      </p>
      <div className="flex items-center gap-2.5 flex-wrap">
        <Button
          variant={confirmDelete ? 'danger' : 'ghost-danger'}
          size="sm"
          data-testid="delete-account-btn"
          disabled={isPendingDelete}
          onClick={handleDeleteClick}
        >
          {isPendingDelete ? 'Deleting…' : confirmDelete ? 'Confirm delete' : 'Delete account'}
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
