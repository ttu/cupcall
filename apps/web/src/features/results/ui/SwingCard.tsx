import type { ReactElement } from 'react';
import type { ProjectedEntry } from '../domain/types';
import { Icon } from '@/shared/ui';
import { ordinal } from './ProjectedStandings';

export function SwingCard({
  entries,
  stillLive,
}: {
  entries: ProjectedEntry[];
  stillLive: number;
}): ReactElement {
  const me = entries.find((e) => e.isCurrentUser);
  const text = buildSwingText(me, entries, stillLive);

  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 13 }}>
        <Icon name="spark" size={15} color="var(--orange-500, oklch(0.65 0.2 55))" />
        The swing
      </div>
      <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 8, lineHeight: 1.55 }}>
        {text}
      </p>
    </div>
  );
}

function buildSwingText(
  me: ProjectedEntry | undefined,
  entries: ProjectedEntry[],
  stillLive: number,
): string {
  if (!me) return 'Make predictions to see your projection.';
  if (stillLive === 0) return 'No bracket picks still live — your total is final.';

  const sortedByCurrent = [...entries].sort((a, b) => b.currentPoints - a.currentPoints);
  const myCurrentRank = sortedByCurrent.findIndex((e) => e.isCurrentUser) + 1;

  if (me.projectedRank === 1 && myCurrentRank === 1) {
    return `You're leading and ${stillLive > 0 ? `+${stillLive} pts still live in your bracket` : 'no more picks to play'}.`;
  }
  if (me.rankDelta > 0) {
    const closestRival = entries.find(
      (e) => !e.isCurrentUser && e.projectedRank === me.projectedRank - 1,
    );
    const gap = closestRival ? me.projectedPoints - closestRival.projectedPoints : 0;
    return `Your bracket picks project you to ${ordinal(me.projectedRank)}${closestRival ? `, ${gap} pts clear of ${closestRival.displayName.split(' ')[0]}` : ''}.`;
  }
  if (me.rankDelta < 0) {
    const leader = entries.find((e) => e.projectedRank === 1 && !e.isCurrentUser);
    const gap = leader ? leader.projectedPoints - me.projectedPoints : 0;
    return `You're projected ${ordinal(me.projectedRank)}${leader ? ` — ${gap} pts behind ${leader.displayName.split(' ')[0]}` : ''}. Every result counts.`;
  }
  return `You're holding ${ordinal(me.projectedRank)} — +${stillLive} still live from your bracket picks.`;
}
