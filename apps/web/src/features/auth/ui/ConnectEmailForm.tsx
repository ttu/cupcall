import type { ReactElement } from 'react';
import { SectionLabel, Icon } from '@/shared/ui';

export function ConnectEmailForm(): ReactElement {
  return (
    <div className="card p-4.5 mb-6">
      <SectionLabel icon={<Icon name="mail" size={13} color="var(--ink-muted)" />}>
        Connect your email
      </SectionLabel>
      <p className="text-xs text-ink-soft mt-2.5 mb-3 leading-[1.5]">
        Add an email address so you can sign in without needing your login link.
      </p>
      <div className="flex items-center gap-2">
        <span className="text-[13px] text-ink-muted">Email sign-in</span>
        <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-surface-2 text-ink-muted border border-line">
          Coming soon
        </span>
      </div>
    </div>
  );
}
