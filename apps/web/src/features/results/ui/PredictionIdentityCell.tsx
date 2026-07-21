import type { ReactElement } from 'react';
import { Avatar } from '@/shared/ui';

type Props = {
  testId: string;
  displayName: string;
  index: number;
  isCurrentUser: boolean;
  className: string;
};

/** Avatar + display name (+ "YOU" chip), the first cell of a match summary sheet's prediction row. */
export function PredictionIdentityCell({
  testId,
  displayName,
  index,
  isCurrentUser,
  className,
}: Props): ReactElement {
  return (
    <div data-testid={testId} className={className}>
      <Avatar name={displayName} index={index} size={28} />
      <span className="text-[13px] font-bold text-ink truncate">
        {displayName}
        {isCurrentUser && (
          <span className="chip green h-4.5 ml-[7px] text-[9.5px] align-middle">YOU</span>
        )}
      </span>
    </div>
  );
}
