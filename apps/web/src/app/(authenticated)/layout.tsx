import type { ReactNode } from 'react';
import { getCurrentActor } from '@/features/auth';
import { getUserPools } from '@/features/pools';
import { db } from '@/shared/db';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const actor = await getCurrentActor();
  const pools = actor ? await getUserPools(db, actor.userId) : [];

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <Sidebar pools={pools} />

      {/* Main content — offset by sidebar width on desktop */}
      <main className="pb-16 md:pl-[220px] md:pb-0">{children}</main>

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
