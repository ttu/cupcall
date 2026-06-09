import type { ReactElement } from 'react';
import { PageSpinner } from '@/shared/ui/PageSpinner';

export default function Loading(): ReactElement {
  return <PageSpinner />;
}
