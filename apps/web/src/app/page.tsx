import type { ReactElement } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '../features/auth/auth';
import { GuestLoginForm, EmailLoginForm } from '@/features/auth';
import { Logo, Chip, Avatar } from '@/shared/ui';

export default async function HomePage(): Promise<ReactElement> {
  const session = await auth();

  if (session?.user) {
    redirect('/pools');
  }

  return (
    <main
      className="turf min-h-screen"
      style={{ color: 'var(--on-dark)', position: 'relative', overflow: 'hidden' }}
    >
      {/* Radial glows */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '-10%',
            right: '-5%',
            width: '50vw',
            height: '50vw',
            borderRadius: '50%',
            background: 'radial-gradient(circle, oklch(0.64 0.16 152 / 0.18) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-10%',
            left: '-5%',
            width: '40vw',
            height: '40vw',
            borderRadius: '50%',
            background: 'radial-gradient(circle, oklch(0.71 0.175 52 / 0.14) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Nav */}
      <nav
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 28px',
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        <Logo dark />
        <a href="/login" className="btn btn-ghost-dark sm" style={{ textDecoration: 'none' }}>
          Sign in
        </a>
      </nav>

      {/* Hero */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 1200,
          margin: '0 auto',
          padding: 'clamp(32px, 6vw, 72px) 28px 80px',
          display: 'grid',
          gap: 48,
          alignItems: 'center',
        }}
        className="md:grid-cols-[1fr_380px]"
      >
        {/* Left: copy + forms */}
        <div style={{ maxWidth: 560 }}>
          <Chip variant="green" dot style={{ marginBottom: 22 }}>
            World Cup 2026 · kicks off June 11
          </Chip>

          <h1 className="display" style={{ fontSize: 'clamp(42px, 7vw, 72px)', marginBottom: 20 }}>
            Call every match.
            <br />
            Then defend it.
          </h1>

          <p
            style={{
              fontSize: 17,
              color: 'var(--on-dark-soft)',
              lineHeight: 1.6,
              marginBottom: 36,
              maxWidth: 440,
            }}
          >
            Predict scores, build your bracket, pick the specials. Compete in private pools with
            friends — one winner when the final whistle blows.
          </p>

          {/* Guest form — primary CTA */}
          <div style={{ marginBottom: 24 }}>
            <div className="eyebrow" style={{ color: 'var(--on-dark-soft)', marginBottom: 10 }}>
              No password. Just your name.
            </div>
            <div
              style={{
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 14,
                padding: 18,
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10)',
              }}
            >
              <GuestLoginForm />
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 20,
              color: 'var(--on-dark-muted)',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
            or sign in with email
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
          </div>

          {/* Email form */}
          <div
            style={{
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 14,
              padding: 18,
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
            }}
          >
            <EmailLoginForm />
          </div>
        </div>

        {/* Right: decorative leaderboard (desktop only) */}
        <div className="hidden md:block" style={{ position: 'relative', paddingBottom: 32 }}>
          <div
            className="card glow-green"
            style={{
              transform: 'rotate(1.5deg)',
              padding: 18,
              background: 'var(--surface)',
            }}
          >
            <div
              className="eyebrow"
              style={{
                color: 'var(--ink-muted)',
                marginBottom: 14,
                paddingBottom: 10,
                borderBottom: '1px solid var(--line-soft)',
              }}
            >
              Leaderboard preview
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { name: 'Sofia Reyes', pts: 147, rank: 1 },
                { name: 'Marcus K.', pts: 134, rank: 2 },
                { name: 'Priya Patel', pts: 129, rank: 3 },
                { name: 'Jake Chen', pts: 112, rank: 4 },
                { name: 'Lena Müller', pts: 98, rank: 5 },
              ].map((row, i) => (
                <div key={row.name} className="lb-row">
                  <span
                    className={`lb-rank${i === 0 ? ' t1' : i === 1 ? ' t2' : i === 2 ? ' t3' : ''}`}
                  >
                    {row.rank}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={row.name} index={i} size={30} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                      {row.name}
                    </span>
                  </div>
                  <span className="lb-pts">{row.pts}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Floating scoreboard chip */}
          <div
            className="card"
            style={{
              position: 'absolute',
              bottom: 0,
              left: -28,
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minWidth: 180,
            }}
          >
            <span className="badge sm c-arg">ARG</span>
            <span className="display tnum" style={{ fontSize: 18, color: 'var(--ink)' }}>
              3
            </span>
            <span className="score-sep" style={{ fontSize: 16 }}>
              –
            </span>
            <span className="display tnum" style={{ fontSize: 18, color: 'var(--ink)' }}>
              2
            </span>
            <span className="badge sm c-fra">FRA</span>
            <Chip variant="green" style={{ height: 21, fontSize: 10 }}>
              FT
            </Chip>
          </div>
        </div>
      </div>
    </main>
  );
}
