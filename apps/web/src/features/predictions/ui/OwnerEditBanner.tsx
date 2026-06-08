import type { ReactElement } from 'react';

type Props = {
  memberName: string;
};

export function OwnerEditBanner({ memberName }: Props): ReactElement {
  return (
    <div
      role="status"
      className="rounded-[var(--radius-sm)] border border-[var(--orange-400)]/50 bg-[var(--orange-050)] px-4 py-3 flex items-start gap-3"
    >
      <span className="text-[var(--orange-600)] text-lg leading-none" aria-hidden="true">
        ✏️
      </span>
      <div>
        <p className="text-sm font-semibold text-[var(--orange-600)]">Owner edit mode</p>
        <p className="text-xs text-[var(--ink-soft)] mt-0.5">
          You are editing <strong>{memberName}</strong>&apos;s card. All changes are logged.
        </p>
      </div>
    </div>
  );
}
