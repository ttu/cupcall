import type { ReactElement } from 'react';
import Link from 'next/link';
import type { PoolSummary } from '../domain/types';
import { Chip } from '@/shared/ui';

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
      className="card"
      style={{
        display: 'flex',
        overflow: 'hidden',
        padding: 0,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      {/* Left accent bar */}
      <div style={{ width: 6, background: accent, flexShrink: 0 }} />

      <div
        style={{
          flex: 1,
          padding: '18px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          minWidth: 0,
        }}
      >
        {/* Pool identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          {/* Initials square */}
          <span
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: accent,
              color: 'var(--on-dark)',
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-display)',
              fontSize: 17,
              letterSpacing: '0.02em',
              flexShrink: 0,
            }}
          >
            {initials(pool.name)}
          </span>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>
                {pool.name}
              </h2>
              {isOwner && (
                <Chip variant="green" style={{ height: 22, fontSize: 10 }}>
                  Owner
                </Chip>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 3, fontWeight: 600 }}>
              {pool.tournamentName} · {pool.memberCount}{' '}
              {pool.memberCount === 1 ? 'member' : 'members'}
            </div>
          </div>
        </div>

        {/* Score + chevron */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            flexShrink: 0,
          }}
        >
          {pool.myScore !== null && (
            <div style={{ textAlign: 'right' }}>
              <div className="eyebrow" style={{ color: 'var(--ink-muted)', marginBottom: 2 }}>
                Points
              </div>
              <span className="display" style={{ fontSize: 22, color: 'var(--ink)' }}>
                {pool.myScore}
              </span>
            </div>
          )}
          <span style={{ color: 'var(--ink-muted)', fontSize: 18, lineHeight: 1 }}>›</span>
        </div>
      </div>
    </Link>
  );
}
