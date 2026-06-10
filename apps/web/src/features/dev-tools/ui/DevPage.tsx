'use client';

import { useTransition } from 'react';
import type { ReactElement } from 'react';
import type { DevState, SimulationCheckpoint } from '../application/get-dev-state';
import { loginAsUserAction, applyCheckpointAction } from '../api/dev-actions';

type Props = { initialState: DevState };

const CHECKPOINT_LABELS: Record<SimulationCheckpoint, string> = {
  fresh: 'Reset to Fresh',
  'groups-half': 'Groups A–F done',
  'groups-done': 'All groups done',
  'r32-done': 'R32 done',
  'r16-done': 'R16 done',
  'qf-done': 'QF done',
  'finals-done': 'Finals done',
};

const CHECKPOINT_ORDER: SimulationCheckpoint[] = [
  'groups-half',
  'groups-done',
  'r32-done',
  'r16-done',
  'qf-done',
  'finals-done',
];

export function DevPage({ initialState }: Props): ReactElement {
  const [isPending, startTransition] = useTransition();

  function handleCheckpoint(checkpoint: SimulationCheckpoint) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('checkpoint', checkpoint);
      await applyCheckpointAction(formData);
    });
  }

  function handleLogin(userId: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('userId', userId);
      await loginAsUserAction(formData);
    });
  }

  const { users, checkpoint: current, stats } = initialState;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-10">
      <div>
        <h1
          className="text-2xl font-bold text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Dev Tools
        </h1>
        <p className="text-sm text-[var(--ink-soft)] mt-1">
          Development utilities — not available in production.
        </p>
      </div>

      {/* ── Simulation Checkpoints ─────────────────────────────────────────── */}
      <section aria-labelledby="simulator-heading">
        <h2
          id="simulator-heading"
          className="text-xs font-bold tracking-widest uppercase text-[var(--ink-muted)] mb-3"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Cup Simulator
        </h2>
        <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-4 space-y-3">
          <div className="text-xs text-[var(--ink-soft)] mb-4">
            Current state:{' '}
            <span className="font-semibold text-[var(--ink)]">{CHECKPOINT_LABELS[current]}</span>
            <span className="ml-3 text-[var(--ink-muted)]">
              ({stats.groupFinal}/{stats.groupTotal} group matches final, {stats.knockoutFinal}{' '}
              knockout final)
            </span>
          </div>

          <div className="space-y-2">
            {CHECKPOINT_ORDER.map((cp) => {
              const isCurrent = cp === current;
              return (
                <div key={cp} className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleCheckpoint(cp)}
                    className={[
                      'flex-1 text-left px-4 py-2 rounded-[var(--radius)] text-sm font-medium transition-colors',
                      isCurrent
                        ? 'bg-[var(--brand)] text-white cursor-default'
                        : 'bg-[var(--surface)] border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--surface-2)] disabled:opacity-50',
                    ].join(' ')}
                  >
                    {CHECKPOINT_LABELS[cp]}
                    {isCurrent && <span className="ml-2 text-xs opacity-80">&#x2713; current</span>}
                  </button>
                </div>
              );
            })}
          </div>

          {isPending && (
            <p className="text-xs text-[var(--ink-soft)] animate-pulse">Applying changes...</p>
          )}
        </div>
      </section>

      {/* ── Login as User ──────────────────────────────────────────────────── */}
      <section aria-labelledby="login-heading">
        <h2
          id="login-heading"
          className="text-xs font-bold tracking-widest uppercase text-[var(--ink-muted)] mb-3"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Login as User
        </h2>
        <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-4">
          {users.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)]">
              No users found. Run{' '}
              <code className="text-xs bg-[var(--surface)] px-1 rounded">pnpm seed:ongoing</code> to
              create dev users.
            </p>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div key={user.id} className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleLogin(user.id)}
                    className="flex-1 text-left px-4 py-2 rounded-[var(--radius)] text-sm bg-[var(--surface)] border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--surface-2)] disabled:opacity-50 transition-colors"
                  >
                    <span className="font-medium">{user.displayName}</span>
                    <span className="ml-2 text-xs text-[var(--ink-muted)] font-mono">
                      {user.id}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
