import type { BracketRoundHealth } from './types';

export type RoundHealthDisplay = {
  /** The main numeric count to show (pending count when round not started, alive count otherwise). */
  numerator: number;
  /** True when the round hasn't started yet (alive=0, pending>0). Main count carries a '?'. */
  notStarted: boolean;
  /** Pending count to show as a secondary annotation when round is in progress (alive>0, pending>0). */
  pendingAnnotation: number | null;
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
  const numerator = notStarted ? pending : alive;
  const pendingAnnotation = !notStarted && pending > 0 ? pending : null;

  const color: RoundHealthDisplay['color'] = allBusted ? 'danger' : someBusted ? 'warning' : 'ok';

  return { numerator, notStarted, pendingAnnotation, color };
}
