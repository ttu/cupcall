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
    <div className="card py-3 px-[14px] flex flex-col gap-2">
      <div className="flex items-center justify-between gap-[10px]">
        <span className="text-xs font-bold text-ink-muted inline-flex items-center gap-[6px]">
          <Icon name="trash" size={11} color="var(--ink-muted)" />
          Leave pool
        </span>
        {confirmLeave ? (
          <div className="flex items-center gap-[6px]">
            <button
              type="button"
              data-testid="leave-pool-btn"
              disabled={isPending}
              onClick={handleLeaveClick}
              className="text-[11px] font-bold py-1 px-[9px] rounded-[7px] border-0 bg-danger text-white cursor-pointer"
            >
              {isPending ? 'Leaving…' : 'Confirm'}
            </button>
            {!isPending && (
              <button
                type="button"
                onClick={() => setConfirmLeave(false)}
                className="text-[11px] bg-transparent border-0 text-ink-muted cursor-pointer"
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
            className="text-[11px] font-bold py-1 px-[9px] rounded-[7px] border-[1.5px] border-[oklch(0.78_0.12_25)] bg-transparent text-danger cursor-pointer"
          >
            Leave
          </button>
        )}
      </div>
      <p className="text-[11px] text-ink-soft m-0 leading-[1.4]">
        Leaving removes you and your predictions from this pool. You can rejoin later with an invite
        link.
      </p>
      {leaveError && (
        <p role="alert" className="m-0 text-[11px] text-danger">
          {leaveError}
        </p>
      )}
    </div>
  );
}
