'use client';

import type { CSSProperties, ReactElement } from 'react';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { saveSpecialBet } from '../api/actions';
import type { SpecialBetView } from '../domain/types';
import { Icon, teamFlag } from '@/shared/ui';

const KIND_ICON = {
  team: 'flag',
  player: 'kick',
  number: 'ball',
  bool: 'whistle',
} as const;

type Props = {
  specials: SpecialBetView[];
  poolId: string;
  locked: boolean;
  teams: { id: string; name: string }[];
  players: { id: string; name: string; team: string }[];
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
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const allFilled = specials.every((b) => b.value !== null);

  function handleSave(betKey: string, value: string | number | boolean) {
    if (onSave) {
      onSave(betKey, value);
      return;
    }
    setPendingKey(betKey);
    startTransition(async () => {
      await saveSpecialBet({ poolId, betKey, value });
      setPendingKey(null);
    });
  }

  return (
    <section
      data-testid="specials-section"
      aria-label="Special bets"
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
        }}
      >
        {specials.map((bet) => {
          const betLocked = locked || bet.locked;
          const empty = bet.value === null;
          const icon = KIND_ICON[bet.kind] ?? 'ball';
          const isPending = pendingKey === bet.key;
          return (
            <div
              key={bet.key}
              data-testid={`special-bet-${bet.key}`}
              aria-busy={isPending}
              style={{
                borderRadius: 'var(--radius)',
                border:
                  empty && !betLocked
                    ? '1px dashed var(--orange-400)'
                    : '1px solid var(--line-soft)',
                background: empty && !betLocked ? 'var(--orange-050)' : 'var(--surface)',
                boxShadow: 'var(--shadow-sm)',
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                position: 'relative',
              }}
            >
              {/* Icon + label + points row */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: 'var(--surface-2)',
                    boxShadow: 'inset 0 0 0 1px var(--line)',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    color: 'var(--ink-muted)',
                  }}
                >
                  <Icon name={icon} size={16} stroke={1.8} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label
                    htmlFor={`special-${bet.key}`}
                    style={{
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: 'var(--ink-soft)',
                      lineHeight: 1.4,
                      display: 'block',
                    }}
                  >
                    {bet.label}
                  </label>
                  {bet.points !== undefined && (
                    <span className="display" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                      {bet.points} pts
                    </span>
                  )}
                </div>
              </div>
              <SpecialBetInput
                bet={bet}
                locked={betLocked || isPending}
                teams={teams}
                players={players}
                onSave={handleSave}
              />
              {isPending && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 'var(--radius)',
                    background: 'rgba(255,255,255,0.6)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                  aria-hidden="true"
                >
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      border: '2px solid var(--green-300)',
                      borderTopColor: 'var(--green-600)',
                      animation: 'spin 0.75s linear infinite',
                      display: 'block',
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer CTA */}
      {!locked && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 16px',
            borderRadius: 'var(--radius)',
            background: allFilled ? 'var(--green-050)' : 'var(--surface-2)',
            boxShadow: allFilled
              ? 'inset 0 0 0 1px var(--green-300)'
              : 'inset 0 0 0 1px var(--line)',
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: allFilled ? 'var(--green-700)' : 'var(--ink-muted)',
            }}
          >
            {allFilled
              ? 'All special bets saved ✓'
              : 'Fill in all special bets to complete your card'}
          </span>
          <Link
            href={`/pools/${poolId}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 40,
              padding: '0 18px',
              borderRadius: 11,
              background: allFilled ? 'var(--green-500)' : 'var(--ink-900)',
              color: allFilled ? 'oklch(0.18 0.02 160)' : 'var(--on-dark)',
              fontFamily: 'var(--font-ui)',
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Lock in my card
          </Link>
        </div>
      )}
    </section>
  );
}

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
  players: { id: string; name: string; team: string }[];
  onSave: (key: string, value: string | number | boolean) => void;
}) {
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
}) {
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
