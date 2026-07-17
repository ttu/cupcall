import type { ReactElement, ReactNode } from 'react';
import { Avatar, Icon, cn } from '@/shared/ui';

export type MatrixTableEntry<Cell> = {
  userId: string;
  displayName: string;
  isCurrentUser: boolean;
  totalPoints: number;
  cells: Cell[];
};

/**
 * Shared player-by-column scoring grid used by the knockout, group-stage, and
 * specials matrices. Callers supply the column headers and per-cell rendering;
 * this owns the sticky-avatar layout, row striping, and "who's leading" note.
 */
export function MatrixTable<Col, Cell>({
  columns,
  entries,
  colWidth,
  headerAlign = 'center',
  renderColumnHeader,
  renderCell,
  getCellKey,
  emptyMessage,
  leaderNote,
}: {
  columns: Col[];
  entries: MatrixTableEntry<Cell>[];
  colWidth: number;
  headerAlign?: 'center' | 'end';
  renderColumnHeader: (col: Col) => ReactElement;
  renderCell: (cell: Cell) => ReactElement;
  getCellKey: (cell: Cell) => string;
  emptyMessage: string;
  leaderNote?: (topPlayer: MatrixTableEntry<Cell>) => ReactNode;
}): ReactElement {
  if (columns.length === 0) {
    return (
      <div className="card p-[32px_24px] text-center">
        <p className="text-sm text-ink-muted m-0">{emptyMessage}</p>
      </div>
    );
  }

  const topPlayer = entries[0];
  const colTemplate = `50px 150px repeat(${columns.length}, ${colWidth}px) 64px`;

  return (
    <div>
      <div className="card overflow-x-auto">
        <div className="min-w-max">
          <div
            className={cn(
              'grid gap-1 bg-surface-2 border-b border-line',
              headerAlign === 'end' ? 'items-end' : 'items-center',
            )}
            style={{ gridTemplateColumns: colTemplate }}
          >
            <div className="sticky left-0 z-10 bg-surface-2 self-stretch" />
            <span className="eyebrow text-ink-muted text-[10px] py-3">Player</span>
            {columns.map(renderColumnHeader)}
            <span className="eyebrow text-ink-muted text-[10px] text-right py-3 pr-4">Total</span>
          </div>

          <div className="divide">
            {entries.map((row, idx) => (
              <MatrixTableRow
                key={row.userId}
                row={row}
                avatarIndex={idx}
                colTemplate={colTemplate}
                getCellKey={getCellKey}
                renderCell={renderCell}
              />
            ))}
          </div>
        </div>
      </div>

      {topPlayer && topPlayer.totalPoints > 0 && leaderNote && (
        <p className="text-[12.5px] text-ink-muted mt-3.5 flex items-center gap-2">
          <Icon name="spark" size={15} color="var(--orange-500, oklch(0.65 0.2 55))" />
          {leaderNote(topPlayer)}
        </p>
      )}
    </div>
  );
}

function MatrixTableRow<Cell>({
  row,
  avatarIndex,
  colTemplate,
  getCellKey,
  renderCell,
}: {
  row: MatrixTableEntry<Cell>;
  avatarIndex: number;
  colTemplate: string;
  getCellKey: (cell: Cell) => string;
  renderCell: (cell: Cell) => ReactElement;
}): ReactElement {
  const stickyBg = row.isCurrentUser ? 'bg-green-050' : 'bg-surface';

  return (
    <div
      className={cn(
        'grid items-center gap-1',
        row.isCurrentUser ? 'bg-green-050' : 'bg-transparent',
      )}
      style={{ gridTemplateColumns: colTemplate }}
    >
      <div
        className={cn(
          'sticky left-0 z-10 flex items-center justify-center self-stretch py-[9px]',
          stickyBg,
        )}
      >
        <Avatar name={row.displayName} index={avatarIndex} size={30} />
      </div>

      <span className="flex items-center min-w-0 py-[9px]">
        <span
          className={cn(
            'font-bold text-[13px] truncate',
            row.isCurrentUser ? 'text-green-700' : 'text-ink',
          )}
        >
          {row.displayName}
          {row.isCurrentUser && (
            <span className="chip green h-4.5 ml-[7px] text-[9.5px] align-middle">YOU</span>
          )}
        </span>
      </span>

      {row.cells.map((cell) => (
        <span key={getCellKey(cell)} className="grid place-items-center py-[9px]">
          {renderCell(cell)}
        </span>
      ))}

      <span
        className={cn(
          'display tnum text-right text-[18px] py-[9px] pr-4',
          row.isCurrentUser ? 'text-green-600' : 'text-ink',
        )}
      >
        {row.totalPoints}
      </span>
    </div>
  );
}
