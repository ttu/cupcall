import type { ReactElement } from 'react';
import type { GroupView } from '../domain/types';

export function GroupJumpNav({ groups }: { groups: GroupView[] }): ReactElement {
  function jumpToGroup(groupId: string) {
    document
      .getElementById(`predict-group-${groupId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {groups.map((g) => {
        const hasIncomplete = g.matches.some((m) => m.predictedHome === null);
        return (
          <button
            key={g.groupId}
            type="button"
            onClick={() => jumpToGroup(g.groupId)}
            style={{
              width: 38,
              height: 38,
              borderRadius: 9,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-display)',
              fontSize: 16,
              fontWeight: 400,
              background: 'var(--surface-2)',
              color: 'var(--ink-soft)',
              boxShadow: hasIncomplete
                ? 'inset 0 0 0 2px var(--orange-400)'
                : 'inset 0 0 0 1px var(--line)',
              transition: 'background .15s',
            }}
          >
            {g.groupId}
          </button>
        );
      })}
    </div>
  );
}
