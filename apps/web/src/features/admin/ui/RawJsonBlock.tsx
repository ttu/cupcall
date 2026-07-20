'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import { Button } from '@/shared/ui';

type Props = {
  title: string;
  /** The already-assembled view-model to dump. `null`/`undefined` renders an empty state. */
  json: unknown;
  /** Base test id: the <pre> gets `testId`, the copy button gets `${testId}-copy-button`. */
  testId: string;
};

export function RawJsonBlock({ title, json, testId }: Props): ReactElement {
  const [copied, setCopied] = useState(false);
  const text = json === null || json === undefined ? null : JSON.stringify(json, null, 2);

  function handleCopy(): void {
    if (text === null) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="card overflow-hidden">
      <div className="turf py-2 px-4 flex items-center justify-between gap-3">
        <span className="display text-[15px] text-on-dark">{title}</span>
        <Button
          variant="soft"
          size="sm"
          onClick={handleCopy}
          disabled={text === null}
          data-testid={`${testId}-copy-button`}
        >
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
      {text === null ? (
        <p className="py-3.5 px-4 text-[13px] text-ink-muted">
          No prediction saved for this member.
        </p>
      ) : (
        <pre
          data-testid={testId}
          className="p-4 text-[11px] font-mono text-ink-soft overflow-x-auto whitespace-pre-wrap break-words max-h-[600px] overflow-y-auto"
        >
          {text}
        </pre>
      )}
    </div>
  );
}
