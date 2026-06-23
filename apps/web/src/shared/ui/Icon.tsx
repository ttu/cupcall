type IconName =
  | 'lock'
  | 'trophy'
  | 'plus'
  | 'share'
  | 'chevron'
  | 'chevdown'
  | 'check'
  | 'checkcirc'
  | 'mail'
  | 'users'
  | 'settings'
  | 'ball'
  | 'edit'
  | 'history'
  | 'link'
  | 'kick'
  | 'rotate'
  | 'trash'
  | 'download'
  | 'upload'
  | 'flag'
  | 'card'
  | 'whistle'
  | 'arrow'
  | 'spark'
  | 'chevleft'
  | 'clock';

type IconProps = {
  name: IconName;
  size?: number;
  stroke?: number;
  color?: string;
};

const PATHS: Record<IconName, string> = {
  lock: 'M5 11V7a5 5 0 0 1 10 0v4M3 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zm7 4v2',
  trophy:
    'M6 2h12v8a6 6 0 0 1-12 0V2zM6 6H2a2 2 0 0 0 0 4h4M18 6h4a2 2 0 0 1 0 4h-4M12 16v4M8 20h8',
  plus: 'M12 4v16M4 12h16',
  share: 'M4 12v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8M16 6l-4-4-4 4M12 2v13',
  chevron: 'M9 18l6-6-6-6',
  chevdown: 'M6 9l6 6 6-6',
  check: 'M20 6L9 17l-5-5',
  checkcirc: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14.01l-3-3',
  mail: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 0 8 8 8-8',
  users:
    'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 0v0M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  ball: 'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 0v0M12 2c-2.76 4.76-2.76 15.24 0 20M12 2c2.76 4.76 2.76 15.24 0 20M2 12h20M3.6 7h16.8M3.6 17h16.8',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  history: 'M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  kick: 'M14.5 10c-.83 0-1.5-.67-1.5-1.5v-5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5zM20.5 10H19V8.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM9.5 14c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5S8 21.33 8 20.5v-5c0-.83.67-1.5 1.5-1.5zM3.5 14H5v1.5c0 .83-.67 1.5-1.5 1.5S2 16.33 2 15.5 2.67 14 3.5 14zM14 14H10v-4h4z',
  rotate:
    'M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
  card: 'M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM1 10h22',
  whistle: 'M6 12a6 6 0 1 0 12 0v-2H6v2zM6 10V6a6 6 0 0 1 6-6h6v4H12a2 2 0 0 0-2 2v4M12 12h.01',
  arrow: 'M5 12h14M12 5l7 7-7 7',
  spark: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  chevleft: 'M15 18l-6-6 6-6',
  clock: 'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 6v4l3 3',
};

export function Icon({
  name,
  size = 20,
  stroke = 2,
  color = 'currentColor',
}: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
