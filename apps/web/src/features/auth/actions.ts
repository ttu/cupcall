'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { updateDisplayName, deleteUser } from '@cup/db';
import { ForbiddenError } from '../../shared/authz';
import { db } from '../../shared/db';
import { logger } from '../../shared/observability/logger';
import { getCurrentActor } from './session';
import { signOut } from './auth';

const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Display name must not be empty')
  .max(64, 'Display name must be at most 64 characters');

export type DisplayNameState = { error: string | null; saved: boolean };

export async function updateDisplayNameAction(
  _prev: DisplayNameState,
  formData: FormData,
): Promise<DisplayNameState> {
  const actor = await getCurrentActor();
  if (!actor) {
    throw new ForbiddenError('Must be signed in to update display name');
  }

  const raw = formData.get('displayName');
  const parsed = displayNameSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn(
      { issue: parsed.error.issues[0]?.message },
      'auth:updateDisplayName — validation failed',
    );
    return { error: parsed.error.issues[0]?.message ?? 'Invalid display name', saved: false };
  }

  const displayName = parsed.data;

  const row = await updateDisplayName(db, actor.userId, displayName);
  if (!row) {
    logger.error({ userId: actor.userId }, 'auth:updateDisplayName — user not found');
    return { error: 'Could not update display name', saved: false };
  }

  logger.info({ userId: actor.userId }, 'auth:updateDisplayName — updated');
  revalidatePath('/settings');
  return { error: null, saved: true };
}

export async function deleteAccountAction(): Promise<{ ok: false; error: string }> {
  const actor = await getCurrentActor();
  if (!actor) {
    throw new ForbiddenError('Must be signed in to delete account');
  }

  try {
    await deleteUser(db, actor.userId);
    logger.info({ userId: actor.userId }, 'auth:deleteAccount — deleted');
  } catch (e) {
    logger.error({ userId: actor.userId, err: e }, 'auth:deleteAccount — failed');
    return { ok: false, error: 'Could not delete account. Please try again.' };
  }

  await signOut({ redirectTo: '/' });
  return { ok: false, error: 'Unexpected error.' };
}
