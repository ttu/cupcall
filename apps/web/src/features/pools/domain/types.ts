import type { UserId, Points } from '@cup/engine';
import type { LeaderboardEntry } from '@cup/db';

export type { LeaderboardEntry };

export type PoolSummary = {
  id: string;
  name: string;
  tournamentId: string;
  tournamentName: string;
  ownerId: UserId;
  memberCount: number;
  myScore: Points | null;
};

export type PoolDetail = {
  id: string;
  name: string;
  tournamentId: string;
  tournamentName: string;
  ownerId: UserId;
  inviteToken: string;
  leaderboard: LeaderboardEntry[];
  memberCount: number;
  lockTime: Date;
};
