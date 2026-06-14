'use server';

import { signIn } from './auth';
import { signInAsGuest } from './guest';
import { checkBetaCode } from './beta-code';

export type GuestSignInState = { error: string | null };

export async function emailSignInAction(formData: FormData): Promise<void> {
  const email = formData.get('email');
  if (typeof email !== 'string' || email.trim() === '') return;
  await signIn('resend', { email, redirectTo: '/pools' });
}

export async function guestSignInAction(
  _prev: GuestSignInState,
  formData: FormData,
): Promise<GuestSignInState> {
  const codeError = checkBetaCode(formData.get('betaCode') as string | null);
  if (codeError) return { error: codeError };

  const name = (formData.get('name') as string | null)?.trim() ?? '';
  if (name.length < 2) return { error: 'Name must be at least 2 characters.' };

  // redirects on success — never returns normally
  return signInAsGuest(name, '/pools');
}
