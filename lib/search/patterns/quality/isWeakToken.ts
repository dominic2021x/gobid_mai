/**
 * Weak token detection for pattern quality.
 * Tokens that should not end a suggestion or stand alone.
 */

import { getDefaultWeakLastTokens, getDefaultWeakStandaloneTokens } from "./blacklists";

/** Check if token is weak as last word of a suggestion. */
export function isWeakLastToken(
  token: string,
  customWeakLast?: Set<string>
): boolean {
  const set = customWeakLast ?? getDefaultWeakLastTokens();
  return set.has(token.toLowerCase().trim());
}

/** Check if token is too weak to be a standalone suggestion. */
export function isWeakStandaloneToken(
  token: string,
  customWeak?: Set<string>
): boolean {
  const set = customWeak ?? getDefaultWeakStandaloneTokens();
  return set.has(token.toLowerCase().trim());
}

/** Check if token looks like a pure number (weak as standalone). */
export function isNumericToken(token: string): boolean {
  return /^[0-9]+([.,][0-9]+)?$/.test(token.trim());
}
