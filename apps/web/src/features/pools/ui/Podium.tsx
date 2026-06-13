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
};

export function Podium({
  entries,
  currentUserId,
  poolId,
  canViewCards,
  viewToken,
}: Props): ReactElement {
  const top3 = entries.slice(0, 3);
  const ordered = [top3[1], top3[0], top3[2]].filter(Boolean) as LeaderboardEntry[];

  return (
    <div
      className="turf"
      style={{
        borderRadius: 16,
        padding: '24px 20px 0',
        position: 'relative',
        overflow: 'hidden',
        marginBottom: 0,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '-20%',
          right: '-10%',
          width: '60%',
          height: '120%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, oklch(0.64 0.16 152 / 0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: 8,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {ordered.map((entry, i) => {
          const originalRank = [2, 1, 3][i]!;
          const h = podiumHeights[i] ?? 74;
          const isSelf = currentUserId !== null && entry.userId === currentUserId;
          const href = cardHref(entry, poolId, currentUserId, viewToken);
          const avatarIndex = entries.indexOf(entry);

          const podiumBlock = (
            <div
              key={entry.userId}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: 110,
                gap: 6,
              }}
            >
              <Avatar name={entry.displayName} index={avatarIndex} size={avatarSizes[i] ?? 40} />
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--on-dark-soft)',
                  maxWidth: 90,
                  textAlign: 'center',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.displayName}
                {isSelf && ' (you)'}
              </div>
              <div
                className="display"
                style={{ fontSize: 18, color: rankColors[i] ?? 'var(--on-dark)' }}
              >
                {entry.pointsTotal}
              </div>
              <div
                style={{
                  width: '100%',
                  height: h,
                  background: podiumColors[i],
                  borderRadius: '8px 8px 0 0',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  paddingTop: 12,
                }}
              >
                <span
                  className="display"
                  style={{ fontSize: 34, color: rankColors[i] ?? 'var(--on-dark)' }}
                >
                  {originalRank}
                </span>
              </div>
            </div>
          );

          return canViewCards ? (
            <Link key={entry.userId} href={href} style={{ textDecoration: 'none' }}>
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
