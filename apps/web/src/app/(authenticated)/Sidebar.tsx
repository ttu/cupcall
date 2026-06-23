'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn, Logo, Icon } from '@/shared/ui';
import { signOutAction } from './nav-actions';
import type { PoolSummary } from '@/features/pools';

type Props = {
  pools: PoolSummary[];
};

export function Sidebar({ pools }: Props): JSX.Element {
  const pathname = usePathname();

  return (
    <aside className="turf hidden md:flex fixed left-0 top-0 bottom-0 w-55 flex-col z-[40] overflow-y-auto border-r border-[rgba(255,255,255,.07)]">
      {/* Logo */}
      <div className="pt-5 px-5 pb-3">
        <Link href="/pools" className="no-underline">
          <Logo dark />
        </Link>
      </div>

      {/* Pool list */}
      <div className="flex-1 px-3 py-2 overflow-y-auto">
        <div className="eyebrow px-2 py-1.5 mb-1 text-[rgba(255,255,255,.35)]">Your Pools</div>
        {pools.length === 0 && (
          <div className="text-xs px-2 py-1.5 text-[rgba(255,255,255,.3)]">No pools yet</div>
        )}
        {pools.map((pool) => {
          const active = pathname.startsWith(`/pools/${pool.id}`);
          return (
            <Link
              key={pool.id}
              href={`/pools/${pool.id}`}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-cup-sm no-underline mb-0.5 transition-[background]',
                active ? 'bg-[rgba(255,255,255,.1)]' : 'bg-transparent',
              )}
            >
              <span
                className={cn(
                  'w-7 h-7 rounded-lg grid place-items-center shrink-0 text-xs font-cup-display',
                  active
                    ? 'bg-green-500 text-[oklch(0.18_0.02_160)]'
                    : 'bg-[rgba(255,255,255,.1)] text-on-dark',
                )}
              >
                {pool.name.slice(0, 2).toUpperCase()}
              </span>
              <span
                className={cn(
                  'flex-1 text-[13px] font-bold truncate',
                  active ? 'text-on-dark' : 'text-on-dark-soft',
                )}
              >
                {pool.name}
              </span>
            </Link>
          );
        })}

        {/* New pool link */}
        <Link
          href="/pools"
          className="flex items-center gap-2 px-2.5 py-[7px] rounded-cup-sm no-underline mt-1 text-xs font-bold text-[rgba(255,255,255,.4)]"
        >
          <Icon name="plus" size={13} color="rgba(255,255,255,.4)" />
          New pool
        </Link>
      </div>

      {/* Bottom nav items */}
      <div className="p-3 flex flex-col gap-0.5 border-t border-[rgba(255,255,255,.07)]">
        <SidebarLink href="/settings" icon="settings" label="Settings" pathname={pathname} />
        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-cup-sm border-0 bg-transparent cursor-pointer text-[13px] font-bold text-left text-[rgba(255,255,255,.4)]"
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
      className={cn(
        'flex items-center gap-2.5 px-2.5 py-2 rounded-cup-sm no-underline text-[13px] font-bold',
        active ? 'text-on-dark bg-[rgba(255,255,255,.1)]' : 'text-on-dark-soft bg-transparent',
      )}
    >
      <Icon name={icon} size={16} color={active ? 'var(--on-dark)' : 'rgba(255,255,255,.5)'} />
      {label}
    </Link>
  );
}
