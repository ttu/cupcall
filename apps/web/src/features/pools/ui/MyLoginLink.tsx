'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { rotateMyLoginToken } from '../api/actions';
import { buildLoginUrl } from '../domain/invite';
import { SectionLabel, Icon } from '@/shared/ui';

type Props = { token: string; baseUrl: string };

export function MyLoginLink({ token: initialToken, baseUrl }: Props): ReactElement {
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmReset, setConfirmReset] = useState(false);

  const url = `${baseUrl}${buildLoginUrl(token)}`;

  function handleCopy() {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleResetClick() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setError(null);
    setConfirmReset(false);
    startTransition(async () => {
      const result = await rotateMyLoginToken();
      if (result.ok) {
        setToken(result.token);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="card" style={{ padding: 18, marginBottom: 24 }}>
      <SectionLabel icon={<Icon name="link" size={13} color="var(--ink-muted)" />}>
        Your login link
      </SectionLabel>

      <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '10px 0 12px', lineHeight: 1.5 }}>
        Your browser remembers you automatically, but this link lets you sign in from any other
        device. Store it somewhere safe — anyone with it can access your account.
      </p>

      {/* URL pill + copy button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            flex: 1,
            height: 36,
            borderRadius: 9,
            background: 'var(--surface-2)',
            boxShadow: 'inset 0 0 0 1px var(--line)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontFamily: 'monospace',
              color: 'var(--ink-soft)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {url}
          </span>
        </div>
        <button type="button" onClick={handleCopy} className="btn btn-soft sm">
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Reset / confirm row */}
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        {confirmReset ? (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={handleResetClick}
              className="btn btn-ghost sm"
              style={{
                color: 'var(--danger)',
                boxShadow: 'inset 0 0 0 1.5px oklch(0.78 0.12 25)',
                opacity: isPending ? 0.5 : 1,
              }}
            >
              Confirm reset
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--ink-muted)',
                padding: 0,
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleResetClick}
            disabled={isPending}
            className="btn btn-ghost sm"
            style={{ opacity: isPending ? 0.5 : 1 }}
          >
            {isPending ? 'Working…' : 'Reset link'}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}
