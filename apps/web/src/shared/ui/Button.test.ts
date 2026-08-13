import { createElement, type ReactElement } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Button } from './Button';

// Button is a plain function component — calling it directly returns the React element
// tree (a plain object) without needing a DOM renderer, matching this repo's node-only
// vitest environment (no jsdom / testing-library configured, and no JSX runtime wired into
// vitest's esbuild transform). Tests below stick to the `asChild` branch, which builds its
// result via `cloneElement`/`isValidElement` (plain function calls) rather than JSX syntax,
// so it doesn't depend on a JSX runtime being configured for the test environment.
// `ReactElement`'s `props` is typed `unknown` by default, so results are cast to a shape we
// can assert on.
type AnyElement = ReactElement<Record<string, unknown>>;
function call(props: Parameters<typeof Button>[0]): AnyElement | null {
  return Button(props) as AnyElement | null;
}

describe('Button (asChild usage)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clones the single valid element child instead of rendering a button', () => {
    const child = createElement('a', { href: '/login' }, 'Sign in');
    const el = call({ variant: 'ghost-dark', size: 'sm', asChild: true, children: child });
    expect(el).not.toBeNull();
    expect(el!.type).toBe('a');
    expect(el!.props.href).toBe('/login');
    expect(el!.props.children).toBe('Sign in');
  });

  it('merges the computed class name with the child’s existing className', () => {
    const child = createElement('a', { href: '/pools', className: 'existing' }, 'Go');
    const el = call({ variant: 'dark', block: true, asChild: true, children: child });
    expect(el!.props.className).toBe('btn btn-dark block existing');
  });

  it('forwards supported rest props onto the cloned child', () => {
    const onClick = vi.fn();
    const child = createElement('a', { href: '/pools' }, 'Go');
    const el = call({
      variant: 'primary',
      asChild: true,
      onClick,
      'aria-label': 'Go to pools',
      children: child,
    });
    expect(el!.props.onClick).toBe(onClick);
    expect(el!.props['aria-label']).toBe('Go to pools');
  });

  it('renders nothing instead of crashing when the child is a primitive (text)', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = call({
      variant: 'primary',
      asChild: true,
      children: 'just some text' as unknown as ReactElement,
    });
    expect(el).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('renders nothing instead of crashing when the child is missing', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = call({
      variant: 'primary',
      asChild: true,
      children: undefined as unknown as ReactElement,
    });
    expect(el).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });
});
