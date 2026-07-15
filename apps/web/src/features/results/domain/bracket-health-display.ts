import type { BracketRoundHealth } from './types';

export type RoundHealthDisplay = {
  /** The alive pick count (0 when round hasn't started yet). */
  numerator: number;
  /** True when the round hasn't started yet (alive=0, pending>0). */
  notStarted: boolean;
  /** Pending count shown as a secondary annotation whenever there are pending picks. */
  pendingAnnotation: number | null;
  /** Count of picks whose team was eliminated; null when zero. */
  bustedAnnotation: number | null;
  /** Count of slots the user never made a pick for; null when zero. */
  noPickAnnotation: number | null;
  /** Color bucket derived from busted/alive ratio. */
  color: 'danger' | 'warning' | 'ok';
};

export function getRoundHealthDisplay(round: BracketRoundHealth): RoundHealthDisplay {
  const { alivePicks: alive, pendingPicks: pending, bustedPicks: busted } = round;
  const possible = alive + pending;
  const hasPicks = possible + busted > 0;
  const allBusted = hasPicks && possible === 0;
  const someBusted = hasPicks && busted > 0 && possible > 0;

  const notStarted = alive === 0 && pending > 0;
  const numerator = alive;
  const pendingAnnotation = pending > 0 ? pending : null;
  const bustedAnnotation = busted > 0 ? busted : null;
  const noPick = round.totalPicks - alive - pending - busted;
  const noPickAnnotation = noPick > 0 ? noPick : null;

  const color: RoundHealthDisplay['color'] = allBusted ? 'danger' : someBusted ? 'warning' : 'ok';

  return { numerator, notStarted, pendingAnnotation, bustedAnnotation, noPickAnnotation, color };
}
