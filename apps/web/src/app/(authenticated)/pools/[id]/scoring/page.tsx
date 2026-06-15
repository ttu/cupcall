import type { ReactElement } from 'react';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentActor } from '@/features/auth';
import { db } from '@/shared/db';
import { getPoolDetail, ScoringGuide } from '@/features/pools';
import { poolId as asPoolId } from '@cup/engine';

type Props = { params: Promise<{ id: string }> };

export default async function PoolScoringPage({ params }: Props): Promise<ReactElement> {
  const { id } = await params;
  const poolId = asPoolId(id);

  const actor = await getCurrentActor();
  if (!actor) redirect('/');

  const detail = await getPoolDetail(db, poolId);
  if (!detail) notFound();
  if (!detail.scoring) notFound();

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <Link
          href={`/pools/${poolId}`}
          className="text-xs text-ink-muted hover:text-ink transition-colors mb-2 inline-block"
        >
          ← {detail.name}
        </Link>
        <h1 className="text-2xl font-bold text-ink font-cup-display">How points are calculated</h1>
        <p className="text-sm text-ink-soft mt-0.5">{detail.tournamentName}</p>
      </div>

      <ScoringGuide scoring={detail.scoring} />
    </main>
  );
}
