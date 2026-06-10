'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo, Icon } from '@/shared/ui';
import { signOutAction } from './nav-actions';
import type { PoolSummary } from '@/features/pools';

type Props = {
  pools: PoolSummary[];
};

export function Sidebar({ pools }: Props) {
  const pathname = usePathname();

  return (
    <aside
      className="turf hidden md:flex"
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        width: 220,
        flexDirection: 'column',
        zIndex: 40,
        borderRight: '1px solid rgba(255,255,255,.07)',
        overflowY: 'auto',
      }}
    >
      {/* Logo */}
      <div style={{ padding: '20px 20px 12px' }}>
        <Link href="/pools" style={{ textDecoration: 'none' }}>
          <Logo dark />
        </Link>
      </div>

      {/* Pool list */}
      <div style={{ flex: 1, padding: '8px 12px', overflowY: 'auto' }}>
        <div
          className="eyebrow"
          style={{ color: 'rgba(255,255,255,.35)', padding: '6px 8px', marginBottom: 4 }}
        >
          Your Pools
        </div>
        {pools.length === 0 && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', padding: '6px 8px' }}>
            No pools yet
          </div>
        )}
        {pools.map((pool) => {
          const active = pathname.startsWith(`/pools/${pool.id}`);
          return (
            <Link
              key={pool.id}
              href={`/pools/${pool.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 9,
                textDecoration: 'none',
                marginBottom: 2,
                background: active ? 'rgba(255,255,255,.1)' : 'transparent',
                transition: 'background .12s',
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: active ? 'var(--green-500)' : 'rgba(255,255,255,.1)',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  fontFamily: 'var(--font-display)',
                  fontSize: 12,
                  color: active ? 'oklch(0.18 0.02 160)' : 'var(--on-dark)',
                }}
              >
                {pool.name.slice(0, 2).toUpperCase()}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: 700,
                  color: active ? 'var(--on-dark)' : 'var(--on-dark-soft)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {pool.name}
              </span>
            </Link>
          );
        })}

        {/* New pool link */}
        <Link
          href="/pools"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 10px',
            borderRadius: 9,
            textDecoration: 'none',
            marginTop: 4,
            color: 'rgba(255,255,255,.4)',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <Icon name="plus" size={13} color="rgba(255,255,255,.4)" />
          New pool
        </Link>
      </div>

      {/* Bottom nav items */}
      <div
        style={{
          padding: '12px',
          borderTop: '1px solid rgba(255,255,255,.07)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <SidebarLink href="/settings" icon="settings" label="Settings" pathname={pathname} />
        <form action={signOutAction}>
          <button
            type="submit"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              borderRadius: 9,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
              color: 'rgba(255,255,255,.4)',
              textAlign: 'left',
            }}
          >
            <Icon name="arrow" size={16} color="rgba(255,255,255,.4)" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

function SidebarLink({
  href,
  icon,
  label,
  pathname,
}: {
  href: string;
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  pathname: string;
}) {
  const active = pathname.startsWith(href);
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 9,
        textDecoration: 'none',
        background: active ? 'rgba(255,255,255,.1)' : 'transparent',
        fontSize: 13,
        fontWeight: 700,
        color: active ? 'var(--on-dark)' : 'var(--on-dark-soft)',
      }}
    >
      <Icon name={icon} size={16} color={active ? 'var(--on-dark)' : 'rgba(255,255,255,.5)'} />
      {label}
    </Link>
  );
}
