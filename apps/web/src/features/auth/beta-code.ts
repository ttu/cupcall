/**
 * Returns an error string if `code` doesn't match the BETA_CODE env var,
 * or null if validation passes. When BETA_CODE is not set, always passes.
 */
export function checkBetaCode(code: string | null | undefined): string | null {
  const expected = process.env.BETA_CODE?.trim();
  if (!expected) return null;
  if (!code || code.trim() !== expected) return 'Invalid beta code.';
  return null;
}
