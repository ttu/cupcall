import type { Db } from '@cup/db';
import {
  getMatchesForTournament,
  getGroupScoresByPool,
  getKnockoutPicksByPool,
  getFinishScoresByPool,
  getSpecialBetsByPool,
  getActualResults,
  getPredictionUserIdsByPool,
} from '@cup/db';
import type {
  MatchRow,
  PoolGroupScore,
  PoolKnockoutPick,
  PoolFinishScore,
  PoolSpecialBet,
  PoolArchiveRecap,
  LeaderboardEntry,
} from '@cup/db';
import {
  buildRaceChartData,
  buildRaceEventDates,
  resolveActualWinner,
  computeHit,
} from '@/features/results';
import { findOverallGroupCompletionDate } from '@/shared/race-chart';
import { deriveCard, scoreCardAccuracy } from '@cup/engine';
import { matchId as toMatchId, teamId as toTeamId, playerId as toPlayerId } from '@cup/engine';
import { SPECIAL_BET_KINDS } from '@cup/engine';
import type {
  PoolId,
  TournamentId,
  Tournament,
  Scoring,
  UserId,
  CardInputs,
  ActualResults,
  SpecialBets,
  BetInputKind,
} from '@cup/engine';
import { userId as asUserId } from '@cup/engine';
import type { AppSchema } from '@/shared/db';
import {
  computeChampionPick,
  computeBestSingleMatch,
  computeBiggestUpset,
  computePredictionsMade,
  computeExactScoreRatePercent,
  computeStageLeaders,
  resolveEffectivePickForMatch,
  buildPickMapByUser,
  buildFinishScoreByUserAndMatch,
  STAGE_LABELS,
} from './build-highlights';

export type EntryRecapExtras = {
  pointsHistory: number[];
  stageReasons: (string | null)[];
};

type StageReasonCtx = {
  def: Tournament;
  scoring: Scoring;
};

// ---------------------------------------------------------------------------
// Precomputed per-pool indexes — built once, reused for every player/date pair
// instead of rescanning the pool-wide match/pick/score arrays each time.
// ---------------------------------------------------------------------------

/** Groups finalized matches by their kickoff date (YYYY-MM-DD), for O(1) per-date lookup. */
function groupFinalMatchesByDate(allMatches: MatchRow[]): Map<string, MatchRow[]> {
  const byDate = new Map<string, MatchRow[]>();
  for (const m of allMatches) {
    if (m.status !== 'final' || !m.kickoff) continue;
    const dateStr = m.kickoff.toISOString().slice(0, 10);
    const list = byDate.get(dateStr) ?? [];
    list.push(m);
    byDate.set(dateStr, list);
  }
  return byDate;
}

/** Groups pool-wide group scores into a per-user `matchId → score` map. */
function buildGroupScoresByUserAndMatch(
  groupScores: PoolGroupScore[],
): Map<UserId, Map<string, PoolGroupScore>> {
  const byUser = new Map<UserId, Map<string, PoolGroupScore>>();
  for (const gs of groupScores) {
    const perUser = byUser.get(gs.userId) ?? new Map<string, PoolGroupScore>();
    perUser.set(gs.matchId, gs);
    byUser.set(gs.userId, perUser);
  }
  return byUser;
}

function countExactGroupScores(
  groupMatchesToday: MatchRow[],
  groupScoresByMatch: Map<string, PoolGroupScore>,
  scoring: Scoring,
): number {
  let exactCount = 0;
  for (const m of groupMatchesToday) {
    const guess = groupScoresByMatch.get(m.id);
    if (!guess || m.homeGoals === null || m.awayGoals === null) continue;
    const { hit } = computeHit(
      m.homeGoals,
      m.awayGoals,
      guess.home,
      guess.away,
      scoring.groupMatch,
    );
    if (hit === 'exact') exactCount++;
  }
  return exactCount;
}

function describeKnockoutOutcome(
  knockoutMatchesToday: MatchRow[],
  pickMap: Map<string, string>,
  finishScoreByMatch: Map<PoolFinishScore['match'], PoolFinishScore>,
  def: Tournament,
): string | null {
  const finalKey = def.bracket.finalMatch;

  const correctTeams: string[] = [];
  let championPickCorrect = false;

  for (const m of knockoutMatchesToday) {
    const winner = resolveActualWinner(m);
    if (!winner) continue;

    const effectivePick = resolveEffectivePickForMatch(m.id, def, pickMap, finishScoreByMatch);
    if (effectivePick !== winner) continue;
    if (m.id === finalKey) championPickCorrect = true;
    else correctTeams.push(winner);
  }

  if (championPickCorrect) return 'Champion pick correct';
  if (correctTeams.length > 0) return `${correctTeams.join(', ')} advance as picked`;
  return null;
}

