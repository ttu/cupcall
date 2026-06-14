'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { rotateToken, clearInviteLink } from '../api/actions';
import { buildInviteUrl } from '../domain/invite';
import { Button, CopyField, SectionLabel, Icon } from '@/shared/ui';
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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const inviteUrl = token ? `${baseUrl}${buildInviteUrl(token)}` : null;

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
    <div className="card p-4.5">
      <SectionLabel icon={<Icon name="link" size={13} color="var(--ink-muted)" />}>
        Invite link
      </SectionLabel>

      {token && inviteUrl ? (
        <div className="mt-3.5 flex flex-col gap-2.5">
          <p className="text-xs text-ink-soft m-0">
            Share this link — anyone with it can join without an email address.
          </p>
          <CopyField value={inviteUrl} label="Invite link" />
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
        <div className="mt-3.5 flex flex-col gap-2.5">
          <p className="text-xs text-ink-soft m-0">
            {isOwner
              ? 'Invite link is disabled. Generate one to let people join.'
              : 'Invite link is disabled. Ask the pool owner to generate one.'}
          </p>
          {isOwner && (
            <Button variant="primary" size="sm" onClick={handleGenerate} disabled={isPending}>
              {isPending ? 'Generating…' : 'Generate invite link'}
            </Button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
