/**
 * Google Ads conversion tracking. Client-safe.
 * Call only after successful server responses.
 */

const LABEL_TO_SENDTO: Record<string, () => string | undefined> = {
  signup: () => process.env.NEXT_PUBLIC_GADS_SENDTO_SIGNUP,
  listing_published: () => process.env.NEXT_PUBLIC_GADS_SENDTO_LISTING,
  bid_created: () => process.env.NEXT_PUBLIC_GADS_SENDTO_BID,
};

function storageKey(label: string, dedupeKey: string): string {
  return `gads_conv_fired:${label}:${dedupeKey}`;
}

function logConversionAttempt(
  label: string,
  dedupeKey: string | undefined,
  hasGtag: boolean
): void {
  const url = "/api/ro/ads/conversion";
  const body = JSON.stringify({ label, dedupeKey, hasGtag });
  try {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore
  }
}

/**
 * Track a Google Ads conversion. Safe to call from client.
 * Maps label to per-event send_to env var (e.g. NEXT_PUBLIC_GADS_SENDTO_SIGNUP).
 * If opts.dedupeKey is provided, blocks duplicate fires for same label+dedupeKey in session.
 * Fire-and-forget logs to /api/ro/ads/conversion for observability (adblock / missing gtag).
 */
export function trackGoogleConversion(
  label: string,
  opts?: { dedupeKey?: string }
): void {
  if (typeof window === "undefined") return;

  const getSendTo = LABEL_TO_SENDTO[label];
  const sendTo = getSendTo?.();

  if (!sendTo) return;

  const gtag = (
    window as unknown as {
      gtag?: (
        cmd: string,
        id: string,
        opts: { send_to?: string; event_callback?: () => void }
      ) => void;
    }
  ).gtag;
  const hasGtag = !!gtag;

  if (!hasGtag) {
    logConversionAttempt(label, opts?.dedupeKey, false);
    return;
  }

  const { dedupeKey } = opts ?? {};
  if (dedupeKey) {
    const key = storageKey(label, dedupeKey);
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // ignore
    }
  }

  try {
    gtag("event", "conversion", { send_to: sendTo });
  } catch {
    // ignore
  }

  logConversionAttempt(label, dedupeKey, true);
}
