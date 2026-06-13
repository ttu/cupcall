'use client';

import type { CSSProperties, ReactElement } from 'react';
import { useState } from 'react';
import type { SpecialBetView } from '../domain/types';
import { teamFlag } from '@/shared/ui';

const selectStyle: CSSProperties = {
  width: '100%',
  borderRadius: 9,
  border: '1px solid var(--line)',
  padding: '8px 12px',
  fontSize: 13,
  background: 'var(--surface)',
  color: 'var(--ink)',
  outline: 'none',
  fontFamily: 'var(--font-ui)',
};

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
        style={{ ...selectStyle, opacity: locked ? 0.5 : 1 }}
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
        style={{ ...selectStyle, opacity: locked ? 0.5 : 1 }}
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
        style={{
          width: 96,
          borderRadius: 9,
          border: '1px solid var(--line)',
          padding: '8px 12px',
          fontSize: 13,
          background: 'var(--surface)',
          color: 'var(--ink)',
          outline: 'none',
          fontFamily: 'var(--font-ui)',
          opacity: locked ? 0.5 : 1,
        }}
      />
    );
  }

  if (bet.kind === 'bool') {
    return (
      <div style={{ display: 'flex', gap: 8, opacity: locked ? 0.5 : 1 }}>
        {(['Yes', 'No'] as const).map((label) => {
          const boolVal = label === 'Yes';
          const active = bet.value === boolVal;
          return (
            <button
              key={label}
              type="button"
              disabled={locked}
              onClick={() => onSave(bet.key, boolVal)}
              style={{
                padding: '6px 16px',
                borderRadius: 9,
                border: 'none',
                fontSize: 13,
                fontWeight: 700,
                cursor: locked ? 'default' : 'pointer',
                fontFamily: 'var(--font-ui)',
                background: active ? 'var(--green-500)' : 'var(--surface-2)',
                color: active ? 'oklch(0.18 0.02 160)' : 'var(--ink)',
                boxShadow: active ? 'none' : 'inset 0 0 0 1px var(--line)',
                transition: 'background .12s',
              }}
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
      <span style={{ fontSize: 13, color: 'var(--ink)' }}>
        {bet.value !== null ? String(bet.value) : '—'}
      </span>
    );
  }

  if (mode === 'custom') {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
          style={{ ...selectStyle, flex: 1, width: 'auto' }}
        />
        <button
          type="button"
          onClick={() => setMode('select')}
          style={{
            flexShrink: 0,
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--green-700)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0 4px',
          }}
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
      style={selectStyle}
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
