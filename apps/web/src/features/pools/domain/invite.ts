import { randomBytes, createHash } from 'crypto';

export function generateInviteToken(): string {
  return randomBytes(24).toString('hex');
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function buildInviteUrl(token: string): string {
  return `/join/${token}`;
}

export function generateViewToken(): string {
  return randomBytes(24).toString('hex');
}

export function buildViewUrl(token: string): string {
  return `/view/${token}`;
}

export function generateLoginToken(): string {
  return randomBytes(24).toString('hex');
}

export function buildLoginUrl(token: string): string {
  return `/login/${token}`;
}
