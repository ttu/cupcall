import type { ReactElement } from 'react';
import Link from 'next/link';

export default function InvalidEmailLinkPage(): ReactElement {
  return (
    <main className="max-w-md mx-auto px-4 py-12 text-center space-y-4">
      <h1 className="text-2xl font-bold text-(--ink) font-cup-display">Link Expired</h1>
      <p className="text-sm text-(--ink-soft)">
        This email link is invalid or has expired. Go to your pools page to request a new one.
      </p>
      <Link
        href="/pools"
        className="inline-block px-4 py-2 rounded-lg bg-(--ink-900) text-(--on-dark) text-sm font-medium hover:bg-(--ink-800) transition-colors"
      >
        Go to pools
      </Link>
    </main>
  );
}
