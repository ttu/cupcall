import type { Db } from '@cup/db';
import { getPoolById, getLeaderboard, getTournamentById, getMatchesForTournament } from '@cup/db';
import type { Tournament } from '@cup/engine';
import type { PoolDetail } from '../domain/types';
import { buildStageProgress } from '@/shared/stage-progress';

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
