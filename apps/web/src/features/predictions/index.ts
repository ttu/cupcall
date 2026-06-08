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

export { getCardView } from './application/get-card';
export { loadActualResults } from './application/load-actual-results';

export {
  saveGroupScore,
  saveKnockoutPick,
  saveFinishScore,
  saveSpecialBet,
  ownerSaveGroupScore,
  ownerSaveSpecialBet,
  exportCard,
  importCard,
} from './api/actions';

export { PredictStepper } from './ui/PredictStepper';
export { ReadOnlyCard } from './ui/ReadOnlyCard';
export { AuditLog } from './ui/AuditLog';
export { OwnerEditBanner } from './ui/OwnerEditBanner';
export { ExportImportControls } from './ui/ExportImportControls';
