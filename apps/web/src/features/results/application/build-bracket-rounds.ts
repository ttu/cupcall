import type { MatchRow, PoolGroupScore, PoolKnockoutPick } from '@cup/db';
import { deriveGroupOrders, selectQualifiers, matchId, resolveSlot } from '@cup/engine';
import type { Tournament, BracketMatchKey, GroupScore } from '@cup/engine';
import type { KnockoutMatchView, BracketRoundResultView, MatchHit } from '../domain/types';
export { computeBracketHealth } from '../domain/bracket-health';

/**
 * Derives the actual winner of a knockout match.
 * `winnerTeamId` is only stored in the DB when the match was decided by
 * penalties (a regulation-time draw). For regulation/extra-time winners the
 * score is the authoritative source.
 */
function getMatchWinner(match: MatchRow | null): string | null {
  if (!match) return null;
  if (match.winnerTeamId) return match.winnerTeamId;
  if (
    match.status === 'final' &&
    match.homeGoals !== null &&
    match.awayGoals !== null &&
    match.homeGoals !== match.awayGoals
  ) {
    return match.homeGoals > match.awayGoals ? match.homeTeamId : match.awayTeamId;
  }
  return null;
}

export function buildBracketRounds(
  def: Tournament,
  allMatches: MatchRow[],
  inputs: {
    knockoutPicks: { bracketMatchKey: string; winner: string }[];
    finishScores: {
      final?: { home: number; away: number };
      bronze?: { home: number; away: number };
    };
  } | null,
  poolGroupScores: PoolGroupScore[],
  poolKnockoutPicks: PoolKnockoutPick[],
): { bracketRounds: BracketRoundResultView[]; bronzeMatch: KnockoutMatchView | null } {
  const teamMap = new Map<string, string>(def.teams.map((t) => [t.id, t.name]));
  const matchByKey = new Map<string, MatchRow>(allMatches.map((m) => [m.id, m]));

  // Teams that have already lost a knockout match and cannot advance further.
  const knockoutEliminatedTeams = new Set<string>();
  for (const m of allMatches) {
    if (m.stage === 'group' || m.status !== 'final') continue;
    const winner = getMatchWinner(m);
    if (winner === null) continue;
    if (m.homeTeamId && m.homeTeamId !== winner) knockoutEliminatedTeams.add(m.homeTeamId);
    if (m.awayTeamId && m.awayTeamId !== winner) knockoutEliminatedTeams.add(m.awayTeamId);
  }
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

  // For each stage, collect all teams the user picked to advance.
  // A card shows "correct" when the actual winner of that match appears in the user's stage picks,
  // regardless of which slot the user assigned them to.
  // Use all user picks to build stage-pick sets, not just picks for DB-matched games.
  // Unplayed matches have no DB row yet, so their picks would be silently dropped if
  // we only consulted matchByKey — causing cross-slot credit to fail mid-round.
  const stagePicksMap = new Map<string, Set<string>>();
  for (const [matchKey, pickedId] of pickMap.entries()) {
    const stage = matchByKey.get(matchKey)?.stage ?? getRoundLabel(matchKey, def.bracket.rounds);
    if (!stagePicksMap.has(stage)) stagePicksMap.set(stage, new Set());
    stagePicksMap.get(stage)!.add(pickedId);
  }

  // For entry-round slots, resolve each pick to the slot where the predicted team actually plays.
  // A user's group-stage predictions may have been wrong, landing their team in a different bracket
  // slot than expected. The effective pick for each slot is the cross-slot adjusted team — matching
  // the logic in computeUserPredictedParticipants — so pickStatus and pickedWinnerId are consistent
  // with the predicted bracket chain.
  const allEntryPickedTeams = new Set<string>();
  if (inputs) {
    for (const slot of def.bracket.slots) {
      const pick = pickMap.get(slot.match);
      if (pick) allEntryPickedTeams.add(pick);
    }
  }

  const effectiveEntryPickMap = new Map<BracketMatchKey, string | null>();
  if (inputs) {
    for (const slot of def.bracket.slots) {
      const directPick = pickMap.get(slot.match) ?? null;
      const derived = derivedParticipants.get(slot.match);
      const actualRow = matchByKey.get(slot.match);
      const home = derived?.[0] ?? actualRow?.homeTeamId ?? null;
      const away = derived?.[1] ?? actualRow?.awayTeamId ?? null;

      if (home === null && away === null) {
        effectiveEntryPickMap.set(slot.match, directPick);
        continue;
      }

      const directValid = directPick !== null && (home === directPick || away === directPick);
      if (directValid) {
        effectiveEntryPickMap.set(slot.match, directPick);
      } else {
        const crossMatch =
          home !== null && allEntryPickedTeams.has(home)
            ? home
            : away !== null && allEntryPickedTeams.has(away)
              ? away
              : null;
        effectiveEntryPickMap.set(slot.match, crossMatch);
      }
    }
  }

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

    // Predicted score: only Final and Bronze have a finish score.
    let predictedHome: number | null = null;
    let predictedAway: number | null = null;
    const isFinale = key === finalMatchKey || key === bronzeMatchKey;
    if (key === finalMatchKey && finishScores.final) {
      predictedHome = finishScores.final.home;
      predictedAway = finishScores.final.away;
    } else if (key === bronzeMatchKey && finishScores.bronze) {
      predictedHome = finishScores.bronze.home;
      predictedAway = finishScores.bronze.away;
    }

    // For Final/Bronze: if no explicit bracket pick was stored but the finish score is non-tied,
    // derive the implied winner from the finalists/bronzePair so both teams appear in the pick row.
    // This covers the case where the user saved the score before filling in SF picks, meaning
    // the implicit winner was never written to the knockout_picks table at save time.
    let effectivePickedId = pickedId;
    if (isFinale && pickedId === null) {
      const score = key === finalMatchKey ? finishScores.final : finishScores.bronze;
      if (score && score.home !== score.away) {
        effectivePickedId = deriveImplicitFinaleWinner(
          key,
          bracket,
          pickMap,
          score.home,
          score.away,
        );
      }
    }

    let pickStatus: KnockoutMatchView['pickStatus'] = 'no-pick';
    if (effectivePickedId) {
      if (!winnerId) {
        const matchTeamsKnown = homeId !== null && awayId !== null;
        const pickedTeamAbsent = effectivePickedId !== homeId && effectivePickedId !== awayId;
        const pickedTeamEliminated = knockoutEliminatedTeams.has(effectivePickedId);
        pickStatus =
          (matchTeamsKnown && pickedTeamAbsent) || pickedTeamEliminated ? 'busted' : 'pending';
      } else if (winnerId === effectivePickedId) {
        pickStatus = 'alive';
      } else {
        pickStatus = 'busted';
      }
    }

    const stagePicks = actual?.stage ? (stagePicksMap.get(actual.stage) ?? null) : null;
    const hit = computeKnockoutHit({
      pickedWinnerId: effectivePickedId,
      actualWinnerId: winnerId,
      stagePicks,
      predictedHome,
      predictedAway,
      actualHome: actual?.homeGoals ?? null,
      actualAway: actual?.awayGoals ?? null,
    });

    const pickedOpponentId = isFinale
      ? derivePredictedOpponent(key, bracket, pickMap, effectivePickedId)
      : null;

    let pickedOpponentStatus: KnockoutMatchView['pickStatus'] = 'no-pick';
    if (pickedOpponentId !== null) {
      if (!winnerId) {
        const opponentEliminated = knockoutEliminatedTeams.has(pickedOpponentId);
        const teamsKnown = homeId !== null && awayId !== null;
        const opponentAbsent = pickedOpponentId !== homeId && pickedOpponentId !== awayId;
        pickedOpponentStatus =
          opponentEliminated || (teamsKnown && opponentAbsent) ? 'busted' : 'pending';
      } else {
        pickedOpponentStatus =
          pickedOpponentId === homeId || pickedOpponentId === awayId ? 'alive' : 'busted';
      }
    }

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
    let homeSlotFeederPickedId: string | null = null;
    let awaySlotFeederPickedId: string | null = null;
    if (!isEntryRound && inputs) {
      const prog = progressionByMatch.get(key);
      if (prog) {
        const [fk0, fk1] = prog.from;
        const homeSlotEmpty = homeId === null && predictedTeams.predictedHomeTeamId === null;
        const awaySlotEmpty = awayId === null && predictedTeams.predictedAwayTeamId === null;
        if (fk0 && homeSlotEmpty) {
          homeSlotFeederPickedId = entryPickIfBusted(
            fk0,
            pickMap,
            derivedParticipants,
            matchByKey,
            knockoutEliminatedTeams,
          );
        }
        if (fk1 && awaySlotEmpty) {
          awaySlotFeederPickedId = entryPickIfBusted(
            fk1,
            pickMap,
            derivedParticipants,
            matchByKey,
            knockoutEliminatedTeams,
          );
        }
      }
    }

    return {
      bracketMatchKey: key,
      round,
      homeTeamId: homeId,
      homeTeamName: homeId ? (teamMap.get(homeId) ?? homeId) : null,
      awayTeamId: awayId,
      awayTeamName: awayId ? (teamMap.get(awayId) ?? awayId) : null,
      actualHome: actual?.homeGoals ?? null,
      actualAway: actual?.awayGoals ?? null,
      actualWinnerId: winnerId,
      actualWinnerName: winnerId ? (teamMap.get(winnerId) ?? winnerId) : null,
      kickoff: actual?.kickoff?.toISOString() ?? null,
      status: actual?.status === 'final' ? 'final' : 'scheduled',
      pickedWinnerId: effectivePickedId,
      pickedWinnerName: effectivePickedId
        ? (teamMap.get(effectivePickedId) ?? effectivePickedId)
        : null,
      pickedOpponentId,
      pickedOpponentName: pickedOpponentId
        ? (teamMap.get(pickedOpponentId) ?? pickedOpponentId)
        : null,
      pickStatus,
      pickedOpponentStatus,
      predictedHome,
      predictedAway,
      hit,
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
      pickedHomeTeamName: pickedHomeTeamId
        ? (teamMap.get(pickedHomeTeamId) ?? pickedHomeTeamId)
        : null,
      pickedAwayTeamId,
      pickedAwayTeamName: pickedAwayTeamId
        ? (teamMap.get(pickedAwayTeamId) ?? pickedAwayTeamId)
        : null,
      homeTeamUserPredictedParticipant:
        !isEntryRound && homeId !== null && userPickedParticipants.get(key)?.[0] === homeId,
      awayTeamUserPredictedParticipant:
        !isEntryRound && awayId !== null && userPickedParticipants.get(key)?.[1] === awayId,
      poolPickHomePct:
        homeId !== null && awayId !== null
          ? (knockoutRoundPcts.get(key)?.get(homeId) ?? null)
          : null,
      poolPickAwayPct:
        homeId !== null && awayId !== null
          ? (knockoutRoundPcts.get(key)?.get(awayId) ?? null)
          : null,
      homeSlotFeederPickedId,
      awaySlotFeederPickedId,
    };
  };

  const { bracket } = def;
  const mainRounds = bracket.rounds.filter((r) => r !== 'Final' && r !== 'bronze');

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

