'use client';

import type { ReactElement } from 'react';
import { useState } from 'react';
import type { SpecialBetView } from '../domain/types';
import { teamFlag, cn } from '@/shared/ui';

const SELECT_CLS =
  'w-full rounded-cup-sm border border-line py-2 px-3 text-[13px] bg-surface text-ink outline-none font-cup-ui';

type Props = {
  bet: SpecialBetView;
  locked: boolean;
  teams: { id: string; name: string }[];
  players: { id: string; name: string; team: string }[];
  onSave: (key: string, value: string | number | boolean) => void;
};

export function SpecialBetInput({
  bet,
  locked,
  teams,
  players,
  onSave,
}: Props): ReactElement | null {
  const id = `special-${bet.key}`;

  if (bet.kind === 'team') {
    return (
      <select
        id={id}
        disabled={locked}
        defaultValue={typeof bet.storedValue === 'string' ? bet.storedValue : ''}
        onChange={(e) => e.target.value && onSave(bet.key, e.target.value)}
        className={cn(SELECT_CLS, locked && 'opacity-50')}
      >
        <option value="">Select team…</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {teamFlag(t.id)} {t.name}
          </option>
        ))}
      </select>
    );
  }

  if (bet.kind === 'player') {
    if (bet.allowFreeText) {
      return (
        <PlayerFreeTextInput id={id} bet={bet} locked={locked} players={players} onSave={onSave} />
      );
    }
    return (
      <select
        id={id}
        disabled={locked}
        defaultValue={typeof bet.storedValue === 'string' ? bet.storedValue : ''}
        onChange={(e) => e.target.value && onSave(bet.key, e.target.value)}
        className={cn(SELECT_CLS, locked && 'opacity-50')}
      >
        <option value="">Select player…</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {teamFlag(p.team)} {p.name}
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
        className={cn(
          'w-24 rounded-cup-sm border border-line py-2 px-3 text-[13px] bg-surface text-ink outline-none font-cup-ui',
          locked && 'opacity-50',
        )}
      />
    );
  }

  if (bet.kind === 'bool') {
    return (
      <div className={cn('flex gap-2', locked && 'opacity-50')}>
        {(['Yes', 'No'] as const).map((label) => {
          const boolVal = label === 'Yes';
          const active = bet.value === boolVal;
          return (
            <button
              key={label}
              type="button"
              disabled={locked}
              onClick={() => onSave(bet.key, boolVal)}
              className={cn(
                'py-1.5 px-4 rounded-cup-sm border-0 text-[13px] font-bold font-cup-ui transition-[background] duration-[120ms]',
                locked ? 'cursor-default' : 'cursor-pointer',
                active
                  ? 'bg-green-500 text-[oklch(0.18_0.02_160)]'
                  : 'bg-surface-2 text-ink shadow-[inset_0_0_0_1px_var(--line)]',
              )}
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

function PlayerFreeTextInput({
  id,
  bet,
  locked,
  players,
  onSave,
}: {
  id: string;
  bet: SpecialBetView;
  locked: boolean;
  players: { id: string; name: string; team: string }[];
  onSave: (key: string, value: string) => void;
}): ReactElement {
  const storedIsInList =
    typeof bet.storedValue === 'string' && players.some((p) => p.id === bet.storedValue);
  const initialMode: 'select' | 'custom' =
    bet.storedValue !== null && !storedIsInList ? 'custom' : 'select';

  const [mode, setMode] = useState<'select' | 'custom'>(initialMode);
  const [customText, setCustomText] = useState(
    initialMode === 'custom' ? String(bet.storedValue) : '',
  );

  if (locked) {
    return (
      <span className="text-[13px] text-ink">{bet.value !== null ? String(bet.value) : '—'}</span>
    );
  }

  if (mode === 'custom') {
    return (
      <div className="flex gap-2 items-center">
        <input
          id={id}
          type="text"
          value={customText}
          placeholder="Type player name…"
          onChange={(e) => setCustomText(e.target.value)}
          onBlur={() => {
            const trimmed = customText.trim();
            if (trimmed) onSave(bet.key, trimmed);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className={cn(SELECT_CLS, 'flex-1 w-auto')}
        />
        <button
          type="button"
          onClick={() => setMode('select')}
          className="shrink-0 text-xs font-bold text-green-700 bg-transparent border-0 cursor-pointer px-1 py-0"
        >
          ← List
        </button>
      </div>
    );
  }

  return (
    <select
      id={id}
      defaultValue={storedIsInList ? String(bet.storedValue) : ''}
      onChange={(e) => {
        if (e.target.value === '__custom__') {
          setMode('custom');
          setCustomText('');
        } else if (e.target.value) {
          onSave(bet.key, e.target.value);
        }
      }}
      className={SELECT_CLS}
    >
      <option value="">Select player…</option>
      {players.map((p) => (
        <option key={p.id} value={p.id}>
          {teamFlag(p.team)} {p.name}
        </option>
      ))}
      <option value="__custom__">Other (type a name)…</option>
    </select>
  );
}
