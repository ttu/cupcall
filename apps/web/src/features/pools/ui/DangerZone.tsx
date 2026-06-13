'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deletePool } from '../api/actions';
import { SectionLabel, Icon } from '@/shared/ui';

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
    <div
      className="card"
      style={{
        padding: 18,
        border: '1px solid oklch(0.85 0.08 25)',
        background: 'oklch(0.98 0.015 25)',
      }}
    >
      <SectionLabel icon={<Icon name="trash" size={13} color="var(--danger)" />}>
        <span style={{ color: 'var(--danger)' }}>Danger zone</span>
      </SectionLabel>
      <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '10px 0 14px' }}>
        Deleting the pool is permanent and removes all members and predictions.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={isPendingDelete}
          onClick={handleDeleteClick}
          style={{
            fontSize: 13,
            fontWeight: 700,
            padding: '8px 16px',
            borderRadius: 9,
            border: 'none',
            cursor: 'pointer',
            background: confirmDelete ? 'var(--danger)' : 'transparent',
            color: confirmDelete ? 'white' : 'var(--danger)',
            boxShadow: confirmDelete ? 'none' : 'inset 0 0 0 1.5px oklch(0.78 0.12 25)',
          }}
        >
          {isPendingDelete ? 'Deleting…' : confirmDelete ? 'Confirm delete' : 'Delete pool'}
        </button>
        {confirmDelete && !isPendingDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            style={{
              fontSize: 12,
              background: 'none',
              border: 'none',
              color: 'var(--ink-muted)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        )}
      </div>
      {deleteError && (
        <p role="alert" style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>
          {deleteError}
        </p>
      )}
    </div>
  );
}
