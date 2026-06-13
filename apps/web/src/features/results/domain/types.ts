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

export type MatchPredictionStats = {
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  avgHomeGoals: number;
  avgAwayGoals: number;
  totalPredictions: number;
};

export type GroupUpcomingMatchRow = {
  matchId: string;
  groupId: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  kickoff: string | null;
  predictedHome: number | null;
  predictedAway: number | null;
  poolPredictionStats: MatchPredictionStats | null;
};

export type GroupResultView = {
  groupId: string;
  completedMatches: GroupMatchResultRow[];
  todayMatches: GroupUpcomingMatchRow[];
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
  /** User's predicted score — only populated for Final and Bronze ties. */
  predictedHome: number | null;
  /** User's predicted score — only populated for Final and Bronze ties. */
  predictedAway: number | null;
  /** Per-tie hit:
   *   - Non-Final/Bronze: 'outcome' | 'missed' | 'pending' only ('exact' impossible — no score predicted).
   *   - Final/Bronze: any of 'exact' | 'outcome' | 'missed' | 'pending'.
   */
  hit: MatchHit;
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
import type { LeaderboardEntry } from '@cup/db';
import type { ScoreBreakdown } from '@cup/engine';
export type { StageKey, StageProgress, LeaderboardEntry, ScoreBreakdown };

export type UserRankChip = {
  rank: number;
  totalMembers: number;
  points: number;
};

// ---------------------------------------------------------------------------
// Points race
// ---------------------------------------------------------------------------

export type MatchMatrixCell = {
  matchId: string;
  hit: MatchHit;
  points: number;
};

export type MatchMatrixEntry = {
  userId: string;
  displayName: string;
  isCurrentUser: boolean;
  cells: MatchMatrixCell[];
  totalPoints: number;
};

export type MatrixMatch = {
  matchId: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  actualHome: number;
  actualAway: number;
};

export type RaceChartPlayer = {
  userId: string;
  displayName: string;
  isCurrentUser: boolean;
  color: string;
  /** Cumulative points at each stage (parallel to PointsRaceView.chartStages). */
  points: number[];
};

export type ProjectedEntry = {
  userId: string;
  displayName: string;
  isCurrentUser: boolean;
  currentPoints: number;
  currentRank: number;
  projectedPoints: number;
  projectedRank: number;
  /** Positive = moved up in projected standings vs current. */
  rankDelta: number;
};

export type PointsRaceView = {
  /** X-axis labels for the race chart, e.g. ["Start","Group Stage","Now","Projected"]. */
  chartStages: string[];
  /** Index of the "Now" stage in chartStages — actual data ends here, dashed after. */
  chartNowIndex: number;
  chartPlayers: RaceChartPlayer[];
  /** Current user's banked (actual) points total. */
  myBanked: number;
  /** Approximate additional points still reachable from surviving bracket picks. */
  myStillLive: number;
  /** myBanked + myStillLive. */
  myProjected: number;
  projectedEntries: ProjectedEntry[];
  /** Rows of the per-match scoring matrix, sorted by totalPoints DESC. */
  matchMatrix: MatchMatrixEntry[];
  /** Completed group-stage matches that form the matrix columns, in kickoff order. */
  matrixMatches: MatrixMatch[];
};

/**
 * Informational hint shown under a pending special bet. Derived from match
 * data — never the final answer (those come from results.json::answers).
 */
export type CurrentLeader = {
  /** Human-readable leader(s). Comma-joined names for team bets; the number itself for number bets. */
  display: string;
  /** Quantitative context, e.g. "5 goals", "1 match", "". Empty string => no parenthetical. */
  detail: string;
  /** Team IDs for badge rendering when bet kind is 'team'; empty array otherwise. */
  teamIds: string[];
};

export type SpecialBetTopValue = {
  displayValue: string;
  count: number;
  pct: number;
  teamId: string | null;
};

export type SpecialBetPoolStats = {
  totalPredictions: number;
  topValues: SpecialBetTopValue[];
};

export type SpecialBetResultRow = {
  key: string;
  label: string;
  kind: 'player' | 'team' | 'number' | 'bool';
  points: number;
  userPickDisplay: string | number | boolean | null;
  actualAnswerDisplay: string | number | boolean | null;
  /** Team ID for flag display — populated for `kind === 'team'` bets and for `kind === 'player'` bets (the player's national team). */
  userPickTeamId: string | null;
  actualAnswerTeamId: string | null;
  hit: 'hit' | 'missed' | 'pending';
  pointsAwarded: number;
  /** Informational only — derived from match data when the bet is still pending. Never the final answer. */
  currentLeader: CurrentLeader | null;
  /** Distribution of what pool members predicted for this bet. */
  poolStats: SpecialBetPoolStats | null;
};

export type ResultsView = {
  poolName: string;
  tournamentName: string;
  userRank: UserRankChip | null;
  /** The current user's score breakdown — null when the user has no scored prediction yet. */
  userBreakdown: ScoreBreakdown | null;
  stageProgress: StageProgress[];
  currentStage: StageKey;
  groupResults: GroupResultView[];
  bracketRounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
  bracketHealth: BracketHealth;
  leaderboard: LeaderboardEntry[];
  pointsRaceView: PointsRaceView;
  specialBets: SpecialBetResultRow[];
};
