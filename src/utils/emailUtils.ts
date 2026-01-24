/**
 * Normalize email casing for stable comparisons.
 */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
