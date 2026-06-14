import type { ReactElement } from 'react';
import Link from 'next/link';
import type { PoolSummary } from '../domain/types';
import { Chip, cn } from '@/shared/ui';

const ACCENT_PALETTE = [
  'oklch(0.6 0.16 150)',
  'oklch(0.62 0.17 50)',
  'oklch(0.55 0.15 260)',
  'oklch(0.58 0.18 25)',
  'oklch(0.6 0.14 200)',
  'oklch(0.55 0.16 320)',
];

function accentColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return ACCENT_PALETTE[hash % ACCENT_PALETTE.length] ?? ACCENT_PALETTE[0]!;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return (words[0] ?? '').slice(0, 2).toUpperCase();
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
}

type Props = {
  pool: PoolSummary;
  isOwner: boolean;
};

export function PoolListItem({ pool, isOwner }: Props): ReactElement {
  const accent = accentColor(pool.id);

  return (
    <Link
      href={`/pools/${pool.id}`}
      className="card flex overflow-hidden p-0 no-underline text-inherit"
    >
      {/* Left accent bar */}
      <div className="w-[6px] shrink-0" style={{ background: accent }} />

      <div className="flex-1 py-[18px] px-5 flex items-center justify-between gap-3 min-w-0">
        {/* Pool identity */}
        <div className="flex items-center gap-[14px] min-w-0">
          {/* Initials square */}
          <span
            className="w-12 h-12 rounded-xl grid place-items-center font-cup-display text-[17px] tracking-[0.02em] text-on-dark shrink-0"
            style={{ background: accent }}
          >
            {initials(pool.name)}
          </span>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[17px] font-extrabold text-ink m-0">{pool.name}</h2>
              {isOwner && (
                <Chip variant="green" style={{ height: 22, fontSize: 10 }}>
                  Owner
                </Chip>
              )}
            </div>
            <div className="text-xs text-ink-muted mt-[3px] font-semibold">
              {pool.tournamentName} · {pool.memberCount}{' '}
              {pool.memberCount === 1 ? 'member' : 'members'}
            </div>
          </div>
        </div>

        {/* Score + chevron */}
        <div className="flex items-center gap-5 shrink-0">
          {pool.myScore !== null && (
            <div className="text-right">
              <div className="eyebrow text-ink-muted mb-[2px]">Points</div>
              <span className="display text-[22px] text-ink">{pool.myScore}</span>
            </div>
          )}
          <span className="text-ink-muted text-lg leading-none">›</span>
        </div>
      </div>
    </Link>
  );
}
