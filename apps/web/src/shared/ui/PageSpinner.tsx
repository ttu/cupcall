import type { ReactElement } from 'react';

export function PageSpinner(): ReactElement {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-6 h-6 rounded-full border-2 border-(--green-200) border-t-(--green-600) animate-spin" />
    </div>
  );
}
