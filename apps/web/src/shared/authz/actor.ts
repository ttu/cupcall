import type { UserId } from '@cup/engine';

/**
 * Represents an authenticated caller. A signed-out caller is `Actor | null`.
 */
export type Actor = { userId: UserId };

/**
 * Authoritative server-side clock, for use by CALLERS (handlers / server actions)
 * at the application boundary: resolve `now = clock()` there and pass the resulting
 * `Date` into policy functions. Policy functions themselves take a plain `Date` and
 * never call `clock()`, `Date.now()`, or `new Date()` internally.
 */
export type Clock = () => Date;
