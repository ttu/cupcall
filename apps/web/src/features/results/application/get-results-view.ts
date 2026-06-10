import type { AppSchema } from '@/shared/db';
import type { Db } from '@cup/db';
import {
  getPoolById,
  getTournamentById,
  getLeaderboard,
  getPrediction,
  getPredictionInputs,
  getMatchesForTournament,
} from '@cup/db';
import type { MatchRow } from '@cup/db';
import type { Tournament, GroupId, TeamId, BracketMatchKey } from '@cup/engine';
import type {
  ResultsView,
  GroupResultView,
  GroupMatchResultRow,
  GroupStandingRow,
  KnockoutMatchView,
  BracketRoundResultView,
  BracketHealth,
  MatchHit,
  UserRankChip,
} from '../domain/types';
import { buildStageProgress } from '@/shared/stage-progress';
import type { StageProgress, StageKey } from '@/shared/stage-progress';

type Params = {
  db: Db<AppSchema>;
  poolId: string;
  userId: string;
  now: Date;
};

export async function getResultsView(params: Params): Promise<ResultsView | null> {
  const { db, poolId, userId, now: _now } = params;

  const pool = await getPoolById(db, poolId);
  if (!pool) return null;

  const tournament = await getTournamentById(db, pool.tournamentId);
  if (!tournament?.definition) return null;

  const def = tournament.definition;

  const [leaderboard, prediction, allMatches] = await Promise.all([
    getLeaderboard(db, poolId),
    getPrediction(db, poolId, userId as import('@cup/engine').UserId),
    getMatchesForTournament(db, pool.tournamentId),
  ]);

  const inputs = prediction != null ? await getPredictionInputs(db, prediction.id) : null;

  const userRank = buildUserRank(leaderboard, userId);
  const stageProgress = buildStageProgress(def, allMatches);
  const currentStage = deriveCurrentStage(stageProgress);
  const groupResults = buildGroupResults(def, allMatches, inputs);
  const { bracketRounds, bronzeMatch } = buildBracketRounds(def, allMatches, inputs);
  const bracketHealth = buildBracketHealth(bracketRounds, bronzeMatch);

  return {
    poolName: pool.name,
    tournamentName: tournament.name,
    userRank,
    stageProgress,
    currentStage,
    groupResults,
    bracketRounds,
    bronzeMatch,
    bracketHealth,
  };
}

// ---------------------------------------------------------------------------
// User rank
// ---------------------------------------------------------------------------

function buildUserRank(
  leaderboard: Awaited<ReturnType<typeof getLeaderboard>>,
  userId: string,
): UserRankChip | null {
  const idx = leaderboard.findIndex((e) => e.userId === userId);
  if (idx === -1) return null;
  return {
    rank: idx + 1,
    totalMembers: leaderboard.length,
    points: leaderboard[idx]!.pointsTotal,
  };
}

function deriveCurrentStage(progress: StageProgress[]): StageKey {
  const active = progress.find((s) => s.state === 'active');
  if (active) return active.key;
  const first = progress[0];
  return first?.key ?? 'group';
}

// ---------------------------------------------------------------------------
// Group results
// ---------------------------------------------------------------------------

function buildGroupResults(
  def: Tournament,
  allMatches: MatchRow[],
  inputs: Awaited<ReturnType<typeof getPredictionInputs>> | null,
): GroupResultView[] {
  const teamMap = new Map<string, string>(def.teams.map((t) => [t.id, t.name]));
  const predMap = new Map<string, { home: number; away: number }>(
    (inputs?.groupScores ?? []).map((gs) => [gs.matchId, { home: gs.home, away: gs.away }]),
  );
  const scoring = def.scoring.groupMatch;

  return def.groups.map((group) => {
    const completedMatches: GroupMatchResultRow[] = allMatches
      .filter((m) => m.stage === 'group' && m.groupId === group.id && m.status === 'final')
      .map((m) => {
        const pred = predMap.get(m.id) ?? null;
        const hit = computeHit(
          m.homeGoals!,
          m.awayGoals!,
          pred?.home ?? null,
          pred?.away ?? null,
          scoring,
        );
        return {
          matchId: m.id,
          groupId: group.id,
          homeTeamId: m.homeTeamId ?? '',
          homeTeamName: teamMap.get(m.homeTeamId ?? '') ?? m.homeTeamId ?? '',
          awayTeamId: m.awayTeamId ?? '',
          awayTeamName: teamMap.get(m.awayTeamId ?? '') ?? m.awayTeamId ?? '',
          kickoff: m.kickoff?.toISOString() ?? null,
          actualHome: m.homeGoals!,
          actualAway: m.awayGoals!,
          predictedHome: pred?.home ?? null,
          predictedAway: pred?.away ?? null,
          hit: hit.hit,
          pointsAwarded: hit.points,
        };
      });

    const standing = buildGroupStanding(def, group.id as GroupId, allMatches, teamMap);

    return { groupId: group.id, completedMatches, standing };
  });
}

