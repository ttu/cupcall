'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/shared/ui';

type Tab = {
  label: string;
  icon: Parameters<typeof Icon>[0]['name'];
  href: string;
  exact?: boolean;
};

function poolTabs(poolId: string): Tab[] {
  return [
    { label: 'Board', icon: 'users', href: `/pools/${poolId}`, exact: true },
    { label: 'Predict', icon: 'ball', href: `/pools/${poolId}/predict` },
    { label: 'Results', icon: 'history', href: `/pools/${poolId}/results` },
    { label: 'You', icon: 'settings', href: '/settings' },
  ];
}

const TOP_LEVEL_TABS: Tab[] = [
  { label: 'Pools', icon: 'trophy', href: '/pools', exact: true },
  { label: 'You', icon: 'settings', href: '/settings' },
];

function isActive(tab: Tab, pathname: string): boolean {
  if (tab.exact) return pathname === tab.href;
  return pathname.startsWith(tab.href);
}

export function MobileNav() {
  const pathname = usePathname();
  const poolId = pathname.match(/^\/pools\/([^/]+)/)?.[1];
  const tabs = poolId ? poolTabs(poolId) : TOP_LEVEL_TABS;

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
        {tabs.map((tab) => {
          const active = isActive(tab, pathname);
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
