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
  // Visual layout is fixed (2nd, 1st, 3rd left-to-right); pair each slot with its rank and
  // style-table index BEFORE dropping empty slots, so a missing lower rank never shifts a
  // present entry into the wrong slot's height/color/rank styling (e.g. a single entry must
  // keep rank-1 styling, not be compacted into the first array position, which is rank 2's).
  const podiumSlots = [
    { slotIndex: 0, rank: 2, entry: top3[1] },
    { slotIndex: 1, rank: 1, entry: top3[0] },
    { slotIndex: 2, rank: 3, entry: top3[2] },
  ].filter(
    (slot): slot is { slotIndex: number; rank: number; entry: LeaderboardEntry } =>
      slot.entry != null,
  );

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
        {podiumSlots.map(({ slotIndex, rank: originalRank, entry }) => {
          const h = podiumHeights[slotIndex] ?? 74;
          const isSelf = currentUserId !== null && entry.userId === currentUserId;
          const href = cardHref(entry, poolId, currentUserId, viewToken);
          const avatarIndex = entries.indexOf(entry);

          const podiumBlock = (
            <div
              key={entry.userId}
              data-testid={`podium-entry-${originalRank}`}
              className="flex flex-col items-center w-27.5 gap-1.5"
            >
              <Avatar
                name={entry.displayName}
                index={avatarIndex}
                size={avatarSizes[slotIndex] ?? 40}
              />
              <div className="text-[11px] font-bold text-on-dark-soft max-w-22.5 text-center truncate">
                {entry.displayName}
                {isSelf && ' (you)'}
              </div>
              <div
                data-testid="podium-points"
                className="display text-lg"
                style={{ color: rankColors[slotIndex] ?? 'var(--on-dark)' }}
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
                style={{ height: h, background: podiumColors[slotIndex] }}
              >
                <span
                  className="display text-[34px]"
                  style={{ color: rankColors[slotIndex] ?? 'var(--on-dark)' }}
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
