import type { ReactElement, ReactNode } from 'react';
import { Logo } from '@/shared/ui';

export default function ViewLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="min-h-screen">
      <header className="p-[14px_20px] border-b border-line bg-surface">
        <Logo />
      </header>
      <main>{children}</main>
    </div>
  );
}