function describeStageReason(
  matchesThisDate: MatchRow[],
  groupScoresByMatch: Map<string, PoolGroupScore>,
  pickMap: Map<string, string>,
  finishScoreByMatch: Map<PoolFinishScore['match'], PoolFinishScore>,
  ctx: StageReasonCtx,
): string | null {
  const groupMatchesToday = matchesThisDate.filter((m) => m.stage === 'group');
  const exactCount = countExactGroupScores(groupMatchesToday, groupScoresByMatch, ctx.scoring);
  if (exactCount > 0) return `${exactCount} exact score${exactCount > 1 ? 's' : ''}`;

  const knockoutMatchesToday = matchesThisDate.filter((m) => m.stage !== 'group');
  return describeKnockoutOutcome(knockoutMatchesToday, pickMap, finishScoreByMatch, ctx.def);
}

function buildStageReasons(
  stages: string[],
  eventDates: string[],
  matchesByDate: Map<string, MatchRow[]>,
  groupScoresByMatch: Map<string, PoolGroupScore>,
  pickMap: Map<string, string>,
  finishScoreByMatch: Map<PoolFinishScore['match'], PoolFinishScore>,
  ctx: StageReasonCtx,
): (string | null)[] {
  // stages = ['Start', ...eventDates-as-labels(, 'Projected')] — index 0 ('Start') has no reason.
  const reasons: (string | null)[] = [null];

  for (const dateStr of eventDates) {
    const matchesThisDate = matchesByDate.get(dateStr) ?? [];
    reasons.push(
      describeStageReason(matchesThisDate, groupScoresByMatch, pickMap, finishScoreByMatch, ctx),
    );
  }

  // buildRaceEventDates never produces a 'Projected' stage for a finished (fully-archived)
  // tournament, so `reasons.length === stages.length` here; if it's ever short, pad with null.
  while (reasons.length < stages.length) reasons.push(null);

  return reasons;
}

/** The tournament stage/round with the most matches finalized on a given date, for display. */
function describeStageRound(matchesThisDate: MatchRow[]): string | null {
  const counts = new Map<string, number>();
  for (const m of matchesThisDate) counts.set(m.stage, (counts.get(m.stage) ?? 0) + 1);
  if (counts.size === 0) return null;

  const [dominantStage] = [...counts.entries()].toSorted((a, b) => b[1] - a[1])[0]!;
  return STAGE_LABELS[dominantStage] ?? null;
}

/**
 * Per-stage round label ('Group Stage', 'Round of 16', 'Final', ...), parallel to `stages` —
 * gives lead-change events context beyond a bare date. Index 0 ('Start') has no round.
 */
function buildStageRoundLabels(
  stages: string[],
  eventDates: string[],
  matchesByDate: Map<string, MatchRow[]>,
): (string | null)[] {
  const labels: (string | null)[] = [null];

  for (const dateStr of eventDates) {
    labels.push(describeStageRound(matchesByDate.get(dateStr) ?? []));
  }

  while (labels.length < stages.length) labels.push(null);

  return labels;
}

/**
 * Reconstructs each pool member's `CardInputs` from the pool-wide prediction arrays (already
 * fetched once for the whole pool) instead of issuing per-member `getPrediction` +
 * `getPredictionInputs` queries. `memberUserIds` seeds one entry per member with a prediction
 * row — members absent from it are skipped entirely, distinguishing "never predicted" from
 * "predicted, but every field is empty".
 */
function buildCardInputsByUser(
  memberUserIds: UserId[],
  groupScores: PoolGroupScore[],
  knockoutPicks: PoolKnockoutPick[],
  finishScores: PoolFinishScore[],
  specialBets: PoolSpecialBet[],
): Map<UserId, CardInputs> {
  const byUser = new Map<UserId, CardInputs>();
  for (const uid of memberUserIds) {
    byUser.set(uid, { groupScores: [], knockoutPicks: [], finishScores: {}, specials: {} });
  }

  for (const gs of groupScores) {
    byUser.get(gs.userId)?.groupScores.push({
      matchId: toMatchId(gs.matchId),
      home: gs.home,
      away: gs.away,
    });
  }
  for (const kp of knockoutPicks) {
    byUser.get(kp.userId)?.knockoutPicks.push({
      bracketMatchKey: kp.bracketMatchKey,
      winner: toTeamId(kp.winnerTeamId),
    });
  }
  applyFinishScores(byUser, finishScores);
  applySpecialBets(byUser, specialBets);

  return byUser;
}

