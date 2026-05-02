/**
 * Parse listing HTML from prod.executori.ro/repes (server-only).
 * Structure: .card-container, app-listing-card, .listing-link a[href*="/repes/listing/"]
 */

import * as cheerio from "cheerio";
import type { RepesListingCard } from "./types";

const BASE_URL = "https://prod.executori.ro";

/**
 * Extract external id from detail URL: /repes/listing/ASG02_163269/d62c0cbbf58448968441badba3d8d713
 * Use the hash (last segment) as unique id.
 */
export function extractRepesExternalId(detailUrl: string): string {
  const match = detailUrl.match(/\/repes\/listing\/[^/]+\/([a-f0-9]+)(?:\?|$|#)/i)
    || detailUrl.match(/\/listing\/[^/]+\/([a-f0-9]+)(?:\?|$|#)/i);
  if (match) return match[1];
  const segments = detailUrl.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  if (last && /^[a-f0-9]{20,}$/i.test(last)) return last;
  return last || detailUrl;
}

/**
 * Get last page number from listing HTML (e.g. "Pagina 1 din 112").
 */
export function getRepesLastPage(html: string): number {
  const $ = cheerio.load(html);
  const label = $(".mat-paginator-range-label").text();
  const m = label.match(/Pagina\s*\d+\s*din\s*(\d+)/i);
  if (m) return Math.max(1, parseInt(m[1], 10));
  return 1;
}

function trim(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Parse listing page HTML and return array of listing cards.
 */
export function parseRepesListingPage(html: string, pageUrl: string): RepesListingCard[] {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl).origin;
  const cards: RepesListingCard[] = [];
  const seen = new Set<string>();

  $(".card-container, app-listing-card").each((_, el) => {
    const $card = $(el);
    const $link = $card.find('a[href*="/repes/listing/"], a[href*="/listing/"]').first();
    const href = $link.attr("href");
    if (!href) return;

    const detailUrl = href.startsWith("http") ? href : new URL(href, base).href;
    const externalId = extractRepesExternalId(detailUrl);
    if (!externalId || seen.has(externalId)) return;
    seen.add(externalId);

    const title = trim($card.find(".listing-title").first().text()) || trim($card.find(".listing-link .listing-title").first().text()) || "";
    const rawAddr = trim($card.find(".listing-address").first().text()) || null;
    const address = rawAddr ? trim(rawAddr.replace(/^\s*(location_on|place|my_location|pin_drop)\s*/i, "")) || null : null;
    let priceText: string | null = trim($card.find(".listing-totalPriceInBaseCurrency").first().text()) || null;
    if (!priceText) priceText = trim($card.find(".listing-totalPriceInBaseCurrency").first().text()) || null;
    const timeLeft = trim($card.find(".listing-timeleft-value").first().text()) || null;
    let publishDate: string | null = trim($card.find(".listing-publish-date").first().text()) || null;
    if (publishDate) publishDate = publishDate.replace(/^\s*Data încărcării:\s*/i, "").trim() || null;
    const guarantee = trim($card.find(".listing-guarantee").first().text()) || null;

    const thumbnails: string[] = [];
    $card.find("img[src]").each((__, img) => {
      const src = $(img).attr("src");
      if (src && !src.includes("no-available-image")) {
        thumbnails.push(src.startsWith("http") ? src : new URL(src, base).href);
      }
    });
    $card.find("[style*='background-image'], [style*='url(']").each((__, styleEl) => {
      const style = $(styleEl).attr("style") || "";
      const urlMatch = style.match(/url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/);
      if (urlMatch && !urlMatch[1].includes("no-available")) {
        thumbnails.push(urlMatch[1].startsWith("http") ? urlMatch[1] : new URL(urlMatch[1], base).href);
      }
    });

    cards.push({
      externalId,
      detailUrl,
      title: title || "Fără titlu",
      priceText,
      locationRaw: address,
      timeLeft,
      publishDate,
      guarantee,
      thumbnails,
    });
  });

  return cards;
}
