import type { CardInputs } from '@cup/engine';
import type { CardExport } from './types';

type SerializedPredictionInputs = Omit<CardExport, 'tournamentId' | 'version'>;

/** Maps stored prediction inputs to the plain-JSON shape used by card/pool export and backup. */
export function serializePredictionInputs(inputs: CardInputs): SerializedPredictionInputs {
  return {
    groupScores: inputs.groupScores.map((gs) => ({
      matchId: gs.matchId,
      home: gs.home,
      away: gs.away,
    })),
    knockoutPicks: inputs.knockoutPicks.map((kp) => ({
      bracketMatchKey: kp.bracketMatchKey,
      winner: kp.winner,
    })),
    finishScores: {
      ...(inputs.finishScores.final ? { final: inputs.finishScores.final } : {}),
      ...(inputs.finishScores.bronze ? { bronze: inputs.finishScores.bronze } : {}),
    },
    specials: inputs.specials as Record<string, unknown>,
  };
}