function applyFinishScores(byUser: Map<UserId, CardInputs>, finishScores: PoolFinishScore[]): void {
  for (const fs of finishScores) {
    const inputs = byUser.get(fs.userId);
    if (!inputs) continue;
    const score = {
      home: fs.home,
      away: fs.away,
      ...(fs.homeTeamId !== null && { homeTeamId: toTeamId(fs.homeTeamId) }),
      ...(fs.awayTeamId !== null && { awayTeamId: toTeamId(fs.awayTeamId) }),
    };
    if (fs.match === 'final') inputs.finishScores.final = score;
    else inputs.finishScores.bronze = score;
  }
}

function applySpecialBets(byUser: Map<UserId, CardInputs>, specialBets: PoolSpecialBet[]): void {
  for (const sb of specialBets) {
    const inputs = byUser.get(sb.userId);
    if (!inputs) continue;
    const kind = SPECIAL_BET_KINDS[sb.betKey];
    if (!kind) continue;
    assignSpecialBetValue(inputs.specials, sb.betKey as keyof SpecialBets, kind, sb.value);
  }
}

/** Assigns a single special-bet value onto `specials`, branded per its declared kind. */
function assignSpecialBetValue(
  specials: SpecialBets,
  key: keyof SpecialBets,
  kind: BetInputKind,
  value: unknown,
): void {
  if (kind === 'player' && typeof value === 'string') {
    (specials as Record<string, unknown>)[key] = toPlayerId(value);
  } else if (kind === 'team' && typeof value === 'string') {
    (specials as Record<string, unknown>)[key] = toTeamId(value);
  } else if (kind === 'number' && typeof value === 'number') {
    (specials as Record<string, unknown>)[key] = value;
  } else if (kind === 'bool' && typeof value === 'boolean') {
    (specials as Record<string, unknown>)[key] = value;
  }
}

/**
 * Sums hit/attempted accuracy across every pool member's predictions. Mirrors
 * `@/shared/card-scoring`'s `rescoreCard` augmentation exactly (fills in actual results for any
 * match a member didn't predict) so this can't diverge from what real scoring already computes.
 *
 * Members with no prediction row at all are skipped entirely (contribute 0/0) rather than run
 * through the augmentation pipeline: an empty `CardInputs` has no saved group scores, so every
 * match would get backfilled with the real result and `groupOrder` accuracy would come out as a
 * phantom ~100% for someone who never predicted anything.
 */
async function computeOverallAccuracyPercent(
  db: Db<AppSchema>,
  poolId: PoolId,
  groupScores: PoolGroupScore[],
  knockoutPicks: PoolKnockoutPick[],
  finishScores: PoolFinishScore[],
  specialBets: PoolSpecialBet[],
  def: Tournament,
  actual: ActualResults,
): Promise<number> {
  const memberUserIds = await getPredictionUserIdsByPool(db, poolId);
  const cardInputsByUser = buildCardInputsByUser(
    memberUserIds,
    groupScores,
    knockoutPicks,
    finishScores,
    specialBets,
  );

  let totalHits = 0;
  let totalAttempted = 0;

  for (const inputs of cardInputsByUser.values()) {
    const savedMatchIds = new Set(inputs.groupScores.map((gs) => gs.matchId as string));
    const augmentedGroupScores = [
      ...inputs.groupScores,
      ...actual.matchResults.filter((r) => !savedMatchIds.has(r.matchId as string)),
    ];
    const derived = deriveCard({ ...inputs, groupScores: augmentedGroupScores }, def);
    const accuracy = scoreCardAccuracy(derived, inputs, actual);
    totalHits += accuracy.total.hits;
    totalAttempted += accuracy.total.attempted;
  }

  return totalAttempted > 0 ? Math.round((totalHits / totalAttempted) * 100) : 0;
}

/** Builds each chart player's per-stage points history and narrative reason, keyed by userId. */
function buildEntryExtras(
  raceChart: ReturnType<typeof buildRaceChartData>,
  eventDates: string[],
  matchesByDate: Map<string, MatchRow[]>,
  groupScoresByUserAndMatch: Map<UserId, Map<string, PoolGroupScore>>,
  pickMapByUser: Map<UserId, Map<string, string>>,
  finishScoreByUserAndMatch: Map<UserId, Map<PoolFinishScore['match'], PoolFinishScore>>,
  ctx: StageReasonCtx,
): Map<UserId, EntryRecapExtras> {
  const entryExtras = new Map<UserId, EntryRecapExtras>();
  for (const player of raceChart.chartPlayers) {
    const uid = asUserId(player.userId);
    entryExtras.set(uid, {
      pointsHistory: player.points,
      stageReasons: buildStageReasons(
        raceChart.chartStages,
        eventDates,
        matchesByDate,
        groupScoresByUserAndMatch.get(uid) ?? new Map(),
        pickMapByUser.get(uid) ?? new Map(),
        finishScoreByUserAndMatch.get(uid) ?? new Map(),
        ctx,
      ),
    });
  }
  return entryExtras;
}

