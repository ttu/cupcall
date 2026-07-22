import type { ReactElement } from 'react';
import { cn } from '@/shared/ui';
import type { CategoryBreakdownRow } from '../domain/category-breakdown';

type Props = { rows: CategoryBreakdownRow[] };

const LABEL_COL_WIDTH = 148;
const MEMBER_COL_WIDTH = 88;

export function ArchiveCategoryBreakdownPanel({ rows }: Props): ReactElement | null {
  const header = rows[0]?.cells;
  if (!header || header.length === 0) return null;

  const colTemplate = `${LABEL_COL_WIDTH}px repeat(${header.length}, ${MEMBER_COL_WIDTH}px)`;

  return (
    <div className="card" data-testid="archive-category-breakdown-panel">
      <span className="section-label block p-4 pb-0">Score breakdown · by category</span>
      <div className="overflow-x-auto mt-3">
        <div className="min-w-max">
          <div
            className="grid gap-1 border-b border-line"
            style={{ gridTemplateColumns: colTemplate }}
          >
            <div className="sticky left-0 z-10 bg-surface" />
            {header.map((cell) => (
              <span
                key={cell.userId ?? cell.displayName}
                className={cn(
                  'text-[11px] font-bold text-center py-2 px-1 truncate',
                  cell.isCurrentUser ? 'text-green-700' : 'text-ink-muted',
                )}
              >
                {cell.displayName}
              </span>
            ))}
          </div>

          <div className="divide">
            {rows.map((row) => (
              <div
                key={row.key}
                className="grid gap-1 items-center"
                style={{ gridTemplateColumns: colTemplate }}
              >
                <span className="sticky left-0 z-10 bg-surface text-[12px] font-bold text-ink py-2 px-3">
                  {row.label}
                </span>
                {row.cells.map((cell) => (
                  <span
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
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
