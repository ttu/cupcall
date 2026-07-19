'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { archivePoolAction } from '../api/actions';
import { TurfCard } from '@/shared/ui';

type Props = { poolId: string; isOwner: boolean; archivedAt: Date | null };

export function ArchivePoolCard({ poolId, isOwner, archivedAt }: Props): ReactElement | null {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!isOwner && !archivedAt) return null;

  function handleArchive() {
    setError(null);
    startTransition(async () => {
      const result = await archivePoolAction({ poolId });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <TurfCard title="Archive">
      <div className="px-4 py-4 space-y-3">
        <p className="text-xs text-ink-muted">
          {archivedAt
            ? isOwner
              ? `Archived on ${archivedAt.toLocaleDateString()}. Survives members' future name changes or account deletions — not your own; deleting your account removes the whole pool.`
              : `Archived on ${archivedAt.toLocaleDateString()}. This snapshot survives future name changes or account deletions.`
            : 'Freeze a permanent snapshot of the final standings once the cup is finished.'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {isOwner && (
            <button
              type="button"
              onClick={handleArchive}
              disabled={isPending}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-line bg-white text-ink-soft hover:text-ink hover:border-ink-muted transition-colors disabled:opacity-50"
            >
              {isPending ? 'Archiving…' : archivedAt ? 'Re-archive' : 'Archive this pool'}
            </button>
          )}
          {archivedAt && (
            <Link
              href={`/pools/${poolId}/archive`}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-line bg-white text-ink-soft hover:text-ink hover:border-ink-muted transition-colors no-underline"
            >
              View archive
            </Link>
          )}
        </div>
        {error && (
          <p role="status" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </TurfCard>
  );
}
