import type { ReactElement } from 'react';
import type { AuditEntry } from '../domain/types';

type Props = { entries: AuditEntry[] };

export function AuditLog({ entries }: Props): ReactElement | null {
  if (entries.length === 0) return null;

  return (
    <section aria-label="Edit history">
      <h3 className="text-sm font-semibold text-[var(--ink-soft)] mb-2">Edit History</h3>
      <ol className="space-y-2">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="text-xs text-[var(--ink-muted)] rounded-[var(--radius-sm)] border border-[var(--line-soft)] bg-[var(--surface-2)] px-3 py-2 flex flex-col gap-0.5"
          >
            <span className="font-medium text-[var(--ink-soft)]">
              {entry.editorName} edited <code className="font-mono">{entry.fieldPath}</code>
            </span>
            <span>
              {entry.oldValue !== null ? JSON.stringify(entry.oldValue) : '—'}
              {' → '}
              {JSON.stringify(entry.newValue)}
            </span>
            {entry.reason && <span className="italic">{entry.reason}</span>}
            <time className="text-[var(--ink-muted)]" dateTime={entry.editedAt.toISOString()}>
              {entry.editedAt.toLocaleString()}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
