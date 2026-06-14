import type { ReactElement } from 'react';
import type { CardView } from '../domain/types';
import { CompletionBar } from './CompletionBar';
import { ReadOnlyPickRow } from './ReadOnlyPickRow';
import { ReadOnlyFinishCard } from './ReadOnlyFinishCard';
import { SectionLabel, Icon, TeamBadge, cn } from '@/shared/ui';
import type { MatchHit } from '@/features/results';
import { HitChip } from '@/features/results';

export type MatchScore = { hit: MatchHit; points: number };

type Props = { card: CardView; matchScores?: ReadonlyMap<string, MatchScore> };

export function ReadOnlyCard({ card, matchScores }: Props): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <CompletionBar percent={card.completionPercent} />

      <section aria-label="Group stage">
        <SectionLabel icon={<Icon name="ball" size={13} />}>Group Stage</SectionLabel>
        <div className="flex flex-col gap-3 mt-3">
          {card.groups.map((group) => (
            <div key={group.groupId} className="card overflow-hidden">
              <div className="turf py-[10px] px-4">
                <span className="display text-xl text-on-dark">Group {group.groupId}</span>
              </div>
              <div className="divide">
                {group.matches.map((match) => {
                  const score = matchScores?.get(match.matchId);
                  return (
                    <div
                      key={match.matchId}
                      className={cn(
                        'grid items-center gap-[10px] py-[10px] px-4',
                        score
                          ? '[grid-template-columns:1fr_auto_1fr_auto]'
                          : '[grid-template-columns:1fr_auto_1fr]',
                      )}
                    >
                      <div className="flex items-center justify-end gap-2 min-w-0">
                        <span className="text-[13px] font-bold text-ink truncate">
                          {match.homeTeamName}
                        </span>
                        <TeamBadge teamId={match.homeTeamId} size="lg" />
                      </div>

                      <div className="flex items-center gap-[6px]">
                        {match.predictedHome !== null ? (
                          <>
                            <span className="score-cell filled pointer-events-none">
                              {match.predictedHome}
                            </span>
                            <span className="score-sep">:</span>
                            <span className="score-cell filled pointer-events-none">
                              {match.predictedAway}
                            </span>
                          </>
                        ) : (
                          <span className="display text-xl text-ink-muted min-w-[58px] text-center">
                            –
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 min-w-0">
                        <TeamBadge teamId={match.awayTeamId} size="lg" />
                        <span className="text-[13px] font-bold text-ink truncate">
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
        <div className="flex flex-col gap-3 mt-3">
          {card.bracket.rounds.map((round) => (
            <div key={round.label} className="card overflow-hidden">
              <div className="turf py-2 px-4">
                <span className="display text-[15px] text-on-dark">{round.label}</span>
              </div>
              <div className="divide">
                {round.ties.map((tie) => (
                  <div key={tie.bracketMatchKey} className="py-[6px] px-3 flex flex-col gap-[2px]">
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
          <div className="card overflow-hidden mt-3">
            <div className="divide">
              {card.specials.map((bet) => (
                <div
                  key={bet.key}
                  className="flex items-center justify-between gap-3 py-[10px] px-4"
                >
                  <span className="text-[13px] text-ink-soft flex-1">{bet.label}</span>
                  <span className="text-[13px] font-bold text-ink">
                    {bet.value !== null ? String(bet.value) : '—'}
                  </span>
                  {bet.points !== undefined && (
                    <span className="display text-[13px] text-green-600">{bet.points}</span>
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
