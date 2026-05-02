/**
 * HTTP helpers for REPES (prod.executori.ro/repes) scraper - server-only.
 * For SPA (content loaded on client), use fetchRepesHtmlWithBrowser.
 */

const DEFAULT_TIMEOUT_MS = 25_000;
const BROWSER_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

const REPES_ORIGIN = "https://prod.executori.ro";

const USER_AGENT =
  process.env.SCRAPER_USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let puppeteer: typeof import("puppeteer") | null = null;
try {
  puppeteer = require("puppeteer");
} catch {
  puppeteer = null;
}

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

export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch HTML with timeout and optional retries/backoff.
 */
export async function fetchRepesHtml(
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
        headers: getHeaders(`${REPES_ORIGIN}/repes/`),
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
  throw lastError ?? new Error("fetchRepesHtml failed");
}

/** Selector to wait for on listing page (SPA renders cards client-side). */
const LISTING_WAIT_SELECTOR = ".card-container, app-listing-card";
/** Selector to wait for on detail page. */
const DETAIL_WAIT_SELECTOR = ".listing-details-table, .auctioneer-details-table, .listing-title";

type Browser = Awaited<ReturnType<NonNullable<typeof puppeteer>["launch"]>>;
type Page = Awaited<ReturnType<Browser["newPage"]>>;

/**
 * Lansează un browser Puppeteer (reutilizabil pentru mai multe pagini).
 */
export async function launchRepesBrowser(): Promise<{ browser: Browser; page: Page }> {
  if (!puppeteer) throw new Error("Puppeteer nu este instalat. Rulează: npm install puppeteer");
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
    ],
    timeout: 60000,
  });
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  return { browser, page };
}

/**
 * Încarcă o pagină de listare REPES folosind un page existent (fără a închide browserul).
 * Pentru pageIdx>0: așteaptă paginatorul corect apoi delay-uri fixe (fără așteptare după „card nou”).
 */
export async function fetchRepesListingPageWithPage(
  page: Page,
  url: string,
  options?: { timeoutMs?: number }
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 35000;
  const pageIdxMatch = url.match(/[?&]pageIdx=(\d+)/);
  const listingPageIndex = pageIdxMatch ? parseInt(pageIdxMatch[1], 10) : 0;

  await page.goto(url, { waitUntil: "networkidle0", timeout: timeoutMs });
  await page.waitForSelector(LISTING_WAIT_SELECTOR, { timeout: Math.min(20000, timeoutMs) });
  if (listingPageIndex > 0) {
    const expectedPageLabel = listingPageIndex + 1;
    try {
      await page.waitForFunction(
        (expected: number) => {
          const el = document.querySelector(".mat-paginator-range-label");
          if (!el) return false;
          const text = (el.textContent || "").trim();
          const m = text.match(/Pagina\s*(\d+)\s*din/i);
          return m ? parseInt(m[1], 10) === expected : false;
        },
        { timeout: 25000 },
        expectedPageLabel
      );
    } catch {
      await delay(6000);
    }
    await delay(10000);
  } else {
    await delay(5000);
  }

  await delay(6000);
  return page.content();
}

/**
 * Fetch REPES HTML using Puppeteer (for SPA – content loaded in browser).
 * Waits for the given selector (or a default based on URL) before returning page HTML.
 * For listing pages with pageIdx>0, waits longer so Angular has time to load that page's data.
 */
export async function fetchRepesHtmlWithBrowser(
  url: string,
  options?: {
    waitForSelector?: string;
    timeoutMs?: number;
  }
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? BROWSER_TIMEOUT_MS;
  const isListing = url.replace(/\?.*/, "").replace(/\/$/, "").endsWith("/repes") || url.includes("/repes?");
  const waitSelector = options?.waitForSelector ?? (isListing ? LISTING_WAIT_SELECTOR : DETAIL_WAIT_SELECTOR);
  const pageIdxMatch = url.match(/[?&]pageIdx=(\d+)/);
  const listingPageIndex = pageIdxMatch ? parseInt(pageIdxMatch[1], 10) : 0;

  if (!puppeteer) {
    throw new Error("Puppeteer nu este instalat. Rulează: npm install puppeteer");
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
    ],
    timeout: 60000,
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.goto(url, { waitUntil: "networkidle0", timeout: timeoutMs });
    await page.waitForSelector(waitSelector, { timeout: Math.min(25000, timeoutMs) });
    if (isListing && listingPageIndex > 0) {
      const expectedPageLabel = listingPageIndex + 1;
      try {
        await page.waitForFunction(
          (expected: number) => {
            const el = document.querySelector(".mat-paginator-range-label");
            if (!el) return false;
            const text = (el.textContent || "").trim();
            const m = text.match(/Pagina\s*(\d+)\s*din/i);
            return m ? parseInt(m[1], 10) === expected : false;
          },
          { timeout: 15000 },
          expectedPageLabel
        );
      } catch {
        await delay(2500);
      }
    } else {
      await delay(1500);
    }
    const html = await page.content();
    return html;
  } finally {
    await browser.close();
  }
}
