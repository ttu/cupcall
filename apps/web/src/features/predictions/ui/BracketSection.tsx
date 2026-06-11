'use client';

import type { CSSProperties, ReactElement } from 'react';
import { useTransition } from 'react';
import { saveKnockoutPick, saveFinishScore } from '../api/actions';
import type { BracketView, TieView, FinishMatchView } from '../domain/types';
import { ScoreCell } from './ScoreCell';
import { TeamBadge } from '@/shared/ui';
import { Icon } from '@/shared/ui';

// Approximate height of one TieCard + the gap below it.
// Used to compute the paddingTop offset that creates the bracket triangle.
const TIE_H = 68; // px — two PickRows + 4px top/bottom card padding
const TIE_GAP = 8; // px — gap between tie cards within a column
const U = TIE_H + TIE_GAP; // "slot unit" height

/** Top offset for column n so its ties center against the column to the left. */
function columnPaddingTop(n: number): number {
  return ((Math.pow(2, n) - 1) * U) / 2;
}

/** Gap between tie cards in column n (grows as the bracket narrows). */
function columnItemGap(n: number): number {
  return Math.pow(2, n) * U - TIE_H;
}

type Props = {
  bracket: BracketView;
  poolId: string;
  locked: boolean;
  onPick?: (bracketMatchKey: string, winner: string) => void;
  onFinishSave?: (match: 'final' | 'bronze', home: number, away: number) => void;
};

