/**
 * Derives a display name from an email address.
 * Uses the local part (before @), trimmed and lowercased.
 * Falls back to 'user' if the local part is empty or the input is not an email.
 */
export function deriveDisplayName(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.indexOf('@');

  // No @, or nothing before @
  if (atIndex <= 0) {
    return 'user';
  }

  const localPart = trimmed.slice(0, atIndex);
  return localPart.length > 0 ? localPart : 'user';
}
