/**
 * Shared logic for extracting product data from pieseauto.ro / olx.ro URLs (or pasted HTML).
 * Used by POST /api/piese-auto/fetch-product and by import-csv.
 */

import { parsePieseAutoProductPage, isCaptchaOrBlockPage } from "@/lib/scraper/pieseauto";
import { parseOlxProductPage } from "@/lib/scraper/olx";

const ALLOWED_ORIGINS = [
  "https://www.pieseauto.ro",
  "https://pieseauto.ro",
  "https://www.olx.ro",
  "https://olx.ro",
];

const PIESEAUTO_HOMEPAGE = "https://www.pieseauto.ro/";
const PIESEAUTO_AUTH_URL = "https://www.pieseauto.ro/members.php?action=auth";
const PIESEAUTO_LOGIN_POST_URL = "https://www.pieseauto.ro/members.php";

const PIESEAUTO_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
];

const PIESEAUTO_BASE_HEADERS: Record<string, string> = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: PIESEAUTO_HOMEPAGE,
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ALLOWED_ORIGINS.includes(u.origin) && u.pathname.length > 1;
  } catch {
    return false;
  }
}

/** Normalizează URL-ul la https și host canonic (www), ca la „Extrage date din URL”. Acceptă și http din CSV. */
function normalizeProductUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase();
    if (!host.includes("pieseauto.ro") && !host.includes("olx.ro")) return null;
    if (u.pathname.length <= 1) return null;
    u.protocol = "https:";
    if (host === "pieseauto.ro") u.hostname = "www.pieseauto.ro";
    if (host === "olx.ro") u.hostname = "www.olx.ro";
    return u.toString();
  } catch {
    return null;
  }
}

function getOriginHost(url: string): "pieseauto" | "olx" | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("pieseauto.ro")) return "pieseauto";
    if (host.includes("olx.ro")) return "olx";
    return null;
  } catch {
    return null;
  }
}

/** Extrage header-ul Cookie din răspuns (Set-Cookie) pentru a-l trimite la request-ul următor. */
function getCookieFromResponse(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") {
    const list = headers.getSetCookie();
    return list.map((c) => c.split(";")[0].trim()).join("; ");
  }
  const one = res.headers.get("set-cookie");
  if (!one) return "";
  return one.split(";")[0].trim();
}

/** Combină două stringuri Cookie (fără duplicate după numele cookie-ului). */
function mergeCookieStrings(existing: string, fromResponse: string): string {
  const parts = existing.split(";").map((s) => s.trim()).filter(Boolean);
  const seen = new Set(parts.map((p) => p.split("=")[0]));
  for (const p of fromResponse.split(";").map((s) => s.trim()).filter(Boolean)) {
    const name = p.split("=")[0];
    if (!seen.has(name)) {
      seen.add(name);
      parts.push(p);
    }
  }
  return parts.join("; ");
}

/**
 * Login pe pieseauto.ro cu user/parolă din env.
 * Returnează cookie-ul de sesiune sau "" dacă nu sunt setate credențialele / login eșuează.
 */
async function getPieseAutoLoginCookie(): Promise<string> {
  const email = process.env.PIESEAUTO_LOGIN_EMAIL?.trim();
  const password = process.env.PIESEAUTO_LOGIN_PASSWORD?.trim();
  if (!email || !password) return "";

  const ua = PIESEAUTO_USER_AGENTS[0];
  let cookie = "";

  try {
    const getRes = await fetch(PIESEAUTO_AUTH_URL, {
      method: "GET",
      headers: {
        "User-Agent": ua,
        ...PIESEAUTO_BASE_HEADERS,
      },
      redirect: "follow",
    });
    cookie = mergeCookieStrings(cookie, getCookieFromResponse(getRes));
    await new Promise((r) => setTimeout(r, 500));

    const body = new URLSearchParams({
      action: "login",
      email,
      password,
    });
    const postRes = await fetch(PIESEAUTO_LOGIN_POST_URL, {
      method: "POST",
      headers: {
        "User-Agent": ua,
        ...PIESEAUTO_BASE_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body.toString(),
      redirect: "follow",
    });
    const newCookie = getCookieFromResponse(postRes);
    if (newCookie) cookie = mergeCookieStrings(cookie, newCookie);

    if (PIESEAUTO_DEBUG) {
      const location = postRes.headers.get("location") ?? "";
      console.log("[pieseauto] login post status=" + postRes.status + " cookie=" + (cookie ? "yes" : "no") + " location=" + location);
    }
  } catch (e) {
    if (PIESEAUTO_DEBUG) console.warn("[pieseauto] login error", e);
    return "";
  }
  return cookie;
}

async function fetchPieseAutoPage(
  url: string,
  userAgent: string,
  cookie: string
): Promise<{ ok: boolean; html: string; status: number }> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": userAgent,
      ...PIESEAUTO_BASE_HEADERS,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    redirect: "follow",
  });
  const html = await res.text();
  return { ok: res.ok, html, status: res.status };
}

