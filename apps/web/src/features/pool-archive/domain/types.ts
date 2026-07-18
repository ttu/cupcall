import type { PoolId, TournamentId, UserId, Points, ScoreBreakdown } from '@cup/engine';

export type PoolArchiveEntryView = {
  userId: UserId | null;
  displayName: string;
  rank: number;
  pointsTotal: Points;
  breakdown: ScoreBreakdown;
};

export type PoolArchiveView = {
  poolId: PoolId;
  poolName: string;
  tournamentId: TournamentId;
  tournamentName: string;
  archivedAt: Date;
  entries: PoolArchiveEntryView[];
};
