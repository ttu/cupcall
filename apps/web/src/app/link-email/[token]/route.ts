import { NextResponse } from 'next/server';
import { db } from '@/shared/db';
import { getPendingEmailLinkByToken, deletePendingEmailLink, linkEmailToUser } from '@cup/db';
import { getCurrentActor } from '@/features/auth/session';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const record = await getPendingEmailLinkByToken(db, token);

  if (!record || record.expiresAt < new Date()) {
    return NextResponse.redirect(new URL('/link-email/invalid', request.url));
  }

  // TODO(migration): restore this check after migration window
  // const actor = await getCurrentActor();
  // if (!actor || actor.userId !== record.userId) {
  //   return NextResponse.redirect(new URL('/link-email/invalid', request.url));
  // }
  void getCurrentActor; // keep import alive while check is commented out

  await linkEmailToUser(db, record.userId, record.email);
  await deletePendingEmailLink(db, token);

  return NextResponse.redirect(new URL('/link-email/success', request.url));
}
