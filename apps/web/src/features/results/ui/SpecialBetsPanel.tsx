import type { ReactElement } from 'react';
import type { SpecialBetResultRow } from '../domain/types';
import { Icon } from '@/shared/ui';

const KIND_ICON = {
  team: 'flag',
  player: 'kick',
  number: 'ball',
  bool: 'whistle',
} as const;

type Props = { specialBets: SpecialBetResultRow[] };

export function SpecialBetsPanel({ specialBets }: Props): ReactElement {
  const totalAwarded = specialBets.reduce((sum, b) => sum + b.pointsAwarded, 0);
  const totalPossible = specialBets.reduce((sum, b) => sum + b.points, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        className="card"
        style={{
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
        }}
      >
        <span className="display tnum" style={{ fontSize: 36, color: 'var(--ink)', lineHeight: 1 }}>
          {totalAwarded}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-muted)' }}>
          / {totalPossible} pts
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {specialBets.map((bet) => (
          <SpecialBetRow key={bet.key} bet={bet} />
        ))}
      </div>
    </div>
  );
}

function SpecialBetRow({ bet }: { bet: SpecialBetResultRow }): ReactElement {
  const icon = KIND_ICON[bet.kind] ?? 'ball';
  const isPending = bet.hit === 'pending';
  const isHit = bet.hit === 'hit';
  const isMissed = bet.hit === 'missed';

  return (
    <div
      data-testid={`special-bet-result-${bet.key}`}
      style={{
        borderRadius: 'var(--radius)',
        border: isPending
          ? '1px solid var(--line-soft)'
          : isHit
            ? '1px solid var(--green-300)'
            : '1px solid var(--line-soft)',
        background: isHit ? 'var(--green-050)' : 'var(--surface)',
        boxShadow: 'var(--shadow-sm)',
        padding: '12px 14px',
        display: 'grid',
        gridTemplateColumns: '34px 1fr auto',
        gap: 10,
        alignItems: 'start',
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          background: 'var(--surface-2)',
          boxShadow: 'inset 0 0 0 1px var(--line)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--ink-muted)',
        }}
      >
        <Icon name={icon} size={16} stroke={1.8} />
      </div>

      {/* Label + picks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            color: 'var(--ink-soft)',
            lineHeight: 1.4,
          }}
        >
          {bet.label}
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <PickDisplay value={bet.userPickDisplay} label="Your pick" />
          {bet.actualAnswerDisplay !== null && (
            <>
              <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>→</span>
              <PickDisplay value={bet.actualAnswerDisplay} label="Actual" actual />
            </>
          )}
        </div>
      </div>

      {/* Hit chip + points */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 4,
          paddingTop: 2,
        }}
      >
        {isPending ? (
          <span className="chip" style={{ height: 24, fontSize: 11 }}>
            Pending
          </span>
        ) : isHit ? (
          <span
            className="chip"
            style={{
              background: 'var(--green-500)',
              color: 'oklch(0.2 0.02 160)',
              boxShadow: 'none',
              height: 24,
              fontSize: 11,
            }}
          >
            +{bet.pointsAwarded}
          </span>
        ) : isMissed ? (
          <span className="chip red" style={{ height: 24, fontSize: 11 }}>
            +0
          </span>
        ) : null}
        <span className="display tnum" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
          {bet.points} pts
        </span>
      </div>
    </div>
  );
}

function PickDisplay({
  value,
  label,
  actual = false,
}: {
  value: string | number | boolean | null;
  label: string;
  actual?: boolean;
}): ReactElement {
  const display =
    value === null ? '—' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);

  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: actual ? 700 : 400,
        color: value === null ? 'var(--ink-muted)' : actual ? 'var(--ink)' : 'var(--ink-soft)',
        fontStyle: value === null ? 'italic' : 'normal',
      }}
    >
      {value === null ? label : display}
    </span>
  );
}
