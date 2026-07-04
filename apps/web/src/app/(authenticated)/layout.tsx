import type { ReactElement, ReactNode } from 'react';
import { getCurrentActor } from '@/features/auth';
import { getUserPools } from '@/features/pools';
import { db } from '@/shared/db';
import { AppFooter } from '@/shared/ui';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  const actor = await getCurrentActor();
  const pools = actor ? await getUserPools(db, actor.userId) : [];

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <Sidebar pools={pools} />

      {/* Main content — offset by sidebar width on desktop */}
      <main className="md:pl-55">{children}</main>

      {/* Beta footer — offset by sidebar on desktop, clears mobile nav with pb-16 */}
      <div className="md:pl-55 pb-16 md:pb-0">
        <AppFooter />
      </div>

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
