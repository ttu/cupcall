'use server';

import { signOut } from '@/features/auth';

export async function signOutAction() {
  await signOut({ redirectTo: '/' });
}
