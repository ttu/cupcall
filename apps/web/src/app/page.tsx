import type { ReactElement } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '../features/auth/auth';
import { GuestLoginForm, EmailLoginForm } from '@/features/auth';
import { Button, Logo, Chip, Avatar } from '@/shared/ui';

export default async function HomePage(): Promise<ReactElement> {
  const session = await auth();

  if (session?.user) {
    redirect('/pools');
  }

  return (
    <main className="turf min-h-screen text-on-dark relative overflow-hidden">
      {/* Radial glows */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none z-[0]">
        <div
          className="absolute rounded-full"
          style={{
            top: '-10%',
            right: '-5%',
            width: '50vw',
            height: '50vw',
            background: 'radial-gradient(circle, oklch(0.64 0.16 152 / 0.18) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            bottom: '-10%',
            left: '-5%',
            width: '40vw',
            height: '40vw',
            background: 'radial-gradient(circle, oklch(0.71 0.175 52 / 0.14) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Nav */}
      <nav className="relative z-[1] flex items-center justify-between py-4.5 px-7 max-w-300 mx-auto">
        <Logo dark />
        <Button asChild variant="ghost-dark" size="sm">
          <a href="/login">Sign in</a>
        </Button>
      </nav>

      {/* Hero */}
      <div
        className="relative z-[1] max-w-300 mx-auto grid gap-12 items-center md:grid-cols-[1fr_380px]"
        style={{ padding: 'clamp(32px, 6vw, 72px) 28px 80px' }}
      >
        {/* Left: copy + forms */}
        <div className="max-w-140">
          <Chip variant="green" dot style={{ marginBottom: 22 }}>
            World Cup 2026 · kicks off June 11
          </Chip>

          <h1 className="display mb-5" style={{ fontSize: 'clamp(42px, 7vw, 72px)' }}>
            Call every match.
            <br />
            Then defend it.
          </h1>

          <p className="text-on-dark-soft mb-9 max-w-110" style={{ fontSize: 17, lineHeight: 1.6 }}>
            Predict scores, build your bracket, pick the specials. Compete in private pools with
            friends — one winner when the final whistle blows.
          </p>

          {/* Guest form — primary CTA */}
          <div className="mb-6">
            <div className="eyebrow text-on-dark-soft mb-2.5">No password. Just your name.</div>
            <div
              className="rounded-cup p-4.5"
              style={{
                background: 'rgba(255,255,255,0.06)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10)',
              }}
            >
              <GuestLoginForm />
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5 text-on-dark-muted text-xs font-bold uppercase tracking-[0.08em]">
            <div className="flex-1 h-px bg-[rgba(255,255,255,0.1)]" />
            or sign in with email
            <div className="flex-1 h-px bg-[rgba(255,255,255,0.1)]" />
          </div>

          <div
            className="rounded-cup p-4.5"
            style={{
              background: 'rgba(255,255,255,0.04)',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
            }}
          >
            <EmailLoginForm />
          </div>
        </div>

        {/* Right: decorative leaderboard (desktop only) */}
        <div className="hidden md:block relative pb-8">
          <div className="card glow-green p-4.5 bg-surface" style={{ transform: 'rotate(1.5deg)' }}>
            <div className="eyebrow text-ink-muted mb-3.5 pb-2.5 border-b border-line-soft">
              Leaderboard preview
            </div>
            <div className="flex flex-col gap-1">
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
                  <div className="flex items-center gap-2.5">
                    <Avatar name={row.name} index={i} size={30} />
                    <span className="text-sm font-bold text-ink">{row.name}</span>
                  </div>
                  <span className="lb-pts">{row.pts}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Floating scoreboard chip */}
          <div className="card absolute bottom-0 left-[-28px] py-2.5 px-4 flex items-center gap-2.5 min-w-45">
            <span className="badge sm c-arg">ARG</span>
            <span className="display tnum text-lg text-ink">3</span>
            <span className="score-sep text-base">–</span>
            <span className="display tnum text-lg text-ink">2</span>
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
