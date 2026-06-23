import type { ReactElement } from 'react';

type LogoProps = {
  size?: 'sm' | 'lg';
  dark?: boolean;
};

import { cn } from './cn';

export function Logo({ size, dark = false }: LogoProps): ReactElement {
  return (
    <span className={cn('logo', dark ? 'text-on-dark' : 'text-ink')}>
      <span className={`logo-mark${size === 'lg' ? ' lg' : ''}`} />
      <span className="logo-word">
        CUP<span className="b">CALL</span>
      </span>
    </span>
  );
}
