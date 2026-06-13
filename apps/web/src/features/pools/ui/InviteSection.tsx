'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { rotateToken, clearInviteLink } from '../api/actions';
import { buildInviteUrl } from '../domain/invite';
import { SectionLabel, Icon } from '@/shared/ui';
import { InviteLinkDisplay } from './InviteLinkDisplay';
import { OwnerInviteActions } from './OwnerInviteActions';

type Props = {
  poolId: string;
  token: string | null;
  isOwner: boolean;
  baseUrl: string;
};

export function InviteSection({
  poolId,
  token: initialToken,
  isOwner,
  baseUrl,
}: Props): ReactElement {
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const inviteUrl = token ? `${baseUrl}${buildInviteUrl(token)}` : null;

  function handleCopy() {
    if (!inviteUrl) return;
    void navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await rotateToken({ poolId });
      if (result.ok) {
        setToken(result.newToken);
      } else {
        setError(result.error);
      }
    });
  }

  function handleRotateClick() {
    if (!confirmRotate) {
      setConfirmRotate(true);
      setConfirmRemove(false);
      return;
    }
    setError(null);
    setConfirmRotate(false);
    startTransition(async () => {
      const result = await rotateToken({ poolId });
      if (result.ok) {
        setToken(result.newToken);
      } else {
        setError(result.error);
      }
    });
  }

  function handleRemoveClick() {
    if (!confirmRemove) {
      setConfirmRemove(true);
      setConfirmRotate(false);
      return;
    }
    setError(null);
    setConfirmRemove(false);
    startTransition(async () => {
      const result = await clearInviteLink({ poolId });
      if (result.ok) {
        setToken(null);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="card" style={{ padding: 18 }}>
      <SectionLabel icon={<Icon name="link" size={13} color="var(--ink-muted)" />}>
        Invite link
      </SectionLabel>

      {token && inviteUrl ? (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: 0 }}>
            Share this link — anyone with it can join without an email address.
          </p>
          <InviteLinkDisplay inviteUrl={inviteUrl} copied={copied} onCopy={handleCopy} />
          {isOwner && (
            <OwnerInviteActions
              isPending={isPending}
              confirmRotate={confirmRotate}
              confirmRemove={confirmRemove}
              onRotateClick={handleRotateClick}
              onRemoveClick={handleRemoveClick}
              onCancelRotate={() => setConfirmRotate(false)}
              onCancelRemove={() => setConfirmRemove(false)}
            />
          )}
        </div>
      ) : (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: 0 }}>
            {isOwner
              ? 'Invite link is disabled. Generate one to let people join.'
              : 'Invite link is disabled. Ask the pool owner to generate one.'}
          </p>
          {isOwner && (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isPending}
              className="btn btn-primary sm"
            >
              {isPending ? 'Generating…' : 'Generate invite link'}
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
