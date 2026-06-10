'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { LeaderboardEntry } from '../domain/types';
import type { UserId } from '@cup/engine';
import { kickMember, deletePool, generateMemberLoginLink } from '../api/actions';
import { Avatar, SectionLabel, Icon } from '@/shared/ui';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Member management */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="turf" style={{ padding: '8px 16px' }}>
          <span className="display" style={{ fontSize: 15, color: 'var(--on-dark)' }}>
            Members
          </span>
        </div>

        {otherMembers.length === 0 ? (
          <p style={{ padding: '14px 16px', fontSize: 13, color: 'var(--ink-muted)' }}>
            No other members yet.
          </p>
        ) : (
          <div className="divide">
            {otherMembers.map((member, i) => {
              const link = loginLinks[member.userId];
              const pending = loginLinkPending[member.userId] ?? false;
              const linkErr = loginLinkError[member.userId];
              return (
                <div key={member.userId} style={{ padding: '10px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar name={member.displayName} index={i} size={34} />
                    <span
                      style={{
                        flex: 1,
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--ink)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {member.displayName}
                    </span>
                    <span
                      className="display"
                      style={{ fontSize: 15, color: 'var(--ink-muted)', flexShrink: 0 }}
                    >
                      {member.pointsTotal}
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void handleGetLink(member.userId)}
                      style={{
                        flexShrink: 0,
                        fontSize: 12,
                        fontWeight: 700,
                        padding: '5px 11px',
                        borderRadius: 8,
                        border: '1.5px solid var(--line)',
                        background: 'transparent',
                        color: 'var(--ink-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      {pending ? 'Getting…' : 'Get link'}
                    </button>
                    {confirmKickId === member.userId ? (
                      <>
                        <button
                          type="button"
                          disabled={isPendingKick}
                          onClick={() => handleKickClick(member.userId)}
                          style={{
                            flexShrink: 0,
                            fontSize: 12,
                            fontWeight: 700,
                            padding: '5px 11px',
                            borderRadius: 8,
                            border: 'none',
                            background: 'var(--danger)',
                            color: 'white',
                            cursor: 'pointer',
                          }}
                        >
                          Confirm kick
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmKickId(null)}
                          style={{
                            flexShrink: 0,
                            fontSize: 12,
                            background: 'none',
                            border: 'none',
                            color: 'var(--ink-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={isPendingKick}
                        onClick={() => handleKickClick(member.userId)}
                        style={{
                          flexShrink: 0,
                          fontSize: 12,
                          fontWeight: 700,
                          padding: '5px 11px',
                          borderRadius: 8,
                          border: '1.5px solid oklch(0.78 0.12 25)',
                          background: 'transparent',
                          color: 'var(--danger)',
                          cursor: 'pointer',
                        }}
                      >
                        <Icon name="kick" size={12} color="var(--danger)" />
                      </button>
                    )}
                  </div>
                  {link && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                      <span
                        style={{
                          flex: 1,
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: 'var(--ink-soft)',
                          background: 'var(--surface-2)',
                          borderRadius: 7,
                          padding: '4px 10px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          boxShadow: 'inset 0 0 0 1px var(--line)',
                        }}
                      >
                        {link}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(member.userId, link)}
                        className="btn btn-soft sm"
                      >
                        {copiedId === member.userId ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  )}
                  {linkErr && (
                    <p role="alert" style={{ marginTop: 4, fontSize: 11, color: 'var(--danger)' }}>
                      {linkErr}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {kickError && (
          <p role="alert" style={{ padding: '0 16px 12px', fontSize: 12, color: 'var(--danger)' }}>
            {kickError}
          </p>
        )}
      </div>

      {/* Danger zone */}
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
    </div>
  );
}
