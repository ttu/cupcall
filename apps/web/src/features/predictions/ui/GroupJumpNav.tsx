import type { ReactElement } from 'react';
import type { GroupView } from '../domain/types';
import { cn } from '@/shared/ui';

export function GroupJumpNav({ groups }: { groups: GroupView[] }): ReactElement {
  function jumpToGroup(groupId: string) {
    document
      .getElementById(`predict-group-${groupId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="flex gap-[6px] flex-wrap">
      {groups.map((g) => {
        const hasIncomplete = g.matches.some((m) => m.predictedHome === null);
        return (
          <button
            key={g.groupId}
            type="button"
            onClick={() => jumpToGroup(g.groupId)}
            className={cn(
              'w-[38px] h-[38px] rounded-[9px] border-0 cursor-pointer font-[family-name:var(--font-display)] text-base font-normal bg-surface-2 text-ink-soft transition-[background] duration-150',
              hasIncomplete
                ? 'shadow-[inset_0_0_0_2px_var(--orange-400)]'
                : 'shadow-[inset_0_0_0_1px_var(--line)]',
            )}
          >
            {g.groupId}
          </button>
        );
      })}
    </div>
  );
}
