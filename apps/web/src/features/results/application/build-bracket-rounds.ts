import type { MatchRow, PoolGroupScore, PoolKnockoutPick } from '@cup/db';
import { deriveGroupOrders, selectQualifiers, matchId, resolveSlot } from '@cup/engine';
import type { Tournament, BracketMatchKey, GroupScore } from '@cup/engine';
import type { KnockoutMatchView, BracketRoundResultView, MatchHit } from '../domain/types';
import {
  derivePredictedOpponent,
  deriveImplicitFinaleWinner,
  resolveFinaleWinner,
} from '../domain/finale-winner';
import {
  resolveActualWinner as getMatchWinner,
  computeKnockoutEliminatedTeams,
  computeSemiFinalLoserTeams,
} from '../domain/knockout-match-winner';
import { resolveCrossSlotPick } from '../domain/cross-slot-pick';
import { buildHitPointsMap } from '../domain/hit-points';
export { computeBracketHealth } from '../domain/bracket-health';
export { derivePredictedOpponent, deriveImplicitFinaleWinner } from '../domain/finale-winner';

export function buildBracketRounds(
  def: Tournament,
  allMatches: MatchRow[],
  inputs: {
    knockoutPicks: { bracketMatchKey: string; winner: string }[];
    finishScores: {
      final?: {
        home: number;
        away: number;
        homeTeamId?: string | null;
        awayTeamId?: string | null;
      };
      bronze?: {
        home: number;
        away: number;
        homeTeamId?: string | null;
        awayTeamId?: string | null;
      };
    };
  } | null,
  poolGroupScores: PoolGroupScore[],
  poolKnockoutPicks: PoolKnockoutPick[],
): { bracketRounds: BracketRoundResultView[]; bronzeMatch: KnockoutMatchView | null } {
  const teamMap = new Map<string, string>(def.teams.map((t) => [t.id, t.name]));
  const teamRankingMap = new Map<string, number>(
    def.teams.filter((t) => t.fifaRanking !== undefined).map((t) => [t.id, t.fifaRanking!]),
  );
  const matchByKey = new Map<string, MatchRow>(allMatches.map((m) => [m.id, m]));

  const knockoutEliminatedTeams = computeKnockoutEliminatedTeams(allMatches);
  // A semifinal loser advances to play Bronze — it is not out of the tournament, unlike a
  // R32/R16/QF/SF loser elsewhere. Bronze-specific pick checks below must not treat it as
  // eliminated, even though knockoutEliminatedTeams (correctly) does for Final purposes.
  const semiFinalLoserTeams = computeSemiFinalLoserTeams(allMatches, def.bracket.semiFinals);
  const pickMap = new Map<string, string>(
    (inputs?.knockoutPicks ?? []).map((kp) => [kp.bracketMatchKey, kp.winner]),
  );
  const {
    participants: derivedParticipants,
    projectedKeys,
    confirmedHome,
    confirmedAway,
  } = computeDerivedParticipants(def, allMatches);
  const userPredictedParticipants = inputs
    ? computeUserPredictedParticipants(def, allMatches, pickMap, derivedParticipants)
    : new Map<string, [string | null, string | null]>();
  const userPickedParticipants = inputs
    ? computeUserPickedParticipants(def, pickMap, derivedParticipants)
    : new Map<string, [string | null, string | null]>();
  const entryRoundKeys = new Set(def.bracket.slots.map((s) => s.match as string));
  const r32PredPcts = computeEntryRoundPredictionPcts(def, poolGroupScores);
  const knockoutRoundPcts = computeKnockoutRoundPcts(poolKnockoutPicks);
  const progressionByMatch = new Map<string, { from: string[] }>(
    def.bracket.progression.map((p) => [p.match as string, { from: p.from as string[] }]),
  );

  const finishScores = inputs?.finishScores ?? {};
  const finalMatchKey = def.bracket.finalMatch;
  const bronzeMatchKey = def.bracket.bronzeMatch;
  const hitPoints = buildHitPointsMap(def);

  // For each stage, collect all teams the user picked to advance.
  // A card shows "correct" when the actual winner of that match appears in the user's stage picks,
  // regardless of which slot the user assigned them to.
  // Use all user picks to build stage-pick sets, not just picks for DB-matched games.
  // Unplayed matches have no DB row yet, so their picks would be silently dropped if
  // we only consulted matchByKey — causing cross-slot credit to fail mid-round.
  const stagePicksMap = buildStagePicksMap(pickMap, matchByKey, def.bracket.rounds);

  // For entry-round slots, resolve each pick to the slot where the predicted team actually plays.
  // A user's group-stage predictions may have been wrong, landing their team in a different bracket
  // slot than expected. The effective pick for each slot is the cross-slot adjusted team — matching
  // the logic in computeUserPredictedParticipants — so pickStatus and pickedWinnerId are consistent
  // with the predicted bracket chain.
  const effectiveEntryPickMap = inputs
    ? buildEffectiveEntryPickMap(def, pickMap, derivedParticipants, matchByKey)
    : new Map<BracketMatchKey, string | null>();

  const buildMatchView = (key: BracketMatchKey, round: string): KnockoutMatchView => {
    const actual = matchByKey.get(key) ?? null;
    const isEntryRound = entryRoundKeys.has(key);
    const pickedId = isEntryRound
      ? (effectiveEntryPickMap.get(key) ?? null)
      : (pickMap.get(key) ?? null);

    const derivedPair = derivedParticipants.get(key);
    const homeId = actual?.homeTeamId ?? derivedPair?.[0] ?? null;
    const awayId = actual?.awayTeamId ?? derivedPair?.[1] ?? null;
    const winnerId = getMatchWinner(actual);

    const {
      isFinale,
      isBronzeMatch,
      predictedHome,
      predictedAway,
      predictedGoalsByTeam,
      effectivePickedId,
    } = resolveFinaleContext(
      key,
      finalMatchKey,
      bronzeMatchKey,
      finishScores,
      pickedId,
      bracket,
      pickMap,
    );

    const pickStatus = resolvePickStatus({
      effectivePickedId,
      winnerId,
      homeId,
      awayId,
      isBronzeMatch,
      knockoutEliminatedTeams,
      semiFinalLoserTeams,
    });

    const stagePicks = actual?.stage ? (stagePicksMap.get(actual.stage) ?? null) : null;
    const hit = computeKnockoutHit({
      pickedWinnerId: effectivePickedId,
      actualWinnerId: winnerId,
      stagePicks,
      predictedHome,
      predictedAway,
      predictedGoalsByTeam,
      actualHome: actual?.homeGoals ?? null,
      actualAway: actual?.awayGoals ?? null,
      actualHomeTeamId: actual?.homeTeamId ?? null,
      actualAwayTeamId: actual?.awayTeamId ?? null,
    });

    const pickedOpponentId = isFinale
      ? derivePredictedOpponent(key, bracket, pickMap, effectivePickedId)
      : null;

    const pickedOpponentStatus = resolveOpponentStatus({
      pickedOpponentId,
      winnerId,
      homeId,
      awayId,
      isBronzeMatch,
      knockoutEliminatedTeams,
      semiFinalLoserTeams,
    });

    const predictedTeams = resolvePredictedTeams(
      key,
      homeId,
      awayId,
      userPredictedParticipants,
      teamMap,
    );

    const pickedFinalistPair = isFinale ? (userPickedParticipants.get(key) ?? null) : null;
    const pickedHomeTeamId = pickedFinalistPair?.[0] ?? null;
    const pickedAwayTeamId = pickedFinalistPair?.[1] ?? null;

    // For progression matches: when a feeder entry-round pick is already definitively wrong
    // (the picked team is not a participant in the upcoming match) and the slot is empty,
    // capture the picked teamId. This lets the UI render the country badge instead of ?.
    const { homeSlotFeederPickedId, awaySlotFeederPickedId } = resolveFeederPickedIds({
      key,
      isEntryRound,
      hasInputs: inputs !== null,
      homeId,
      awayId,
      predictedHomeTeamId: predictedTeams.predictedHomeTeamId,
      predictedAwayTeamId: predictedTeams.predictedAwayTeamId,
      progressionByMatch,
      pickMap,
      derivedParticipants,
      matchByKey,
      knockoutEliminatedTeams,
    });

    return {
      bracketMatchKey: key,
      round,
      homeTeamId: homeId,
      homeTeamName: teamNameOf(teamMap, homeId),
      homeTeamFifaRanking: teamRankingOf(teamRankingMap, homeId),
      awayTeamId: awayId,
      awayTeamName: teamNameOf(teamMap, awayId),
      awayTeamFifaRanking: teamRankingOf(teamRankingMap, awayId),
      actualHome: actual?.homeGoals ?? null,
      actualAway: actual?.awayGoals ?? null,
      actualWinnerId: winnerId,
      actualWinnerName: teamNameOf(teamMap, winnerId),
      decidedBy: actual?.decidedBy ?? null,
      kickoff: actual?.kickoff?.toISOString() ?? null,
      status: actual?.status === 'final' ? 'final' : 'scheduled',
      pickedWinnerId: effectivePickedId,
      pickedWinnerName: teamNameOf(teamMap, effectivePickedId),
      pickedOpponentId,
      pickedOpponentName: teamNameOf(teamMap, pickedOpponentId),
      pickStatus,
      pickedOpponentStatus,
      predictedHome,
      predictedAway,
      predictedGoalsByTeam,
      hit,
      points: pointsForHit(hit, key, hitPoints),
      projected: projectedKeys.has(key),
      // Entry-round: confirmed when the team's source group is fully finalised.
      // Later rounds: confirmed when the actual match row has the team ID (previous match done).
      homeTeamConfirmed: confirmedHome.get(key) ?? !!actual?.homeTeamId,
      awayTeamConfirmed: confirmedAway.get(key) ?? !!actual?.awayTeamId,
      isEntryRound,
      homeTeamPredictedPct: computeTeamRoundPct(
        key,
        homeId,
        0,
        isEntryRound,
        r32PredPcts,
        progressionByMatch,
        knockoutRoundPcts,
        bronzeMatchKey,
        matchByKey,
      ),
      awayTeamPredictedPct: computeTeamRoundPct(
        key,
        awayId,
        1,
        isEntryRound,
        r32PredPcts,
        progressionByMatch,
        knockoutRoundPcts,
        bronzeMatchKey,
        matchByKey,
      ),
      ...predictedTeams,
      pickedHomeTeamId,
      pickedHomeTeamName: teamNameOf(teamMap, pickedHomeTeamId),
      pickedAwayTeamId,
      pickedAwayTeamName: teamNameOf(teamMap, pickedAwayTeamId),
      homeTeamUserPredictedParticipant: isPredictedParticipantSlot(
        isEntryRound,
        homeId,
        userPickedParticipants.get(key)?.[0],
      ),
      awayTeamUserPredictedParticipant: isPredictedParticipantSlot(
        isEntryRound,
        awayId,
        userPickedParticipants.get(key)?.[1],
      ),
      poolPickHomePct: poolPickPct(homeId, awayId, homeId, knockoutRoundPcts.get(key)),
      poolPickAwayPct: poolPickPct(homeId, awayId, awayId, knockoutRoundPcts.get(key)),
      homeSlotFeederPickedId,
      awaySlotFeederPickedId,
    };
  };

  const { bracket } = def;
  const mainRounds = bracket.rounds.filter((r) => r !== 'Final' && r !== 'bronze');

  const keysByRound = buildKeysByRound(bracket, finalMatchKey, bronzeMatchKey);

  const bracketRounds: BracketRoundResultView[] = mainRounds
    .filter((r) => keysByRound.has(r))
    .map((r) => ({
      label: r,
      matches: (keysByRound.get(r) ?? []).map((key) => buildMatchView(key, r)),
    }));

  bracketRounds.push({
    label: 'Final',
    matches: [buildMatchView(finalMatchKey, 'Final')],
  });

  const bronzeMatch = buildMatchView(bronzeMatchKey, 'Bronze');

  return { bracketRounds, bronzeMatch };
}

