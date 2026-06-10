import type { ReactElement } from 'react';

const BADGE_COLORS: Record<string, string> = {
  ALG: 'c-alg',
  ARG: 'c-arg',
  AUS: 'c-aus',
  AUT: 'c-aut',
  BEL: 'c-bel',
  BIH: 'c-bih',
  BRA: 'c-bra',
  CAN: 'c-can',
  CIV: 'c-civ',
  COD: 'c-cod',
  COL: 'c-col',
  CPV: 'c-cpv',
  CRO: 'c-cro',
  CUW: 'c-cuw',
  CZE: 'c-cze',
  ECU: 'c-ecu',
  EGY: 'c-egy',
  ENG: 'c-eng',
  ESP: 'c-esp',
  FRA: 'c-fra',
  GER: 'c-ger',
  GHA: 'c-gha',
  HAI: 'c-hai',
  IRN: 'c-irn',
  IRQ: 'c-irq',
  JOR: 'c-jor',
  JPN: 'c-jpn',
  KOR: 'c-kor',
  KSA: 'c-ksa',
  MAR: 'c-mar',
  MEX: 'c-mex',
  NED: 'c-ned',
  NOR: 'c-nor',
  NZL: 'c-nzl',
  PAN: 'c-pan',
  PAR: 'c-par',
  POR: 'c-por',
  QAT: 'c-qat',
  RSA: 'c-rsa',
  SCO: 'c-sco',
  SEN: 'c-sen',
  SUI: 'c-sui',
  SWE: 'c-swe',
  TUN: 'c-tun',
  TUR: 'c-tur',
  URU: 'c-uru',
  USA: 'c-usa',
  UZB: 'c-uzb',
};

type Size = 'sm' | 'md' | 'lg' | 'xl';

export function TeamBadge({
  teamId,
  size = 'md',
}: {
  teamId: string | null | undefined;
  size?: Size;
}): ReactElement {
  const code = teamId ?? '?';
  const colorClass = teamId ? (BADGE_COLORS[teamId] ?? '') : '';
  const sizeClass = size === 'md' ? '' : size;
  const className = ['badge', sizeClass, colorClass].filter(Boolean).join(' ');
  return <span className={className}>{code}</span>;
}
