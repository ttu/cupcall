/**
 * Safely narrows a variable-length array (0-N elements, as derived.finalists/derived.bronzePair
 * are while SF picks are still incomplete) into a proper 2-tuple, or null when it isn't exactly
 * two elements. Replaces `arr.length >= 2 ? (arr as [T, T]) : null` — an unsafe cast that assumes
 * what this function actually proves.
 */
export function toPair<T>(arr: readonly T[]): [T, T] | null {
  return arr.length === 2 ? [arr[0]!, arr[1]!] : null;
}
