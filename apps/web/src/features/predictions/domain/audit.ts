import type { EditRow } from '@cup/db';
import type { AuditEntry } from './types';

/** Maps a DB edit row (own-card or owner-edit) to the UI's AuditEntry shape. */
export function toAuditEntry(edit: EditRow): AuditEntry {
  return {
    id: edit.id,
    editorName: edit.editorName,
    fieldPath: edit.fieldPath,
    oldValue: edit.oldValue,
    newValue: edit.newValue,
    ...(edit.reason !== null ? { reason: edit.reason } : {}),
    source: edit.source,
    editedAt: edit.editedAt,
  };
}
