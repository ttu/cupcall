import type { MatchRow } from '@cup/db';
import { deriveGroupOrders, selectQualifiers, matchId } from '@cup/engine';
import type { Tournament, GroupScore } from '@cup/engine';
import {
  computeGroupTopScoringLeader,
  computeGroupTopConcedingLeader,
  computeTournamentTopScoringLeader,
  computeTournamentTopConcedingLeader,
  computeHighestMatchGoalsLeader,
  computePenaltyShootoutCountLeader,
} from './special-bet-current';
import type { CurrentLeader } from './types';
import { resolveActualWinner as getMatchWinner } from './knockout-match-winner';

/**
 * Answers "can this specific pick still become correct?" for the special bets that have a
 * live data source. Only fires on monotonic, irreversible facts (a team will never play
 * again; a running counter already exceeded the guess) — never on who's currently ahead,
 * which can still change. See docs/superpowers/specs/2026-07-12-special-bet-impossibility-design.md.
 */
export type SpecialBetImpossibility = {
  isImpossible(betKey: string, value: unknown): boolean;
};

function hasScore(m: MatchRow): boolean {
  return m.homeGoals !== null && m.awayGoals !== null;
}

function toGroupScore(m: MatchRow): GroupScore {
  return { matchId: matchId(m.id), home: m.homeGoals ?? 0, away: m.awayGoals ?? 0 };
}

/** Teams whose group is fully played — their group-stage tallies can never change again. */
function computeGroupCompleteTeams(def: Tournament, groupMatches: MatchRow[]): Set<string> {
  const done = new Set<string>();
  for (const g of def.groups) {
    const gms = groupMatches.filter((m) => m.groupId === g.id);
    if (gms.length > 0 && gms.every((m) => m.status === 'final')) {
      for (const teamId of g.teams) done.add(teamId);
    }
  }
  return done;
}

/** Teams that will never play again: lost a completed knockout match, or the whole group
 * stage is over and they never qualified for the knockout stage at all. */
function computeTournamentDoneTeams(def: Tournament, matches: MatchRow[]): Set<string> {
  const groupMatches = matches.filter((m) => m.stage === 'group');
  const done = new Set<string>();

  for (const m of matches) {
    if (m.stage === 'group' || m.status !== 'final') continue;
    const winner = getMatchWinner(m);
    if (winner === null) continue;
    if (m.homeTeamId && m.homeTeamId !== winner) done.add(m.homeTeamId);
    if (m.awayTeamId && m.awayTeamId !== winner) done.add(m.awayTeamId);
  }

  const groupStageComplete =
    groupMatches.length > 0 && groupMatches.every((m) => m.status === 'final');
  if (groupStageComplete) {
    const scores = groupMatches.filter(hasScore).map(toGroupScore);
    const groupOrders = deriveGroupOrders(def, scores);
    const qualifiers = new Set(selectQualifiers(def, scores, groupOrders));
    for (const team of def.teams) {
      if (!qualifiers.has(team.id)) done.add(team.id);
    }
  }

  return done;
}

function isTeamPickDead(
  value: unknown,
  doneTeams: Set<string>,
  leader: CurrentLeader | null,
): boolean {
  if (typeof value !== 'string') return false;
  if (!doneTeams.has(value)) return false;
  if (leader === null) return false;
  return !leader.teamIds.includes(value);
}

function isNumberPickDead(value: unknown, leader: CurrentLeader | null): boolean {
  if (typeof value !== 'number' || leader === null) return false;
  return Number(leader.display) > value;
}

export function computeSpecialBetImpossibility(
  def: Tournament,
  matches: MatchRow[],
): SpecialBetImpossibility {
  const groupMatches = matches.filter((m) => m.stage === 'group');
  const groupCompleteTeams = computeGroupCompleteTeams(def, groupMatches);
  const tournamentDoneTeams = computeTournamentDoneTeams(def, matches);

  const groupScoringLeader = computeGroupTopScoringLeader(def, matches);
  const groupConcedingLeader = computeGroupTopConcedingLeader(def, matches);
  const tournamentScoringLeader = computeTournamentTopScoringLeader(def, matches);
  const tournamentConcedingLeader = computeTournamentTopConcedingLeader(def, matches);
  const highestMatchGoalsLeader = computeHighestMatchGoalsLeader(matches);
  const penaltyShootoutLeader = computePenaltyShootoutCountLeader(matches);

  const playerTeam = new Map(def.players.map((p) => [p.id as string, p.team as string]));

  return {
    isImpossible(betKey: string, value: unknown): boolean {
      switch (betKey) {
        case 'groupTopScoringTeam':
          return isTeamPickDead(value, groupCompleteTeams, groupScoringLeader);
        case 'groupTopConcedingTeam':
          return isTeamPickDead(value, groupCompleteTeams, groupConcedingLeader);
        case 'tournamentTopScoringTeam':
          return isTeamPickDead(value, tournamentDoneTeams, tournamentScoringLeader);
        case 'tournamentTopConcedingTeam':
          return isTeamPickDead(value, tournamentDoneTeams, tournamentConcedingLeader);
        case 'highestMatchGoals':
          return isNumberPickDead(value, highestMatchGoalsLeader);
        case 'penaltyShootoutCount':
          return isNumberPickDead(value, penaltyShootoutLeader);
        case 'finalDecisiveGoalPlayer': {
          if (typeof value !== 'string') return false;
          const team = playerTeam.get(value);
          return team !== undefined && tournamentDoneTeams.has(team);
        }
        default:
          return false;
      }
    },
  };
}
