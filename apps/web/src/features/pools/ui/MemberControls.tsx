'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { Icon } from '@/shared/ui';
import { leavePool } from '../api/actions';

type Props = {
  poolId: string;
};

export function MemberControls({ poolId }: Props): ReactElement {
  const [isPending, startTransition] = useTransition();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  function handleLeaveClick() {
    if (!confirmLeave) {
      setConfirmLeave(true);
      return;
    }
    setLeaveError(null);
    startTransition(async () => {
      const result = await leavePool({ poolId });
      if (!result.ok) {
        setLeaveError(result.error);
        setConfirmLeave(false);
      }
      // On success, leavePool redirects to /pools via server-side redirect.
    });
  }

  return (
    <div
      className="card"
      style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--ink-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Icon name="trash" size={11} color="var(--ink-muted)" />
          Leave pool
        </span>
        {confirmLeave ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              data-testid="leave-pool-btn"
              disabled={isPending}
              onClick={handleLeaveClick}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '4px 9px',
                borderRadius: 7,
                border: 'none',
                background: 'var(--danger)',
                color: 'white',
                cursor: 'pointer',
              }}
            >
              {isPending ? 'Leaving…' : 'Confirm'}
            </button>
            {!isPending && (
              <button
                type="button"
                onClick={() => setConfirmLeave(false)}
                style={{
                  fontSize: 11,
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
        ) : (
          <button
            type="button"
            data-testid="leave-pool-btn"
            disabled={isPending}
            onClick={handleLeaveClick}
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '4px 9px',
              borderRadius: 7,
              border: '1.5px solid oklch(0.78 0.12 25)',
              background: 'transparent',
              color: 'var(--danger)',
              cursor: 'pointer',
            }}
          >
            Leave
          </button>
        )}
      </div>
      <p style={{ fontSize: 11, color: 'var(--ink-soft)', margin: 0, lineHeight: 1.4 }}>
        Leaving removes you and your predictions from this pool. You can rejoin later with an invite
        link.
      </p>
      {leaveError && (
        <p role="alert" style={{ margin: 0, fontSize: 11, color: 'var(--danger)' }}>
          {leaveError}
        </p>
      )}
    </div>
  );
}
