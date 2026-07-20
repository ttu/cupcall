// apps/web/src/app/not-found.tsx
import type { ReactElement } from 'react';
import Link from 'next/link';

export default function NotFound(): ReactElement {
  return (
    <main
      data-testid="not-found-page"
      className="max-w-md mx-auto px-4 py-12 text-center space-y-4"
    >
      <h1 className="text-2xl font-bold text-ink font-cup-display">Page not found</h1>
      <p className="text-sm text-ink-soft">
        The page you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Link
        href="/"
        className="inline-block px-4 py-2 rounded-lg bg-ink-900 text-on-dark text-sm font-medium hover:bg-ink-800 transition-colors"
      >
        Go home
      </Link>
    </main>
  );
}