/**
 * Returns the user's pick teamId for the entry-round feeder match when that pick is
 * already definitively wrong; returns null when the pick is absent or still valid.
 */
function entryPickIfBusted(
  matchKey: string,
  pickMap: Map<string, string>,
  derivedParticipants: Map<string, [string | null, string | null]>,
  matchByKey: Map<string, MatchRow>,
  knockoutEliminatedTeams: Set<string>,
): string | null {
  const pick = pickMap.get(matchKey) ?? null;
  if (!pick) return null;
  const actual = matchByKey.get(matchKey) ?? null;
  const winner = getMatchWinner(actual);
  if (winner !== null) return winner !== pick ? pick : null;
  if (knockoutEliminatedTeams.has(pick)) return pick;
  const derived = derivedParticipants.get(matchKey);
  if (!derived) return null;
  const [home, away] = derived;
  return home !== null && away !== null && pick !== home && pick !== away ? pick : null;
}

type FinishScore = {
  home: number;
  away: number;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
};

/** Display name for a team ID, falling back to the raw ID; null when the slot is empty. */
function teamNameOf(teamMap: Map<string, string>, teamId: string | null): string | null {
  return teamId ? (teamMap.get(teamId) ?? teamId) : null;
}

/** FIFA ranking for a team ID; null when the slot is empty or the team has no ranking. */
function teamRankingOf(teamRankingMap: Map<string, number>, teamId: string | null): number | null {
  return teamId ? (teamRankingMap.get(teamId) ?? null) : null;
}

