'use client';

import type { ReactElement } from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPool } from '../api/actions';

export function CreatePoolForm(): ReactElement {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createPool({ name });
      if (result.ok) {
        router.push(`/pools/${result.poolId}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex gap-2">
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
          className="flex-1 rounded-lg border border-[var(--line)] px-3 py-2 text-sm bg-white text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--green-500)] focus:ring-2 focus:ring-[var(--green-500)]/20 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isPending || name.trim().length === 0}
          className="px-4 py-2 rounded-lg bg-[var(--green-600)] text-white text-sm font-semibold hover:bg-[var(--green-700)] transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          {isPending ? 'Creating…' : 'Create'}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
    </form>
  );
}
