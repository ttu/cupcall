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
    <div className="card p-[12px_14px]">
      <div className="flex items-center gap-2 font-extrabold text-[13px]">
        <Icon name="spark" size={15} color="var(--orange-500, oklch(0.65 0.2 55))" />
        The swing
      </div>
      <p className="text-xs text-ink-muted mt-2 leading-[1.55]">{text}</p>
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

  const sortedByCurrent = entries.toSorted((a, b) => b.currentPoints - a.currentPoints);
  const myCurrentRank = sortedByCurrent.findIndex((e) => e.isCurrentUser) + 1;

  if (me.projectedRank === 1 && myCurrentRank === 1) return describeLeading(stillLive);
  if (me.rankDelta > 0) return describeRising(me, entries);
  if (me.rankDelta < 0) return describeFalling(me, entries);
  return describeHolding(me, stillLive);
}

function describeLeading(stillLive: number): string {
  const liveNote =
    stillLive > 0 ? `+${stillLive} pts still live in your bracket` : 'no more picks to play';
  return `You're leading and ${liveNote}.`;
}

function describeRising(me: ProjectedEntry, entries: ProjectedEntry[]): string {
  const closestRival = entries.find(
    (e) => !e.isCurrentUser && e.projectedRank === me.projectedRank - 1,
  );
  const gap = closestRival ? me.projectedPoints - closestRival.projectedPoints : 0;
  const rivalNote = closestRival
    ? `, ${gap} pts clear of ${closestRival.displayName.split(' ')[0]}`
    : '';
  return `Your bracket picks project you to ${ordinal(me.projectedRank)}${rivalNote}.`;
}

function describeFalling(me: ProjectedEntry, entries: ProjectedEntry[]): string {
  const leader = entries.find((e) => e.projectedRank === 1 && !e.isCurrentUser);
  const gap = leader ? leader.projectedPoints - me.projectedPoints : 0;
  const leaderNote = leader ? ` — ${gap} pts behind ${leader.displayName.split(' ')[0]}` : '';
  return `You're projected ${ordinal(me.projectedRank)}${leaderNote}. Every result counts.`;
}

function describeHolding(me: ProjectedEntry, stillLive: number): string {
  return `You're holding ${ordinal(me.projectedRank)} — +${stillLive} still live from your bracket picks.`;
}