/** Points awarded for a card: only outcome/exact hits earn this match's reward. */
function pointsForHit(hit: MatchHit, key: BracketMatchKey, hitPoints: Map<string, number>): number {
  return hit === 'outcome' || hit === 'exact' ? (hitPoints.get(key) ?? 0) : 0;
}

/** True when the user predicted `teamId` into this (non-entry) slot's actual participant. */
function isPredictedParticipantSlot(
  isEntryRound: boolean,
  teamId: string | null,
  predictedParticipant: string | null | undefined,
): boolean {
  return !isEntryRound && teamId !== null && predictedParticipant === teamId;
}

/** Pool pick-pct for a team, only once both of this match's participants are known. */
function poolPickPct(
  homeId: string | null,
  awayId: string | null,
  teamId: string | null,
  pctByTeam: Map<string, number> | undefined,
): number | null {
  if (homeId === null || awayId === null || teamId === null) return null;
  return pctByTeam?.get(teamId) ?? null;
}

/** Predicted (home, away) goals for Final/Bronze, plus the team-identity snapshot when present. */
function resolvePredictedFinaleScore(finishScore: FinishScore | undefined): {
  predictedHome: number | null;
  predictedAway: number | null;
  predictedGoalsByTeam: { teamId: string; goals: number }[] | null;
} {
  if (!finishScore) {
    return { predictedHome: null, predictedAway: null, predictedGoalsByTeam: null };
  }
  const predictedGoalsByTeam =
    finishScore.homeTeamId != null && finishScore.awayTeamId != null
      ? [
          { teamId: finishScore.homeTeamId, goals: finishScore.home },
          { teamId: finishScore.awayTeamId, goals: finishScore.away },
        ]
      : null;
  return {
    predictedHome: finishScore.home,
    predictedAway: finishScore.away,
    predictedGoalsByTeam,
  };
}

/**
 * Final/Bronze context for a card: predicted score, and the effective picked winner — derived
 * from the finish score (snapshot-first) when no explicit bracket pick was stored, also covering
 * the case where a since-changed SF pick invalidated the stale explicit Final/Bronze pick.
 */
function resolveFinaleContext(
  key: BracketMatchKey,
  finalMatchKey: string,
  bronzeMatchKey: string,
  finishScores: { final?: FinishScore; bronze?: FinishScore },
  pickedId: string | null,
  bracket: Tournament['bracket'],
  pickMap: Map<string, string>,
): {
  isFinale: boolean;
  isBronzeMatch: boolean;
  predictedHome: number | null;
  predictedAway: number | null;
  predictedGoalsByTeam: { teamId: string; goals: number }[] | null;
  effectivePickedId: string | null;
} {
  const isFinale = key === finalMatchKey || key === bronzeMatchKey;
  const isBronzeMatch = key === bronzeMatchKey;
  const finishScoreForKey =
    key === finalMatchKey
      ? finishScores.final
      : key === bronzeMatchKey
        ? finishScores.bronze
        : undefined;
  const { predictedHome, predictedAway, predictedGoalsByTeam } =
    resolvePredictedFinaleScore(finishScoreForKey);

  let effectivePickedId = pickedId;
  if (isFinale && pickedId === null) {
    const score = key === finalMatchKey ? finishScores.final : finishScores.bronze;
    effectivePickedId = resolveFinaleWinner(score, (home, away) =>
      deriveImplicitFinaleWinner(key, bracket, pickMap, home, away),
    );
  }
  return {
    isFinale,
    isBronzeMatch,
    predictedHome,
    predictedAway,
    predictedGoalsByTeam,
    effectivePickedId,
  };
}

/** Card pick status: alive/busted/pending/no-pick for the user's picked winner. */
function resolvePickStatus(args: {
  effectivePickedId: string | null;
  winnerId: string | null;
  homeId: string | null;
  awayId: string | null;
  isBronzeMatch: boolean;
  knockoutEliminatedTeams: Set<string>;
  semiFinalLoserTeams: Set<string>;
}): KnockoutMatchView['pickStatus'] {
  const {
    effectivePickedId,
    winnerId,
    homeId,
    awayId,
    isBronzeMatch,
    knockoutEliminatedTeams,
    semiFinalLoserTeams,
  } = args;
  if (!effectivePickedId) return 'no-pick';
  if (winnerId) return winnerId === effectivePickedId ? 'alive' : 'busted';
  const matchTeamsKnown = homeId !== null && awayId !== null;
  const pickedTeamAbsent = effectivePickedId !== homeId && effectivePickedId !== awayId;
  const pickedTeamEliminated =
    knockoutEliminatedTeams.has(effectivePickedId) &&
    !(isBronzeMatch && semiFinalLoserTeams.has(effectivePickedId));
  return (matchTeamsKnown && pickedTeamAbsent) || pickedTeamEliminated ? 'busted' : 'pending';
}

