import type { MatchHit, RaceChartPlayer } from '@/shared/race-chart';
export type { MatchHit, RaceChartPlayer };

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
  poolMatchStats: MatchResultPoolStats | null;
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
  conduct: number;
  qualifies: 'auto' | 'best-third' | false;
  /** True when the team is mathematically eliminated from the group stage. */
  eliminated: boolean;
  /** Position the current user predicted for this team. Null when no predictions exist (viewer mode or unpredicted group). */
  predictedPosition: number | null;
  /** Most commonly predicted position for this team across the pool. Null when no pool predictions exist. */
  poolMostPredictedPosition: number | null;
  /** % of pool members who predicted the most common position above. */
  poolMostPredictedPct: number | null;
  fifaRanking: number | null;
};

export type Best3rdStandingRow = {
  rank: number;
  groupId: string;
  teamId: string;
  teamName: string;
  played: number;
  goalDifference: number;
  points: number;
  qualifies: boolean;
};

export type MatchPredictionStats = {
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  avgHomeGoals: number;
  avgAwayGoals: number;
  totalPredictions: number;
};

export type MatchResultPoolStats = {
  totalPredictions: number;
  /** % of pool members who predicted the exact score. */
  exactPct: number;
  /** % who predicted the correct outcome (winner/draw) but not the exact score. */
  outcomePct: number;
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

export type GroupPoints = {
  matchPoints: number;
  groupOrderPoints: number;
};

export type GroupResultView = {
  groupId: string;
  completedMatches: GroupMatchResultRow[];
  todayMatches: GroupUpcomingMatchRow[];
  /** Non-final matches with kickoff beyond the 24h today window, or with no kickoff set yet. */
  upcomingMatches: GroupUpcomingMatchRow[];
  standing: GroupStandingRow[];
  /** Points the current user earned from this group once all matches are final. Null when group is not yet finalized or user has no prediction. */
  groupPoints: GroupPoints | null;
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
  /** The predicted opponent in Final/Bronze — the non-winner pick derived from SF bracket picks. Null for all other rounds or when picks are incomplete. */
  pickedOpponentId: string | null;
  pickedOpponentName: string | null;
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
  /** True when participants are derived from live (partial) group standings during the group stage. */
  projected: boolean;
  /** True when homeTeamId comes from the actual confirmed match data, not projected from group standings. Only meaningful when projected=true. */
  homeTeamConfirmed: boolean;
  /** True when awayTeamId comes from the actual confirmed match data, not projected from group standings. Only meaningful when projected=true. */
  awayTeamConfirmed: boolean;
  /** User's predicted home team for this slot — populated only when homeTeamId is null and the pick is still alive. */
  predictedHomeTeamId: string | null;
  predictedHomeTeamName: string | null;
  /** User's predicted away team for this slot — populated only when awayTeamId is null and the pick is still alive. */
  predictedAwayTeamId: string | null;
  predictedAwayTeamName: string | null;
  /** True when this match is the first knockout round (R32/QF depending on tournament size). */
  isEntryRound: boolean;
  /** % of pool members who predicted this team would be playing in this round. For the entry round: derived from group-score predictions. For later rounds: derived from knockout winner picks. Null when team slot is unknown or no predictions exist. */
  homeTeamPredictedPct: number | null;
  /** % of pool members who predicted the away team would be playing in this round. */
  awayTeamPredictedPct: number | null;
  /** True when the confirmed home-slot team was predicted by the user to be in this slot (progression rounds only; always false for the entry round). */
  homeTeamUserPredictedParticipant: boolean;
  /** True when the confirmed away-slot team was predicted by the user to be in this slot (progression rounds only; always false for the entry round). */
  awayTeamUserPredictedParticipant: boolean;
};

export type BracketRoundResultView = {
  label: string;
  matches: KnockoutMatchView[];
};

export type BracketRoundHealth = {
  label: string;
  alivePicks: number;
  pendingPicks: number;
  bustedPicks: number;
  totalPicks: number;
  earnedPoints: number;
  maxPossiblePoints: number;
};

export type BracketHealth = {
  totalPicks: number;
  alivePicks: number;
  pendingPicks: number;
  bustedPicks: number;
  missedPicks: number;
  perRound: BracketRoundHealth[];
};

import type { StageKey, StageProgress } from '@/shared/stage-progress';
import type { LeaderboardEntry } from '@cup/db';
import type { ScoreBreakdown, Scoring } from '@cup/engine';
export type { StageKey, StageProgress, LeaderboardEntry, ScoreBreakdown, Scoring };

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
  /** The user's predicted outcome derived from their predicted score. Null when no prediction was made. */
  predictedOutcome: '1' | 'X' | '2' | null;
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
  status: 'scheduled' | 'in_progress' | 'final' | 'cancelled';
  /** ISO-8601 string. Null when kickoff is not set. */
  kickoff: string | null;
  /** Null for unplayed matches. */
  actualHome: number | null;
  /** Null for unplayed matches. */
  actualAway: number | null;
};

