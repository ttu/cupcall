import type { PoolId, TournamentId, UserId, Points, ScoreBreakdown } from '@cup/engine';
import type { PoolArchiveRecap } from '@cup/db';
import type { LeadChangeEvent, BiggestRiserEvent } from './race-history';

export type {
  PoolArchiveRecap,
  ChampionPickHighlight,
  BestSingleMatchHighlight,
  BiggestUpsetHighlight,
} from '@cup/db';
export type { LeadChangeEvent, BiggestRiserEvent } from './race-history';

export type PoolArchiveEntryView = {
  userId: UserId | null;
  displayName: string;
  rank: number;
  pointsTotal: Points;
  breakdown: ScoreBreakdown;
  pointsHistory: number[] | null;
  stageReasons: (string | null)[] | null;
};

export type PoolArchiveView = {
  poolId: PoolId;
  poolName: string;
  tournamentId: TournamentId;
  tournamentName: string;
  archivedAt: Date;
  entries: PoolArchiveEntryView[];
  recap: PoolArchiveRecap | null;
  leadChanges: LeadChangeEvent[];
  biggestRiser: BiggestRiserEvent;
};