/** Card status for the user's predicted opponent (Final/Bronze only). */
function resolveOpponentStatus(args: {
  pickedOpponentId: string | null;
  winnerId: string | null;
  homeId: string | null;
  awayId: string | null;
  isBronzeMatch: boolean;
  knockoutEliminatedTeams: Set<string>;
  semiFinalLoserTeams: Set<string>;
}): KnockoutMatchView['pickStatus'] {
  const {
    pickedOpponentId,
    winnerId,
    homeId,
    awayId,
    isBronzeMatch,
    knockoutEliminatedTeams,
    semiFinalLoserTeams,
  } = args;
  if (pickedOpponentId === null) return 'no-pick';
  if (winnerId) {
    return pickedOpponentId === homeId || pickedOpponentId === awayId ? 'alive' : 'busted';
  }
  const opponentEliminated =
    knockoutEliminatedTeams.has(pickedOpponentId) &&
    !(isBronzeMatch && semiFinalLoserTeams.has(pickedOpponentId));
  const teamsKnown = homeId !== null && awayId !== null;
  const opponentAbsent = pickedOpponentId !== homeId && pickedOpponentId !== awayId;
  return opponentEliminated || (teamsKnown && opponentAbsent) ? 'busted' : 'pending';
}

/**
 * For a progression card with an empty slot: the feeder entry-round pick to render as a badge,
 * but only when that pick is already definitively busted. Empty when entry-round, when there is
 * no progression for this match, or when there are no inputs.
 */
function resolveFeederPickedIds(args: {
  key: BracketMatchKey;
  isEntryRound: boolean;
  hasInputs: boolean;
  homeId: string | null;
  awayId: string | null;
  predictedHomeTeamId: string | null;
  predictedAwayTeamId: string | null;
  progressionByMatch: Map<string, { from: string[] }>;
  pickMap: Map<string, string>;
  derivedParticipants: Map<string, [string | null, string | null]>;
  matchByKey: Map<string, MatchRow>;
  knockoutEliminatedTeams: Set<string>;
}): { homeSlotFeederPickedId: string | null; awaySlotFeederPickedId: string | null } {
  const {
    key,
    isEntryRound,
    hasInputs,
    homeId,
    awayId,
    predictedHomeTeamId,
    predictedAwayTeamId,
    progressionByMatch,
    pickMap,
    derivedParticipants,
    matchByKey,
    knockoutEliminatedTeams,
  } = args;
  const empty = { homeSlotFeederPickedId: null, awaySlotFeederPickedId: null };
  if (isEntryRound || !hasInputs) return empty;
  const prog = progressionByMatch.get(key);
  if (!prog) return empty;
  const [fk0, fk1] = prog.from;
  const homeSlotEmpty = homeId === null && predictedHomeTeamId === null;
  const awaySlotEmpty = awayId === null && predictedAwayTeamId === null;
  return {
    homeSlotFeederPickedId:
      fk0 && homeSlotEmpty
        ? entryPickIfBusted(fk0, pickMap, derivedParticipants, matchByKey, knockoutEliminatedTeams)
        : null,
    awaySlotFeederPickedId:
      fk1 && awaySlotEmpty
        ? entryPickIfBusted(fk1, pickMap, derivedParticipants, matchByKey, knockoutEliminatedTeams)
        : null,
  };
}

/** Every team the user picked across all entry-round bracket slots. */
function collectEntryPickedTeams(
  slots: Tournament['bracket']['slots'],
  pickMap: Map<string, string>,
): Set<string> {
  const teams = new Set<string>();
  for (const slot of slots) {
    const pick = pickMap.get(slot.match);
    if (pick) teams.add(pick);
  }
  return teams;
}

/**
 * Per entry-round slot: the effective pick resolved to the slot where the predicted team
 * actually plays (cross-slot adjustment against the slot's actual/projected participants).
 */
function buildEffectiveEntryPickMap(
  def: Tournament,
  pickMap: Map<string, string>,
  derivedParticipants: Map<BracketMatchKey, [string | null, string | null]>,
  matchByKey: Map<string, MatchRow>,
): Map<BracketMatchKey, string | null> {
  const allEntryPickedTeams = collectEntryPickedTeams(def.bracket.slots, pickMap);
  const result = new Map<BracketMatchKey, string | null>();
  for (const slot of def.bracket.slots) {
    const directPick = pickMap.get(slot.match) ?? null;
    const derived = derivedParticipants.get(slot.match);
    const actualRow = matchByKey.get(slot.match);
    const home = derived?.[0] ?? actualRow?.homeTeamId ?? null;
    const away = derived?.[1] ?? actualRow?.awayTeamId ?? null;
    result.set(slot.match, resolveCrossSlotPick(directPick, home, away, allEntryPickedTeams));
  }
  return result;
}

/** Maps each knockout stage to the set of teams the user picked to advance in that stage. */
function buildStagePicksMap(
  pickMap: Map<string, string>,
  matchByKey: Map<string, MatchRow>,
  rounds: string[],
): Map<string, Set<string>> {
  const stagePicksMap = new Map<string, Set<string>>();
  for (const [matchKey, pickedId] of pickMap.entries()) {
    const stage = matchByKey.get(matchKey)?.stage ?? getRoundLabel(matchKey, rounds);
    if (!stagePicksMap.has(stage)) stagePicksMap.set(stage, new Set());
    stagePicksMap.get(stage)!.add(pickedId);
  }
  return stagePicksMap;
}

/** Groups every non-finale bracket match key under its round label, in slot-then-progression order. */
function buildKeysByRound(
  bracket: Tournament['bracket'],
  finalMatchKey: string,
  bronzeMatchKey: string,
): Map<string, BracketMatchKey[]> {
  const keysByRound = new Map<string, BracketMatchKey[]>();
  for (const slot of bracket.slots) {
    const round = getRoundLabel(slot.match, bracket.rounds);
    if (!keysByRound.has(round)) keysByRound.set(round, []);
    keysByRound.get(round)!.push(slot.match);
  }
  for (const prog of bracket.progression) {
    if (prog.match === finalMatchKey || prog.match === bronzeMatchKey) continue;
    const round = getRoundLabel(prog.match, bracket.rounds);
    if (!keysByRound.has(round)) keysByRound.set(round, []);
    keysByRound.get(round)!.push(prog.match);
  }
  return keysByRound;
}