export type KnockoutMatchHit = 'hit' | 'miss' | 'no-pick' | 'pending';

export type KnockoutMatrixCell = {
  bracketMatchKey: string;
  hit: KnockoutMatchHit;
  points: number;
  pickedWinnerId: string | null;
};

export type KnockoutMatrixEntry = {
  userId: string;
  displayName: string;
  isCurrentUser: boolean;
  cells: KnockoutMatrixCell[];
  totalPoints: number;
};

export type KnockoutMatrixMatch = {
  bracketMatchKey: string;
  round: string;
  homeTeamId: string | null;
  homeTeamName: string | null;
  awayTeamId: string | null;
  awayTeamName: string | null;
  actualWinnerId: string | null;
  kickoff: string | null;
  status: 'scheduled' | 'final';
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
  /** Hit-rate projection: banked/resolvedMax × remainingMax. Used for chart + projected standings. */
  myStillLive: number;
  /** myBanked + myStillLive. */
  myProjected: number;
  /** True maximum still attainable (sum of canStillGet across all scoring categories). */
  myTotalCanStillGet: number;
  projectedEntries: ProjectedEntry[];
  /** Rows of the per-match scoring matrix, sorted by totalPoints DESC. */
  matchMatrix: MatchMatrixEntry[];
  /** All group-stage matches that form the matrix columns, in kickoff order. */
  matrixMatches: MatrixMatch[];
  /** Rows of the knockout winner-pick matrix, sorted by totalPoints DESC. */
  knockoutMatrix: KnockoutMatrixEntry[];
  /** All knockout matches that form the matrix columns, sorted by kickoff (nulls last). */
  knockoutMatrixMatches: KnockoutMatrixMatch[];
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
  /** Team IDs for the correct answer(s) — multiple entries when there is a tie. */
  actualAnswerTeamIds: string[];
  hit: 'hit' | 'missed' | 'pending';
  pointsAwarded: number;
  /** Informational only — derived from match data when the bet is still pending. Never the final answer. */
  currentLeader: CurrentLeader | null;
  /** Distribution of what pool members predicted for this bet. */
  poolStats: SpecialBetPoolStats | null;
};

export type UserPointsSummary = {
  /** Points the user has actually scored from resolved matches. */
  earned: number;
  /** Max points available from resolved matches that the user didn't score. */
  missed: number;
  /** Maximum points still attainable from unresolved matches. */
  canStillGet: number;
  /** Breakdown of earned into match-result points vs. group-order points. Present only on the group summary; absent on knockout/specials. Null in viewer mode. */
  earnedBreakdown?: { matchPoints: number; orderPoints: number } | null;
};

export type ResultsView = {
  poolName: string;
  tournamentName: string;
  scoring: Scoring;
  userRank: UserRankChip | null;
  /** The current user's score breakdown — null when the user has no scored prediction yet. */
  userBreakdown: ScoreBreakdown | null;
  /** Group matches + group order points summary — null in viewer mode. */
  userGroupSummary: UserPointsSummary | null;
  /** Bracket picks points summary (roundOf8, topFour, bronze, final) — null in viewer mode. */
  userKnockoutSummary: UserPointsSummary | null;
  /** Specials-only points summary — null in viewer mode. */
  userSpecialsSummary: UserPointsSummary | null;
  stageProgress: StageProgress[];
  currentStage: StageKey;
  groupResults: GroupResultView[];
  /** Live cross-group ranking of 3rd-placed teams. Null when tournament has no best-third advancement or no matches played yet. */
  best3rdStanding: Best3rdStandingRow[] | null;
  bracketRounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
  bracketHealth: BracketHealth;
  /** Team IDs the current user predicted would reach the knockout stage (qualify from groups) plus bracket winner picks. Null in viewer mode. */
  userPredictedKnockoutTeamIds: string[] | null;
  leaderboard: LeaderboardEntry[];
  pointsRaceView: PointsRaceView;
  specialBets: SpecialBetResultRow[];
};
