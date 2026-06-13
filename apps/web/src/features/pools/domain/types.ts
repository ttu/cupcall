import type { UserId, Points, Scoring } from '@cup/engine';
import type { LeaderboardEntry } from '@cup/db';
import type { StageProgress } from '@/shared/stage-progress';
import type { RaceChartData } from '@/features/results';

export type { LeaderboardEntry, StageProgress };

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
  stageProgress: StageProgress[];
  raceChart: RaceChartData | null;
};
