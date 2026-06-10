'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { rotateToken, clearInviteLink } from '../api/actions';
import { buildInviteUrl } from '../domain/invite';
import { SectionLabel, Icon } from '@/shared/ui';

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

      {token ? (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: 0 }}>
            Share this link — anyone with it can join without an email address.
          </p>

          {/* URL pill + copy */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div
              style={{
                flex: 1,
                height: 36,
                borderRadius: 9,
                background: 'var(--surface-2)',
                boxShadow: 'inset 0 0 0 1px var(--line)',
                padding: '0 12px',
                display: 'flex',
                alignItems: 'center',
                overflow: 'hidden',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: 'var(--ink-soft)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {inviteUrl}
              </span>
            </div>
            <button type="button" onClick={handleCopy} className="btn btn-soft sm">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* Owner actions */}
          {isOwner && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              {confirmRotate ? (
                <>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleRotateClick}
                    className="btn btn-ghost sm"
                    style={{ fontSize: 11 }}
                  >
                    Confirm reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRotate(false)}
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
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleRotateClick}
                  disabled={isPending}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    background: 'none',
                    border: 'none',
                    color: 'var(--ink-muted)',
                    cursor: 'pointer',
                  }}
                >
                  {isPending ? 'Working…' : 'Reset link'}
                </button>
              )}

              {!confirmRotate && (
                <>
                  {confirmRemove ? (
                    <>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={handleRemoveClick}
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: 7,
                          border: 'none',
                          background: 'var(--danger)',
                          color: 'white',
                          cursor: 'pointer',
                        }}
                      >
                        Confirm remove
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(false)}
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
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRemoveClick}
                      disabled={isPending}
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        background: 'none',
                        border: 'none',
                        color: 'var(--ink-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      Remove link
                    </button>
                  )}
                </>
              )}
            </div>
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
