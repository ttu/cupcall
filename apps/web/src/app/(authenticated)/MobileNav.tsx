'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/shared/ui';

const TABS = [
  { label: 'Pools', icon: 'trophy' as const, href: '/pools' },
  { label: 'Predict', icon: 'ball' as const, href: '/pools' },
  { label: 'Board', icon: 'users' as const, href: '/pools' },
  { label: 'You', icon: 'settings' as const, href: '/settings' },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        borderTop: '1px solid var(--line)',
        background: 'var(--surface)',
        padding: '8px 6px 4px',
        /* no display: flex here — md:hidden must win */
      }}
    >
      <div style={{ display: 'flex' }}>
        {TABS.map((tab) => {
          const active =
            tab.href !== '/pools'
              ? pathname.startsWith(tab.href)
              : tab.label === 'Pools' &&
                pathname.startsWith('/pools') &&
                !pathname.startsWith('/settings');
          return (
            <Link
              key={tab.label}
              href={tab.href}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                textDecoration: 'none',
                color: active ? 'var(--green-600)' : 'var(--ink-muted)',
              }}
            >
              <Icon name={tab.icon} size={22} stroke={active ? 2.2 : 1.8} />
              <span style={{ fontSize: 10.5, fontWeight: active ? 800 : 600 }}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
