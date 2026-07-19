import type { MatchRow, PoolGroupScore, PoolKnockoutPick } from '@cup/db';
import type {
  ChampionPickHighlight,
  BestSingleMatchHighlight,
  BiggestUpsetHighlight,
} from '@cup/db';
import type { Tournament, TeamId } from '@cup/engine';
import { matchId as asMatchId } from '@cup/engine';
import { resolveActualWinner, computeHit } from '@/features/results';

const STAGE_LABELS: Record<string, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarterfinal',
  SF: 'Semifinal',
  Final: 'Final',
  bronze: 'Bronze Match',
};

function teamName(def: Tournament, id: string): string {
  return def.teams.find((t) => t.id === id)?.name ?? id;
}

export function computeChampionPick(
  knockoutPicks: PoolKnockoutPick[],
  def: Tournament,
  totalMembers: number,
): ChampionPickHighlight | null {
  const finalKey = def.bracket.finalMatch;
  const picks = knockoutPicks.filter((p) => p.bracketMatchKey === finalKey);
  if (picks.length === 0) return null;

  const counts = new Map<string, number>();
  for (const p of picks) counts.set(p.winnerTeamId, (counts.get(p.winnerTeamId) ?? 0) + 1);

  let bestTeamId: TeamId | null = null;
  let bestCount = 0;
  for (const team of def.teams) {
    const c = counts.get(team.id) ?? 0;
    if (c > bestCount) {
      bestCount = c;
      bestTeamId = team.id;
    }
  }
  if (!bestTeamId) return null;

  return {
    teamId: bestTeamId,
    teamName: teamName(def, bestTeamId),
    count: bestCount,
    total: totalMembers,
  };
}

export function computeBestSingleMatch(
  groupScores: PoolGroupScore[],
  allMatches: MatchRow[],
  def: Tournament,
  groupScoring: { exactScore: number; correctOutcome: number },
  totalMembers: number,
): BestSingleMatchHighlight | null {
  const groupMatches = allMatches
    .filter(
      (m) =>
        m.stage === 'group' && m.status === 'final' && m.homeGoals !== null && m.awayGoals !== null,
    )
    .toSorted((a, b) => (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0));

  let best: BestSingleMatchHighlight | null = null;
  let bestCount = 0;

  for (const match of groupMatches) {
    let exactCount = 0;
    for (const gs of groupScores) {
      if (gs.matchId !== match.id) continue;
      const { hit } = computeHit(
        match.homeGoals!,
        match.awayGoals!,
        gs.home,
        gs.away,
        groupScoring,
      );
      if (hit === 'exact') exactCount++;
    }
    if (exactCount > bestCount) {
      bestCount = exactCount;
      const home = teamName(def, match.homeTeamId ?? '?');
      const away = teamName(def, match.awayTeamId ?? '?');
      best = {
        matchId: asMatchId(match.id),
        description: `${home} ${match.homeGoals}-${match.awayGoals} ${away}`,
        homeTeam: home,
        awayTeam: away,
        homeGoals: match.homeGoals!,
        awayGoals: match.awayGoals!,
        exactCount,
        total: totalMembers,
      };
    }
  }

  return bestCount > 0 ? best : null;
}

function countCorrectPicks(
  knockoutPicks: PoolKnockoutPick[],
  matchId: string,
  winner: string,
): number {
  let pickCount = 0;
  for (const pick of knockoutPicks) {
    if (pick.bracketMatchKey === matchId && pick.winnerTeamId === winner) pickCount++;
  }
  return pickCount;
}

export function computeBiggestUpset(
  knockoutPicks: PoolKnockoutPick[],
  allMatches: MatchRow[],
  def: Tournament,
  totalMembers: number,
): BiggestUpsetHighlight | null {
  const knockoutMatches = allMatches
    .filter((m) => m.stage !== 'group' && m.status === 'final')
    .toSorted((a, b) => (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0));

  let best: BiggestUpsetHighlight | null = null;
  let bestCount = Infinity;

  for (const match of knockoutMatches) {
    const winner = resolveActualWinner(match);
    if (!winner) continue;
    const loser = winner === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
    const pickCount = countCorrectPicks(knockoutPicks, match.id, winner);

    if (pickCount > 0 && pickCount < bestCount) {
      bestCount = pickCount;
      best = {
        matchId: asMatchId(match.id),
        round: STAGE_LABELS[match.stage] ?? match.stage,
        winnerTeam: teamName(def, winner),
        loserTeam: teamName(def, loser ?? '?'),
        pickCount,
        total: totalMembers,
      };
    }
  }

  return best;
}

export function computePredictionsMade(counts: {
  groupScores: number;
  knockoutPicks: number;
  finishScores: number;
  specialBets: number;
}): number {
  return counts.groupScores + counts.knockoutPicks + counts.finishScores + counts.specialBets;
}

export function computeExactScoreRatePercent(
  groupScores: PoolGroupScore[],
  allMatches: MatchRow[],
  groupScoring: { exactScore: number; correctOutcome: number },
): number {
  const matchById = new Map(allMatches.map((m) => [m.id, m]));
  let exact = 0;
  let total = 0;

  for (const gs of groupScores) {
    const match = matchById.get(gs.matchId);
    if (
      !match ||
      match.status !== 'final' ||
      match.homeGoals === null ||
      match.awayGoals === null
    ) {
      continue;
    }
    total++;
    const { hit } = computeHit(match.homeGoals, match.awayGoals, gs.home, gs.away, groupScoring);
    if (hit === 'exact') exact++;
  }

  return total > 0 ? Math.round((exact / total) * 100) : 0;
}
