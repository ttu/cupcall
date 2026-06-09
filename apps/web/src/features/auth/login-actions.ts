'use server';

import { signIn } from './auth';
import { signInAsGuest } from './guest';

export async function emailSignInAction(formData: FormData): Promise<void> {
  const email = formData.get('email');
  if (typeof email !== 'string' || email.trim() === '') return;
  await signIn('resend', { email, redirectTo: '/pools' });
}

export async function guestSignInAction(formData: FormData): Promise<void> {
  const name = (formData.get('name') as string | null)?.trim() ?? '';
  if (name.length < 2) return;
  await signInAsGuest(name, '/pools');
}
