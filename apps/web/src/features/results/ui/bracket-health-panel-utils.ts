import type { KnockoutMatchView, PickStatus } from '../domain/types';

export type TopFourRow = {
  position: string;
  teamId: string;
  teamName: string;
  status: PickStatus;
  /** Set when the picked team is actually alive in the sibling Final/Bronze match instead of
   * this one (e.g. predicted for the Final but the real semifinal results sent it to Bronze).
   * Distinguishes "wrong bracket half" from a genuine elimination. */
  wrongMatchLabel: 'Final' | 'Bronze' | null;
};

/**
 * A busted pick is "wrong match, still alive" rather than truly eliminated when the picked
 * team is a confirmed participant of the sibling Final/Bronze match and hasn't lost it.
 */
function isAliveInOtherMatch(teamId: string, other: KnockoutMatchView | null): boolean {
  if (!other) return false;
  const isParticipant = other.homeTeamId === teamId || other.awayTeamId === teamId;
  if (!isParticipant) return false;
  return other.actualWinnerId === null || other.actualWinnerId === teamId;
}

function buildRow(
  position: string,
  teamId: string,
  teamName: string,
  status: PickStatus,
  otherMatch: KnockoutMatchView | null,
  otherLabel: 'Final' | 'Bronze',
): TopFourRow {
  const wrongMatchLabel =
    status === 'busted' && isAliveInOtherMatch(teamId, otherMatch) ? otherLabel : null;
  return { position, teamId, teamName, status, wrongMatchLabel };
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
