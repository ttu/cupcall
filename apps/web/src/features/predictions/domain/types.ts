/**
 * View-model types for the predictions feature.
 * These are derived from domain + tournament data and passed to UI components.
 * They carry only what the UI needs — no raw DB rows exposed.
 */

import type {
  TeamId,
  PlayerId,
  MatchId,
  BracketMatchKey,
  GroupId,
  BetInputKind,
  SpecialBetDef,
} from '@cup/engine';

export type { BetInputKind, SpecialBetDef };

// ---------------------------------------------------------------------------
// Card status
// ---------------------------------------------------------------------------

/**
 * 'editable'  — before firstKickoff; all items editable
 * 'locked'    — after firstKickoff, early joiner; all items locked
 * 'partial'   — after firstKickoff, late joiner; per-item lock via item.locked
 */
export type PredictionStatus = 'editable' | 'locked' | 'partial';

// ---------------------------------------------------------------------------
// Group scores
// ---------------------------------------------------------------------------

export type GroupMatchView = {
  matchId: MatchId;
  group: GroupId;
  homeTeamId: TeamId;
  homeTeamName: string;
  awayTeamId: TeamId;
  awayTeamName: string;
  kickoff: Date | null;
  predictedHome: number | null;
  predictedAway: number | null;
  /** True when this match's result is known and the item cannot be edited. */
  locked: boolean;
};

export type GroupView = {
  groupId: GroupId;
  matches: GroupMatchView[];
  /** Derived standing order for this group (from the user's predicted scores), 1st → last */
  derivedOrder: Array<{
    teamId: TeamId;
    teamName: string;
    qualifies: 'auto' | 'best-third' | false;
  }>;
  /** True when all matches in this group have been predicted */
  complete: boolean;
};

// ---------------------------------------------------------------------------
// Bracket / knockout
// ---------------------------------------------------------------------------

export type TieView = {
  bracketMatchKey: BracketMatchKey;
  homeTeamId: TeamId | null;
  homeTeamName: string | null;
  awayTeamId: TeamId | null;
  awayTeamName: string | null;
  /** The user's current winner pick (null = not yet picked) */
  pickedWinnerId: TeamId | null;
  /** True when this tie's result is known and the pick cannot be changed. */
  locked: boolean;
};

export type BracketRoundView = {
  label: string;
  ties: TieView[];
};

export type FinishMatchView = {
  homeTeamId: TeamId | null;
  homeTeamName: string | null;
  awayTeamId: TeamId | null;
  awayTeamName: string | null;
  predictedHome: number | null;
  predictedAway: number | null;
  /** Explicit winner pick (final/bronze knockoutPick). Null when not set. */
  pickedWinnerId: TeamId | null;
  /** True when this match's result is known and it cannot be edited. */
  locked: boolean;
};

export type BracketView = {
  rounds: BracketRoundView[];
  final: FinishMatchView;
  bronze: FinishMatchView;
  /** Derived: 8 teams the user has as QF qualifiers */
  roundOf8: Array<{ teamId: TeamId; teamName: string }>;
  /** Derived top-4 ranking */
  topFour: Array<{ teamId: TeamId; teamName: string; position: number }>;
};

// ---------------------------------------------------------------------------
// Special bets
// ---------------------------------------------------------------------------

export type SpecialBetView = SpecialBetDef & {
  /** Human-readable display value (player name, team name, number, bool, or custom text) */
  value: string | number | boolean | null;
  /** Raw stored value — player/team ID, number, bool, or custom free-text string */
  storedValue: string | number | boolean | null;
  /** True when this bet's answer is already known and it cannot be changed. */
  locked: boolean;
};

// ---------------------------------------------------------------------------
// Full card view (passed to prediction pages)
// ---------------------------------------------------------------------------

export type CardView = {
  predictionId: string;
  poolId: string;
  tournamentId: string;
  status: PredictionStatus;
  completionPercent: number;
  groups: GroupView[];
  bracket: BracketView;
  specials: SpecialBetView[];
  /** Non-null only for late joiners with status 'partial'; the time their window closes. */
  lateJoinerDeadline: Date | null;
};

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export type AuditEntry = {
  id: string;
  editorName: string;
  fieldPath: string;
  oldValue: unknown;
  newValue: unknown;
  reason?: string;
  source: 'manual' | 'import';
  editedAt: Date;
};

// ---------------------------------------------------------------------------
// Export/import format (functional-spec §6.6)
// ---------------------------------------------------------------------------

export type CardExport = {
  tournamentId: string;
  version: 1;
  groupScores: Array<{ matchId: string; home: number; away: number }>;
  knockoutPicks: Array<{ bracketMatchKey: string; winner: string }>;
  finishScores: {
    final?: { home: number; away: number };
    bronze?: { home: number; away: number };
  };
  specials: Record<string, unknown>;
};
