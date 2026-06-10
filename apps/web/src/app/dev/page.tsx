import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import { db } from '@/shared/db';
import { getDevState, DevPage } from '@/features/dev-tools';

export default async function DevToolsPage(): Promise<ReactElement> {
  if (process.env.NODE_ENV === 'production') notFound();
  const state = await getDevState(db);
  return <DevPage initialState={state} />;
}
