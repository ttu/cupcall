import { cloneElement, isValidElement, type ButtonHTMLAttributes, type ReactElement } from 'react';
import { cn } from './cn';

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

type ButtonBaseProps = {
  variant: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
};

/** Renders a native `<button>`; `children` is the button's content. */
type NormalButtonProps = ButtonBaseProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: false;
  };

/**
 * Clones `children` instead of rendering a `<button>`, so callers can turn e.g. a `Link`
 * or `a` into something styled like a button without nesting interactive elements.
 * Requires exactly one valid React element child.
 */
type AsChildButtonProps = ButtonBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    asChild: true;
    children: ReactElement;
  };

export type ButtonProps = NormalButtonProps | AsChildButtonProps;

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

/** Props a cloned `asChild` element may safely receive — its own props, widened for spreading. */
type ClonableElementProps = { className?: string } & Record<string, unknown>;

function isSingleElementChild(children: unknown): children is ReactElement<ClonableElementProps> {
  return isValidElement<ClonableElementProps>(children) && !Array.isArray(children);
}

export function Button(props: ButtonProps): ReactElement | null {
  const { variant, size, block, asChild, children, className, ...rest } = props;
  const cls = buildClassName(variant, size, block, className);

  if (asChild) {
    if (!isSingleElementChild(children)) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(
          'Button: `asChild` requires exactly one valid React element child — rendering nothing.',
        );
      }
      return null;
    }
    return cloneElement(children, {
      ...rest,
      className: cn(cls, children.props.className),
    });
  }

  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}
