// TODO(design): Replace placeholder UI with styled components once design system is in place.
import type { ReactElement } from 'react';
import { auth, signIn, signOut } from '../features/auth/auth';

export default async function HomePage(): Promise<ReactElement> {
  const session = await auth();

  if (session?.user) {
    // Signed-in dashboard stub
    // TODO(design): Replace with real dashboard layout.
    return (
      <main>
        <h1>Cup Prediction</h1>
        <p>
          Signed in as <strong>{session.user.name ?? session.user.email}</strong>
        </p>
        <nav aria-label="Main navigation">
          <ul>
            <li>
              <a href="/settings">Settings</a>
            </li>
          </ul>
        </nav>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/' });
          }}
        >
          <button type="submit">Sign out</button>
        </form>
      </main>
    );
  }

  // Signed-out: show magic-link sign-in form.
  return (
    <main>
      <h1>Cup Prediction</h1>
      <section aria-labelledby="signin-heading">
        <h2 id="signin-heading">Sign in</h2>
        <p>Enter your email address and we&apos;ll send you a magic link to sign in.</p>
        <form
          action={async (formData: FormData) => {
            'use server';
            const email = formData.get('email');
            if (typeof email !== 'string' || email.trim() === '') return;
            await signIn('resend', { email, redirectTo: '/' });
          }}
        >
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
          />
          <button type="submit">Send magic link</button>
        </form>
      </section>
    </main>
  );
}
