import type { Db } from '@cup/db';
import { getPoolById, getLeaderboard, getTournamentById, getMatchesForTournament } from '@cup/db';
import type { Tournament } from '@cup/engine';
import type { MatchRow } from '@cup/db';
import type { PoolDetail, StageProgress } from '../domain/types';

// getSpecialBetDefs always produces 11 bets for any standard tournament scoring config.
const SPECIALS_COUNT = 11;

function computeTotalFields(definition: Tournament | null): number {
  if (!definition) return 0;
  const { bracket } = definition;
  return (
    definition.groupMatches.length +
    bracket.slots.length +
    bracket.progression.filter(
      (p) => p.match !== bracket.bronzeMatch && p.match !== bracket.finalMatch,
    ).length +
    2 + // final + bronze finish scores
    SPECIALS_COUNT
  );
}

type StageKey = 'group' | 'R16' | 'QF' | 'SF' | 'Final';

const STAGE_ORDER: StageKey[] = ['group', 'R16', 'QF', 'SF', 'Final'];
const STAGE_LABELS: Record<StageKey, string> = {
  group: 'Group Stage',
  R16: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  Final: 'Final',
};

function buildStageProgress(def: Tournament, allMatches: MatchRow[]): StageProgress[] {
  const stages = STAGE_ORDER.filter((s) => {
    if (s === 'group') return def.groups.length > 0;
    return def.bracket.rounds.includes(s);
  });

  const finalCountByStage = new Map<string, number>();
  const totalCountByStage = new Map<string, number>();
  const startDateByStage = new Map<string, Date>();

  for (const m of allMatches) {
    const key = m.stage === 'group' ? 'group' : m.stage;
    totalCountByStage.set(key, (totalCountByStage.get(key) ?? 0) + 1);
    if (m.status === 'final') {
      finalCountByStage.set(key, (finalCountByStage.get(key) ?? 0) + 1);
    }
    if (m.kickoff) {
      const existing = startDateByStage.get(key);
      if (!existing || m.kickoff < existing) startDateByStage.set(key, m.kickoff);
    }
  }

  let foundActive = false;
  return stages.map((key) => {
    const total = totalCountByStage.get(key) ?? 0;
    const done = finalCountByStage.get(key) ?? 0;

    let state: StageProgress['state'];
    if (total > 0 && done === total) {
      state = 'completed';
    } else if (done > 0 && !foundActive) {
      state = 'active';
      foundActive = true;
    } else if (done === 0 && !foundActive) {
      if (key === stages[0] && total > 0) {
        state = 'active';
        foundActive = true;
      } else {
        state = 'upcoming';
      }
    } else {
      state = 'upcoming';
    }

    return { key, label: STAGE_LABELS[key], state, startDate: startDateByStage.get(key) ?? null };
  });
}

export async function getPoolDetail(
  db: Db<import('@/shared/db').AppSchema>,
  poolId: string,
): Promise<PoolDetail | undefined> {
  const pool = await getPoolById(db, poolId);
  if (!pool) return undefined;

  const tournament = await getTournamentById(db, pool.tournamentId);
  const def = tournament?.definition ?? null;

  const [leaderboard, allMatches] = await Promise.all([
    getLeaderboard(db, poolId, computeTotalFields(def)),
    getMatchesForTournament(db, pool.tournamentId),
  ]);

  const stageProgress = def ? buildStageProgress(def, allMatches) : [];

  return {
    id: pool.id,
    name: pool.name,
    tournamentId: pool.tournamentId,
    tournamentName: tournament?.name ?? pool.tournamentId,
    ownerId: pool.ownerId,
    inviteToken: pool.inviteTokenHash ?? null,
    viewToken: pool.viewToken ?? null,
    leaderboard,
    memberCount: leaderboard.length,
    lockTime: tournament?.firstKickoff ?? new Date(0),
    scoring: tournament?.scoringConfig ?? null,
    stageProgress,
  } satisfies PoolDetail;
}
