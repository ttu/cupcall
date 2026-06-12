import type { ReactNode } from 'react';
import { Logo } from '@/shared/ui';

export default function ViewLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh' }}>
      <header
        style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--surface)',
        }}
      >
        <Logo />
      </header>
      <main>{children}</main>
    </div>
  );
}
