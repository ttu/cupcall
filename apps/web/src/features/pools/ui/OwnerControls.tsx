'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { LeaderboardEntry } from '../domain/types';
import type { UserId } from '@cup/engine';
import { kickMember, deletePool, generateMemberLoginLink } from '../api/actions';

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
  const [confirmKickId, setConfirmKickId] = useState<UserId | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loginLinks, setLoginLinks] = useState<Record<string, string>>({});
  const [loginLinkPending, setLoginLinkPending] = useState<Record<string, boolean>>({});
  const [loginLinkError, setLoginLinkError] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function handleKickClick(targetUserId: UserId) {
    if (confirmKickId !== targetUserId) {
      setConfirmKickId(targetUserId);
      return;
    }
    setKickError(null);
    setConfirmKickId(null);
    startKickTransition(async () => {
      const result = await kickMember({ poolId, targetUserId });
      if (!result.ok) setKickError(result.error);
    });
  }

  async function handleGetLink(targetUserId: UserId) {
    setLoginLinkError((prev) => ({ ...prev, [targetUserId]: '' }));
    setLoginLinkPending((prev) => ({ ...prev, [targetUserId]: true }));
    const result = await generateMemberLoginLink({ poolId, targetUserId });
    setLoginLinkPending((prev) => ({ ...prev, [targetUserId]: false }));
    if (!result.ok) {
      setLoginLinkError((prev) => ({ ...prev, [targetUserId]: result.error }));
    } else {
      const fullUrl = `${window.location.origin}${result.url}`;
      setLoginLinks((prev) => ({ ...prev, [targetUserId]: fullUrl }));
    }
  }

  function handleCopy(targetUserId: string, url: string) {
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedId(targetUserId);
      setTimeout(() => setCopiedId(null), 2000);
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
            {otherMembers.map((member) => {
              const link = loginLinks[member.userId];
              const pending = loginLinkPending[member.userId] ?? false;
              const linkErr = loginLinkError[member.userId];
              return (
                <div key={member.userId} className="px-4 py-2.5 space-y-1.5">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex-1 text-sm text-[var(--ink)] truncate"
                      title={member.userId}
                    >
                      {member.displayName}
                    </span>
                    <span className="text-xs text-[var(--ink-muted)] tabular-nums">
                      {member.pointsTotal} pts
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void handleGetLink(member.userId)}
                      className="text-xs px-2.5 py-1 rounded-md text-[var(--ink-muted)] border border-[var(--line)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
                    >
                      {pending ? 'Getting…' : 'Get link'}
                    </button>
                    {confirmKickId === member.userId ? (
                      <>
                        <button
                          type="button"
                          disabled={isPendingKick}
                          onClick={() => handleKickClick(member.userId)}
                          className="text-xs px-2.5 py-1 rounded-md bg-[var(--danger)] text-white hover:bg-[var(--danger)]/90 transition-colors disabled:opacity-50"
                        >
                          Confirm kick
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmKickId(null)}
                          className="text-xs text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={isPendingKick}
                        onClick={() => handleKickClick(member.userId)}
                        className="text-xs px-2.5 py-1 rounded-md text-[var(--danger)] border border-[var(--danger)]/30 hover:bg-[var(--danger)]/5 transition-colors disabled:opacity-50"
                      >
                        Kick
                      </button>
                    )}
                  </div>
                  {link && (
                    <div className="flex items-center gap-2 pl-0">
                      <span className="flex-1 text-xs text-[var(--ink-soft)] truncate font-mono bg-[var(--surface-2)] rounded px-2 py-1">
                        {link}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(member.userId, link)}
                        className="shrink-0 text-xs px-2.5 py-1 rounded-md text-[var(--ink-muted)] border border-[var(--line)] hover:bg-[var(--surface-2)] transition-colors"
                      >
                        {copiedId === member.userId ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  )}
                  {linkErr && (
                    <p role="alert" className="text-xs text-[var(--danger)]">
                      {linkErr}
                    </p>
                  )}
                </div>
              );
            })}
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