function computeKnockoutHit(args: {
  pickedWinnerId: string | null;
  actualWinnerId: string | null;
  /** All teams the user picked to advance in this stage — show "correct" when the actual winner is in this set. */
  stagePicks: Set<string> | null;
  predictedHome: number | null;
  predictedAway: number | null;
  actualHome: number | null;
  actualAway: number | null;
}): MatchHit {
  const {
    pickedWinnerId,
    actualWinnerId,
    stagePicks,
    predictedHome,
    predictedAway,
    actualHome,
    actualAway,
  } = args;

  if (actualWinnerId === null) return 'pending';

  // Exact requires both predicted and actual scores; only Final/Bronze populate predicted.
  if (
    predictedHome !== null &&
    predictedAway !== null &&
    actualHome !== null &&
    actualAway !== null &&
    predictedHome === actualHome &&
    predictedAway === actualAway
  ) {
    return 'exact';
  }

  // Credit the pick on the card where the predicted team actually played and won,
  // regardless of which slot the user assigned them to.
  if (stagePicks?.has(actualWinnerId) ?? pickedWinnerId === actualWinnerId) {
    return 'outcome';
  }
  return 'missed';
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

  const finalGroupMatchIds = new Set(
    allMatches.filter((m) => m.stage === 'group' && m.status === 'final').map((m) => m.id),
  );
  const allGroupsFinal = def.groupMatches.every((gm) => finalGroupMatchIds.has(gm.id));

  // Per-group finality: a group is "done" when all its matches are final.
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

  for (const prog of def.bracket.progression) {
    if (prog.match === def.bracket.bronzeMatch) continue;
    if (prog.from.length !== 2) continue;
    const [fk0, fk1] = prog.from;
    const w0 = fk0 ? getMatchWinner(matchByKey.get(fk0) ?? null) : null;
    const w1 = fk1 ? getMatchWinner(matchByKey.get(fk1) ?? null) : null;
    // Populate even when only one feeder match is final so the known team
    // appears as confirmed in the next round instead of as a predicted fill.
    if (w0 !== null || w1 !== null) {
      participantsByMatch.set(prog.match, [w0, w1] as [string | null, string | null]);
    }
  }

  // Bronze: SF losers (need both SFs final; participants of SF can be derived or from DB row)
  const bronzeProg = def.bracket.progression.find((p) => p.match === def.bracket.bronzeMatch);
  if (bronzeProg) {
    const losers: (string | null)[] = bronzeProg.from.map((sfKey) => {
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
    if (l0 && l1) {
      participantsByMatch.set(def.bracket.bronzeMatch, [l0, l1]);
    }
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
 * For Final: both participants are SF winners — return the SF winner that is NOT the picked Final winner.
 * For Bronze: both participants are SF losers — for each SF, find the team the user did NOT pick to win.
 */
function derivePredictedOpponent(
  matchKey: string,
  bracket: Tournament['bracket'],
  pickMap: Map<string, string>,
  effectivePick: string | null,
): string | null {
  const prog = bracket.progression.find((p) => p.match === matchKey);
  if (!prog || prog.from.length !== 2) return null;
  const sf1Key = prog.from[0];
  const sf2Key = prog.from[1];
  if (!sf1Key || !sf2Key) return null;
  const pickedWinner = effectivePick;

  if (matchKey !== bracket.bronzeMatch) {
    // Final: participants are SF winners
    const finalist1 = pickMap.get(sf1Key) ?? null;
    const finalist2 = pickMap.get(sf2Key) ?? null;
    if (finalist1 && finalist2) {
      return finalist1 === pickedWinner ? finalist2 : finalist1;
    }
    return null;
  }

  // Bronze: participants are SF losers
  const sfLoser = (sfKey: string): string | null => {
    const sfProg = bracket.progression.find((p) => p.match === sfKey);
    if (!sfProg || sfProg.from.length !== 2) return null;
    const qf1Key = sfProg.from[0];
    const qf2Key = sfProg.from[1];
    if (!qf1Key || !qf2Key) return null;
    const sfWinner = pickMap.get(sfKey) ?? null;
    if (!sfWinner) return null;
    const team1 = pickMap.get(qf1Key) ?? null;
    const team2 = pickMap.get(qf2Key) ?? null;
    if (team1 && sfWinner !== team1) return team1;
    if (team2 && sfWinner !== team2) return team2;
    return null;
  };

  const loser1 = sfLoser(sf1Key);
  const loser2 = sfLoser(sf2Key);
  if (!loser1 || !loser2) return null;
  return loser1 === pickedWinner ? loser2 : loser1;
}

/**
 * Derives the implied winner of a Final or Bronze match from the predicted score
 * and the bracket picks, mirroring what deriveFinishWinner does at save time.
 *
 * Used when no explicit knockout pick was stored for the match (typically because
 * the score was saved before the SF/QF bracket picks were filled in), but the
 * feeder picks are now present and allow the winner to be inferred.
 *
 * Returns null when: score is tied, feeder picks are missing, or the bracket
 * progression cannot be resolved.
 */
export function deriveImplicitFinaleWinner(
  matchKey: string,
  bracket: Tournament['bracket'],
  pickMap: Map<string, string>,
  homeGoals: number,
  awayGoals: number,
): string | null {
  if (homeGoals === awayGoals) return null;

  const prog = bracket.progression.find((p) => p.match === matchKey);
  if (!prog || prog.from.length !== 2) return null;
  const [from1, from2] = prog.from;
  if (!from1 || !from2) return null;

  if (matchKey !== bracket.bronzeMatch) {
    // Final: home side = sf1 winner, away side = sf2 winner
    const homeSide = pickMap.get(from1) ?? null;
    const awaySide = pickMap.get(from2) ?? null;
    if (!homeSide || !awaySide) return null;
    return homeGoals > awayGoals ? homeSide : awaySide;
  }

  // Bronze: home side = sf1 loser, away side = sf2 loser
  const getSfLoser = (sfKey: string): string | null => {
    const sfProg = bracket.progression.find((p) => p.match === sfKey);
    if (!sfProg || sfProg.from.length !== 2) return null;
    const [qf1Key, qf2Key] = sfProg.from;
    if (!qf1Key || !qf2Key) return null;
    const sfWinner = pickMap.get(sfKey) ?? null;
    if (!sfWinner) return null;
    const team1 = pickMap.get(qf1Key) ?? null;
    const team2 = pickMap.get(qf2Key) ?? null;
    if (team1 && sfWinner !== team1) return team1;
    if (team2 && sfWinner !== team2) return team2;
    return null;
  };

  const homeSide = getSfLoser(from1);
  const awaySide = getSfLoser(from2);
  if (!homeSide || !awaySide) return null;
  return homeGoals > awayGoals ? homeSide : awaySide;
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
  const allEntryPickedTeams = new Set<string>();
  for (const slot of def.bracket.slots) {
    const pick = pickMap.get(slot.match);
    if (pick) allEntryPickedTeams.add(pick);
  }

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
    const directValid = directPick && (derived[0] === directPick || derived[1] === directPick);
    if (directValid) {
      entryWinner.set(slot.match, directPick);
    } else {
      const crossMatch =
        derived[0] !== null && allEntryPickedTeams.has(derived[0])
          ? derived[0]
          : derived[1] !== null && allEntryPickedTeams.has(derived[1])
            ? derived[1]
            : null;
      entryWinner.set(slot.match, crossMatch);
    }
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
  for (const round of def.bracket.rounds) {
    for (const prog of def.bracket.progression) {
      if (prog.match === bronzeKey) continue;
      if (predicted.has(prog.match)) continue;
      if (getRoundLabel(prog.match, def.bracket.rounds) !== round) continue;
      const [fk0, fk1] = prog.from;
      predicted.set(prog.match, [
        fk0 ? getPredictedWinner(fk0) : null,
        fk1 ? getPredictedWinner(fk1) : null,
      ]);
    }
  }

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
    predicted.set(bronzeKey, [sf1 ? getSfLoser(sf1) : null, sf2 ? getSfLoser(sf2) : null]);
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
  const allEntryPickedTeams = new Set<string>();
  for (const slot of def.bracket.slots) {
    const pick = pickMap.get(slot.match);
    if (pick) allEntryPickedTeams.add(pick);
  }

  // Entry rounds: resolve user's pick (with cross-slot adjustment) — no actual substitution.
  const entryPickWinner = new Map<BracketMatchKey, string | null>();
  for (const slot of def.bracket.slots) {
    const derived = derivedParticipants.get(slot.match);
    if (!derived) {
      entryPickWinner.set(slot.match, null);
      continue;
    }
    const directPick = pickMap.get(slot.match) ?? null;
    const directValid =
      directPick !== null && (derived[0] === directPick || derived[1] === directPick);
    if (directValid) {
      entryPickWinner.set(slot.match, directPick);
    } else {
      const crossMatch =
        derived[0] !== null && allEntryPickedTeams.has(derived[0])
          ? derived[0]
          : derived[1] !== null && allEntryPickedTeams.has(derived[1])
            ? derived[1]
            : null;
      entryPickWinner.set(slot.match, crossMatch);
    }
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
  for (const round of def.bracket.rounds) {
    for (const prog of def.bracket.progression) {
      if (prog.match === bronzeKey) continue;
      if (predicted.has(prog.match)) continue;
      if (getRoundLabel(prog.match, def.bracket.rounds) !== round) continue;
      const [fk0, fk1] = prog.from;
      predicted.set(prog.match, [
        fk0 ? getUserPickedWinner(fk0) : null,
        fk1 ? getUserPickedWinner(fk1) : null,
      ]);
    }
  }

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
    predicted.set(bronzeKey, [sf1 ? getSfLoser(sf1) : null, sf2 ? getSfLoser(sf2) : null]);
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
