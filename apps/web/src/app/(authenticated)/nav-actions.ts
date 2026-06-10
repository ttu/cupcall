'use server';

import { signOut } from '@/features/auth/auth';

export async function signOutAction() {
  await signOut({ redirectTo: '/' });
}
