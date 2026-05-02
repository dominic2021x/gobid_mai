/**
 * Lightweight mobile diagnostics logger.
 * Production-safe: only logs relevant camera/flow failures, no sensitive data, no spam.
 */

/** No colon inside `[…]` — Tailwind scans strings and treats `[x:y]` as arbitrary CSS. */
const PREFIX = '[gobid-mobile]';

export function logCameraFailure(context: string, reason: string, detail?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const msg = detail ? `${reason}: ${detail}` : reason;
    console.warn(`${PREFIX} ${context} — ${msg}`);
  } catch {
    // no-op
  }
}

export function logCameraSuccess(context: string, source: string): void {
  if (typeof window === 'undefined') return;
  if (process.env.NODE_ENV !== 'development') return;
  try {
    console.info(`${PREFIX} ${context} — photo from ${source}`);
  } catch {
    // no-op
  }
}
