import type { ReactElement } from 'react';

export function InviteLinkDisplay({
  inviteUrl,
  copied,
  onCopy,
}: {
  inviteUrl: string;
  copied: boolean;
  onCopy: () => void;
}): ReactElement {
  return (
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
      <button type="button" onClick={onCopy} className="btn btn-soft sm">
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}