function computeKnockoutHit(args: {
  pickedWinnerId: string | null;
  actualWinnerId: string | null;
  /** All teams the user picked to advance in this stage — show "correct" when the actual winner is in this set. */
  stagePicks: Set<string> | null;
  predictedHome: number | null;
  predictedAway: number | null;
  predictedGoalsByTeam: { teamId: string; goals: number }[] | null;
  actualHome: number | null;
  actualAway: number | null;
  actualHomeTeamId: string | null;
  actualAwayTeamId: string | null;
}): MatchHit {
  const {
    pickedWinnerId,
    actualWinnerId,
    stagePicks,
    predictedHome,
    predictedAway,
    predictedGoalsByTeam,
    actualHome,
    actualAway,
    actualHomeTeamId,
    actualAwayTeamId,
  } = args;

  if (actualWinnerId === null) return 'pending';

  // Exact requires both predicted and actual scores; only Final/Bronze populate predicted.
  // Prefer team-identity comparison when a snapshot is available — it's correct regardless of
  // how the real match's home/away assignment relates to the user's own predicted orientation.
  if (actualHome !== null && actualAway !== null) {
    if (predictedGoalsByTeam !== null && actualHomeTeamId !== null && actualAwayTeamId !== null) {
      const goalsByTeam = new Map(predictedGoalsByTeam.map((s) => [s.teamId, s.goals]));
      if (
        goalsByTeam.get(actualHomeTeamId) === actualHome &&
        goalsByTeam.get(actualAwayTeamId) === actualAway
      ) {
        return 'exact';
      }
    } else if (
      predictedHome !== null &&
      predictedAway !== null &&
      predictedHome === actualHome &&
      predictedAway === actualAway
    ) {
      return 'exact';
    }
  }

  // Credit the pick on the card where the predicted team actually played and won,
  // regardless of which slot the user assigned them to.
  if (stagePicks?.has(actualWinnerId) ?? pickedWinnerId === actualWinnerId) {
    return 'outcome';
  }
  return 'missed';
}

/** Group-stage finality: which group matches are final, whether every group is done, and per-group. */
function computeGroupFinality(
  def: Tournament,
  allMatches: MatchRow[],
): {
  finalGroupMatchIds: Set<string>;
  allGroupsFinal: boolean;
  groupIsFinal: Map<string, boolean>;
} {
  const finalGroupMatchIds = new Set(
    allMatches.filter((m) => m.stage === 'group' && m.status === 'final').map((m) => m.id),
  );
  const allGroupsFinal = def.groupMatches.every((gm) => finalGroupMatchIds.has(gm.id));

  const matchIdsByGroup = new Map<string, string[]>();
  for (const gm of def.groupMatches) {
    const g = gm.group as string;
    if (!matchIdsByGroup.has(g)) matchIdsByGroup.set(g, []);
    matchIdsByGroup.get(g)!.push(gm.id);
  }
  const groupIsFinal = new Map<string, boolean>();
  for (const [g, ids] of matchIdsByGroup.entries()) {
    groupIsFinal.set(
      g,
      ids.every((id) => finalGroupMatchIds.has(id)),
    );
  }
  return { finalGroupMatchIds, allGroupsFinal, groupIsFinal };
}

/**
 * Progression (R16+) participants derived from actual feeder-match winners. Populated even when
 * only one feeder is final, so a known team shows as confirmed rather than a predicted fill.
 * Excludes the Bronze match (its participants are SF losers, derived separately).
 */
function deriveProgressionParticipants(
  def: Tournament,
  matchByKey: Map<string, MatchRow>,
): Map<BracketMatchKey, [string | null, string | null]> {
  const result = new Map<BracketMatchKey, [string | null, string | null]>();
  for (const prog of def.bracket.progression) {
    if (prog.match === def.bracket.bronzeMatch) continue;
    if (prog.from.length !== 2) continue;
    const [fk0, fk1] = prog.from;
    const w0 = fk0 ? getMatchWinner(matchByKey.get(fk0) ?? null) : null;
    const w1 = fk1 ? getMatchWinner(matchByKey.get(fk1) ?? null) : null;
    if (w0 !== null || w1 !== null) {
      const pair: [string | null, string | null] = [w0, w1];
      result.set(prog.match, pair);
    }
  }
  return result;
}

/**
 * Bronze participants: the SF losers, once both semifinals are final. Each SF's participants may
 * come from the actual match row or from the already-derived progression participants.
 */
function deriveBronzeParticipants(
  def: Tournament,
  matchByKey: Map<string, MatchRow>,
  participantsByMatch: Map<BracketMatchKey, [string | null, string | null]>,
): [string, string] | null {
  const bronzeProg = def.bracket.progression.find((p) => p.match === def.bracket.bronzeMatch);
  if (!bronzeProg) return null;
  const losers = bronzeProg.from.map((sfKey) => {
    const sfMatch = matchByKey.get(sfKey) ?? null;
    const sfWinner = getMatchWinner(sfMatch);
    if (!sfWinner) return null;
    const sfParts = participantsByMatch.get(sfKey);
    const sfHome = sfMatch?.homeTeamId ?? sfParts?.[0] ?? null;
    const sfAway = sfMatch?.awayTeamId ?? sfParts?.[1] ?? null;
    if (!sfHome || !sfAway) return null;
    return sfWinner === sfHome ? sfAway : sfHome;
  });
  const [l0, l1] = losers;
  return l0 && l1 ? [l0, l1] : null;
}

