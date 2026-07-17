import type { ComponentProps, ReactElement } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';

export type QuickActionVariant = 'orange' | 'green';

const QUICK_ACTION_STYLES: Record<QuickActionVariant, string> = {
  orange: 'bg-orange-500 text-[oklch(0.22_0.03_50)] shadow-[0_10px_30px_-16px_var(--orange-500)]',
  green: 'bg-green-500 text-[oklch(0.18_0.02_160)] shadow-[0_10px_30px_-16px_var(--green-500)]',
};

type Props = {
  href: string;
  testId: string;
  variant: QuickActionVariant;
  iconName: ComponentProps<typeof Icon>['name'];
  title: string;
  subtitle: string;
};

/** A bold, icon-led navigation tile — e.g. "Results & standings" on the pool/view pages. */
export function QuickActionLink({
  href,
  testId,
  variant,
  iconName,
  title,
  subtitle,
}: Props): ReactElement {
  return (
    <Link
      href={href}
      data-testid={testId}
      className={`p-4.5 rounded-cup flex items-center gap-3.5 no-underline ${QUICK_ACTION_STYLES[variant]}`}
    >
      <span
        aria-hidden
        className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[rgba(0,0,0,0.12)] shrink-0"
      >
        <Icon name={iconName} size={22} color="currentColor" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-extrabold text-base tracking-[-0.005em]">{title}</div>
        <div className="text-xs opacity-[0.78] mt-0.5 font-semibold">{subtitle}</div>
      </div>
      <Icon name="arrow" size={18} color="currentColor" />
    </Link>
  );
}
