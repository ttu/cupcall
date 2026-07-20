import type { KnockoutMatchView, PickStatus } from '../domain/types';

export type TopFourRow = {
  position: string;
  teamId: string;
  teamName: string;
  status: PickStatus;
  /** Set when a busted pick's team is actually a participant of the sibling Final/Bronze match
   * instead of this one (e.g. predicted for the Final but the real semifinal results sent it to
   * Bronze). While the sibling match is undecided this reads "playing {round}"; once it's final
   * it reports the team's real finish ("champion" / "runner-up" / "3rd place" / "4th place") so a
   * team that genuinely reached the real top four is never shown as "eliminated". Null for a
   * genuine elimination (not a participant of the sibling match at all). */
  realOutcomeLabel: string | null;
};

/** The team's real finish once the sibling Final/Bronze match it actually played is decided. */
function resolveRealFinishLabel(won: boolean, otherLabel: 'Final' | 'Bronze'): string {
  if (otherLabel === 'Final') return won ? 'champion' : 'runner-up';
  return won ? '3rd place' : '4th place';
}

/**
 * A busted pick's real outcome, derived from the sibling Final/Bronze match the picked team
 * actually played instead. Null when the team never reached that match either — a genuine
 * elimination.
 */
function resolveRealOutcomeLabel(
  teamId: string,
  other: KnockoutMatchView | null,
  otherLabel: 'Final' | 'Bronze',
): string | null {
  if (!other) return null;
  const isParticipant = other.homeTeamId === teamId || other.awayTeamId === teamId;
  if (!isParticipant) return null;
  if (other.actualWinnerId === null) return `playing ${otherLabel}`;
  return resolveRealFinishLabel(other.actualWinnerId === teamId, otherLabel);
}

function buildRow(
  position: string,
  teamId: string,
  teamName: string,
  status: PickStatus,
  otherMatch: KnockoutMatchView | null,
  otherLabel: 'Final' | 'Bronze',
): TopFourRow {
  const realOutcomeLabel =
    status === 'busted' ? resolveRealOutcomeLabel(teamId, otherMatch, otherLabel) : null;
  return { position, teamId, teamName, status, realOutcomeLabel };
}

export function buildTopFour(
  finalMatch: KnockoutMatchView | null,
  bronzeMatch: KnockoutMatchView | null,
): TopFourRow[] {
  const rows: TopFourRow[] = [];

  if (finalMatch?.pickedWinnerId) {
    rows.push(
      buildRow(
        '1st',
        finalMatch.pickedWinnerId,
        finalMatch.pickedWinnerName ?? finalMatch.pickedWinnerId,
        finalMatch.pickStatus,
        bronzeMatch,
        'Bronze',
      ),
    );
  }
  if (finalMatch?.pickedOpponentId) {
    rows.push(
      buildRow(
        '2nd',
        finalMatch.pickedOpponentId,
        finalMatch.pickedOpponentName ?? finalMatch.pickedOpponentId,
        finalMatch.pickedOpponentStatus,
        bronzeMatch,
        'Bronze',
      ),
    );
  }
  if (bronzeMatch?.pickedWinnerId) {
    rows.push(
      buildRow(
        '3rd',
        bronzeMatch.pickedWinnerId,
        bronzeMatch.pickedWinnerName ?? bronzeMatch.pickedWinnerId,
        bronzeMatch.pickStatus,
        finalMatch,
        'Final',
      ),
    );
  }
  if (bronzeMatch?.pickedOpponentId) {
    rows.push(
      buildRow(
        '4th',
        bronzeMatch.pickedOpponentId,
        bronzeMatch.pickedOpponentName ?? bronzeMatch.pickedOpponentId,
        bronzeMatch.pickedOpponentStatus,
        finalMatch,
        'Final',
      ),
    );
  }

  return rows;
}
