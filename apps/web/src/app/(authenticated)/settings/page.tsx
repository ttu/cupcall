import type { ReactElement } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/features/auth/auth';
import { ConnectEmailForm } from '@/features/auth';
import { db } from '@/shared/db';
import { getUserById, countPoolsOwnedBy, getLoginTokenByUserId, upsertLoginToken } from '@cup/db';
import { userId } from '@cup/engine';
import { MyLoginLink, generateLoginToken } from '@/features/pools';
import { SettingsForm } from './SettingsForm';

export default async function SettingsPage(): Promise<ReactElement> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/');
  }

  const uid = userId(session.user.id);
  const [user, ownedPoolCount] = await Promise.all([
    getUserById(db, uid),
    countPoolsOwnedBy(db, uid),
  ]);
  const displayName = user?.displayName ?? '';
  const email = session.user.email ?? null;

  const existing = await getLoginTokenByUserId(db, uid);
  const loginToken = existing?.token ?? generateLoginToken();
  if (!existing) await upsertLoginToken(db, uid, loginToken);
  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? '';

  return (
    <div style={{ maxWidth: 560, margin: '32px auto', padding: '0 24px' }}>
      <h1 className="display" style={{ fontSize: 36, marginBottom: 28 }}>
        Settings
      </h1>
      <div className="eyebrow" style={{ color: 'var(--ink-muted)', marginBottom: 10 }}>
        Your account
      </div>
      <SettingsForm displayName={displayName} email={email} ownedPoolCount={ownedPoolCount} />
      {!email && <ConnectEmailForm />}
      <MyLoginLink token={loginToken} baseUrl={baseUrl} />
    </div>
  );
}
