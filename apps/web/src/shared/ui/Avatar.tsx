import type { ReactElement } from 'react';

export const AVATAR_PALETTE = [
  'oklch(0.6 0.16 150)',
  'oklch(0.62 0.17 50)',
  'oklch(0.55 0.15 260)',
  'oklch(0.58 0.18 25)',
  'oklch(0.6 0.14 200)',
  'oklch(0.55 0.16 320)',
];

export function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  const first = words[0] ?? '';
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  const second = words[1] ?? '';
  return ((first[0] ?? '') + (second[0] ?? '')).toUpperCase();
}

type AvatarProps = {
  name: string;
  index?: number;
  size?: number;
  /**
   * Mark the avatar as decorative when a visible name label already sits next to it
   * (e.g. inside `AvatarNameBadge`), so screen readers don't announce the name twice.
   * Defaults to false — a standalone avatar exposes `name` as its accessible label.
   */
  decorative?: boolean;
};

/** Wraps the palette index so negative values still resolve to a valid palette color. */
function paletteIndex(index: number): number {
  return ((index % AVATAR_PALETTE.length) + AVATAR_PALETTE.length) % AVATAR_PALETTE.length;
}

export function Avatar({
  name,
  index = 0,
  size = 36,
  decorative = false,
}: AvatarProps): ReactElement {
  const bg = AVATAR_PALETTE[paletteIndex(index)];
  return (
    <span
      className="avatar"
      style={{
        background: bg,
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
      }}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name })}
    >
      {initials(name)}
    </span>
  );
}
