import type { ReactElement } from 'react';

export function PageSpinner(): ReactElement {
  return (
    <div className="page-spinner-wrap">
      <div className="page-spinner" />
    </div>
  );
}