function computeDerivedParticipants(
  def: Tournament,
  allMatches: MatchRow[],
): {
  participants: Map<BracketMatchKey, [string | null, string | null]>;
  projectedKeys: Set<BracketMatchKey>;
  /** Per entry-round slot: is the home team's source group fully finalised? */
  confirmedHome: Map<BracketMatchKey, boolean>;
  /** Per entry-round slot: is the away team's source group fully finalised? */
  confirmedAway: Map<BracketMatchKey, boolean>;
} {
  const participantsByMatch = new Map<BracketMatchKey, [string | null, string | null]>();
  const projectedKeys = new Set<BracketMatchKey>();
  const confirmedHome = new Map<BracketMatchKey, boolean>();
  const confirmedAway = new Map<BracketMatchKey, boolean>();
  const matchByKey = new Map<string, MatchRow>(allMatches.map((m) => [m.id, m]));

  const { finalGroupMatchIds, allGroupsFinal, groupIsFinal } = computeGroupFinality(
    def,
    allMatches,
  );

  // A slot ref is confirmed when its source group is fully final.
  // "3rd[i]" needs ALL groups done (best-third ranking spans all groups).
  function slotRefConfirmed(ref: string): boolean {
    if (/^3rd\[/.test(ref)) return allGroupsFinal;
    const m = /^(\d+)([A-Z])$/.exec(ref);
    return m ? (groupIsFinal.get(m[2]!) ?? false) : false;
  }

  const liveScores: GroupScore[] = def.groupMatches
    .filter((gm) => finalGroupMatchIds.has(gm.id))
    .map((gm) => {
      const m = matchByKey.get(gm.id)!;
      return { matchId: matchId(gm.id), home: m.homeGoals!, away: m.awayGoals! };
    });

  // Always derive: with no matches played the engine falls back to seed order.
  const groupOrders = deriveGroupOrders(def, liveScores);
  const qualifiers = selectQualifiers(def, liveScores, groupOrders);
  const autoCount = def.groups.length * def.qualification.autoQualifyPerGroup;
  const rankedThirds = qualifiers.slice(autoCount);

  for (const slot of def.bracket.slots) {
    confirmedHome.set(slot.match, slotRefConfirmed(slot.home));
    confirmedAway.set(slot.match, slotRefConfirmed(slot.away));
    try {
      const home = resolveSlot(slot.home, groupOrders, rankedThirds);
      const away = resolveSlot(slot.away, groupOrders, rankedThirds);
      participantsByMatch.set(slot.match, [home, away]);
      if (!allGroupsFinal) projectedKeys.add(slot.match);
    } catch {
      // unresolvable ref (e.g. best-third slot not yet rankable) — leave TBD
    }
  }

  for (const [key, pair] of deriveProgressionParticipants(def, matchByKey)) {
    participantsByMatch.set(key, pair);
  }

  const bronzePair = deriveBronzeParticipants(def, matchByKey, participantsByMatch);
  if (bronzePair) {
    participantsByMatch.set(def.bracket.bronzeMatch, bronzePair);
  }

  return { participants: participantsByMatch, projectedKeys, confirmedHome, confirmedAway };
}

/**
 * For each team, compute the percentage of pool members who predicted it
 * to qualify to the entry round (R32/QF), derived from their group score predictions.
 */
function computeEntryRoundPredictionPcts(
  def: Tournament,
  poolGroupScores: PoolGroupScore[],
): Map<string, number> | null {
  const byUser = new Map<string, GroupScore[]>();
  for (const s of poolGroupScores) {
    const uid = s.userId as string;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push({ matchId: matchId(s.matchId), home: s.home, away: s.away });
  }

  // Distinguish "no pool predictions exist at all" (null → hide the badge) from
  // "predictions exist but this specific team got zero of them" (0% → still shown below).
  if (byUser.size === 0) return null;

  const qualifierCounts = new Map<string, number>();
  for (const scores of byUser.values()) {
    const groupOrders = deriveGroupOrders(def, scores);
    const qualifiers = selectQualifiers(def, scores, groupOrders);
    for (const tid of qualifiers) {
      qualifierCounts.set(tid, (qualifierCounts.get(tid) ?? 0) + 1);
    }
  }

  const total = byUser.size;
  return new Map(
    Array.from(qualifierCounts.entries()).map(([tid, count]) => [
      tid,
      Math.round((count / total) * 100),
    ]),
  );
}

/**
 * For each bracket match key, computes the % of pool members who picked each
 * team to win that match. Used to derive "predicted to be in this round" pcts
 * for non-entry rounds: the pct for a team in round R is the pick-pct from
 * their feeder match in round R-1.
 */
function computeKnockoutRoundPcts(
  poolKnockoutPicks: PoolKnockoutPick[],
): Map<string, Map<string, number>> {
  const users = new Set<string>();
  const counts = new Map<string, Map<string, number>>();

  for (const pick of poolKnockoutPicks) {
    users.add(pick.userId as string);
    const key = pick.bracketMatchKey as string;
    if (!counts.has(key)) counts.set(key, new Map());
    const teamCounts = counts.get(key)!;
    teamCounts.set(pick.winnerTeamId, (teamCounts.get(pick.winnerTeamId) ?? 0) + 1);
  }

  const totalUsers = users.size;
  if (totalUsers === 0) return new Map();

  return new Map(
    Array.from(counts.entries()).map(([key, teams]) => [
      key,
      new Map(
        Array.from(teams.entries()).map(([tid, count]) => [
          tid,
          Math.round((count / totalUsers) * 100),
        ]),
      ),
    ]),
  );
}

/**
 * Returns the "% predicted this team in this round" for one slot (home=slotIndex 0, away=1).
 * - Entry round: derived from group-score qualification predictions.
 * - Bronze: always null (participants are SF losers; no direct pick exists for this).
 * - Other rounds: % of users who picked `teamId` to win their feeder match.
 *
 * The feeder match is resolved by checking which of the two candidate feeders `teamId`
 * actually won — real match rows (as synced from an external results feed) assign home/away
 * independently of which bracket slot (prog.from[0] vs [1]) the team progressed through, so
 * home/away order cannot be trusted to match feeder order. Falls back to positional slot order
 * only when neither feeder has a decided winner yet, which is safe because derived/projected
 * participants (used before the real match row exists) are always built in prog.from order.
 *
 * A team that legitimately got zero pool picks for its feeder match must still show "0%",
 * not be hidden — only the absence of any prediction data at all yields null.
 */
function computeTeamRoundPct(
  matchKey: string,
  teamId: string | null,
  slotIndex: 0 | 1,
  isEntryRound: boolean,
  r32PredPcts: Map<string, number> | null,
  progressionByMatch: Map<string, { from: string[] }>,
  knockoutRoundPcts: Map<string, Map<string, number>>,
  bronzeMatchKey: string,
  matchByKey: Map<string, MatchRow>,
): number | null {
  if (!teamId) return null;
  if (isEntryRound) return r32PredPcts === null ? null : (r32PredPcts.get(teamId) ?? 0);
  if (matchKey === bronzeMatchKey) return null;
  const prog = progressionByMatch.get(matchKey);
  if (!prog) return null;
  const feederKey = resolveFeederKeyForTeam(prog, teamId, slotIndex, matchByKey);
  if (!feederKey) return null;
  const feederPcts = knockoutRoundPcts.get(feederKey);
  return feederPcts === undefined ? null : (feederPcts.get(teamId) ?? 0);
}

/**
 * Finds which feeder match `teamId` actually won, so its pool-pick pct is read from the
 * correct semifinal/quarterfinal — not from whichever feeder happens to share the same
 * home/away slot index as the real match row.
 */
function resolveFeederKeyForTeam(
  prog: { from: string[] },
  teamId: string,
  slotIndex: 0 | 1,
  matchByKey: Map<string, MatchRow>,
): string | undefined {
  const [fk0, fk1] = prog.from;
  if (fk0 && getMatchWinner(matchByKey.get(fk0) ?? null) === teamId) return fk0;
  if (fk1 && getMatchWinner(matchByKey.get(fk1) ?? null) === teamId) return fk1;
  return prog.from[slotIndex];
}

function getRoundLabel(matchKey: string, rounds: string[]): string {
  const prefixMap: Record<string, string> = {
    'ro32-': 'R32',
    'ro16-': 'R16',
    'qf-': 'QF',
    'sf-': 'SF',
  };
  for (const [prefix, label] of Object.entries(prefixMap)) {
    if (matchKey.startsWith(prefix)) return label;
  }
  for (const r of rounds) {
    if (matchKey.toLowerCase().startsWith(r.toLowerCase().replace(/\s+/g, '-'))) return r;
  }
  return matchKey;
}

/** The advancing team from a feeder key, or null when the feeder slot is empty. */
function winnerOrNull(
  fromKey: string | undefined,
  getWinner: (key: string) => string | null,
): string | null {
  return fromKey ? getWinner(fromKey) : null;
}

/** Whether this progression match still needs filling for the round currently being processed. */
function shouldFillProgForRound(
  prog: { match: BracketMatchKey },
  round: string,
  bronzeKey: string,
  predicted: Map<string, [string | null, string | null]>,
  rounds: string[],
): boolean {
  if (prog.match === bronzeKey) return false;
  if (predicted.has(prog.match)) return false;
  return getRoundLabel(prog.match, rounds) === round;
}

/**
 * Fills `predicted` for every non-bronze progression match in round order, so each match's
 * predicted participants are available when a later round depends on them. `getWinner` resolves
 * the advancing team for a feeder key.
 */
function fillProgressionParticipantsInRoundOrder(
  def: Tournament,
  predicted: Map<string, [string | null, string | null]>,
  getWinner: (fromKey: string) => string | null,
): void {
  const bronzeKey = def.bracket.bronzeMatch;
  for (const round of def.bracket.rounds) {
    for (const prog of def.bracket.progression) {
      if (!shouldFillProgForRound(prog, round, bronzeKey, predicted, def.bracket.rounds)) continue;
      const [fk0, fk1] = prog.from;
      predicted.set(prog.match, [winnerOrNull(fk0, getWinner), winnerOrNull(fk1, getWinner)]);
    }
  }
}

/**
 * Builds a map of user-predicted (home, away) team IDs for every bracket match,
 * walking the bracket in topological order.
 *
 * Entry-round picks are resolved against actual/projected slot participants so that
 * each prediction appears in the slot where the team is currently projected/confirmed
 * to play, not necessarily where the user originally placed their pick.
 *
 * This applies in both states:
 * - Groups ongoing: resolved against current projected standings.
 * - Groups done: resolved against final actual standings.
 *
 * For each slot: prefer the direct pick if it matches that slot's participants;
 * otherwise scan all entry-round picks for a team that is a participant here
 * (cross-slot matching). E.g. if the user picked GER for r32m78 but GER is
 * actually projected into r32m74, GER appears in the R16 position fed by r32m74.
 *
 * Progression picks (R16+) are validated against predicted participants of their
 * feeding matches to ensure the chain is internally consistent.
 */
function computeUserPredictedParticipants(
  def: Tournament,
  allMatches: MatchRow[],
  pickMap: Map<string, string>,
  derivedParticipants: Map<BracketMatchKey, [string | null, string | null]>,
): Map<string, [string | null, string | null]> {
  const matchByKey = new Map<string, MatchRow>(allMatches.map((m) => [m.id, m]));

  // Collect every team the user picked across all entry-round matches.
  // Used when groups are done to find picks by actual slot participants.
  const allEntryPickedTeams = collectEntryPickedTeams(def.bracket.slots, pickMap);

  // Resolve the predicted advancing team for each entry-round slot.
  const entryWinner = new Map<BracketMatchKey, string | null>();
  for (const slot of def.bracket.slots) {
    const actual = matchByKey.get(slot.match) ?? null;
    const actualWinner = getMatchWinner(actual);
    if (actualWinner) {
      entryWinner.set(slot.match, actualWinner);
      continue;
    }
    const derived = derivedParticipants.get(slot.match);
    if (!derived) {
      entryWinner.set(slot.match, null);
      continue;
    }
    // Prefer a direct pick that matches actual/projected participants; fall back
    // to any entry-round pick that is a participant in this slot (cross-slot matching).
    // Applies whether groups are ongoing (projected) or done (actual).
    const directPick = pickMap.get(slot.match) ?? null;
    entryWinner.set(
      slot.match,
      resolveCrossSlotPick(directPick, derived[0], derived[1], allEntryPickedTeams),
    );
  }

  const predicted = new Map<string, [string | null, string | null]>();

  // Returns the predicted advancing team from a given match key.
  const getPredictedWinner = (fromKey: string): string | null => {
    // Entry-round: use pre-resolved winner.
    if (entryWinner.has(fromKey as BracketMatchKey)) {
      return entryWinner.get(fromKey as BracketMatchKey) ?? null;
    }
    // Progression match: actual winner > pick validated against predicted participants.
    const actual = matchByKey.get(fromKey) ?? null;
    const actualWinner = getMatchWinner(actual);
    if (actualWinner) return actualWinner;
    const pick = pickMap.get(fromKey) ?? null;
    if (!pick) return null;
    const parts = predicted.get(fromKey as BracketMatchKey);
    if (parts) {
      return parts[0] === pick || parts[1] === pick ? pick : null;
    }
    return null;
  };

  // Progression matches (excluding bronze) — process in round order so each match's
  // predicted participants are available when a later round depends on them.
  const bronzeKey = def.bracket.bronzeMatch;
  fillProgressionParticipantsInRoundOrder(def, predicted, getPredictedWinner);

  // Bronze match: participants are the SF losers (the SF team the user did NOT pick to win)
  const bronzeProg = def.bracket.progression.find((p) => p.match === bronzeKey);
  if (bronzeProg) {
    const getSfLoser = (sfKey: string): string | null => {
      const actual = matchByKey.get(sfKey) ?? null;
      const sfParts = predicted.get(sfKey);
      if (!sfParts) return null;
      const sfActualWinner = getMatchWinner(actual);
      if (sfActualWinner) {
        const home = actual?.homeTeamId ?? sfParts[0] ?? null;
        const away = actual?.awayTeamId ?? sfParts[1] ?? null;
        if (!home || !away) return null;
        return sfActualWinner === home ? away : home;
      }
      const sfPick = pickMap.get(sfKey) ?? null;
      if (!sfPick) return null;
      if (sfParts[0] === sfPick) return sfParts[1];
      if (sfParts[1] === sfPick) return sfParts[0];
      return null;
    };
    const [sf1, sf2] = bronzeProg.from;
    predicted.set(bronzeKey, [winnerOrNull(sf1, getSfLoser), winnerOrNull(sf2, getSfLoser)]);
  }

  return predicted;
}

/**
 * Walks the bracket pick chain using ONLY the user's picks — never substituting
 * actual match results. Returns a map of what team the user predicted for the
 * home (index 0) and away (index 1) slot of each progression match.
 *
 * Entry rounds: apply the same cross-slot adjustment as computeUserPredictedParticipants
 * but do not substitute actual.winnerTeamId.
 * Progression rounds: use the user's pick for each feeder match (validated against
 * the predicted participants of that feeder) but do not substitute actual.winnerTeamId.
 */
function computeUserPickedParticipants(
  def: Tournament,
  pickMap: Map<string, string>,
  derivedParticipants: Map<BracketMatchKey, [string | null, string | null]>,
): Map<string, [string | null, string | null]> {
  const allEntryPickedTeams = collectEntryPickedTeams(def.bracket.slots, pickMap);

  // Entry rounds: resolve user's pick (with cross-slot adjustment) — no actual substitution.
  const entryPickWinner = new Map<BracketMatchKey, string | null>();
  for (const slot of def.bracket.slots) {
    const derived = derivedParticipants.get(slot.match);
    if (!derived) {
      entryPickWinner.set(slot.match, null);
      continue;
    }
    const directPick = pickMap.get(slot.match) ?? null;
    entryPickWinner.set(
      slot.match,
      resolveCrossSlotPick(directPick, derived[0], derived[1], allEntryPickedTeams),
    );
  }

  const predicted = new Map<string, [string | null, string | null]>();

  const getUserPickedWinner = (fromKey: string): string | null => {
    if (entryPickWinner.has(fromKey as BracketMatchKey)) {
      return entryPickWinner.get(fromKey as BracketMatchKey) ?? null;
    }
    const pick = pickMap.get(fromKey) ?? null;
    if (!pick) return null;
    const parts = predicted.get(fromKey);
    if (parts) {
      return parts[0] === pick || parts[1] === pick ? pick : null;
    }
    return null;
  };

  const bronzeKey = def.bracket.bronzeMatch;
  fillProgressionParticipantsInRoundOrder(def, predicted, getUserPickedWinner);

  // Bronze match: participants are the SF losers implied by the user's own SF winner picks
  // (never substituting actual results, unlike computeUserPredictedParticipants's bronze branch).
  const bronzeProg = def.bracket.progression.find((p) => p.match === bronzeKey);
  if (bronzeProg) {
    const getSfLoser = (sfKey: string): string | null => {
      const sfParts = predicted.get(sfKey);
      if (!sfParts) return null;
      const sfPick = pickMap.get(sfKey) ?? null;
      if (!sfPick) return null;
      if (sfParts[0] === sfPick) return sfParts[1];
      if (sfParts[1] === sfPick) return sfParts[0];
      return null;
    };
    const [sf1, sf2] = bronzeProg.from;
    predicted.set(bronzeKey, [winnerOrNull(sf1, getSfLoser), winnerOrNull(sf2, getSfLoser)]);
  }

  return predicted;
}

function resolvePredictedTeams(
  key: string,
  homeId: string | null,
  awayId: string | null,
  userPredictedParticipants: Map<string, [string | null, string | null]>,
  teamMap: Map<string, string>,
): {
  predictedHomeTeamId: string | null;
  predictedHomeTeamName: string | null;
  predictedAwayTeamId: string | null;
  predictedAwayTeamName: string | null;
} {
  const pair = userPredictedParticipants.get(key);
  const predictedHomeId = homeId === null ? (pair?.[0] ?? null) : null;
  const predictedAwayId = awayId === null ? (pair?.[1] ?? null) : null;
  return {
    predictedHomeTeamId: predictedHomeId,
    predictedHomeTeamName: predictedHomeId
      ? (teamMap.get(predictedHomeId) ?? predictedHomeId)
      : null,
    predictedAwayTeamId: predictedAwayId,
    predictedAwayTeamName: predictedAwayId
      ? (teamMap.get(predictedAwayId) ?? predictedAwayId)
      : null,
  };
}
