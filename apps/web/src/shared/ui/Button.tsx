import { cloneElement, type ButtonHTMLAttributes, type ReactElement } from 'react';

type ButtonVariant =
  | 'primary'
  | 'accent'
  | 'dark'
  | 'ghost'
  | 'ghost-dark'
  | 'soft'
  | 'danger'
  | 'ghost-danger';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  asChild?: boolean;
  children?: React.ReactNode;
};

function buildClassName(
  variant: ButtonVariant,
  size?: ButtonSize,
  block?: boolean,
  extra?: string,
) {
  const parts = ['btn', `btn-${variant}`];
  if (size === 'sm') parts.push('sm');
  if (size === 'lg') parts.push('lg');
  if (block) parts.push('block');
  if (extra) parts.push(extra);
  return parts.join(' ');
}

export function Button({
  variant,
  size,
  block,
  asChild,
  children,
  className,
  ...rest
}: ButtonProps) {
  const cls = buildClassName(variant, size, block, className);

  if (asChild && children) {
    const child = children as ReactElement<{ className?: string }>;
    return cloneElement(child, { className: cls });
  }

  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}
