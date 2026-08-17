'use client';

import type { ComponentProps, ReactElement } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, QUICK_ACTION_STYLES, type QuickActionVariant } from '@/shared/ui';

const STAGE_ROOTS = {
  groups: '/view/demo-groups',
  knockout: '/view/demo-knockout',
  completed: '/view/demo-completed',
} as const;

const STAGES = [
  {
    key: 'groups' as const,
    label: 'Group stage',
    subtitle: 'Mid-way through the group matches',
    icon: 'flag' as ComponentProps<typeof Icon>['name'],
    variant: 'green' as QuickActionVariant,
  },
  {
    key: 'knockout' as const,
    label: 'Knockout stage',
    subtitle: 'R32 and R16 resolved, QF onward still open',
    icon: 'kick' as ComponentProps<typeof Icon>['name'],
    variant: 'orange' as QuickActionVariant,
  },
  {
    key: 'completed' as const,
    label: 'Completed',
    subtitle: 'The full tournament, final whistle blown',
    icon: 'trophy' as ComponentProps<typeof Icon>['name'],
    variant: 'green' as QuickActionVariant,
  },
];

type DemoStage = 'groups' | 'knockout' | 'completed';

export function getDemoStage(pathname: string): DemoStage | null {
  if (pathname.startsWith('/view/demo-groups/') || pathname === '/view/demo-groups')
    return 'groups';
  if (pathname.startsWith('/view/demo-knockout/') || pathname === '/view/demo-knockout')
    return 'knockout';
  if (pathname.startsWith('/view/demo-completed/') || pathname === '/view/demo-completed')
    return 'completed';
  return null;
}

export default function DemoBanner(): ReactElement | null {
  const pathname = usePathname();
  const stage = getDemoStage(pathname);

  if (stage === null) return null;

  const subPath = pathname.slice(STAGE_ROOTS[stage].length);

  return (
    <div data-testid="demo-banner" className="turf flex items-center gap-3 px-5 py-3 flex-wrap">
      <span className="eyebrow text-on-dark-muted flex items-center gap-1.5 shrink-0">
        ⚽ Live demo
      </span>
      <nav className="flex items-center gap-2.5 flex-wrap">
        {STAGES.map((s) => {
          const active = stage === s.key;
          return (
            <Link
              key={s.key}
              href={`${STAGE_ROOTS[s.key]}${subPath}`}
              data-testid={`demo-banner-link-${s.key}`}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-cup text-sm no-underline transition-opacity ${QUICK_ACTION_STYLES[s.variant]} ${
                active ? 'font-bold opacity-100' : 'font-semibold opacity-60 hover:opacity-90'
              }`}
            >
              <Icon name={s.icon} size={16} color="currentColor" />
              <div>
                <div className="font-bold leading-tight">{s.label}</div>
                <div className="text-xs font-medium opacity-75 leading-tight mt-0.5">
                  {s.subtitle}
                </div>
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
