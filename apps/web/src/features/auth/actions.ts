'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { updateDisplayName } from '@cup/db';
import { ForbiddenError } from '../../shared/authz';
import { db } from '../../shared/db';
import { logger } from '../../shared/observability/logger';
import { getCurrentActor } from './session';

const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Display name must not be empty')
  .max(64, 'Display name must be at most 64 characters');

/**
 * Server action: update the signed-in user's display name.
 * Validates input, enforces auth, persists, and revalidates /settings.
 *
 * Returns void (form action contract). Throws on auth failure so Next.js
 * can redirect to the sign-in page. Validation errors are silently dropped
 * for now; TODO(design) wire up useFormState for user-visible error feedback.
 */
export async function updateDisplayNameAction(formData: FormData): Promise<void> {
  const actor = await getCurrentActor();
  if (!actor) {
    throw new ForbiddenError('Must be signed in to update display name');
  }

  const raw = formData.get('displayName');
  const parsed = displayNameSchema.safeParse(raw);
  if (!parsed.success) {
    // TODO(design): Use useFormState / useActionState to surface validation errors in UI.
    logger.warn(
      { issue: parsed.error.issues[0]?.message },
      'auth:updateDisplayName — validation failed',
    );
    return;
  }

  const displayName = parsed.data;

  const updated = await updateDisplayName(db, actor.userId, displayName);
  if (!updated) {
    logger.error({ userId: actor.userId }, 'auth:updateDisplayName — user not found');
    return;
  }

  logger.info({ userId: actor.userId }, 'auth:updateDisplayName — updated');
  revalidatePath('/settings');
}
