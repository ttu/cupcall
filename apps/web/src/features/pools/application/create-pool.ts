import type { Db } from '@cup/db';
import {
  createPool as dbCreatePool,
  addMember,
  countPoolsOwnedBy,
  checkRateLimit,
  RATE_LIMITS,
  listTournaments,
  getTournamentById,
} from '@cup/db';
import type { UserId, TournamentId } from '@cup/engine';
import { generateInviteToken } from '../domain/invite';
import type { PoolSummary } from '../domain/types';

/** Maximum pools a single user may own (functional-spec §9). */
const MAX_POOLS_PER_USER = 5;

export type CreatePoolError =
  | { code: 'no_tournament' }
  | { code: 'tournament_not_found' }
  | { code: 'pool_cap_exceeded'; limit: number }
  | { code: 'rate_limited' };

export type CreatePoolResult =
  | { ok: true; pool: PoolSummary }
  | { ok: false; error: CreatePoolError };

export async function createPool(
  db: Db<import('@/shared/db').AppSchema>,
  input: { ownerId: UserId; name: string; tournamentId?: TournamentId; now: Date },
): Promise<CreatePoolResult> {
  const { ownerId, name, tournamentId, now } = input;

  // Resolve the tournament: use the specified one, or fall back to the first available.
  let tournament;
  if (tournamentId) {
    tournament = await getTournamentById(db, tournamentId);
    if (!tournament) return { ok: false, error: { code: 'tournament_not_found' } };
  } else {
    const available = await listTournaments(db);
    if (available.length === 0) return { ok: false, error: { code: 'no_tournament' } };
    tournament = available[0]!;
  }

  // Pool ownership cap.
  const owned = await countPoolsOwnedBy(db, ownerId);
  if (owned >= MAX_POOLS_PER_USER) {
    return { ok: false, error: { code: 'pool_cap_exceeded', limit: MAX_POOLS_PER_USER } };
  }

  // Rate limit.
  const rl = await checkRateLimit(db, {
    key: `create_pool:user:${ownerId}`,
    limit: RATE_LIMITS.createPool.limit,
    windowMs: RATE_LIMITS.createPool.windowMs,
    now,
  });
  if (!rl.allowed) {
    return { ok: false, error: { code: 'rate_limited' } };
  }

  // Raw token stored directly — unguessable due to 24-byte entropy.
  // The column is named inviteTokenHash but stores the raw token so that
  // the invite URL can be rebuilt from the pool row without a separate lookup.
  const token = generateInviteToken();

  const pool = await dbCreatePool(db, {
    tournamentId: tournament.id,
    ownerId,
    name,
    inviteTokenHash: token,
  });

  // Owner is also a member of their own pool.
  await addMember(db, pool.id, ownerId);

  return {
    ok: true,
    pool: {
      id: pool.id,
      name: pool.name,
      tournamentId: pool.tournamentId,
      tournamentName: tournament.name,
      ownerId: pool.ownerId,
      memberCount: 1,
      myScore: null,
    },
  };
}