function computeGroupCompletionStageIndex(
  allMatches: MatchRow[],
  def: Tournament,
  eventDates: string[],
): number {
  const groupCompletionDate = findOverallGroupCompletionDate(allMatches, def);
  return groupCompletionDate ? eventDates.indexOf(groupCompletionDate) + 1 : 0;
}

export async function buildPoolArchiveRecap(
  db: Db<AppSchema>,
  params: {
    poolId: PoolId;
    tournamentId: TournamentId;
    /** The pool's leaderboard — pass in the one the caller already fetched (e.g. `archivePool`)
     *  rather than re-querying it here. */
    leaderboard: LeaderboardEntry[];
    def: Tournament;
    scoring: Scoring;
  },
): Promise<{ recap: PoolArchiveRecap; entryExtras: Map<UserId, EntryRecapExtras> }> {
  const { poolId, tournamentId, leaderboard, def, scoring } = params;

  const [allMatches, groupScores, knockoutPicks, finishScores, specialBets, actual] =
    await Promise.all([
      getMatchesForTournament(db, tournamentId),
      getGroupScoresByPool(db, poolId),
      getKnockoutPicksByPool(db, poolId),
      getFinishScoresByPool(db, poolId),
      getSpecialBetsByPool(db, poolId),
      getActualResults(db, tournamentId),
    ]);

  const totalMembers = leaderboard.length;

  const raceChart = buildRaceChartData(leaderboard, null, {
    allMatches,
    poolGroupScores: groupScores,
    def,
    knockoutPicks,
  });

  const eventDates = buildRaceEventDates(allMatches);
  const matchesByDate = groupFinalMatchesByDate(allMatches);
  const groupScoresByUserAndMatch = buildGroupScoresByUserAndMatch(groupScores);
  const pickMapByUser = buildPickMapByUser(knockoutPicks);
  const finishScoreByUserAndMatch = buildFinishScoreByUserAndMatch(finishScores);

  const entryExtras = buildEntryExtras(
    raceChart,
    eventDates,
    matchesByDate,
    groupScoresByUserAndMatch,
    pickMapByUser,
    finishScoreByUserAndMatch,
    { def, scoring },
  );

  const groupCompletionStageIndex = computeGroupCompletionStageIndex(allMatches, def, eventDates);

  const pointsHistoryByUser = new Map(
    [...entryExtras.entries()].map(([uid, extras]) => [uid, extras.pointsHistory]),
  );
  const {
    groupStageLeader,
    preSpecialsLeader,
    finalWinner,
    bestKnockoutPerformer,
    bestSpecialBetsPerformer,
  } = computeStageLeaders(leaderboard, pointsHistoryByUser, groupCompletionStageIndex);

  const recap: PoolArchiveRecap = {
    stages: raceChart.chartStages,
    stageRoundLabels: buildStageRoundLabels(raceChart.chartStages, eventDates, matchesByDate),
    championPick: computeChampionPick(knockoutPicks, finishScores, def, totalMembers),
    bestSingleMatch: computeBestSingleMatch(
      groupScores,
      allMatches,
      def,
      scoring.groupMatch,
      totalMembers,
    ),
    biggestUpset: computeBiggestUpset(knockoutPicks, finishScores, allMatches, def, totalMembers),
    predictionsMade: computePredictionsMade({
      groupScores: groupScores.length,
      knockoutPicks: knockoutPicks.length,
      finishScores: finishScores.length,
      specialBets: specialBets.length,
    }),
    exactScoreRatePercent: computeExactScoreRatePercent(
      groupScores,
      allMatches,
      scoring.groupMatch,
    ),
    overallAccuracyPercent: await computeOverallAccuracyPercent(
      db,
      poolId,
      groupScores,
      knockoutPicks,
      finishScores,
      specialBets,
      def,
      actual,
    ),
    groupCompletionStageIndex,
    groupStageLeader,
    preSpecialsLeader,
    finalWinner,
    bestKnockoutPerformer,
    bestSpecialBetsPerformer,
  };

  return { recap, entryExtras };
}
