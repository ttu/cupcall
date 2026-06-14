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
    <div className="py-2.5 px-4">
      <div className="flex items-center gap-3">
        <Avatar name={member.displayName} index={avatarIndex} size={34} />
        <span className="flex-1 text-sm font-bold text-ink truncate">{member.displayName}</span>
        <span className="display text-[15px] text-ink-muted shrink-0">{member.pointsTotal}</span>
        <button
          type="button"
          disabled={loginLinkPending}
          onClick={() => void handleGetLink()}
          className="shrink-0 text-xs font-bold py-[5px] px-[11px] rounded-lg border-input border-line bg-transparent text-ink-muted cursor-pointer"
        >
          {loginLinkPending ? 'Getting…' : 'Get link'}
        </button>
        {confirmKick ? (
          <>
            <button
              type="button"
              disabled={isPendingKick}
              onClick={handleKickClick}
              className="shrink-0 text-xs font-bold py-[5px] px-[11px] rounded-lg border-0 bg-danger text-white cursor-pointer"
            >
              Confirm kick
            </button>
            <button
              type="button"
              onClick={() => setConfirmKick(false)}
              className="shrink-0 text-xs bg-transparent border-0 text-ink-muted cursor-pointer"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={isPendingKick}
            onClick={handleKickClick}
            className="shrink-0 text-xs font-bold py-[5px] px-[11px] rounded-lg border-input border-[oklch(0.78_0.12_25)] bg-transparent text-danger cursor-pointer"
          >
            <Icon name="kick" size={12} color="var(--danger)" />
          </button>
        )}
      </div>
      {loginLink && (
        <div className="flex items-center gap-2 mt-2">
          <span className="flex-1 text-[11px] font-mono text-ink-soft bg-surface-2 rounded-[7px] py-1 px-2.5 truncate shadow-[inset_0_0_0_1px_var(--line)]">
            {loginLink}
          </span>
          <button type="button" onClick={() => handleCopy(loginLink)} className="btn btn-soft sm">
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
      {loginLinkError && (
        <p role="alert" className="mt-1 text-[11px] text-danger">
          {loginLinkError}
        </p>
      )}
      {kickError && (
        <p role="alert" className="mt-1 text-[11px] text-danger">
          {kickError}
        </p>
      )}
    </div>
  );
}
