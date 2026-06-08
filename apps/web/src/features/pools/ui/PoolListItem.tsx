import type { ReactElement } from 'react';
import Link from 'next/link';
import type { PoolSummary } from '../domain/types';

type Props = {
  pool: PoolSummary;
  isOwner: boolean;
};

export function PoolListItem({ pool, isOwner }: Props): ReactElement {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-white shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2
              className="text-base font-bold text-[var(--ink)] truncate"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {pool.name}
            </h2>
            {isOwner && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--green-050)] text-[var(--green-700)] ring-1 ring-[var(--green-300)]">
                Owner
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--ink-muted)] mt-0.5">
            {pool.tournamentName} · {pool.memberCount}{' '}
            {pool.memberCount === 1 ? 'member' : 'members'}
          </p>
          {pool.myScore !== null && (
            <p className="text-xs font-semibold text-[var(--green-700)] mt-1">
              Your score: {pool.myScore} pts
            </p>
          )}
        </div>
        <Link
          href={`/pools/${pool.id}`}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--ink-900)] text-[var(--on-dark)] text-sm font-medium hover:bg-[var(--ink-800)] transition-colors"
        >
          View pool →
        </Link>
      </div>
    </div>
  );
}
