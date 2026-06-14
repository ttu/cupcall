'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import { Button } from './Button';

type Props = {
  value: string;
  label?: string;
};

export function CopyField({ value, label = 'URL' }: Props): ReactElement {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={value}
        aria-label={label}
        className="flex-1 h-9 rounded-cup-sm bg-surface-2 shadow-[inset_0_0_0_1px_var(--line)] px-3 text-[11px] font-mono text-ink-soft outline-none select-all cursor-text"
        onFocus={(e) => e.currentTarget.select()}
      />
      <Button variant="soft" size="sm" onClick={handleCopy}>
        {copied ? 'Copied!' : 'Copy'}
      </Button>
    </div>
  );
}
