import type { ReactElement } from 'react';
import type { CardView } from '../domain/types';
import { CompletionBar } from './CompletionBar';
import { ReadOnlyPickRow } from './ReadOnlyPickRow';
import { ReadOnlyFinishCard } from './ReadOnlyFinishCard';
import { SectionLabel, Icon, TeamBadge } from '@/shared/ui';
import type { MatchHit } from '@/features/results';
import { HitChip } from '@/features/results';

export type MatchScore = { hit: MatchHit; points: number };

type Props = { card: CardView; matchScores?: ReadonlyMap<string, MatchScore> };

export function ReadOnlyCard({ card, matchScores }: Props): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <CompletionBar percent={card.completionPercent} />

      <section aria-label="Group stage">
        <SectionLabel icon={<Icon name="ball" size={13} />}>Group Stage</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          {card.groups.map((group) => (
            <div key={group.groupId} className="card" style={{ overflow: 'hidden' }}>
              <div className="turf" style={{ padding: '10px 16px' }}>
                <span className="display" style={{ fontSize: 20, color: 'var(--on-dark)' }}>
                  Group {group.groupId}
                </span>
              </div>
              <div className="divide">
                {group.matches.map((match) => {
                  const score = matchScores?.get(match.matchId);
                  return (
                    <div
                      key={match.matchId}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: score ? '1fr auto 1fr auto' : '1fr auto 1fr',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 16px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: 8,
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: 'var(--ink)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {match.homeTeamName}
                        </span>
                        <TeamBadge teamId={match.homeTeamId} size="lg" />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {match.predictedHome !== null ? (
                          <>
                            <span className="score-cell filled" style={{ pointerEvents: 'none' }}>
                              {match.predictedHome}
                            </span>
                            <span className="score-sep">:</span>
                            <span className="score-cell filled" style={{ pointerEvents: 'none' }}>
                              {match.predictedAway}
                            </span>
                          </>
                        ) : (
                          <span
                            className="display"
                            style={{
                              fontSize: 20,
                              color: 'var(--ink-muted)',
                              minWidth: 58,
                              textAlign: 'center',
                            }}
                          >
                            –
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <TeamBadge teamId={match.awayTeamId} size="lg" />
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: 'var(--ink)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {match.awayTeamName}
                        </span>
                      </div>

                      {score && <HitChip hit={score.hit} points={score.points} />}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Bracket picks">
        <SectionLabel icon={<Icon name="trophy" size={13} />}>Bracket</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          {card.bracket.rounds.map((round) => (
            <div key={round.label} className="card" style={{ overflow: 'hidden' }}>
              <div className="turf" style={{ padding: '8px 16px' }}>
                <span className="display" style={{ fontSize: 15, color: 'var(--on-dark)' }}>
                  {round.label}
                </span>
              </div>
              <div className="divide">
                {round.ties.map((tie) => (
                  <div
                    key={tie.bracketMatchKey}
                    style={{
                      padding: '6px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <ReadOnlyPickRow
                      teamId={tie.homeTeamId}
                      teamName={tie.homeTeamName ?? '?'}
                      isPick={tie.pickedWinnerId !== null && tie.pickedWinnerId === tie.homeTeamId}
                    />
                    <ReadOnlyPickRow
                      teamId={tie.awayTeamId}
                      teamName={tie.awayTeamName ?? '?'}
                      isPick={tie.pickedWinnerId !== null && tie.pickedWinnerId === tie.awayTeamId}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <ReadOnlyFinishCard
            label="Final"
            homeTeamId={card.bracket.final.homeTeamId}
            homeTeamName={card.bracket.final.homeTeamName}
            awayTeamId={card.bracket.final.awayTeamId}
            awayTeamName={card.bracket.final.awayTeamName}
            predictedHome={card.bracket.final.predictedHome}
            predictedAway={card.bracket.final.predictedAway}
            pickedWinnerId={card.bracket.final.pickedWinnerId}
            isFinal
          />

          <ReadOnlyFinishCard
            label="3rd Place"
            homeTeamId={card.bracket.bronze.homeTeamId}
            homeTeamName={card.bracket.bronze.homeTeamName}
            awayTeamId={card.bracket.bronze.awayTeamId}
            awayTeamName={card.bracket.bronze.awayTeamName}
            predictedHome={card.bracket.bronze.predictedHome}
            predictedAway={card.bracket.bronze.predictedAway}
            pickedWinnerId={card.bracket.bronze.pickedWinnerId}
            isFinal={false}
          />
        </div>
      </section>

      {card.specials.length > 0 && (
        <section aria-label="Special bets">
          <SectionLabel icon={<Icon name="spark" size={13} />}>Special Bets</SectionLabel>
          <div className="card" style={{ overflow: 'hidden', marginTop: 12 }}>
            <div className="divide">
              {card.specials.map((bet) => (
                <div
                  key={bet.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '10px 16px',
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--ink-soft)', flex: 1 }}>
                    {bet.label}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                    {bet.value !== null ? String(bet.value) : '—'}
                  </span>
                  {bet.points !== undefined && (
                    <span className="display" style={{ fontSize: 13, color: 'var(--green-600)' }}>
                      {bet.points}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
