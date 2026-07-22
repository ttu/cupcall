import type { ReactElement } from 'react';
import { Avatar } from './Avatar';
import { cn } from './cn';

type Props = {
  name: string;
  avatarIndex: number;
  isCurrentUser: boolean;
  size?: number;
};

export function AvatarNameBadge({
  name,
  avatarIndex,
  isCurrentUser,
  size = 28,
}: Props): ReactElement {
  return (
    <>
      <Avatar name={name} index={avatarIndex} size={size} />
      <span
        className={cn(
          'text-[13px] font-bold truncate',
          isCurrentUser ? 'text-green-700' : 'text-ink',
        )}
      >
        {name}
        {isCurrentUser && (
          <span className="chip green h-4.5 ml-[7px] text-[9.5px] align-middle">YOU</span>
        )}
      </span>
    </>
  );
}
