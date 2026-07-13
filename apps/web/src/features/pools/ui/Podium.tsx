import type { ReactElement } from 'react';
import Link from 'next/link';
import type { LeaderboardEntry } from '../domain/types';
import type { UserId } from '@cup/engine';
import { Avatar } from '@/shared/ui';

export function cardHref(
  entry: LeaderboardEntry,
  poolId: string,
  currentUserId: UserId | null,
  viewToken?: string,
): string {
  if (viewToken) return `/view/${viewToken}/members/${entry.userId}`;
  if (currentUserId !== null && entry.userId === currentUserId) return `/pools/${poolId}/predict`;
  return `/pools/${poolId}/members/${entry.userId}`;
}

const podiumHeights = [96, 130, 74];
const podiumColors = [
  'rgba(255,255,255,.12)',
  'linear-gradient(180deg, var(--gold), oklch(0.7 0.12 80))',
  'rgba(255,255,255,.08)',
];
const rankColors = ['var(--green-400)', 'var(--on-dark)', 'var(--green-400)'];
const avatarSizes = [44, 56, 40];

type Props = {
  entries: LeaderboardEntry[];
  currentUserId: UserId | null;
  poolId: string;
  canViewCards: boolean;
  viewToken?: string;
  lastDayPoints?: { date: string; pointsByUser: Record<string, number> } | null;
};

export function Podium({
  entries,
  currentUserId,
  poolId,
  canViewCards,
  viewToken,
  lastDayPoints,
}: Props): ReactElement {
  const top3 = entries.slice(0, 3);
  const ordered = [top3[1], top3[0], top3[2]].filter(Boolean) as LeaderboardEntry[];

  return (
    <div className="turf rounded-2xl pt-6 px-5 pb-0 relative overflow-hidden mb-0">
      <div
        aria-hidden="true"
        className="absolute top-[-20%] right-[-10%] w-[60%] h-[120%] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, oklch(0.64 0.16 152 / 0.15) 0%, transparent 70%)',
        }}
      />
      <div className="flex items-end justify-center gap-2 relative z-[1]">
        {ordered.map((entry, i) => {
          const originalRank = [2, 1, 3][i]!;
          const h = podiumHeights[i] ?? 74;
          const isSelf = currentUserId !== null && entry.userId === currentUserId;
          const href = cardHref(entry, poolId, currentUserId, viewToken);
          const avatarIndex = entries.indexOf(entry);

          const podiumBlock = (
            <div
              key={entry.userId}
              data-testid={`podium-entry-${originalRank}`}
              className="flex flex-col items-center w-27.5 gap-1.5"
            >
              <Avatar name={entry.displayName} index={avatarIndex} size={avatarSizes[i] ?? 40} />
              <div className="text-[11px] font-bold text-on-dark-soft max-w-22.5 text-center truncate">
                {entry.displayName}
                {isSelf && ' (you)'}
              </div>
              <div
                data-testid="podium-points"
                className="display text-lg"
                style={{ color: rankColors[i] ?? 'var(--on-dark)' }}
              >
                {entry.pointsTotal}
              </div>
              {(lastDayPoints?.pointsByUser[entry.userId] ?? 0) > 0 && (
                <div className="text-[11px] font-bold text-green-400 tabular-nums">
                  +{lastDayPoints!.pointsByUser[entry.userId]}
                </div>
              )}
              <div
                className="w-full flex items-start justify-center pt-3 rounded-t-lg"
                style={{ height: h, background: podiumColors[i] }}
              >
                <span
                  className="display text-[34px]"
                  style={{ color: rankColors[i] ?? 'var(--on-dark)' }}
                >
                  {originalRank}
                </span>
              </div>
            </div>
          );

          return canViewCards ? (
            <Link key={entry.userId} href={href} className="no-underline">
              {podiumBlock}
            </Link>
          ) : (
            podiumBlock
          );
        })}
      </div>
    </div>
  );
}
