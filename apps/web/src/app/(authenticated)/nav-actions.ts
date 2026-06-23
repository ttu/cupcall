'use server';

import { signOut } from '@/features/auth';

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/' });
}
