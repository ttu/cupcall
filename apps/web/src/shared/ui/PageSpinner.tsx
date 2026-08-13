import type { ReactElement } from 'react';

export function PageSpinner(): ReactElement {
  return (
    <div className="page-spinner-wrap" role="status" aria-label="Loading">
      <div className="page-spinner" aria-hidden="true" />
    </div>
  );
}
