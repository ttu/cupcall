// Public interface for the predictions feature.
// Other features and app routes import from here — never from internals.

export type {
  CardView,
  GroupView,
  GroupMatchView,
  BracketView,
  TieView,
  BracketRoundView,
  FinishMatchView,
  SpecialBetView,
  SpecialBetDef,
  BetInputKind,
  AuditEntry,
  CardExport,
  PredictionStatus,
} from './domain/types';
export { getSpecialBetDefs } from './domain/special-bet-defs';
export { toAuditEntry } from './domain/audit';
export { buildMatchScores } from './domain/match-scores';
export type { MatchScore } from './ui/ReadOnlyCard';

export { getCardView, buildCardView } from './application/get-card';
export type { CardData } from './application/get-card';
export { loadActualResults } from './application/load-actual-results';
export { rescoreCard } from './application/rescore';

export {
  saveGroupScore,
  saveKnockoutPick,
  saveFinishScore,
  saveSpecialBet,
  ownerSaveGroupScore,
  ownerSaveSpecialBet,
  ownerSaveKnockoutPick,
  ownerSaveFinishScore,
  exportCard,
  importCard,
} from './api/actions';

export { PredictStepper } from './ui/PredictStepper';
export { ReadOnlyCard } from './ui/ReadOnlyCard';
export { OwnerCardEditor } from './ui/OwnerCardEditor';
export { CreatorPredictEdit } from './ui/CreatorPredictEdit';
export { AuditLog } from './ui/AuditLog';
export { OwnerEditBanner } from './ui/OwnerEditBanner';
export { ExportImportControls } from './ui/ExportImportControls';
export { CompletionBar } from './ui/CompletionBar';
