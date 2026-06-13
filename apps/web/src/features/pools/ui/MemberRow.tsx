'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import type { LeaderboardEntry } from '../domain/types';
import type { UserId } from '@cup/engine';
import { kickMember, generateMemberLoginLink } from '../api/actions';
import { Avatar, Icon } from '@/shared/ui';

type Props = {
  member: LeaderboardEntry;
  avatarIndex: number;
  poolId: string;
};

export function MemberRow({ member, avatarIndex, poolId }: Props): ReactElement {
  const [kickError, setKickError] = useState<string | null>(null);
  const [isPendingKick, startKickTransition] = useTransition();
  const [confirmKick, setConfirmKick] = useState(false);
  const [loginLink, setLoginLink] = useState<string | null>(null);
  const [loginLinkPending, setLoginLinkPending] = useState(false);
  const [loginLinkError, setLoginLinkError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleKickClick() {
    if (!confirmKick) {
      setConfirmKick(true);
      return;
    }
    setKickError(null);
    setConfirmKick(false);
    startKickTransition(async () => {
      const result = await kickMember({ poolId, targetUserId: member.userId as UserId });
      if (!result.ok) setKickError(result.error);
    });
  }

  async function handleGetLink() {
    setLoginLinkError(null);
    setLoginLinkPending(true);
    const result = await generateMemberLoginLink({
      poolId,
      targetUserId: member.userId as UserId,
    });
    setLoginLinkPending(false);
    if (!result.ok) {
      setLoginLinkError(result.error);
    } else {
      setLoginLink(`${window.location.origin}${result.url}`);
    }
  }

  function handleCopy(url: string) {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ padding: '10px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name={member.displayName} index={avatarIndex} size={34} />
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
          disabled={loginLinkPending}
          onClick={() => void handleGetLink()}
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
          {loginLinkPending ? 'Getting…' : 'Get link'}
        </button>
        {confirmKick ? (
          <>
            <button
              type="button"
              disabled={isPendingKick}
              onClick={handleKickClick}
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
              onClick={() => setConfirmKick(false)}
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
            onClick={handleKickClick}
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
      {loginLink && (
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
            {loginLink}
          </span>
          <button type="button" onClick={() => handleCopy(loginLink)} className="btn btn-soft sm">
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
      {loginLinkError && (
        <p role="alert" style={{ marginTop: 4, fontSize: 11, color: 'var(--danger)' }}>
          {loginLinkError}
        </p>
      )}
      {kickError && (
        <p role="alert" style={{ marginTop: 4, fontSize: 11, color: 'var(--danger)' }}>
          {kickError}
        </p>
      )}
    </div>
  );
}
