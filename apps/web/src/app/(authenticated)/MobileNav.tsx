'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn, Icon } from '@/shared/ui';

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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[40] border-t border-line bg-surface pt-2 pb-1 px-1.5">
      <div className="flex">
        {tabs.map((tab) => {
          const active = isActive(tab, pathname);
          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={cn(
                'flex-1 flex flex-col items-center gap-[3px] no-underline',
                active ? 'text-green-600' : 'text-ink-muted',
              )}
            >
              <Icon name={tab.icon} size={22} stroke={active ? 2.2 : 1.8} />
              <span className={cn('text-[10.5px]', active ? 'font-extrabold' : 'font-bold')}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
