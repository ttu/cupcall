import type { ReactElement } from 'react';
import Link from 'next/link';

export default function EmailLinkedPage(): ReactElement {
  return (
    <main className="max-w-md mx-auto px-4 py-12 text-center space-y-4">
      <h1 className="text-2xl font-bold text-ink font-cup-display">Email connected</h1>
      <p className="text-sm text-ink-soft">
        Your email address has been connected to your account.
      </p>
      <Link
        href="/pools"
        className="inline-block px-4 py-2 rounded-lg bg-ink-900 text-on-dark text-sm font-medium hover:bg-ink-800 transition-colors"
      >
        Go to My Pools
      </Link>
    </main>
  );
}
