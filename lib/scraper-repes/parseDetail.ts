/**
 * Parse detail page HTML from prod.executori.ro/repes/listing/... (server-only).
 * Extract title, address, description, listing-details-table, auctioneer-details-table, PDF link.
 */

import * as cheerio from "cheerio";

const BASE_URL = "https://prod.executori.ro";

export interface RepesDetailParsed {
  externalId: string;
  title: string;
  priceText: string | null;
  locationRaw: string | null;
  descriptionHtml: string | null;
  publishedAt: string | null;
  auctionDate: string | null;
  auctionTime: string | null;
  sellerName: string | null;
  sellerEmail: string | null;
  sellerPhone: string | null;
  sellerAddress: string | null;
  /** Primul PDF (compatibilitate). */
  pdfUrl: string | null;
  /** Toate URL-urile PDF din anunț. */
  pdfUrls: string[];
  metaFields: Record<string, string>;
  imageUrls: string[];
}

function trim(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function toAbsolute(url: string, base: string): string {
  if (!url) return "";
  return url.startsWith("http") ? url : new URL(url, base).href;
}

function extractRepesExternalIdFromUrl(pageUrl: string): string {
  const m = pageUrl.match(/\/repes\/listing\/[^/]+\/([a-f0-9]+)(?:\?|$|#)/i)
    || pageUrl.match(/\/listing\/[^/]+\/([a-f0-9]+)(?:\?|$|#)/i);
  if (m) return m[1];
  const segments = pageUrl.split("/").filter(Boolean);
  return segments[segments.length - 1] || pageUrl;
}

/**
 * Parse table rows from .listing-details-table and .auctioneer-details-table (tr td).
 */
function parseTableToMap($: cheerio.CheerioAPI, tableSelector: string): Record<string, string> {
  const map: Record<string, string> = {};
  $(tableSelector).find("tr").each((_, row) => {
    const tds = $(row).find("td");
    if (tds.length >= 2) {
      const key = trim($(tds[0]).text());
      const val = trim($(tds[1]).text());
      if (key && val) map[key] = val;
    }
  });
  return map;
}

/**
 * Parse detail page HTML.
 */
export function parseRepesDetailPage(html: string, pageUrl: string): RepesDetailParsed {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl).origin;

  const externalId = extractRepesExternalIdFromUrl(pageUrl);

  let title = trim($('meta[itemprop="name"]').attr("content") || "");
  if (!title) title = trim($("h1, .listing-sub-details-title").first().text());
  if (!title) title = trim($(".listing-title").first().text()) || "Fără titlu";

  const listingDetails = parseTableToMap($ as cheerio.CheerioAPI, ".listing-details-table");
  const auctioneerDetails = parseTableToMap($ as cheerio.CheerioAPI, ".auctioneer-details-table");

  const priceContent = $('meta[itemprop="price"]').attr("content");
  const priceCurrency = $('meta[itemprop="priceCurrency"]').attr("content") || "RON";
  let priceText: string | null = null;
  if (priceContent) priceText = `${priceContent} ${priceCurrency}`.trim();

  const addressEl = $(".listing-address").first();
  const rawAddress = addressEl.length ? trim(addressEl.text()) : null;
  const locationRaw = rawAddress ? trim(rawAddress.replace(/^\s*(location_on|place|my_location|pin_drop)\s*/i, "")) || null : null;

  let descriptionHtml: string | null = trim($(".listing-description").first().html() || $("p.listing-description").first().html() || "");
  if (!descriptionHtml) descriptionHtml = null;

  const dataIncarcarii = listingDetails["Data încărcării"];
  let publishedAt: string | null = null;
  if (dataIncarcarii) {
    const d = parseRoDate(dataIncarcarii);
    if (d) publishedAt = d.toISOString().slice(0, 10);
  }

  const listingSubDetailsTitle = $(".listing-sub-details-title").first();
  let auctionDate: string | null = null;
  let auctionTime: string | null = null;
  $(".listing-publish-date").each((_, el) => {
    const text = trim($(el).text());
    const dateMatch = text.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (dateMatch) {
      const [, d, mo, y, h, min] = dateMatch;
      auctionDate = `${y}-${mo}-${d}`;
      auctionTime = `${h.padStart(2, "0")}:${min}`;
      return false;
    }
  });

  const licitator = auctioneerDetails["Licitator"];
  const auctioneerNameDom = trim($(".auctioneer-name").first().text());
  const sellerName =
    licitator != null && licitator !== ""
      ? licitator
      : auctioneerNameDom
        ? auctioneerNameDom
        : null;
  const sellerEmail = auctioneerDetails["Email"] ?? null;
  const sellerPhone = auctioneerDetails["Telefon"] ?? auctioneerDetails["Fax"] ?? null;
  const sellerAddress = auctioneerDetails["Adresă"] ?? null;

  const pdfUrls: string[] = [];
  const addPdf = (href: string) => {
    const abs = toAbsolute(href, base);
    if (abs && !pdfUrls.includes(abs)) pdfUrls.push(abs);
  };
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href");
    if (!href) return;
    const h = href.trim().toLowerCase();
    if (h.includes(".pdf") || h.includes("publication") || h.includes("/document") || (h.includes("download") && (h.includes("pdf") || h.includes("publication"))) || $(a).attr("download")) {
      addPdf(href);
    }
  });
  const pdfUrl = pdfUrls.length > 0 ? pdfUrls[0] : null;

  const imageUrls: string[] = [];
  $(".listing-details img[src], .gallery-column img[src], .slideshow-container [style*='background-image']").each((_, el) => {
    const src = $(el).attr("src");
    if (src && !src.includes("no-available")) {
      imageUrls.push(toAbsolute(src, base));
    }
    const style = $(el).attr("style") || "";
    const urlMatch = style.match(/url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/);
    if (urlMatch && !urlMatch[1].includes("no-available")) {
      imageUrls.push(toAbsolute(urlMatch[1], base));
    }
  });

  const metaFields: Record<string, string> = { ...listingDetails, ...auctioneerDetails };

  return {
    externalId,
    title,
    priceText,
    locationRaw,
    descriptionHtml,
    publishedAt,
    auctionDate,
    auctionTime,
    sellerName,
    sellerEmail,
    sellerPhone,
    sellerAddress,
    pdfUrl,
    pdfUrls,
    metaFields,
    imageUrls,
  };
}

function parseRoDate(dateStr: string): Date | null {
  const m = dateStr.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const day = parseInt(d!, 10);
  const month = parseInt(mo!, 10) - 1;
  const year = parseInt(y!, 10);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const date = new Date(year, month, day);
  return isNaN(date.getTime()) ? null : date;
}
