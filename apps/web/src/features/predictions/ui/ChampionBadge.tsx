import type { ReactElement } from 'react';
import { TeamBadge, cn } from '@/shared/ui';

type Props = {
  pickedWinnerId: string | null;
  homeTeamId: string | null;
  homeTeamName: string | null;
  awayTeamId: string | null;
  awayTeamName: string | null;
  isFinal: boolean;
};

/** Champion pill shown under a resolved Final/Bronze card once a shootout winner is picked. */
export function ChampionBadge({
  pickedWinnerId,
  homeTeamId,
  homeTeamName,
  awayTeamId,
  awayTeamName,
  isFinal,
}: Props): ReactElement | null {
  const champion =
    pickedWinnerId !== null && pickedWinnerId === homeTeamId
      ? { teamId: homeTeamId, teamName: homeTeamName }
      : pickedWinnerId !== null && pickedWinnerId === awayTeamId
        ? { teamId: awayTeamId, teamName: awayTeamName }
        : null;

  if (!champion?.teamId) return null;

  return (
    <div className="flex justify-center px-2 pt-0.5 pb-2.5">
      <div
        className={cn(
          'inline-flex items-center gap-1.5 py-1 pr-2.5 pl-1.5 rounded-full',
          isFinal ? 'bg-gold' : 'bg-[oklch(0.80_0.06_55)]',
        )}
      >
        <TeamBadge teamId={champion.teamId} size="sm" />
        <span
          className={cn(
            'display text-[11px] tracking-[0.04em]',
            isFinal ? 'text-[oklch(0.28_0.06_80)]' : 'text-[oklch(0.32_0.06_55)]',
          )}
        >
          {champion.teamName}
        </span>
      </div>
    </div>
  );
}
