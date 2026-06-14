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
    <div className="flex gap-2">
      <div className="flex-1 h-9 rounded-cup-sm bg-surface-2 shadow-[inset_0_0_0_1px_var(--line)] px-3 flex items-center overflow-hidden">
        <span className="text-[11px] font-mono text-ink-soft truncate">{inviteUrl}</span>
      </div>
      <button type="button" onClick={onCopy} className="btn btn-soft sm">
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}
