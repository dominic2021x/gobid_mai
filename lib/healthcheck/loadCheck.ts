/**
 * Load check: fetch homepage; if slow or error, consider site "busy" to avoid running scan under load.
 */

const DEFAULT_THRESHOLD_MS = 4000;

export interface LoadCheckResult {
  busy: boolean;
  durationMs: number;
  status: number | null;
  retryAfterMin: number; // 20-40 suggested
}

export async function checkLoad(thresholdMs: number = DEFAULT_THRESHOLD_MS): Promise<LoadCheckResult> {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://gobid.ro");
  const url = base.replace(/\/$/, "") + "/";
  const start = Date.now();

  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    const durationMs = Date.now() - start;
    const busy = durationMs > thresholdMs || !res.ok;
    const retryAfterMin = busy ? 20 + Math.floor(Math.random() * 21) : 0; // 20-40 min
    return {
      busy,
      durationMs,
      status: res.status,
      retryAfterMin,
    };
  } catch {
    const durationMs = Date.now() - start;
    return {
      busy: true,
      durationMs,
      status: null,
      retryAfterMin: 20 + Math.floor(Math.random() * 21),
    };
  }
}
