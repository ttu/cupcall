import type { ReactElement } from 'react';
import { AvatarNameBadge } from '@/shared/ui';

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
      <AvatarNameBadge name={displayName} avatarIndex={index} isCurrentUser={isCurrentUser} />
    </div>
  );
}
