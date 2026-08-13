import type { ReactElement } from 'react';
import { cn } from '@/shared/ui';
import type { CategoryBreakdownRow, CategoryBreakdownCell } from '../domain/category-breakdown';

type Props = { rows: CategoryBreakdownRow[] };

const LABEL_COL_WIDTH = 148;
const MEMBER_COL_WIDTH = 88;

function Cols({ header }: { header: CategoryBreakdownCell[] }): ReactElement {
  return (
    <colgroup>
      <col style={{ width: LABEL_COL_WIDTH }} />
      {header.map((cell) => (
        <col key={cell.userId ?? cell.displayName} style={{ width: MEMBER_COL_WIDTH }} />
      ))}
    </colgroup>
  );
}

function HeaderRow({ header }: { header: CategoryBreakdownCell[] }): ReactElement {
  return (
    <tr className="border-b border-line">
      <th scope="col" className="sticky left-0 z-10 bg-surface" />
      {header.map((cell) => (
        <th
          key={cell.userId ?? cell.displayName}
          scope="col"
          className={cn(
            'text-[11px] font-bold text-center py-2 px-1 truncate',
            cell.isCurrentUser ? 'text-green-700' : 'text-ink-muted',
          )}
        >
          {cell.displayName}
        </th>
      ))}
    </tr>
  );
}

function BodyRow({ row }: { row: CategoryBreakdownRow }): ReactElement {
  return (
    <tr>
      <th
        scope="row"
        className="sticky left-0 z-10 bg-surface text-[12px] font-bold text-ink text-left py-2 px-3"
      >
        {row.label}
      </th>
      {row.cells.map((cell) => (
        <td
          key={cell.userId ?? cell.displayName}
          className={cn(
            'display tnum text-center text-[13px] py-2',
            cell.isLeader
              ? 'bg-green-050 text-green-700 font-bold'
              : cell.points > 0
                ? 'text-ink font-bold'
                : 'text-ink-muted',
          )}
        >
          {cell.points}
        </td>
      ))}
    </tr>
  );
}

export function ArchiveCategoryBreakdownPanel({ rows }: Props): ReactElement | null {
  const header = rows[0]?.cells;
  if (!header || header.length === 0) return null;

  return (
    <div className="card" data-testid="archive-category-breakdown-panel">
      <span className="section-label block p-4 pb-0">Score breakdown · by category</span>
      <div className="overflow-x-auto mt-3">
        <table className="min-w-max w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <Cols header={header} />
          <thead>
            <HeaderRow header={header} />
          </thead>
          <tbody className="divide">
            {rows.map((row) => (
              <BodyRow key={row.key} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
