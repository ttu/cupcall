export const AVATAR_PALETTE = [
  'oklch(0.6 0.16 150)',
  'oklch(0.62 0.17 50)',
  'oklch(0.55 0.15 260)',
  'oklch(0.58 0.18 25)',
  'oklch(0.6 0.14 200)',
  'oklch(0.55 0.16 320)',
];

function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  const first = words[0] ?? '';
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  const second = words[1] ?? '';
  return (first[0] ?? '' + (second[0] ?? '')).toUpperCase();
}

type AvatarProps = {
  name: string;
  index?: number;
  size?: number;
};

export function Avatar({ name, index = 0, size = 36 }: AvatarProps) {
  const bg = AVATAR_PALETTE[index % AVATAR_PALETTE.length];
  return (
    <span
      className="avatar"
      style={{
        background: bg,
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
      }}
    >
      {initials(name)}
    </span>
  );
}
