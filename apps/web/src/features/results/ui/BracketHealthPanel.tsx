import type { ReactElement } from 'react';
import type {
  BracketHealth,
  BracketRoundHealth,
  KnockoutMatchView,
  PickStatus,
} from '../domain/types';
import { getRoundHealthDisplay } from '../domain/bracket-health-display';
import { cn } from '@/shared/ui';

const COLOR_TEXT = { danger: 'text-danger', warning: 'text-amber-600', ok: 'text-green-700' };
const COLOR_BAR = { danger: 'bg-danger', warning: 'bg-amber-400', ok: 'bg-green-500' };

function RoundHealthRow({ round }: { round: BracketRoundHealth }): ReactElement {
  const { numerator, pendingAnnotation, missedAnnotation, color } = getRoundHealthDisplay(round);
  const total = round.totalPicks;
  const possible = round.alivePicks + round.pendingPicks;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-bold text-green-800 w-8 shrink-0">{round.label}</span>
      <div className="flex-1 h-1 rounded-full bg-green-100 overflow-hidden relative">
        {/* Pending segment (lighter, extends further) */}
        {round.pendingPicks > 0 && (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-green-300"
            style={{ width: `${total > 0 ? (possible / total) * 100 : 0}%` }}
          />
        )}
        {/* Alive segment (solid, on top) */}
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full transition-all', COLOR_BAR[color])}
          style={{ width: `${total > 0 ? (round.alivePicks / total) * 100 : 0}%` }}
        />
      </div>
      <span className={cn('text-[11px] font-semibold tabular-nums shrink-0', COLOR_TEXT[color])}>
        {numerator}/{total}
        {pendingAnnotation !== null && (
          <span className="text-green-500"> · {pendingAnnotation} pending</span>
        )}
        {missedAnnotation !== null && (
          <span className="text-danger"> · {missedAnnotation} missed</span>
        )}
      </span>
    </div>
  );
}

type Props = {
  health: BracketHealth;
  championPick: KnockoutMatchView | null;
  bronzeMatch: KnockoutMatchView | null;
};

const STATUS_TEXT: Record<PickStatus, string> = {
  alive: ' · still alive',
  busted: ' · eliminated',
  pending: ' · pending',
  'no-pick': '',
};

const STATUS_CLASS: Record<PickStatus, string> = {
  alive: 'text-green-700',
  busted: 'text-danger',
  pending: 'text-ink-muted',
  'no-pick': 'text-ink-muted',
};

type TopFourRow = {
  position: string;
  teamId: string;
  teamName: string;
  status: PickStatus;
};

function buildTopFour(
  finalMatch: KnockoutMatchView | null,
  bronzeMatch: KnockoutMatchView | null,
): TopFourRow[] {
  const rows: TopFourRow[] = [];

  if (finalMatch?.pickedWinnerId) {
    rows.push({
      position: '1st',
      teamId: finalMatch.pickedWinnerId,
      teamName: finalMatch.pickedWinnerName ?? finalMatch.pickedWinnerId,
      status: finalMatch.pickStatus,
    });
  }
  if (finalMatch?.pickedOpponentId) {
    rows.push({
      position: '2nd',
      teamId: finalMatch.pickedOpponentId,
      teamName: finalMatch.pickedOpponentName ?? finalMatch.pickedOpponentId,
      status: finalMatch.pickedOpponentStatus,
    });
  }
  if (bronzeMatch?.pickedWinnerId) {
    rows.push({
      position: '3rd',
      teamId: bronzeMatch.pickedWinnerId,
      teamName: bronzeMatch.pickedWinnerName ?? bronzeMatch.pickedWinnerId,
      status: bronzeMatch.pickStatus,
    });
  }
  if (bronzeMatch?.pickedOpponentId) {
    rows.push({
      position: '4th',
      teamId: bronzeMatch.pickedOpponentId,
      teamName: bronzeMatch.pickedOpponentName ?? bronzeMatch.pickedOpponentId,
      status: bronzeMatch.pickedOpponentStatus,
    });
  }

  return rows;
}

export function BracketHealthPanel({ health, championPick, bronzeMatch }: Props): ReactElement {
  const pct = health.totalPicks > 0 ? (health.alivePicks / health.totalPicks) * 100 : 0;
  const pendingPct =
    health.totalPicks > 0
      ? ((health.alivePicks + health.pendingPicks) / health.totalPicks) * 100
      : 0;
  const topFour = buildTopFour(championPick, bronzeMatch);

  return (
    <div className="flex flex-col gap-3">
      {/* Health card */}
      <div className="card bg-green-050 border border-green-300 py-3.5 px-4">
        <div className="eyebrow text-green-700 mb-2.5">Bracket health</div>
        <div className="flex items-baseline gap-2 mb-2.5">
          <span className="display text-green-700 text-[44px] leading-none">
            {health.alivePicks}
            <span className="text-[24px] text-green-600">/{health.totalPicks}</span>
          </span>
          <span className="text-[13px] font-bold text-green-700">picks alive</span>
        </div>
        {/* Two-segment bar: pending (lighter) behind alive (solid) */}
        <div className="bar mt-1 relative">
          {health.pendingPicks > 0 && (
            <div
              className="absolute inset-0 rounded-full bg-green-300"
              style={{ width: `${pendingPct}%` }}
            />
          )}
          <i className="relative" style={{ width: `${pct}%` }} />
        </div>
        {(health.pendingPicks > 0 || health.bustedPicks > 0 || health.missedPicks > 0) && (
          <p className="text-[11px] font-semibold mt-2 text-ink-muted">
            {[
              health.pendingPicks > 0 && `${health.pendingPicks} pending`,
              health.bustedPicks > 0 &&
                `${health.bustedPicks} pick${health.bustedPicks !== 1 ? 's' : ''} busted`,
              health.missedPicks > 0 && `${health.missedPicks} missed`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        {health.perRound.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-green-200 flex flex-col gap-1">
            {health.perRound.map((r) => (
              <RoundHealthRow key={r.label} round={r} />
            ))}
          </div>
        )}
      </div>

      {/* Top 4 picks */}
      {topFour.length > 0 && (
        <div className="card py-3 px-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <span>🏆</span>
            <span className="text-[13px] font-extrabold text-ink">Your top 4</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {topFour.map(({ position, teamId, teamName, status }) => (
              <div key={position} className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-ink-muted w-6 shrink-0">
                  {position}
                </span>
                <span className="badge sm">{teamId}</span>
                <span className={cn('font-bold text-[13px]', STATUS_CLASS[status])}>
                  {teamName}
                  {STATUS_TEXT[status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
