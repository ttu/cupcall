// TODO(design): Replace placeholder UI with styled components once design system is in place.
import type { ReactElement } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '../../features/auth/auth';
import { updateDisplayNameAction } from '../../features/auth/actions';
import { db } from '../../shared/db';
import { getUserById } from '@cup/db';
import { userId } from '@cup/engine';

export default async function SettingsPage(): Promise<ReactElement> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/');
  }

  const user = await getUserById(db, userId(session.user.id));
  const displayName = user?.displayName ?? '';

  return (
    <main>
      <h1>Settings</h1>
      <section aria-labelledby="display-name-heading">
        <h2 id="display-name-heading">Display name</h2>
        <p>Your display name is shown on leaderboards and pool pages.</p>
        {/* TODO(design): Wire up useActionState to show validation errors in the UI */}
        <form action={updateDisplayNameAction}>
          <label htmlFor="displayName">Display name</label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            defaultValue={displayName}
            required
            minLength={1}
            maxLength={64}
            autoComplete="nickname"
          />
          <button type="submit">Save</button>
        </form>
      </section>
      <nav aria-label="Settings navigation">
        <a href="/">← Back to home</a>
      </nav>
    </main>
  );
}
