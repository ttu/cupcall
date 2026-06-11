export type MatchHit = 'exact' | 'outcome' | 'missed' | 'pending';

export type GroupMatchResultRow = {
  matchId: string;
  groupId: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  kickoff: string | null;
  actualHome: number;
  actualAway: number;
  predictedHome: number | null;
  predictedAway: number | null;
  hit: MatchHit;
  pointsAwarded: number;
};

export type GroupStandingRow = {
  position: number;
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  qualifies: 'auto' | 'best-third' | false;
};

export type GroupResultView = {
  groupId: string;
  completedMatches: GroupMatchResultRow[];
  standing: GroupStandingRow[];
};

export type PickStatus = 'alive' | 'busted' | 'pending' | 'no-pick';

export type KnockoutMatchView = {
  bracketMatchKey: string;
  round: string;
  homeTeamId: string | null;
  homeTeamName: string | null;
  awayTeamId: string | null;
  awayTeamName: string | null;
  actualHome: number | null;
  actualAway: number | null;
  actualWinnerId: string | null;
  actualWinnerName: string | null;
  kickoff: string | null;
  status: 'scheduled' | 'final';
  pickedWinnerId: string | null;
  pickedWinnerName: string | null;
  pickStatus: PickStatus;
};

export type BracketRoundResultView = {
  label: string;
  matches: KnockoutMatchView[];
};

export type BracketHealth = {
  totalPicks: number;
  alivePicks: number;
  bustedPicks: number;
};

import type { StageKey, StageProgress } from '@/shared/stage-progress';
export type { StageKey, StageProgress };

export type UserRankChip = {
  rank: number;
  totalMembers: number;
  points: number;
};

export type ResultsView = {
  poolName: string;
  tournamentName: string;
  userRank: UserRankChip | null;
  stageProgress: StageProgress[];
  currentStage: StageKey;
  groupResults: GroupResultView[];
  bracketRounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
  bracketHealth: BracketHealth;
};
