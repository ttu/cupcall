import type { ReactElement } from 'react';
import type { BracketRoundResultView, KnockoutMatchView } from '../domain/types';
import { BracketMatchCard } from './BracketMatchCard';

type Props = {
  rounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
};

export function KnockoutBracket({ rounds, bronzeMatch }: Props): ReactElement {
  if (rounds.length === 0) {
    return (
      <div
        className="rounded-[var(--radius)] px-6 py-8 text-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--line-soft)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--ink-muted)' }}>
          Knockout stage bracket will appear here once teams are confirmed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div
        className="rounded-[var(--radius)] p-4"
        style={{ background: 'var(--green-050)', border: '1px solid var(--green-300)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--green-700)' }}>
          Results drop into your bracket as we enter them.{' '}
          <strong>Green = your pick survived, red = it&apos;s out.</strong>
        </p>
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-6 items-start min-w-max pb-2">
          {rounds.map((round) => (
            <div key={round.label} className="flex flex-col gap-2">
              <div
                className="text-[11px] font-bold uppercase tracking-wider text-center mb-2"
                style={{ color: 'var(--ink-muted)' }}
              >
                {round.label}
              </div>
              <div className="flex flex-col gap-3">
                {round.matches.map((match) => (
                  <BracketMatchCard key={match.bracketMatchKey} match={match} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {bronzeMatch && (
        <div>
          <div
            className="text-[11px] font-bold uppercase tracking-wider mb-2"
            style={{ color: 'var(--ink-muted)' }}
          >
            Third place
          </div>
          <BracketMatchCard match={bronzeMatch} />
        </div>
      )}
    </div>
  );
}
