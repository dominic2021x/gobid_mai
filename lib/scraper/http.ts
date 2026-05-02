/**
 * HTTP helpers for licitatii-insolventa.ro scraper (server-only).
 * User-Agent, Accept-Language ro, gzip, timeout, retries with backoff.
 */

const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

function getHeaders(referer?: string): HeadersInit {
  const ua =
    process.env.SCRAPER_USER_AGENT ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const headers: HeadersInit = {
    "User-Agent": ua,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "ro,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
  };
  if (referer) headers["Referer"] = referer;
  return headers;
}

/**
 * Fetch HTML with timeout and optional retries/backoff.
 */
export async function fetchHtml(
  url: string,
  options?: { timeoutMs?: number; retries?: number }
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options?.retries ?? MAX_RETRIES;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        headers: getHeaders("https://www.licitatii-insolventa.ro/"),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const html = await res.text();
      return html;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        await delay(backoff);
      }
    }
  }
  throw lastError ?? new Error("fetchHtml failed");
}

/**
 * Small delay between requests to respect rate limits.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
