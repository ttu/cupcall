'use client';

import type { ReactElement } from 'react';
import { useRef, useTransition, useState } from 'react';
import { exportPool, importPool } from '../api/actions';

type Props = { poolId: string; isOwner: boolean };

export function PoolBackupControls({ poolId, isOwner }: Props): ReactElement {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function handleExport() {
    setMessage(null);
    startTransition(async () => {
      const result = await exportPool({ poolId });
      if (!result.ok) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cup-pool-backup-${poolId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ ok: true, text: 'Pool exported.' });
    });
  }

  function handleImportFile(file: File) {
    setMessage(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backupData = JSON.parse(reader.result as string) as unknown;
        startTransition(async () => {
          const result = await importPool({ poolId, backupData });
          if (!result.ok) {
            setMessage({ ok: false, text: result.error });
          } else {
            setMessage({
              ok: true,
              text: `Restored ${result.membersRestored} member(s).`,
            });
          }
        });
      } catch {
        setMessage({ ok: false, text: 'Invalid JSON file.' });
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-white shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="px-4 py-2.5 turf">
        <span
          className="text-sm font-bold tracking-widest uppercase text-[var(--on-dark)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {isOwner ? 'Backup & Restore' : 'Backup'}
        </span>
      </div>
      <div className="px-4 py-4 space-y-3">
        <p className="text-xs text-[var(--ink-muted)]">
          {isOwner
            ? 'Export a full backup of this pool including all members and their predictions. Import a backup to restore members and predictions (existing members are matched by ID; unknown members are added as guests).'
            : 'Download a full backup of this pool including all members and their predictions. Use it to verify that results are not changed after the tournament.'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--line)] bg-white text-[var(--ink-soft)] hover:text-[var(--ink)] hover:border-[var(--ink-muted)] transition-colors"
          >
            Export backup
          </button>
          {isOwner && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--line)] bg-white text-[var(--ink-soft)] hover:text-[var(--ink)] hover:border-[var(--ink-muted)] transition-colors"
              >
                Import backup
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile(file);
                  e.target.value = '';
                }}
                aria-label="Import pool backup JSON file"
              />
            </>
          )}
        </div>
        {message && (
          <p
            role="status"
            className={`text-xs ${message.ok ? 'text-[var(--green-700)]' : 'text-[var(--danger)]'}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
