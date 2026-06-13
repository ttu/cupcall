import type { ReactElement } from 'react';
import type { SpecialBetView } from '../domain/types';
import { Icon } from '@/shared/ui';
import { SpecialBetInput } from './SpecialBetInput';

const KIND_ICON = {
  team: 'flag',
  player: 'kick',
  number: 'ball',
  bool: 'whistle',
} as const;

type Props = {
  bet: SpecialBetView;
  locked: boolean;
  isPending: boolean;
  teams: { id: string; name: string }[];
  players: { id: string; name: string; team: string }[];
  onSave: (key: string, value: string | number | boolean) => void;
};

export function SpecialBetCard({
  bet,
  locked,
  isPending,
  teams,
  players,
  onSave,
}: Props): ReactElement {
  const empty = bet.value === null;
  const icon = KIND_ICON[bet.kind] ?? 'ball';

  return (
    <div
      data-testid={`special-bet-${bet.key}`}
      aria-busy={isPending}
      style={{
        borderRadius: 'var(--radius)',
        border: empty && !locked ? '1px dashed var(--orange-400)' : '1px solid var(--line-soft)',
        background: empty && !locked ? 'var(--orange-050)' : 'var(--surface)',
        boxShadow: 'var(--shadow-sm)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        position: 'relative',
      }}
    >
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
        locked={locked || isPending}
        teams={teams}
        players={players}
        onSave={onSave}
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
}
