import type { ReactElement } from 'react';
import { Chip } from './Chip';

export function AppFooter(): ReactElement {
  return (
    <footer className="border-t border-line px-6 py-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-6 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <Chip>Beta</Chip>
          Functionality may be incomplete or change without notice.
        </span>
        <span>
          Open source ·{' '}
          <a
            href="https://github.com/ttu/football-cup-prediction"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-ink"
          >
            github.com/ttu/football-cup-prediction
          </a>{' '}
          — report issues, suggest improvements, or contribute.
        </span>
        <span>
          Contact:{' '}
          <a href="mailto:contact@cupcall.app" className="underline hover:text-ink">
            contact@cupcall.app
          </a>
        </span>
      </div>
    </footer>
  );
}