const PIESEAUTO_DEBUG = process.env.PIESEAUTO_FETCH_DEBUG === "true";

async function fetchPieseAutoWithRetries(url: string): Promise<{ html: string; ok: boolean }> {
  let cookie = "";

  try {
    const puppeteerHtml = await fetchPieseAutoWithPuppeteer(url);
    if (puppeteerHtml && !isCaptchaOrBlockPage(puppeteerHtml)) {
      if (PIESEAUTO_DEBUG) console.log("[pieseauto] Puppeteer OK, pagină produs obținută");
      return { html: puppeteerHtml, ok: true };
    }
  } catch (e) {
    if (PIESEAUTO_DEBUG) console.warn("[pieseauto] Puppeteer failed", e);
  }

  const loginCookie = await getPieseAutoLoginCookie();
  if (loginCookie) {
    cookie = mergeCookieStrings(cookie, loginCookie);
    if (PIESEAUTO_DEBUG) console.log("[pieseauto] using login cookie (PIESEAUTO_LOGIN_EMAIL set)");
  }

  const homeRes = await fetch(PIESEAUTO_HOMEPAGE, {
    method: "GET",
    headers: {
      "User-Agent": PIESEAUTO_USER_AGENTS[0],
      ...PIESEAUTO_BASE_HEADERS,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    redirect: "follow",
  });
  const homeHtml = await homeRes.text();
  cookie = mergeCookieStrings(cookie, getCookieFromResponse(homeRes));
  if (PIESEAUTO_DEBUG) {
    const homeCaptcha = isCaptchaOrBlockPage(homeHtml);
    console.log("[pieseauto] homepage status=" + homeRes.status + " captcha=" + homeCaptcha + " cookie=" + (cookie ? "yes" : "no"));
  }
  await new Promise((r) => setTimeout(r, 400));

  for (let i = 0; i < PIESEAUTO_USER_AGENTS.length; i++) {
    const ua = PIESEAUTO_USER_AGENTS[i];
    const { ok, html } = await fetchPieseAutoPage(url, ua, cookie);
    const captcha = isCaptchaOrBlockPage(html);
    if (PIESEAUTO_DEBUG) {
      console.log("[pieseauto] attempt " + (i + 1) + " ok=" + ok + " captcha=" + captcha + " snippet=" + html.slice(0, 120).replace(/\s+/g, " "));
    }
    if (!ok) continue;
    if (!captcha) return { html, ok: true };
    if (i < PIESEAUTO_USER_AGENTS.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return { html: "", ok: false };
}

async function acceptPieseAutoCookies(page: { evaluate: (fn: () => boolean) => Promise<boolean> }): Promise<boolean> {
  return page.evaluate(() => {
    const text = "ACCEPT TOATE";
    const candidates = document.querySelectorAll("button, a, [role='button'], input[type='submit'], .btn, [class*='accept'], [class*='cookie']");
    for (const el of candidates) {
      if (el.textContent?.toUpperCase().includes(text) || (el as HTMLInputElement).value?.toUpperCase().includes(text)) {
        (el as HTMLElement).click();
        return true;
      }
    }
    const allClickable = document.querySelectorAll("button, a, [role='button']");
    for (const el of allClickable) {
      if (el.textContent?.trim().toUpperCase().includes("ACCEPT")) {
        (el as HTMLElement).click();
        return true;
      }
    }
    return false;
  });
}

async function fetchPieseAutoWithPuppeteer(url: string): Promise<string | null> {
  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 2500));
    await acceptPieseAutoCookies(page);
    await new Promise((r) => setTimeout(r, 2000));
    const bullets = await page.$$(".pr-head__gallery .glide__bullet, .pr-gallery .glide__bullet");
    for (let i = 0; i < bullets.length; i++) {
      await bullets[i].click();
      await new Promise((r) => setTimeout(r, 350));
    }
    await new Promise((r) => setTimeout(r, 500));
    const specsTab = await page.$(".pr-tabs__item[data-tab='specs'], .js-product-tab[data-tab='specs'], [data-tab='specs']");
    if (specsTab) {
      await specsTab.click();
      await new Promise((r) => setTimeout(r, 1000));
    }
    const shippingTab = await page.$(".pr-tabs__item[data-tab='shipping'], .js-product-tab[data-tab='shipping'], li[data-tab='shipping']");
    if (shippingTab) {
      await shippingTab.click();
      await new Promise((r) => setTimeout(r, 800));
    }
    return await page.content();
  } finally {
    await browser.close();
  }
}

