import type { ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';

type Props = { href: string; children: ReactNode };

export function BackLink({ href, children }: Props) {
  return (
    <Link href={href} className="eyebrow back-link">
      <Icon name="chevleft" size={13} stroke={2.5} />
      {children}
    </Link>
  );
}
