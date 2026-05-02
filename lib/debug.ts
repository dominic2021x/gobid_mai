/**
 * Only logs when NEXT_PUBLIC_DEBUG_LOGS=true (e.g. in .env.local).
 * Use for [Dashboard], [UniversalHeader], Facebook config, etc. to keep console quiet by default.
 */
const enabled =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_LOGS === "true";

export function debugLog(...args: unknown[]): void {
  if (enabled) console.log(...args);
}

export function debugWarn(...args: unknown[]): void {
  if (enabled) console.warn(...args);
}