export function BracketSection({
  bracket,
  poolId,
  locked,
  onPick,
  onFinishSave,
}: Props): ReactElement {
  const [, startTransition] = useTransition();

  function handlePick(bracketMatchKey: string, winner: string) {
    if (onPick) {
      onPick(bracketMatchKey, winner);
      return;
    }
    startTransition(() => {
      void saveKnockoutPick({ poolId, bracketMatchKey, winner });
    });
  }

  function handleFinishSave(match: 'final' | 'bronze', home: number, away: number) {
    if (onFinishSave) {
      onFinishSave(match, home, away);
      return;
    }
    startTransition(() => {
      void saveFinishScore({ poolId, match, home, away });
    });
  }

  const finalColumnIndex = bracket.rounds.length;

  return (
    <section
      data-testid="bracket-section"
      aria-label="Knockout bracket predictions"
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      {/* Info banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '10px 14px',
          borderRadius: 10,
          background: 'var(--green-050)',
          border: '1px solid var(--green-300)',
          fontSize: 13,
          color: 'var(--green-700)',
        }}
      >
        <span style={{ fontWeight: 800 }}>⚡</span>
        <span>
          Pick the winner of each tie. Your group stage predictions determine who fills each slot.
        </span>
      </div>

      {/* Bracket columns */}
      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* Round columns */}
          {bracket.rounds.map((round, i) => (
            <div
              key={round.label}
              data-testid={`bracket-round-${round.label}`}
              style={{
                minWidth: 190,
                paddingTop: columnPaddingTop(i),
              }}
            >
              <div
                className="eyebrow"
                style={{ color: 'var(--ink-muted)', marginBottom: 8, paddingLeft: 2 }}
              >
                {round.label}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: columnItemGap(i),
                }}
              >
                {round.ties.map((tie) => (
                  <TieCard
                    key={tie.bracketMatchKey}
                    tie={tie}
                    locked={locked}
                    onPick={handlePick}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Final + Bronze column */}
          <div
            style={{
              minWidth: 220,
              paddingTop: columnPaddingTop(finalColumnIndex),
            }}
          >
            <div
              className="eyebrow"
              style={{ color: 'var(--ink-muted)', marginBottom: 8, paddingLeft: 2 }}
            >
              Final
            </div>
            <FinalCard
              match={bracket.final}
              matchKey="final"
              poolId={poolId}
              locked={locked}
              onSave={handleFinishSave}
              onPickWinner={handlePick}
            />
            <div
              className="eyebrow"
              style={{ color: 'var(--ink-muted)', margin: '16px 0 8px', paddingLeft: 2 }}
            >
              3rd Place
            </div>
            <FinalCard
              match={bracket.bronze}
              matchKey="bronze"
              poolId={poolId}
              locked={locked}
              onSave={handleFinishSave}
              onPickWinner={handlePick}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function TieCard({
  tie,
  locked,
  onPick,
}: {
  tie: TieView;
  locked: boolean;
  onPick: (key: string, winner: string) => void;
}) {
  const hasPick = tie.pickedWinnerId !== null;

  return (
    <div
      data-testid="bracket-tie-row"
      className="card"
      style={{
        padding: 4,
        boxShadow: 'none',
        border: hasPick ? '1px solid var(--green-300)' : '1px dashed var(--line)',
      }}
    >
      <PickRow
        testId="pick-home"
        teamId={tie.homeTeamId}
        teamName={tie.homeTeamName ?? '?'}
        isPick={tie.pickedWinnerId === tie.homeTeamId && hasPick}
        disabled={locked || !tie.homeTeamId}
        onClick={() => tie.homeTeamId && onPick(tie.bracketMatchKey, tie.homeTeamId)}
      />
      <PickRow
        testId="pick-away"
        teamId={tie.awayTeamId}
        teamName={tie.awayTeamName ?? '?'}
        isPick={tie.pickedWinnerId === tie.awayTeamId && hasPick}
        disabled={locked || !tie.awayTeamId}
        onClick={() => tie.awayTeamId && onPick(tie.bracketMatchKey, tie.awayTeamId)}
      />
    </div>
  );
}

function PickRow({
  testId,
  teamId,
  teamName,
  isPick,
  disabled,
  onClick,
}: {
  testId: string;
  teamId: string | null;
  teamName: string;
  isPick: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={isPick}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 7px',
        borderRadius: 7,
        border: 'none',
        background: isPick ? 'var(--green-050)' : 'transparent',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background .12s',
        textAlign: 'left',
      }}
    >
      <TeamBadge teamId={teamId} size="sm" />
      <span
        style={{
          flex: 1,
          fontSize: 12,
          fontWeight: 700,
          color: isPick ? 'var(--green-700)' : teamId ? 'var(--ink)' : 'var(--ink-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {teamName}
      </span>
      {isPick && <Icon name="check" size={11} color="var(--green-700)" />}
    </button>
  );
}

function tieButtonStyle(isPick: boolean, isFinal: boolean): CSSProperties {
  return {
    flex: 1,
    padding: '6px 8px',
    borderRadius: 7,
    border: isPick
      ? '1px solid var(--green-300)'
      : `1px solid ${isFinal ? 'rgba(255,255,255,.12)' : 'var(--line)'}`,
    background: isPick ? 'var(--green-050)' : isFinal ? 'rgba(255,255,255,.04)' : 'transparent',
    color: isPick ? 'var(--green-700)' : isFinal ? 'var(--on-dark)' : 'var(--ink)',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  };
}

function FinalCard({
  match,
  matchKey,
  poolId,
  locked,
  onSave,
  onPickWinner,
}: {
  match: FinishMatchView;
  matchKey: 'final' | 'bronze';
  poolId: string;
  locked: boolean;
  onSave: (match: 'final' | 'bronze', home: number, away: number) => void | Promise<void>;
  onPickWinner: (matchKey: 'final' | 'bronze', winner: string) => void;
}) {
  const isFinal = matchKey === 'final';

  const champion = (() => {
    if (match.pickedWinnerId === null) return null;
    if (match.pickedWinnerId === match.homeTeamId) {
      return { teamId: match.homeTeamId, teamName: match.homeTeamName };
    }
    if (match.pickedWinnerId === match.awayTeamId) {
      return { teamId: match.awayTeamId, teamName: match.awayTeamName };
    }
    return null;
  })();

  const scoreIsTied =
    match.predictedHome !== null &&
    match.predictedAway !== null &&
    match.predictedHome === match.predictedAway;
  const bothTeamsResolved = match.homeTeamId !== null && match.awayTeamId !== null;
  const needsTiebreak = scoreIsTied && bothTeamsResolved;

  return (
    <div
      data-testid={`${matchKey}-section`}
      style={{
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        background: isFinal ? 'var(--ink-900)' : 'var(--surface)',
        border: isFinal ? 'none' : '1px solid var(--line-soft)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Match row: home | score | away */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          gap: 6,
          padding: '10px 10px',
        }}
      >
        {/* Home team */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 5,
            minWidth: 0,
          }}
        >
          <span
            data-testid="home-team-name"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isFinal ? 'var(--on-dark-soft)' : 'var(--ink-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'right',
            }}
          >
            {match.homeTeamName ?? '—'}
          </span>
          <TeamBadge teamId={match.homeTeamId} size="sm" />
        </div>

        {/* Score cells */}
        <ScoreCell
          matchId={matchKey}
          poolId={poolId}
          home={match.predictedHome}
          away={match.predictedAway}
          locked={locked}
          onSave={(_, home, away) => Promise.resolve(onSave(matchKey, home, away))}
        />

        {/* Away team */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            minWidth: 0,
          }}
        >
          <TeamBadge teamId={match.awayTeamId} size="sm" />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isFinal ? 'var(--on-dark-soft)' : 'var(--ink-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {match.awayTeamName ?? '—'}
          </span>
        </div>
      </div>

      {/* Tiebreak winner picker (tied score, both teams known, unlocked) */}
      {needsTiebreak && !locked && (
        <div
          data-testid={`${matchKey}-winner-picker`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '6px 10px 10px',
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isFinal ? 'var(--on-dark-soft)' : 'var(--ink-muted)',
              textAlign: 'center',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            Pick the shootout winner
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              data-testid={`${matchKey}-pick-home`}
              aria-pressed={match.pickedWinnerId === match.homeTeamId}
              onClick={() => match.homeTeamId && onPickWinner(matchKey, match.homeTeamId)}
              disabled={!match.homeTeamId}
              style={tieButtonStyle(match.pickedWinnerId === match.homeTeamId, isFinal)}
            >
              {match.homeTeamName ?? '—'}
            </button>
            <button
              type="button"
              data-testid={`${matchKey}-pick-away`}
              aria-pressed={match.pickedWinnerId === match.awayTeamId}
              onClick={() => match.awayTeamId && onPickWinner(matchKey, match.awayTeamId)}
              disabled={!match.awayTeamId}
              style={tieButtonStyle(match.pickedWinnerId === match.awayTeamId, isFinal)}
            >
              {match.awayTeamName ?? '—'}
            </button>
          </div>
        </div>
      )}

      {/* Winner pill */}
      {champion?.teamId && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '2px 8px 10px',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px 4px 6px',
              borderRadius: 999,
              background: isFinal ? 'var(--gold)' : 'oklch(0.80 0.06 55)',
            }}
          >
            <TeamBadge teamId={champion.teamId} size="sm" />
            <span
              className="display"
              style={{
                fontSize: 11,
                color: isFinal ? 'oklch(0.28 0.06 80)' : 'oklch(0.32 0.06 55)',
                letterSpacing: '0.04em',
              }}
            >
              {champion.teamName}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
