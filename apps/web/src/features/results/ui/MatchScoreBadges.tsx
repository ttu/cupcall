import type { ReactElement } from 'react';
import { TeamBadge } from '@/shared/ui';

type Props = {
  homeTeamId: string | null;
  awayTeamId: string | null;
  hasScore: boolean;
  actualHome: number | null;
  actualAway: number | null;
};

/** Home badge — actual score or "vs" — away badge, shown in a match summary sheet's header. */
export function MatchScoreBadges({
  homeTeamId,
  awayTeamId,
  hasScore,
  actualHome,
  actualAway,
}: Props): ReactElement {
  return (
    <>
      <TeamBadge teamId={homeTeamId} size="md" />
      {hasScore ? (
        <span className="display tnum text-[32px] leading-none text-ink shrink-0">
          {actualHome}–{actualAway}
        </span>
      ) : (
        <span className="text-xs font-bold text-ink-muted shrink-0">vs</span>
      )}
      <TeamBadge teamId={awayTeamId} size="md" />
    </>
  );
}
