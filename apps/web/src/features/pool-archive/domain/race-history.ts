export type StageHistoryPlayer = {
  displayName: string;
  points: number[];
  stageReasons: (string | null)[] | null;
};

export type LeadChangeEvent = {
  stageIndex: number;
  stageName: string;
  leaderDisplayName: string;
  reason: string | null;
  pointsAtStage: number;
};

export type BiggestRiserEvent = {
  displayName: string;
  fromRank: number;
  toRank: number;
  stageName: string;
  reason: string | null;
} | null;

/**
 * Ranks players by points at a given stage, highest first. Ties break by
 * displayName ascending, matching the getLeaderboard convention.
 */
function rankAtStage(players: StageHistoryPlayer[], stageIndex: number): Map<string, number> {
  const sorted = [...players]
    .map((p) => ({ displayName: p.displayName, points: p.points[stageIndex] ?? 0 }))
    .sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName));

  const ranks = new Map<string, number>();
  sorted.forEach((p, i) => ranks.set(p.displayName, i + 1));
  return ranks;
}

export function computeLeadChanges(
  players: StageHistoryPlayer[],
  stages: string[],
): LeadChangeEvent[] {
  if (players.length === 0 || stages.length === 0) return [];

  const events: LeadChangeEvent[] = [];
  let currentLeader: string | null = null;

  for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
    const ranks = rankAtStage(players, stageIndex);
    const leaderName = [...ranks.entries()].find(([, rank]) => rank === 1)?.[0];
    if (leaderName === undefined || leaderName === currentLeader) continue;

    const leader = players.find((p) => p.displayName === leaderName);
    events.push({
      stageIndex,
      stageName: stages[stageIndex] ?? '',
      leaderDisplayName: leaderName,
      reason: leader?.stageReasons?.[stageIndex] ?? null,
      pointsAtStage: leader?.points[stageIndex] ?? 0,
    });
    currentLeader = leaderName;
  }

  return events;
}

export function computeBiggestRiser(
  players: StageHistoryPlayer[],
  stages: string[],
): BiggestRiserEvent {
  if (players.length < 2 || stages.length < 2) return null;

  let best: BiggestRiserEvent = null;
  let bestImprovement = 0;

  for (let stageIndex = 1; stageIndex < stages.length; stageIndex++) {
    const previousRanks = rankAtStage(players, stageIndex - 1);
    const currentRanks = rankAtStage(players, stageIndex);

    for (const player of players) {
      const fromRank = previousRanks.get(player.displayName);
      const toRank = currentRanks.get(player.displayName);
      if (fromRank === undefined || toRank === undefined) continue;

      const improvement = fromRank - toRank; // positive = moved up (toward #1)
      if (improvement > bestImprovement) {
        bestImprovement = improvement;
        best = {
          displayName: player.displayName,
          fromRank,
          toRank,
          stageName: stages[stageIndex] ?? '',
          reason: player.stageReasons?.[stageIndex] ?? null,
        };
      }
    }
  }

  return best;
}
