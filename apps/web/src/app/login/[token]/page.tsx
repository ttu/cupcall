import type { ReactElement } from 'react';
import Link from 'next/link';
import { db } from '@/shared/db';
import { getLoginTokenByToken } from '@cup/db';
import { signInAsExistingGuest } from '@/features/auth';

type Props = { params: Promise<{ token: string }> };

export default async function LoginTokenPage({ params }: Props): Promise<ReactElement> {
  const { token } = await params;

  const record = await getLoginTokenByToken(db, token);

  if (!record) {
    return (
      <main className="max-w-md mx-auto px-4 py-12 text-center space-y-4">
        <h1
          className="text-2xl font-bold text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Invalid Link
        </h1>
        <p className="text-sm text-[var(--ink-soft)]">
          This login link is invalid. Ask the pool owner to generate a new one.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 rounded-lg bg-[var(--ink-900)] text-[var(--on-dark)] text-sm font-medium hover:bg-[var(--ink-800)] transition-colors"
        >
          Go home
        </Link>
      </main>
    );
  }

  // Token is valid — sign in and redirect. signInAsExistingGuest never returns.
  await signInAsExistingGuest(record.userId, '/pools');

  // Unreachable; satisfies the return type.
  return <></>;
}
