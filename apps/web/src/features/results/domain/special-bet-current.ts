import type { MatchRow } from '@cup/db';
import type { Tournament } from '@cup/engine';
import type { CurrentLeader } from './types';

/**
 * Returns true when a match has both goals recorded (covers 'final' and any
 * in-progress states with a known score). Other matches contribute nothing.
 */
function hasScore(m: MatchRow): boolean {
  return m.homeGoals !== null && m.awayGoals !== null;
}

/**
 * Accumulates per-team totals using the given accessor, then returns all teams
 * tied at the top tally. Returns null when no team has a positive tally.
 *
 * Names are emitted in tournament team-list order so output is deterministic.
 */
function topTeamsByTally(
  def: Tournament,
  matches: MatchRow[],
  tally: (m: MatchRow) => Array<{ teamId: string; amount: number }>,
): CurrentLeader | null {
  const totals = new Map<string, number>();
  for (const m of matches) {
    if (!hasScore(m)) continue;
    for (const entry of tally(m)) {
      totals.set(entry.teamId, (totals.get(entry.teamId) ?? 0) + entry.amount);
    }
  }

  let max = 0;
  for (const v of totals.values()) {
    if (v > max) max = v;
  }
  if (max === 0) return null;

  const teamOrder = def.teams.map((t) => t.id);
  const leaders = teamOrder.filter((id) => (totals.get(id) ?? 0) === max);
  const nameById = new Map(def.teams.map((t) => [t.id, t.name]));

  return {
    display: leaders.map((id) => nameById.get(id) ?? id).join(', '),
    detail: `${max} goals`,
    teamIds: leaders,
  };
}

function scoredByEach(m: MatchRow): Array<{ teamId: string; amount: number }> {
  const entries: Array<{ teamId: string; amount: number }> = [];
  if (m.homeTeamId !== null) entries.push({ teamId: m.homeTeamId, amount: m.homeGoals ?? 0 });
  if (m.awayTeamId !== null) entries.push({ teamId: m.awayTeamId, amount: m.awayGoals ?? 0 });
  return entries;
}

function concededByEach(m: MatchRow): Array<{ teamId: string; amount: number }> {
  const entries: Array<{ teamId: string; amount: number }> = [];
  if (m.homeTeamId !== null) entries.push({ teamId: m.homeTeamId, amount: m.awayGoals ?? 0 });
  if (m.awayTeamId !== null) entries.push({ teamId: m.awayTeamId, amount: m.homeGoals ?? 0 });
  return entries;
}

export function computeGroupTopScoringLeader(
  def: Tournament,
  matches: MatchRow[],
): CurrentLeader | null {
  return topTeamsByTally(
    def,
    matches.filter((m) => m.stage === 'group'),
    scoredByEach,
  );
}

export function computeGroupTopConcedingLeader(
  def: Tournament,
  matches: MatchRow[],
): CurrentLeader | null {
  return topTeamsByTally(
    def,
    matches.filter((m) => m.stage === 'group'),
    concededByEach,
  );
}

export function computeTournamentTopScoringLeader(
  def: Tournament,
  matches: MatchRow[],
): CurrentLeader | null {
  return topTeamsByTally(def, matches, scoredByEach);
}

export function computeTournamentTopConcedingLeader(
  def: Tournament,
  matches: MatchRow[],
): CurrentLeader | null {
  return topTeamsByTally(def, matches, concededByEach);
}

export function computeHighestMatchGoalsLeader(matches: MatchRow[]): CurrentLeader | null {
  let max = -1;
  let count = 0;
  for (const m of matches) {
    if (!hasScore(m)) continue;
    const total = (m.homeGoals ?? 0) + (m.awayGoals ?? 0);
    if (total > max) {
      max = total;
      count = 1;
    } else if (total === max) {
      count += 1;
    }
  }
  if (max < 0) return null;
  return {
    display: String(max),
    detail: count === 1 ? '1 match' : `${count} matches`,
    teamIds: [],
  };
}

export function computePenaltyShootoutCountLeader(matches: MatchRow[]): CurrentLeader | null {
  const count = matches.filter((m) => m.decidedBy === 'penalties').length;
  if (count === 0) return null;
  return { display: String(count), detail: '', teamIds: [] };
}
