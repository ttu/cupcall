import type { ReactElement } from 'react';
import type { MatchMatrixEntry, MatrixMatch, MatchHit } from '../domain/types';
import { Avatar, Icon } from '@/shared/ui';

export function MatchMatrix({
  entries,
  matches,
}: {
  entries: MatchMatrixEntry[];
  matches: MatrixMatch[];
}): ReactElement {
  if (matches.length === 0) {
    return (
      <div className="card" style={{ padding: '32px 24px', textAlign: 'center' }}>
        <p style={{ color: 'var(--ink-muted)', fontSize: 14, margin: 0 }}>
          No completed matches yet — come back after the first results are in.
        </p>
      </div>
    );
  }

  const topPlayer = entries[0];
  const colTemplate = `200px repeat(${matches.length}, 1fr) 64px`;

  return (
    <div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: colTemplate,
            alignItems: 'center',
            padding: '12px 16px',
            background: 'var(--surface-2)',
            borderBottom: '1px solid var(--line)',
            gap: 4,
          }}
        >
          <span className="eyebrow" style={{ color: 'var(--ink-muted)', fontSize: 10 }}>
            Player
          </span>
          {matches.map((m) => (
            <div
              key={m.matchId}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                fontSize: 11,
              }}
            >
              <span
                style={{ fontWeight: 800, color: 'var(--ink)', fontFamily: 'var(--font-display)' }}
              >
                {m.actualHome}–{m.actualAway}
              </span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--ink-muted)' }}>
                {m.homeTeamId}·{m.awayTeamId}
              </span>
            </div>
          ))}
          <span
            className="eyebrow"
            style={{ color: 'var(--ink-muted)', fontSize: 10, textAlign: 'right' }}
          >
            Total
          </span>
        </div>

        <div className="divide">
          {entries.map((row, idx) => (
            <MatrixRow key={row.userId} row={row} avatarIndex={idx} colTemplate={colTemplate} />
          ))}
        </div>
      </div>

      {topPlayer && topPlayer.totalPoints > 0 && (
        <p
          style={{
            fontSize: 12.5,
            color: 'var(--ink-muted)',
            marginTop: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="spark" size={15} color="var(--orange-500, oklch(0.65 0.2 55))" />
          {topPlayer.isCurrentUser ? (
            <>
              You lead the group-stage matrix with{' '}
              <strong style={{ color: 'var(--ink)' }}>{topPlayer.totalPoints} pts</strong>.
            </>
          ) : (
            <>
              <strong style={{ color: 'var(--ink)' }}>{topPlayer.displayName.split(' ')[0]}</strong>{' '}
              leads with {topPlayer.totalPoints} pts from these matches.
            </>
          )}
        </p>
      )}
    </div>
  );
}

function MatrixRow({
  row,
  avatarIndex,
  colTemplate,
}: {
  row: MatchMatrixEntry;
  avatarIndex: number;
  colTemplate: string;
}): ReactElement {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: colTemplate,
        alignItems: 'center',
        padding: '9px 16px',
        background: row.isCurrentUser ? 'var(--green-050)' : 'transparent',
        gap: 4,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <Avatar name={row.displayName} index={avatarIndex} size={30} />
        <span
          style={{
            fontWeight: 700,
            fontSize: 13,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: row.isCurrentUser ? 'var(--green-700)' : 'var(--ink)',
          }}
        >
          {row.displayName}
          {row.isCurrentUser && (
            <span
              className="chip green"
              style={{ height: 18, marginLeft: 7, fontSize: 9.5, verticalAlign: 'middle' }}
            >
              YOU
            </span>
          )}
        </span>
      </span>
      {row.cells.map((cell) => (
        <span key={cell.matchId} style={{ display: 'grid', placeItems: 'center' }}>
          <MatrixCell hit={cell.hit} points={cell.points} />
        </span>
      ))}
      <span
        className="display tnum"
        style={{
          textAlign: 'right',
          fontSize: 18,
          color: row.isCurrentUser ? 'var(--green-600)' : 'var(--ink)',
        }}
      >
        {row.totalPoints}
      </span>
    </div>
  );
}

function MatrixCell({ hit, points }: { hit: MatchHit; points: number }): ReactElement {
  const style: React.CSSProperties =
    hit === 'exact'
      ? { background: 'var(--green-500)', color: 'oklch(0.2 0.02 160)' }
      : hit === 'outcome'
        ? {
            background: 'var(--green-050)',
            color: 'var(--green-700)',
            boxShadow: 'inset 0 0 0 1px var(--green-300)',
          }
        : { background: 'var(--surface-2)', color: 'var(--ink-muted)' };

  return (
    <span
      style={{
        width: 36,
        height: 32,
        borderRadius: 8,
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'var(--font-display)',
        fontSize: 14,
        ...style,
      }}
    >
      {points === 0 ? '·' : points}
    </span>
  );
}
