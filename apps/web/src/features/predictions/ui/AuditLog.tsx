import type { ReactElement } from 'react';
import type { AuditEntry } from '../domain/types';

type Props = { entries: AuditEntry[] };

export function AuditLog({ entries }: Props): ReactElement | null {
  if (entries.length === 0) return null;

  return (
    <section aria-label="Edit history">
      <h3 className="text-sm font-semibold text-ink-soft mb-2">Edit History</h3>
      <ol className="space-y-2">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="text-xs text-ink-muted rounded-cup-sm border border-line-soft bg-surface-2 px-3 py-2 flex flex-col gap-0.5"
          >
            <span className="font-medium text-ink-soft">
              {entry.editorName} edited <code className="font-mono">{entry.fieldPath}</code>
            </span>
            <span>
              {entry.oldValue !== null ? JSON.stringify(entry.oldValue) : '—'}
              {' → '}
              {JSON.stringify(entry.newValue)}
            </span>
            {entry.reason && <span className="italic">{entry.reason}</span>}
            <time className="text-ink-muted" dateTime={entry.editedAt.toISOString()}>
              {entry.editedAt.toLocaleString()}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
