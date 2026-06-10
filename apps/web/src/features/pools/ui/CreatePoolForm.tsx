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
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10 }}>
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
          style={{
            flex: 1,
            height: 48,
            borderRadius: 11,
            border: '1.5px solid var(--line)',
            background: 'var(--surface)',
            padding: '0 15px',
            fontSize: 15,
            color: 'var(--ink)',
            fontFamily: 'var(--font-ui)',
            boxSizing: 'border-box',
            opacity: isPending ? 0.6 : 1,
          }}
        />
        <button
          type="submit"
          disabled={isPending || name.trim().length === 0}
          className="btn btn-primary"
          style={{ opacity: isPending || name.trim().length === 0 ? 0.55 : 1 }}
        >
          {isPending ? 'Creating…' : 'Create'}
        </button>
      </div>
      {error && (
        <p role="alert" style={{ fontSize: 13, color: 'var(--danger)', margin: 0 }}>
          {error}
        </p>
      )}
    </form>
  );
}
