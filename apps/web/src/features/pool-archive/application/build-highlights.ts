import type { MatchRow, PoolGroupScore, PoolKnockoutPick, PoolFinishScore } from '@cup/db';
import type {
  ChampionPickHighlight,
  BestSingleMatchHighlight,
  BiggestUpsetHighlight,
  StageLeader,
} from '@cup/db';
import type { Tournament, TeamId, UserId, ScoreBreakdown } from '@cup/engine';
import { matchId as asMatchId } from '@cup/engine';
import {
  resolveActualWinner,
  computeHit,
  resolveFinaleWinner,
  deriveImplicitFinaleWinner,
} from '@/features/results';

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

/**
 * Resolves a user's effective Final/Bronze winner pick: an explicit bracket pick wins if
 * present, otherwise it's derived from their finish-score prediction. Most players only ever
 * submit a Final/Bronze scoreline (no explicit bracketMatchKey pick for those two matches), so
 * skipping this fallback silently drops the majority of predictions from any stat that counts
 * Final/Bronze picks.
 */
export function resolveEffectiveFinalePick(
  matchKey: string,
  def: Tournament,
  pickMap: Map<string, string>,
  finishScore: PoolFinishScore | undefined,
): string | null {
  return (
    pickMap.get(matchKey) ??
    resolveFinaleWinner(finishScore, (home, away) =>
      deriveImplicitFinaleWinner(matchKey, def.bracket, pickMap, home, away),
    )
  );
}

export function computeStageLeaders(
  entries: {
    userId: UserId;
    displayName: string;
    pointsTotal: number;
    breakdown: ScoreBreakdown | null;
  }[],
  pointsHistory: Map<UserId, number[]>,
  groupCompletionStageIndex: number,
): {
  groupStageLeader: StageLeader | null;
  preSpecialsLeader: StageLeader | null;
  finalWinner: StageLeader | null;
  bestKnockoutPerformer: StageLeader | null;
  bestSpecialBetsPerformer: StageLeader | null;
} {
  if (entries.length === 0) {
    return {
      groupStageLeader: null,
      preSpecialsLeader: null,
      finalWinner: null,
      bestKnockoutPerformer: null,
      bestSpecialBetsPerformer: null,
    };
  }

  let groupStageLeader: StageLeader | null = null;
  let bestGroupPoints = -Infinity;
  let preSpecialsLeader: StageLeader | null = null;
  let bestPreSpecialsPoints = -Infinity;
  let finalWinner: StageLeader | null = null;
  let bestFinalPoints = -Infinity;
  let bestKnockoutPerformer: StageLeader | null = null;
  let bestKnockoutPoints = -Infinity;
  let bestSpecialBetsPerformer: StageLeader | null = null;
  let bestSpecialBetsPoints = -Infinity;

  for (const entry of entries) {
    const groupPoints = pointsHistory.get(entry.userId)?.[groupCompletionStageIndex] ?? 0;
    if (groupPoints > bestGroupPoints) {
      bestGroupPoints = groupPoints;
      groupStageLeader = {
        userId: entry.userId,
        displayName: entry.displayName,
        points: groupPoints,
      };
    }

    const specials = entry.breakdown?.specials ?? 0;
    const preSpecialsPoints = entry.pointsTotal - specials;
    if (preSpecialsPoints > bestPreSpecialsPoints) {
      bestPreSpecialsPoints = preSpecialsPoints;
      preSpecialsLeader = {
        userId: entry.userId,
        displayName: entry.displayName,
        points: preSpecialsPoints,
      };
    }

    if (entry.pointsTotal > bestFinalPoints) {
      bestFinalPoints = entry.pointsTotal;
      finalWinner = {
        userId: entry.userId,
        displayName: entry.displayName,
        points: entry.pointsTotal,
      };
    }

    const knockoutPoints =
      (entry.breakdown?.bronze ?? 0) +
      (entry.breakdown?.final ?? 0) +
      (entry.breakdown?.roundOf16 ?? 0) +
      (entry.breakdown?.roundOf8 ?? 0) +
      (entry.breakdown?.topFour ?? 0);
    if (knockoutPoints > bestKnockoutPoints) {
      bestKnockoutPoints = knockoutPoints;
      bestKnockoutPerformer = {
        userId: entry.userId,
        displayName: entry.displayName,
        points: knockoutPoints,
      };
    }

    if (specials > bestSpecialBetsPoints) {
      bestSpecialBetsPoints = specials;
      bestSpecialBetsPerformer = {
        userId: entry.userId,
        displayName: entry.displayName,
        points: specials,
      };
    }
  }

  return {
    groupStageLeader,
    preSpecialsLeader,
    finalWinner,
    bestKnockoutPerformer,
    bestSpecialBetsPerformer,
  };
}

export function computeChampionPick(
  knockoutPicks: PoolKnockoutPick[],
  finishScores: PoolFinishScore[],
  def: Tournament,
  totalMembers: number,
): ChampionPickHighlight | null {
  const finalKey = def.bracket.finalMatch;

  const pickMapByUser = new Map<UserId, Map<string, string>>();
  for (const pick of knockoutPicks) {
    const map = pickMapByUser.get(pick.userId) ?? new Map<string, string>();
    map.set(pick.bracketMatchKey, pick.winnerTeamId);
    pickMapByUser.set(pick.userId, map);
  }
  const finishScoreByUser = new Map(
    finishScores.filter((fs) => fs.match === 'final').map((fs) => [fs.userId, fs]),
  );

  const userIds = new Set<UserId>([...pickMapByUser.keys(), ...finishScoreByUser.keys()]);
  const counts = new Map<string, number>();
  for (const uid of userIds) {
    const pickMap = pickMapByUser.get(uid) ?? new Map<string, string>();
    const winner = resolveEffectiveFinalePick(finalKey, def, pickMap, finishScoreByUser.get(uid));
    if (winner) counts.set(winner, (counts.get(winner) ?? 0) + 1);
  }

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
