import type { ReactElement } from 'react';
import type { PoolArchiveRecap, BiggestRiserEvent } from '../domain/types';

type Props = { recap: PoolArchiveRecap | null; biggestRiser: BiggestRiserEvent };

export function ArchiveHighlightsPanel({ recap, biggestRiser }: Props): ReactElement {
  if (!recap) {
    return (
      <div className="card p-4">
        <span className="section-label">Tournament highlights</span>
        <p className="text-xs text-ink-muted mt-2">
          Highlights aren&apos;t available for this archive yet — re-archive to generate them.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4" data-testid="archive-highlights-panel">
      <span className="section-label">Tournament highlights</span>
      <ul className="mt-3 space-y-3">
        {recap.championPick && (
          <li>
            <div className="font-bold text-sm">Champion pick</div>
            <p className="text-xs text-ink-muted">
              {recap.championPick.count} of {recap.championPick.total} players backed{' '}
              {recap.championPick.teamName} before the final — the pool&apos;s most popular winner
              call.
            </p>
          </li>
        )}
        {biggestRiser && (
          <li>
            <div className="font-bold text-sm">Biggest riser</div>
            <p className="text-xs text-ink-muted">
              {biggestRiser.displayName} climbed from {biggestRiser.fromRank} to{' '}
              {biggestRiser.toRank}
              {biggestRiser.reason
                ? ` after ${biggestRiser.reason}`
                : ` at ${biggestRiser.stageName}`}
              .
            </p>
          </li>
        )}
        {recap.bestSingleMatch && (
          <li>
            <div className="font-bold text-sm">Best single match</div>
            <p className="text-xs text-ink-muted">
              {recap.bestSingleMatch.exactCount} of {recap.bestSingleMatch.total} players called{' '}
              {recap.bestSingleMatch.description} exactly — the pool&apos;s highest-agreement
              result.
            </p>
          </li>
        )}
        {recap.biggestUpset && (
          <li>
            <div className="font-bold text-sm">Biggest upset called</div>
            <p className="text-xs text-ink-muted">
              Only {recap.biggestUpset.pickCount} of {recap.biggestUpset.total} players backed{' '}
              {recap.biggestUpset.winnerTeam} over {recap.biggestUpset.loserTeam} in the{' '}
              {recap.biggestUpset.round}.
            </p>
          </li>
        )}
      </ul>
    </div>
  );
}
