'use client';

import type { ReactElement } from 'react';
import { useTransition } from 'react';
import { saveSpecialBet } from '../api/actions';
import type { SpecialBetView } from '../domain/types';

type Props = {
  specials: SpecialBetView[];
  poolId: string;
  locked: boolean;
  teams: { id: string; name: string }[];
  players: { id: string; name: string }[];
  onSave?: (betKey: string, value: string | number | boolean) => void;
};

export function SpecialsSection({
  specials,
  poolId,
  locked,
  teams,
  players,
  onSave,
}: Props): ReactElement {
  const [, startTransition] = useTransition();

  function handleSave(betKey: string, value: string | number | boolean) {
    if (onSave) {
      onSave(betKey, value);
      return;
    }
    startTransition(() => {
      void saveSpecialBet({ poolId, betKey, value });
    });
  }

  return (
    <section aria-label="Special bets" className="space-y-3">
      {specials.map((bet) => (
        <div
          key={bet.key}
          className="rounded-[var(--radius)] border border-[var(--line)] bg-white shadow-[var(--shadow-sm)] px-4 py-3 flex flex-col gap-1.5"
        >
          <label htmlFor={`special-${bet.key}`} className="text-sm font-semibold text-[var(--ink)]">
            {bet.label}
          </label>
          <SpecialBetInput
            bet={bet}
            locked={locked}
            teams={teams}
            players={players}
            onSave={handleSave}
          />
        </div>
      ))}
    </section>
  );
}

function SpecialBetInput({
  bet,
  locked,
  teams,
  players,
  onSave,
}: {
  bet: SpecialBetView;
  locked: boolean;
  teams: { id: string; name: string }[];
  players: { id: string; name: string }[];
  onSave: (key: string, value: string | number | boolean) => void;
}) {
  const id = `special-${bet.key}`;
  const disabledClass = locked ? 'opacity-50 pointer-events-none' : '';

  if (bet.kind === 'team') {
    return (
      <select
        id={id}
        disabled={locked}
        defaultValue={typeof bet.value === 'string' ? bet.value : ''}
        onChange={(e) => e.target.value && onSave(bet.key, e.target.value)}
        className={`w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm bg-white text-[var(--ink)] focus:outline-none focus:border-[var(--green-500)] focus:ring-2 focus:ring-[var(--green-500)]/20 ${disabledClass}`}
      >
        <option value="">Select team…</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    );
  }

  if (bet.kind === 'player') {
    return (
      <select
        id={id}
        disabled={locked}
        defaultValue={typeof bet.value === 'string' ? bet.value : ''}
        onChange={(e) => e.target.value && onSave(bet.key, e.target.value)}
        className={`w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm bg-white text-[var(--ink)] focus:outline-none focus:border-[var(--green-500)] focus:ring-2 focus:ring-[var(--green-500)]/20 ${disabledClass}`}
      >
        <option value="">Select player…</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    );
  }

  if (bet.kind === 'number') {
    return (
      <input
        id={id}
        type="number"
        min="0"
        disabled={locked}
        defaultValue={typeof bet.value === 'number' ? bet.value : ''}
        onBlur={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v)) onSave(bet.key, v);
        }}
        className={`w-24 rounded-lg border border-[var(--line)] px-3 py-2 text-sm bg-white text-[var(--ink)] focus:outline-none focus:border-[var(--green-500)] focus:ring-2 focus:ring-[var(--green-500)]/20 ${disabledClass}`}
      />
    );
  }

  if (bet.kind === 'bool') {
    return (
      <div className={`flex gap-3 ${disabledClass}`}>
        {(['Yes', 'No'] as const).map((label) => {
          const boolVal = label === 'Yes';
          const active = bet.value === boolVal;
          return (
            <button
              key={label}
              type="button"
              disabled={locked}
              onClick={() => onSave(bet.key, boolVal)}
              className={
                'px-4 py-1.5 rounded-lg text-sm font-medium transition-all ' +
                (active
                  ? 'bg-[var(--green-500)] text-white ring-2 ring-[var(--green-400)]/40'
                  : 'bg-[var(--surface-2)] text-[var(--ink)] hover:bg-[var(--green-050)] hover:text-[var(--green-700)]')
              }
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  return null;
}
