import type { ReactElement } from 'react';
import { cn } from './cn';

type LogoProps = {
  size?: 'sm' | 'lg';
  dark?: boolean;
};

function LogoMark({ lg = false }: { lg?: boolean }): ReactElement {
  const size = lg ? 44 : 30;
  const rx = lg ? 13 : 9;
  const cx = size / 2;
  const cr = lg ? 8 : 5.5;
  const csw = lg ? 3.5 : 2.5;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <rect width={size} height={size} rx={rx} fill="var(--green-500)" />
      <rect
        x={1}
        y={1}
        width={size - 2}
        height={size - 2}
        rx={rx - 1}
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={2}
      />
      <circle cx={cx} cy={cx} r={cr} stroke="var(--ink-950)" strokeWidth={csw} />
    </svg>
  );
}

export function Logo({ size, dark = false }: LogoProps): ReactElement {
  return (
    <span className={cn('logo', dark ? 'text-on-dark' : 'text-ink')}>
      <LogoMark lg={size === 'lg'} />
      <span className="logo-word">
        CUP<span className="b">CALL</span>
      </span>
    </span>
  );
}
