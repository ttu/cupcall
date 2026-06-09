import type { UserId, Points, Scoring } from '@cup/engine';
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
  inviteToken: string | null;
  viewToken: string | null;
  leaderboard: LeaderboardEntry[];
  memberCount: number;
  lockTime: Date;
  scoring: Scoring | null;
};