function buildGroupStanding(
  def: Tournament,
  groupId: GroupId,
  allMatches: MatchRow[],
  teamMap: Map<string, string>,
): GroupStandingRow[] {
  const group = def.groups.find((g) => g.id === groupId);
  if (!group) return [];

  const stats = new Map<string, { w: number; d: number; l: number; gf: number; ga: number }>(
    group.teams.map((t) => [t, { w: 0, d: 0, l: 0, gf: 0, ga: 0 }]),
  );

  for (const m of allMatches) {
    if (m.stage !== 'group' || m.groupId !== groupId || m.status !== 'final') continue;
    if (!m.homeTeamId || !m.awayTeamId) continue;

    const h = stats.get(m.homeTeamId);
    const a = stats.get(m.awayTeamId);
    if (!h || !a) continue;

    const hg = m.homeGoals!;
    const ag = m.awayGoals!;
    h.gf += hg;
    h.ga += ag;
    a.gf += ag;
    a.ga += hg;

    if (hg > ag) {
      h.w++;
      a.l++;
    } else if (hg < ag) {
      a.w++;
      h.l++;
    } else {
      h.d++;
      a.d++;
    }
  }

  const autoQualify = def.qualification.autoQualifyPerGroup;

  // Sort: points → GD → GF → seed order
  const ranked = group.teams
    .map((tid, seed) => {
      const s = stats.get(tid) ?? { w: 0, d: 0, l: 0, gf: 0, ga: 0 };
      const pts = s.w * 3 + s.d;
      return { tid, seed, s, pts, gd: s.gf - s.ga };
    })
    .sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.s.gf !== a.s.gf) return b.s.gf - a.s.gf;
      return a.seed - b.seed;
    });

  return ranked.map(({ tid, s, pts, gd }, i) => ({
    position: i + 1,
    teamId: tid,
    teamName: teamMap.get(tid) ?? tid,
    played: s.w + s.d + s.l,
    won: s.w,
    drawn: s.d,
    lost: s.l,
    goalsFor: s.gf,
    goalsAgainst: s.ga,
    goalDifference: gd,
    points: pts,
    qualifies: i < autoQualify ? 'auto' : false,
  }));
}

// ---------------------------------------------------------------------------
// Knockout bracket
// ---------------------------------------------------------------------------

function buildBracketRounds(
  def: Tournament,
  allMatches: MatchRow[],
  inputs: Awaited<ReturnType<typeof getPredictionInputs>> | null,
): { bracketRounds: BracketRoundResultView[]; bronzeMatch: KnockoutMatchView | null } {
  const teamMap = new Map<string, string>(def.teams.map((t) => [t.id, t.name]));
  const matchByKey = new Map<string, MatchRow>(allMatches.map((m) => [m.id, m]));
  const pickMap = new Map<string, string>(
    (inputs?.knockoutPicks ?? []).map((kp) => [kp.bracketMatchKey, kp.winner]),
  );

  const buildMatchView = (key: BracketMatchKey, round: string): KnockoutMatchView => {
    const actual = matchByKey.get(key) ?? null;
    const pickedId = pickMap.get(key) ?? null;

    const homeId = actual?.homeTeamId ?? null;
    const awayId = actual?.awayTeamId ?? null;
    const winnerId = actual?.winnerTeamId ?? null;

    let pickStatus: KnockoutMatchView['pickStatus'] = 'no-pick';
    if (pickedId) {
      if (!winnerId) {
        pickStatus = 'pending';
      } else if (winnerId === pickedId) {
        pickStatus = 'alive';
      } else {
        pickStatus = 'busted';
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
      pickedWinnerId: pickedId,
      pickedWinnerName: pickedId ? (teamMap.get(pickedId) ?? pickedId) : null,
      pickStatus,
    };
  };

  const { bracket } = def;
  const mainRounds = bracket.rounds.filter((r) => r !== 'Final' && r !== 'bronze');

  // Collect all bracket match keys per round from slots + progression
  const keysByRound = new Map<string, BracketMatchKey[]>();

  for (const slot of bracket.slots) {
    const round = getRoundLabel(slot.match, bracket.rounds);
    if (!keysByRound.has(round)) keysByRound.set(round, []);
    keysByRound.get(round)!.push(slot.match);
  }

  for (const prog of bracket.progression) {
    if (prog.match === bracket.finalMatch || prog.match === bracket.bronzeMatch) continue;
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

  // Final (its own round in the display)
  const finalRound: BracketRoundResultView = {
    label: 'Final',
    matches: [buildMatchView(bracket.finalMatch, 'Final')],
  };
  bracketRounds.push(finalRound);

  const bronzeMatch = buildMatchView(bracket.bronzeMatch, 'Bronze');

  return { bracketRounds, bronzeMatch };
}

// ---------------------------------------------------------------------------
// Bracket health
// ---------------------------------------------------------------------------

function buildBracketHealth(
  rounds: BracketRoundResultView[],
  bronze: KnockoutMatchView | null,
): BracketHealth {
  const allMatches = [...rounds.flatMap((r) => r.matches), ...(bronze ? [bronze] : [])].filter(
    (m) => m.pickStatus !== 'no-pick',
  );

  return {
    totalPicks: allMatches.length,
    alivePicks: allMatches.filter((m) => m.pickStatus === 'alive').length,
    bustedPicks: allMatches.filter((m) => m.pickStatus === 'busted').length,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeHit(
  actualHome: number,
  actualAway: number,
  predictedHome: number | null,
  predictedAway: number | null,
  scoring: { exactScore: number; correctOutcome: number },
): { hit: MatchHit; points: number } {
  if (predictedHome === null || predictedAway === null) return { hit: 'pending', points: 0 };
  if (predictedHome === actualHome && predictedAway === actualAway) {
    return { hit: 'exact', points: scoring.exactScore };
  }
  const actualOutcome = Math.sign(actualHome - actualAway);
  const predictedOutcome = Math.sign(predictedHome - predictedAway);
  if (actualOutcome === predictedOutcome) {
    return { hit: 'outcome', points: scoring.correctOutcome };
  }
  return { hit: 'missed', points: 0 };
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
