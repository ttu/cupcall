import type { KnockoutMatchView, PickStatus } from './types';

/** Derives the pick status for the non-winner side of a Final or Bronze match.
 * "Alive" means the team is confirmed in the match; "busted" means both slots are
 * confirmed and this team isn't one of them; "pending" means slots aren't settled yet.
 */
export function deriveOpponentStatus(
  match: KnockoutMatchView,
  pickedOpponentId: string | null,
): PickStatus {
  if (pickedOpponentId === null) return 'no-pick';
  if (match.homeTeamId === null || match.awayTeamId === null) return 'pending';
  if (pickedOpponentId === match.homeTeamId || pickedOpponentId === match.awayTeamId)
    return 'alive';
  return 'busted';
}
