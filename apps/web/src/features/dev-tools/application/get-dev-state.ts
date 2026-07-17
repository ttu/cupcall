import type { Db } from '@cup/db';
import type { AppSchema } from '@/shared/db';
import { listAllUsers, getMatchesForTournament } from '@cup/db';
import { tournamentId as asTournamentId } from '@cup/engine';

export type SimulationCheckpoint =
  | 'fresh'
  | 'groups-half'
  | 'groups-done'
  | 'r32-done'
  | 'r16-done'
  | 'qf-done'
  | 'finals-done';

export type DevUser = { id: string; displayName: string; email: string | null };

export type DevState = {
  users: DevUser[];
  checkpoint: SimulationCheckpoint;
  groupStageDay: string | null;
  stats: { groupFinal: number; groupTotal: number; knockoutFinal: number };
};

export async function getDevState(db: Db<AppSchema>): Promise<DevState> {
  const [users, matches] = await Promise.all([
    listAllUsers(db),
    getMatchesForTournament(db, asTournamentId('test-wc-2026')),
  ]);

  const groupFinal = matches.filter((m) => m.stage === 'group' && m.status === 'final').length;
  const groupTotal = matches.filter((m) => m.stage === 'group').length;
  const knockoutFinal = matches.filter((m) => m.stage !== 'group' && m.status === 'final').length;

  const stats = { groupFinal, groupTotal, knockoutFinal };

  const finalGroupKickoffs = matches
    .filter((m) => m.stage === 'group' && m.status === 'final' && m.kickoff !== null)
    .map((m) => m.kickoff!.toISOString().slice(0, 10))
    .sort((a, b) => a.localeCompare(b));
  const groupStageDay = finalGroupKickoffs.at(-1) ?? null;

  let checkpoint: SimulationCheckpoint;
  if (groupFinal < 36) {
    checkpoint = 'fresh';
  } else if (groupFinal >= 36 && groupFinal < 72) {
    checkpoint = 'groups-half';
  } else if (groupFinal >= 72 && knockoutFinal === 0) {
    checkpoint = 'groups-done';
  } else if (knockoutFinal >= 16 && knockoutFinal < 24) {
    checkpoint = 'r32-done';
  } else if (knockoutFinal >= 24 && knockoutFinal < 28) {
    checkpoint = 'r16-done';
  } else if (knockoutFinal >= 28 && knockoutFinal < 30) {
    checkpoint = 'qf-done';
  } else {
    checkpoint = 'finals-done';
  }

  return {
    users: users.map((u) => ({ id: u.id, displayName: u.displayName, email: u.email })),
    checkpoint,
    groupStageDay,
    stats,
  };
}
