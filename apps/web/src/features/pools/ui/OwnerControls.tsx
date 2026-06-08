'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { LeaderboardEntry } from '../domain/types';
import type { UserId } from '@cup/engine';
import { kickMember, deletePool } from '../api/actions';

type Props = {
  poolId: string;
  members: LeaderboardEntry[];
  currentUserId: UserId;
};

export function OwnerControls({ poolId, members, currentUserId }: Props): ReactElement {
  const router = useRouter();
  const [kickError, setKickError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPendingKick, startKickTransition] = useTransition();
  const [isPendingDelete, startDeleteTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleKick(targetUserId: UserId) {
    setKickError(null);
    startKickTransition(async () => {
      const result = await kickMember({ poolId, targetUserId });
      if (!result.ok) setKickError(result.error);
    });
  }

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

  const otherMembers = members.filter((m) => m.userId !== currentUserId);

  return (
    <div className="space-y-4">
      {/* Member management */}
      <div className="rounded-[var(--radius)] border border-[var(--line)] bg-white shadow-[var(--shadow-sm)] overflow-hidden">
        <div className="px-4 py-2.5 turf">
          <span
            className="text-sm font-bold tracking-widest uppercase text-[var(--on-dark)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Manage Members
          </span>
        </div>
        {otherMembers.length === 0 ? (
          <p className="px-4 py-4 text-sm text-[var(--ink-muted)]">No other members yet.</p>
        ) : (
          <div className="divide">
            {otherMembers.map((member) => (
              <div key={member.userId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 text-sm text-[var(--ink)] truncate">
                  {member.displayName}
                </span>
                <span className="text-xs text-[var(--ink-muted)] tabular-nums">
                  {member.pointsTotal} pts
                </span>
                <button
                  type="button"
                  disabled={isPendingKick}
                  onClick={() => handleKick(member.userId)}
                  className="text-xs px-2.5 py-1 rounded-md text-[var(--danger)] border border-[var(--danger)]/30 hover:bg-[var(--danger)]/5 transition-colors disabled:opacity-50"
                >
                  Kick
                </button>
              </div>
            ))}
          </div>
        )}
        {kickError && (
          <p role="alert" className="px-4 pb-3 text-xs text-[var(--danger)]">
            {kickError}
          </p>
        )}
      </div>

      {/* Danger zone */}
      <div className="rounded-[var(--radius)] border border-[var(--danger)]/30 bg-white overflow-hidden">
        <div className="px-4 py-3 space-y-2">
          <p className="text-sm font-semibold text-[var(--danger)]">Danger zone</p>
          <p className="text-xs text-[var(--ink-soft)]">
            Deleting the pool is permanent and removes all members and predictions.
          </p>
          <button
            type="button"
            disabled={isPendingDelete}
            onClick={handleDeleteClick}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
              confirmDelete
                ? 'bg-[var(--danger)] text-white hover:bg-[var(--danger)]/90'
                : 'border border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/5'
            }`}
          >
            {isPendingDelete ? 'Deleting…' : confirmDelete ? 'Confirm delete' : 'Delete pool'}
          </button>
          {confirmDelete && !isPendingDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="ml-2 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
            >
              Cancel
            </button>
          )}
          {deleteError && (
            <p role="alert" className="text-xs text-[var(--danger)]">
              {deleteError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
