import { NextResponse } from 'next/server';
import { db } from '@/shared/db';
import { getLoginTokenByToken } from '@cup/db';
import { signInAsExistingGuest } from '@/features/auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  const record = await getLoginTokenByToken(db, token);

  if (!record) {
    return NextResponse.redirect(new URL('/login/invalid', request.url));
  }

  return await signInAsExistingGuest(record.userId, '/pools');
}