export type FetchProductResult = {
  success: boolean;
  product?: {
    title: string;
    price: number | null;
    currency: string;
    imageUrls: string[];
    description: string;
    specifications: Record<string, string>;
    livrareSiPlata: string;
    url: string;
    externalId?: string | null;
    location?: string | null;
  };
  error?: string;
};

export function isAllowedProductUrl(url: string): boolean {
  return isAllowedUrl(url);
}

/** Extrage date din URL (sau din HTML lipit). Folosit de fetch-product route și import-csv. */
export async function fetchProductFromUrl(url: string, pastedHtml?: string): Promise<FetchProductResult> {
  const raw = url.trim();
  const html = typeof pastedHtml === "string" ? pastedHtml.trim() : "";
  if (!raw) return { success: false, error: "URL lipsește." };
  const u = normalizeProductUrl(raw) ?? (isAllowedUrl(raw) ? raw : "");
  if (!u) return { success: false, error: "Folosește doar URL-uri de la pieseauto.ro sau olx.ro (produse auto)." };

  const host = getOriginHost(u);
  const isOlx = host === "olx";
  const isPieseauto = host === "pieseauto";

  if (html.length > 500) {
    if (host === "pieseauto") {
      const product = parsePieseAutoProductPage(html, u);
      return { success: true, product: { title: product.title, price: product.price, currency: product.currency, imageUrls: product.imageUrls, description: product.description, specifications: product.specifications, livrareSiPlata: product.livrareSiPlata, url: product.url, externalId: product.externalId, location: product.location } };
    }
    if (host === "olx") {
      const product = parseOlxProductPage(html, u);
      const hasContent = (product.title && product.title !== "Produs auto OLX") || product.price != null || product.description.length > 20 || product.imageUrls.length > 0;
      if (!hasContent) return { success: false, error: "Din HTML-ul lipit nu s-au putut extrage date de produs." };
      return { success: true, product: { title: product.title, price: product.price, currency: product.currency, imageUrls: product.imageUrls, description: product.description, specifications: product.specifications, livrareSiPlata: product.livrareSiPlata, url: product.url, externalId: product.externalId } };
    }
  }

  let pageHtml: string;
  if (host === "pieseauto") {
    const result = await fetchPieseAutoWithRetries(u);
    if (!result.ok || !result.html) return { success: false, error: "pieseauto.ro: pagină de securitate sau inaccesibilă. Încearcă din nou sau lipește sursa paginii (Ctrl+U)." };
    pageHtml = result.html;
  } else if (host === "olx") {
    const res = await fetch(u, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        Referer: "https://www.olx.ro/",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
      },
      redirect: "follow",
    });
    if (!res.ok) return { success: false, error: `Pagina a returnat status ${res.status}.` };
    pageHtml = await res.text();
  } else {
    return { success: false, error: "URL neacceptat." };
  }

  if (host === "pieseauto") {
    const product = parsePieseAutoProductPage(pageHtml, u);
    return { success: true, product: { title: product.title, price: product.price, currency: product.currency, imageUrls: product.imageUrls, description: product.description, specifications: product.specifications, livrareSiPlata: product.livrareSiPlata, url: product.url, externalId: product.externalId, location: product.location } };
  }
  if (host === "olx") {
    const product = parseOlxProductPage(pageHtml, u);
    const hasContent = (product.title && product.title !== "Produs auto OLX") || product.price != null || product.description.length > 20 || product.imageUrls.length > 0;
    if (!hasContent) return { success: false, error: "Nu s-au putut extrage date de pe OLX (pagina poate fi blocată)." };
    return { success: true, product: { title: product.title, price: product.price, currency: product.currency, imageUrls: product.imageUrls, description: product.description, specifications: product.specifications, livrareSiPlata: product.livrareSiPlata, url: product.url, externalId: product.externalId } };
  }
  return { success: false, error: "URL neacceptat." };
}
