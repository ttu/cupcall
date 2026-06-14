import type { ReactElement } from 'react';
import type { SpecialBetView } from '../domain/types';
import { Icon, cn } from '@/shared/ui';
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
      className={cn(
        'rounded-cup shadow-cup-sm p-4 flex flex-col gap-2.5 relative',
        empty && !locked
          ? 'border border-dashed border-orange-400 bg-orange-050'
          : 'border border-line-soft bg-surface',
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-8.5 h-8.5 rounded-cup-sm bg-surface-2 shadow-[inset_0_0_0_1px_var(--line)] grid place-items-center shrink-0 text-ink-muted">
          <Icon name={icon} size={16} stroke={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <label
            htmlFor={`special-${bet.key}`}
            className="text-[12.5px] font-bold text-ink-soft leading-[1.4] block"
          >
            {bet.label}
          </label>
          {bet.points !== undefined && (
            <span className="display text-xs text-ink-muted">{bet.points} pts</span>
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
          className="absolute inset-0 rounded-cup bg-white/60 grid place-items-center"
          aria-hidden="true"
        >
          <span className="page-spinner" style={{ width: 20, height: 20 }} />
        </div>
      )}
    </div>
  );
}
