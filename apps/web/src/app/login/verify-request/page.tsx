import type { ReactElement } from 'react';
import { Icon } from '@/shared/ui';
import { MAGIC_LINK_MAX_AGE_SECONDS } from '@/features/auth';

function MailCheckBadge(): ReactElement {
  return (
    <div className="relative mx-auto mb-5 w-16 h-16">
      <div className="w-16 h-16 rounded-full bg-green-050 grid place-items-center">
        <Icon name="mail" size={26} color="var(--green-600)" />
      </div>
      <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-green-500 grid place-items-center ring-2 ring-white">
        <Icon name="check" size={12} color="white" stroke={3} />
      </div>
    </div>
  );
}

export default function VerifyRequestPage(): ReactElement {
  const expiryMinutes = MAGIC_LINK_MAX_AGE_SECONDS / 60;

  return (
    <main className="turf min-h-screen grid place-items-center px-4">
      <div className="card max-w-sm w-full p-8 text-center">
        <MailCheckBadge />
        <h1 className="display text-[28px] text-ink mb-3">Check your email</h1>
        <p className="text-sm text-ink-soft leading-[1.5] mb-5">
          We sent a sign-in link to your inbox.
        </p>
        <div className="rounded-lg bg-surface-2 text-ink-muted text-xs font-medium py-2.5 px-4">
          The link expires in {expiryMinutes} minutes
        </div>
      </div>
    </main>
  );
}
