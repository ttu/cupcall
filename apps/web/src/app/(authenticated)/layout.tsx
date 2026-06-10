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
    <div style={{ minHeight: '100vh' }}>
      {/* Desktop sidebar */}
      <Sidebar pools={pools} />

      {/* Main content — offset by sidebar width on desktop */}
      <main style={{ paddingBottom: 64 }} className="md:pl-[220px] md:pb-0">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  );
}
