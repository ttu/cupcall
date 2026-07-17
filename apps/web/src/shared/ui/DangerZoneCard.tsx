'use client';

import { useState, useTransition } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';
import { SectionLabel } from './SectionLabel';

type DeleteResult = { ok: true } | { ok: false; error: string };

/** Confirm-then-delete card: click once to arm, click again to confirm. */
export function DangerZoneCard({
  wrapperClassName,
  description,
  actionLabel,
  testId,
  onConfirm,
}: {
  wrapperClassName: string;
  description: ReactNode;
  actionLabel: string;
  testId?: string;
  onConfirm: () => Promise<DeleteResult>;
}): ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function handleClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await onConfirm();
      if (!result.ok) {
        setError(result.error);
        setConfirming(false);
      }
      // On success, onConfirm redirects away.
    });
  }

  return (
    <div className={wrapperClassName}>
      <SectionLabel icon={<Icon name="trash" size={13} color="var(--danger)" />}>
        <span className="text-danger">Danger zone</span>
      </SectionLabel>
      <p className="text-xs text-ink-soft mt-2.5 mb-3.5">{description}</p>
      <div className="flex items-center gap-2.5 flex-wrap">
        <Button
          variant={confirming ? 'danger' : 'ghost-danger'}
          size="sm"
          {...(testId ? { 'data-testid': testId } : {})}
          disabled={isPending}
          onClick={handleClick}
        >
          {isPending ? 'Deleting…' : confirming ? 'Confirm delete' : actionLabel}
        </Button>
        {confirming && !isPending && (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-xs bg-transparent border-0 text-ink-muted cursor-pointer"
          >
            Cancel
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
