'use client';

import type { ReactElement } from 'react';
import { useRef, useTransition, useState } from 'react';
import { exportCard, importCard } from '../api/actions';

type Props = {
  poolId: string;
  targetUserId?: string;
};

export function ExportImportControls({ poolId, targetUserId }: Props): ReactElement {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function handleExport() {
    startTransition(async () => {
      const result = await exportCard({ poolId });
      if (!result.ok) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cup-card-${poolId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ ok: true, text: 'Card exported.' });
    });
  }

  function handleImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const exportData = JSON.parse(reader.result as string) as unknown;
        startTransition(async () => {
          const result = await importCard({ poolId, targetUserId, exportData });
          if (!result.ok) {
            setMessage({ ok: false, text: result.error });
          } else {
            setMessage({
              ok: true,
              text: `Imported ${result.imported} field(s).${result.skipped.length ? ` Skipped: ${result.skipped.join(', ')}` : ''}`,
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
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleExport}
        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--line)] bg-white text-[var(--ink-soft)] hover:text-[var(--ink)] hover:border-[var(--ink-muted)] transition-colors"
      >
        Export JSON
      </button>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--line)] bg-white text-[var(--ink-soft)] hover:text-[var(--ink)] hover:border-[var(--ink-muted)] transition-colors"
      >
        Import JSON
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
        aria-label="Import JSON card file"
      />

      {message && (
        <p
          role="status"
          className={`text-xs ${message.ok ? 'text-[var(--green-700)]' : 'text-[var(--danger)]'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
