import type { ReactElement, ReactNode } from 'react';

type ChipVariant = 'default' | 'green' | 'orange' | 'dark';

type ChipProps = {
  variant?: ChipVariant;
  dot?: boolean;
  children?: ReactNode;
  style?: React.CSSProperties;
  className?: string;
};

export function Chip({
  variant = 'default',
  dot,
  children,
  style,
  className,
}: ChipProps): ReactElement {
  const parts = ['chip'];
  if (variant !== 'default') parts.push(variant);
  if (dot) parts.push('dot');
  if (className) parts.push(className);

  return (
    <span className={parts.join(' ')} style={style}>
      {children}
    </span>
  );
}
