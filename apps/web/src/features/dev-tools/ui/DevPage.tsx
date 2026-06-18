'use client';

import { useTransition } from 'react';
import type { ReactElement } from 'react';
import type { DevState, SimulationCheckpoint } from '../application/get-dev-state';
import { GROUP_STAGE_DAYS } from '../constants';
import {
  loginAsUserAction,
  applyCheckpointAction,
  applyGroupStageDayAction,
  resetToFreshAction,
} from '../api/dev-actions';

const GROUP_STAGE_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatGroupStageDay(day: string): string {
  const parts = day.split('-');
  const month = parseInt(parts[1]!, 10);
  const dayNum = parseInt(parts[2]!, 10);
  return `${GROUP_STAGE_MONTH_NAMES[month - 1]} ${dayNum}`;
}

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

  function handleGroupStageDay(day: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('day', day);
      await applyGroupStageDayAction(formData);
    });
  }

  function handleResetToFresh() {
    startTransition(async () => {
      await resetToFreshAction();
    });
  }

  const { users, checkpoint: current, groupStageDay, stats } = initialState;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-ink font-cup-display">Dev Tools</h1>
        <p className="text-sm text-ink-soft mt-1">
          Development utilities — not available in production.
        </p>
      </div>

      {/* ── Simulation Checkpoints ─────────────────────────────────────────── */}
      <section aria-labelledby="simulator-heading">
        <h2
          id="simulator-heading"
          className="text-xs font-bold tracking-widest uppercase text-ink-muted mb-3 font-cup-display"
        >
          Cup Simulator
        </h2>
        <div className="rounded-cup border border-line bg-surface-2 p-4 space-y-3">
          <div className="text-xs text-ink-soft mb-4">
            Current state:{' '}
            <span className="font-semibold text-ink">{CHECKPOINT_LABELS[current]}</span>
            <span className="ml-3 text-ink-muted">
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
                      'flex-1 text-left px-4 py-2 rounded-cup text-sm font-medium transition-colors',
                      isCurrent
                        ? 'bg-[var(--brand)] text-white cursor-default'
                        : 'bg-surface border border-line text-ink hover:bg-surface-2 disabled:opacity-50',
                    ].join(' ')}
                  >
                    {CHECKPOINT_LABELS[cp]}
                    {isCurrent && <span className="ml-2 text-xs opacity-80">&#x2713; current</span>}
                  </button>
                </div>
              );
            })}
          </div>

          {isPending && <p className="text-xs text-ink-soft animate-pulse">Applying changes...</p>}
        </div>
      </section>

      {/* ── Group Stage Days ───────────────────────────────────────────────── */}
      <section aria-labelledby="group-days-heading">
        <h2
          id="group-days-heading"
          className="text-xs font-bold tracking-widest uppercase text-ink-muted mb-3 font-cup-display"
        >
          Group Stage Day
        </h2>
        <div className="rounded-cup border border-line bg-surface-2 p-4 space-y-3">
          <div className="text-xs text-ink-soft mb-4">
            Apply all group match results up to and including the selected day.
            {groupStageDay && (
              <span className="ml-2">
                Current:{' '}
                <span className="font-semibold text-ink">{formatGroupStageDay(groupStageDay)}</span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleResetToFresh}
              className="px-3 py-1.5 rounded-cup text-xs font-medium bg-surface border border-line text-ink-muted hover:bg-surface-2 disabled:opacity-50 transition-colors"
            >
              Clear
            </button>
            {GROUP_STAGE_DAYS.map((day) => {
              const isCurrent = day === groupStageDay;
              return (
                <button
                  key={day}
                  type="button"
                  disabled={isPending}
                  onClick={() => handleGroupStageDay(day)}
                  className={[
                    'px-3 py-1.5 rounded-cup text-xs font-medium transition-colors',
                    isCurrent
                      ? 'bg-[var(--brand)] text-white cursor-default'
                      : 'bg-surface border border-line text-ink hover:bg-surface-2 disabled:opacity-50',
                  ].join(' ')}
                >
                  {formatGroupStageDay(day)}
                </button>
              );
            })}
          </div>

          {isPending && <p className="text-xs text-ink-soft animate-pulse">Applying changes...</p>}
        </div>
      </section>

      {/* ── Login as User ──────────────────────────────────────────────────── */}
      <section aria-labelledby="login-heading">
        <h2
          id="login-heading"
          className="text-xs font-bold tracking-widest uppercase text-ink-muted mb-3 font-cup-display"
        >
          Login as User
        </h2>
        <div className="rounded-cup border border-line bg-surface-2 p-4">
          {users.length === 0 ? (
            <p className="text-sm text-ink-soft">
              No users found. Run{' '}
              <code className="text-xs bg-surface px-1 rounded">pnpm seed:ongoing</code> to create
              dev users.
            </p>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div key={user.id} className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleLogin(user.id)}
                    className="flex-1 text-left px-4 py-2 rounded-cup text-sm bg-surface border border-line text-ink hover:bg-surface-2 disabled:opacity-50 transition-colors"
                  >
                    <span className="font-medium">{user.displayName}</span>
                    <span className="ml-2 text-xs text-ink-muted font-mono">{user.id}</span>
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
