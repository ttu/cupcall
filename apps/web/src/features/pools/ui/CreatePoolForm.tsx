'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPool } from '../api/actions';
import { cn } from '@/shared/ui';

interface Tournament {
  id: string;
  name: string;
}

interface Props {
  tournaments: Tournament[];
}

export function CreatePoolForm({ tournaments }: Props): ReactElement {
  const [name, setName] = useState('');
  const [tournamentId, setTournamentId] = useState(tournaments[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (tournaments.length === 0) {
    return <p className="text-sm text-ink-soft m-0">No tournament available yet.</p>;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createPool({ name, tournamentId });
      if (result.ok) {
        router.push(`/pools/${result.poolId}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <select
        value={tournamentId}
        onChange={(e) => setTournamentId(e.target.value)}
        disabled={isPending || tournaments.length === 1}
        aria-label="Tournament"
        data-testid="tournament-select"
        className={cn(
          'h-12 rounded-[11px] border-[1.5px] border-line bg-surface px-[15px] text-[15px] text-ink font-cup-ui',
          isPending && 'opacity-60',
        )}
      >
        {tournaments.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <div className="flex gap-[10px]">
        <input
          id="pool-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Pool name…"
          required
          maxLength={100}
          disabled={isPending}
          aria-label="Pool name"
          className={cn(
            'flex-1 h-12 rounded-[11px] border-[1.5px] border-line bg-surface px-[15px] text-[15px] text-ink box-border font-cup-ui',
            isPending && 'opacity-60',
          )}
        />
        <button
          type="submit"
          disabled={isPending || name.trim().length === 0}
          className={cn(
            'btn btn-primary',
            (isPending || name.trim().length === 0) && 'opacity-[0.55]',
          )}
        >
          {isPending ? 'Creating…' : 'Create'}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-danger m-0">
          {error}
        </p>
      )}
    </form>
  );
}
