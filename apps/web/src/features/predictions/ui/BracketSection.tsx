'use client';

import type { ReactElement } from 'react';
import { useTransition } from 'react';
import { saveKnockoutPick, saveFinishScore } from '../api/actions';
import type { BracketView, TieView, FinishMatchView } from '../domain/types';
import { ScoreCell } from './ScoreCell';
import { teamFlag } from './teamFlag';

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

  async function handleFinishSave(match: 'final' | 'bronze', home: number, away: number) {
    if (onFinishSave) {
      onFinishSave(match, home, away);
      return;
    }
    startTransition(() => {
      void saveFinishScore({ poolId, match, home, away });
    });
  }

  return (
    <section
      data-testid="bracket-section"
      aria-label="Knockout bracket predictions"
      className="space-y-6"
    >
      {bracket.rounds.map((round) => (
        <div
          key={round.label}
          data-testid={`bracket-round-${round.label}`}
          className="rounded-[var(--radius)] border border-[var(--line)] overflow-hidden bg-white shadow-[var(--shadow-sm)]"
        >
          <div className="px-4 py-2.5 turf">
            <span
              className="text-sm font-bold tracking-widest uppercase text-[var(--on-dark)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {round.label}
            </span>
          </div>
          <div className="divide">
            {round.ties.map((tie) => (
              <TieRow key={tie.bracketMatchKey} tie={tie} locked={locked} onPick={handlePick} />
            ))}
          </div>
        </div>
      ))}

      {/* Semi-final derived summary */}
      {bracket.roundOf8.length > 0 && (
        <div className="rounded-[var(--radius)] border border-[var(--line)] overflow-hidden bg-white shadow-[var(--shadow-sm)]">
          <div className="px-4 py-2.5 turf">
            <span
              className="text-sm font-bold tracking-widest uppercase text-[var(--on-dark)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Quarter-Final Teams
            </span>
          </div>
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {bracket.roundOf8.map((t) => (
              <span
                key={t.teamId}
                className="text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--orange-050)] text-[var(--orange-600)] ring-1 ring-[var(--orange-400)]/40"
              >
                {teamFlag(t.teamId)} {t.teamName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Final */}
      <FinishMatchSection
        label="Final"
        match={bracket.final}
        matchKey="final"
        poolId={poolId}
        locked={locked}
        onSave={handleFinishSave}
      />

      {/* Bronze */}
      <FinishMatchSection
        label="3rd Place"
        match={bracket.bronze}
        matchKey="bronze"
        poolId={poolId}
        locked={locked}
        onSave={handleFinishSave}
      />
    </section>
  );
}

function TieRow({
  tie,
  locked,
  onPick,
}: {
  tie: TieView;
  locked: boolean;
  onPick: (key: string, winner: string) => void;
}) {
  const { homeTeamId, homeTeamName, awayTeamId, awayTeamName, bracketMatchKey, pickedWinnerId } =
    tie;

  return (
    <div data-testid="bracket-tie-row" className="flex items-center gap-2 px-4 py-3">
      <TeamPickButton
        teamId={homeTeamId}
        teamName={homeTeamName ?? '?'}
        picked={pickedWinnerId !== null && pickedWinnerId === homeTeamId}
        disabled={locked || !homeTeamId}
        onClick={() => homeTeamId && onPick(bracketMatchKey, homeTeamId)}
        side="home"
      />
      <span className="text-[var(--ink-muted)] text-xs font-bold select-none px-1">vs</span>
      <TeamPickButton
        teamId={awayTeamId}
        teamName={awayTeamName ?? '?'}
        picked={pickedWinnerId !== null && pickedWinnerId === awayTeamId}
        disabled={locked || !awayTeamId}
        onClick={() => awayTeamId && onPick(bracketMatchKey, awayTeamId)}
        side="away"
      />
    </div>
  );
}

function TeamPickButton({
  teamId,
  teamName,
  picked,
  disabled,
  onClick,
  side,
}: {
  teamId: string | null;
  teamName: string;
  picked: boolean;
  disabled: boolean;
  onClick: () => void;
  side: 'home' | 'away';
}) {
  const align = side === 'home' ? 'text-right' : 'text-left';
  const flag = teamFlag(teamId);
  const unknown = !teamId;
  return (
    <button
      type="button"
      data-testid={side === 'home' ? 'pick-home' : 'pick-away'}
      disabled={disabled}
      onClick={onClick}
      className={
        'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ' +
        align +
        (picked
          ? ' bg-[var(--green-500)] text-white shadow-[var(--shadow-sm)] ring-2 ring-[var(--green-400)]/50'
          : unknown
            ? ' bg-[var(--surface)] text-[var(--ink-muted)] ring-1 ring-inset ring-[var(--line)] cursor-not-allowed'
            : disabled
              ? ' bg-[var(--surface-2)] text-[var(--ink-muted)] cursor-default'
              : ' bg-[var(--surface-2)] text-[var(--ink)] hover:bg-[var(--green-050)] hover:text-[var(--green-700)] cursor-pointer')
      }
    >
      {side === 'home' ? `${teamName} ${flag}` : `${flag} ${teamName}`}
    </button>
  );
}

function FinishMatchSection({
  label,
  match,
  matchKey,
  poolId,
  locked,
  onSave,
}: {
  label: string;
  match: FinishMatchView;
  matchKey: 'final' | 'bronze';
  poolId: string;
  locked: boolean;
  onSave: (match: 'final' | 'bronze', home: number, away: number) => Promise<void>;
}) {
  return (
    <div
      data-testid={`${matchKey}-section`}
      className="rounded-[var(--radius)] border border-[var(--line)] overflow-hidden bg-white shadow-[var(--shadow-sm)]"
    >
      <div className="px-4 py-2.5 turf">
        <span
          className="text-sm font-bold tracking-widest uppercase text-[var(--on-dark)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {label}
        </span>
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          data-testid="home-team-name"
          className="flex-1 text-right text-sm font-medium text-[var(--ink)] truncate"
        >
          {match.homeTeamName ?? '—'} {teamFlag(match.homeTeamId)}
        </span>
        <ScoreCell
          matchId={matchKey}
          poolId={poolId}
          home={match.predictedHome}
          away={match.predictedAway}
          locked={locked}
          onSave={(_, home, away) => onSave(matchKey, home, away)}
        />
        <span className="flex-1 text-left text-sm font-medium text-[var(--ink)] truncate">
          {teamFlag(match.awayTeamId)} {match.awayTeamName ?? '—'}
        </span>
      </div>
    </div>
  );
}
