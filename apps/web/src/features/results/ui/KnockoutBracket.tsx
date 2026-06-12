import type { ReactElement } from 'react';
import type { BracketRoundResultView, KnockoutMatchView } from '../domain/types';
import { BracketMatchCard } from './BracketMatchCard';
import { FinalResultCard } from './FinalResultCard';

const TIE_H = 80;
const TIE_GAP = 8;
const U = TIE_H + TIE_GAP;

function columnPaddingTop(n: number): number {
  return ((Math.pow(2, n) - 1) * U) / 2;
}

function columnItemGap(n: number): number {
  return Math.pow(2, n) * U - TIE_H;
}

type Props = {
  rounds: BracketRoundResultView[];
  bronzeMatch: KnockoutMatchView | null;
};

export function KnockoutBracket({ rounds, bronzeMatch }: Props): ReactElement {
  if (rounds.length === 0) {
    return (
      <div className="card" style={{ padding: '32px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-muted)' }}>
          Knockout stage bracket will appear here once teams are confirmed.
        </p>
      </div>
    );
  }

  // Split off the Final round so we can render the special FinalResultCard in
  // the right-most column alongside the bronze tie.
  const finalRound = rounds.find((r) => r.label === 'Final') ?? null;
  const finalMatch = finalRound?.matches[0] ?? null;
  const mainRounds = rounds.filter((r) => r.label !== 'Final');
  const finalColumnIndex = mainRounds.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Info banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '10px 14px',
          borderRadius: 10,
          background: 'var(--green-050)',
          border: '1px solid var(--green-300)',
          fontSize: 13,
          color: 'var(--green-700)',
        }}
      >
        <span style={{ fontWeight: 800 }}>⚡</span>
        <span>
          Results drop into your bracket as we enter them.{' '}
          <strong>Green = your pick survived, red = it&apos;s out.</strong>
        </span>
      </div>

      {/* Bracket columns */}
      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <div
          style={{
            display: 'flex',
            gap: 16,
            alignItems: 'flex-start',
            minWidth: 'max-content',
          }}
        >
          {mainRounds.map((round, i) => (
            <div
              key={round.label}
              data-testid={`bracket-round-${round.label}`}
              style={{
                minWidth: 190,
                paddingTop: columnPaddingTop(i),
              }}
            >
              <div
                className="eyebrow"
                style={{ color: 'var(--ink-muted)', marginBottom: 8, paddingLeft: 2 }}
              >
                {round.label}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: columnItemGap(i),
                }}
              >
                {round.matches.map((match) => (
                  <BracketMatchCard key={match.bracketMatchKey} match={match} />
                ))}
              </div>
            </div>
          ))}

          {/* Final + Bronze column */}
          {(finalMatch || bronzeMatch) && (
            <div
              style={{
                minWidth: 220,
                paddingTop: columnPaddingTop(finalColumnIndex),
              }}
            >
              {finalMatch && (
                <>
                  <div
                    className="eyebrow"
                    style={{ color: 'var(--ink-muted)', marginBottom: 8, paddingLeft: 2 }}
                  >
                    Final
                  </div>
                  <FinalResultCard match={finalMatch} matchKey="final" />
                </>
              )}
              {bronzeMatch && (
                <>
                  <div
                    className="eyebrow"
                    style={{ color: 'var(--ink-muted)', margin: '16px 0 8px', paddingLeft: 2 }}
                  >
                    3rd Place
                  </div>
                  <FinalResultCard match={bronzeMatch} matchKey="bronze" />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
